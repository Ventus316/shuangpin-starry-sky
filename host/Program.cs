// 雙拼星空桌布主程式：把網頁放到桌面圖示後面，並把滑鼠、鍵盤轉給網頁。
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace PinyinSky;

static class Program
{
    [STAThread]
    static void Main()
    {
        using var mutex = new Mutex(true, "PinyinSkyWallpaper_SingleInstance", out bool first);
        if (!first) return;
        ApplicationConfiguration.Initialize();
        Application.Run(new WallpaperForm());
    }
}

sealed class WallpaperForm : Form
{
    readonly WebView2 web = new() { Dock = DockStyle.Fill, DefaultBackgroundColor = Color.FromArgb(4, 7, 20) };
    readonly NotifyIcon tray = new();
    readonly System.Windows.Forms.Timer watch = new() { Interval = 1000 };
    readonly uint taskbarCreated = Native.RegisterWindowMessage("TaskbarCreated");

    IntPtr mouseHook, keyHook;
    readonly Native.HookProc mouseProc, keyProc;   // 保留參考，避免被回收
    bool ready, paused, mouseInside;
    long lastMouseSend;

    public WallpaperForm()
    {
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.Manual;
        BackColor = Color.FromArgb(4, 7, 20);
        Text = "雙拼星空桌布";
        Controls.Add(web);

        mouseProc = MouseHook;
        keyProc = KeyHook;

        var menu = new ContextMenuStrip();
        menu.Items.Add("重新載入桌布", null, (_, _) => web.CoreWebView2?.Reload());
        menu.Items.Add("重新貼回桌面", null, (_, _) => AttachToDesktop());
        menu.Items.Add("開啟網頁資料夾", null, (_, _) => Process.Start("explorer.exe", WebFolder()));
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("結束", null, (_, _) => Close());
        tray.ContextMenuStrip = menu;
        tray.Icon = MakeIcon();
        tray.Text = "雙拼星空桌布";
        tray.Visible = true;

        watch.Tick += (_, _) => CheckPause();
        Microsoft.Win32.SystemEvents.DisplaySettingsChanged += (_, _) => BeginInvoke(AttachToDesktop);
    }

    protected override async void OnLoad(EventArgs e)
    {
        base.OnLoad(e);
        AttachToDesktop();

        var dataDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "PinyinSky");
        var env = await CoreWebView2Environment.CreateAsync(null, dataDir,
            new CoreWebView2EnvironmentOptions("--autoplay-policy=no-user-gesture-required"));
        await web.EnsureCoreWebView2Async(env);
        var cw = web.CoreWebView2;
        cw.Settings.AreDefaultContextMenusEnabled = false;
        cw.Settings.IsZoomControlEnabled = false;
        cw.Settings.AreDevToolsEnabled = true;
        cw.Settings.IsStatusBarEnabled = false;
        cw.SetVirtualHostNameToFolderMapping("sky.local", WebFolder(), CoreWebView2HostResourceAccessKind.Allow);
        cw.NavigationCompleted += (_, _) => ready = true;
        cw.Navigate("https://sky.local/index.html");

        mouseHook = Native.SetWindowsHookEx(Native.WH_MOUSE_LL, mouseProc, Native.GetModuleHandle(null), 0);
        keyHook = Native.SetWindowsHookEx(Native.WH_KEYBOARD_LL, keyProc, Native.GetModuleHandle(null), 0);
        watch.Start();
    }

    protected override void OnFormClosed(FormClosedEventArgs e)
    {
        if (mouseHook != IntPtr.Zero) Native.UnhookWindowsHookEx(mouseHook);
        if (keyHook != IntPtr.Zero) Native.UnhookWindowsHookEx(keyHook);
        tray.Visible = false;
        base.OnFormClosed(e);
        // 讓 Windows 重畫原本的桌布
        var sb = new StringBuilder(520);
        Native.SystemParametersInfo(Native.SPI_GETDESKWALLPAPER, (uint)sb.Capacity, sb, 0);
        Native.SystemParametersInfo(Native.SPI_SETDESKWALLPAPER, 0, sb, 0);
    }

    protected override void WndProc(ref Message m)
    {
        if (m.Msg == (int)taskbarCreated) BeginInvoke(AttachToDesktop);   // 檔案總管重啟後重新貼上
        base.WndProc(ref m);
    }

    // 不要搶焦點
    protected override bool ShowWithoutActivation => true;
    protected override CreateParams CreateParams
    {
        get
        {
            var cp = base.CreateParams;
            cp.ExStyle |= Native.WS_EX_TOOLWINDOW | Native.WS_EX_NOACTIVATE;
            return cp;
        }
    }

    static string WebFolder()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        for (int i = 0; i < 6 && dir != null; i++, dir = dir.Parent)
        {
            var p = Path.Combine(dir.FullName, "web");
            if (File.Exists(Path.Combine(p, "index.html"))) return p;
        }
        throw new DirectoryNotFoundException("找不到 web\\index.html");
    }

    // ---------- 貼到桌面圖示後面 ----------
    IntPtr desktopParent;

    void AttachToDesktop()
    {
        var progman = Native.FindWindow("Progman", null);
        Native.SendMessageTimeout(progman, 0x052C, new IntPtr(0xD), new IntPtr(1), 0, 1000, out _);
        Native.SendMessageTimeout(progman, 0x052C, IntPtr.Zero, IntPtr.Zero, 0, 1000, out _);

        var screen = Screen.PrimaryScreen!.Bounds;
        var style = Native.GetWindowLong(Handle, Native.GWL_STYLE);
        Native.SetWindowLong(Handle, Native.GWL_STYLE, (style & ~Native.WS_POPUP) | Native.WS_CHILD);

        var innerWorker = Native.FindWindowEx(progman, IntPtr.Zero, "WorkerW", null);
        if (innerWorker != IntPtr.Zero)
        {
            // Windows 11 24H2 之後：WorkerW 在 Progman 裡面，桌布要夾在圖示層和 WorkerW 之間
            desktopParent = progman;
            // Progman 用 DirectComposition 合成，子視窗要是 layered 才畫得出來
            var ex = Native.GetWindowLong(Handle, Native.GWL_EXSTYLE);
            Native.SetWindowLong(Handle, Native.GWL_EXSTYLE, ex | Native.WS_EX_LAYERED);
            Native.SetLayeredWindowAttributes(Handle, 0, 255, Native.LWA_ALPHA);
            Native.SetParent(Handle, progman);
            var defView = Native.FindWindowEx(progman, IntPtr.Zero, "SHELLDLL_DefView", null);
            var pt = new Native.POINT { X = screen.X, Y = screen.Y };
            Native.ScreenToClient(progman, ref pt);
            Native.SetWindowPos(Handle, defView, pt.X, pt.Y, screen.Width, screen.Height, Native.SWP_NOACTIVATE | Native.SWP_SHOWWINDOW);
            Native.SetWindowPos(innerWorker, Handle, 0, 0, 0, 0, Native.SWP_NOMOVE | Native.SWP_NOSIZE | Native.SWP_NOACTIVATE);
        }
        else
        {
            // 舊版：找圖示層後面那個獨立的 WorkerW
            IntPtr worker = IntPtr.Zero;
            Native.EnumWindows((top, _) =>
            {
                if (Native.FindWindowEx(top, IntPtr.Zero, "SHELLDLL_DefView", null) != IntPtr.Zero)
                    worker = Native.FindWindowEx(IntPtr.Zero, top, "WorkerW", null);
                return true;
            }, IntPtr.Zero);
            if (worker == IntPtr.Zero) worker = progman;
            desktopParent = worker;
            Native.SetParent(Handle, worker);
            var pt = new Native.POINT { X = screen.X, Y = screen.Y };
            Native.ScreenToClient(worker, ref pt);
            Native.SetWindowPos(Handle, IntPtr.Zero, pt.X, pt.Y, screen.Width, screen.Height, Native.SWP_NOACTIVATE | Native.SWP_SHOWWINDOW | Native.SWP_NOZORDER);
        }
        Visible = true;
    }

    // ---------- 只有在看得到桌面時才動 ----------
    static bool IsDesktopWindow(IntPtr hwnd)
    {
        if (hwnd == IntPtr.Zero) return false;
        var root = Native.GetAncestor(hwnd, Native.GA_ROOT);
        var cls = Native.ClassName(root);
        return cls is "Progman" or "WorkerW";
    }

    void CheckPause()
    {
        // 前景視窗蓋滿主螢幕（最大化或全螢幕）時暫停，省電
        var fg = Native.GetForegroundWindow();
        bool cover = false;
        if (!IsDesktopWindow(fg) && fg != IntPtr.Zero && Native.IsWindowVisible(fg) && !Native.IsIconic(fg))
        {
            Native.GetWindowRect(fg, out var r);
            var s = Screen.PrimaryScreen!;
            var wa = s.WorkingArea;
            cover = r.Left <= wa.Left && r.Top <= wa.Top && r.Right >= wa.Right && r.Bottom >= wa.Bottom;
        }
        if (cover != paused)
        {
            paused = cover;
            Send(paused ? "{\"type\":\"pause\"}" : "{\"type\":\"resume\"}");
        }
    }

    void Send(string json)
    {
        if (!ready) return;
        BeginInvoke(() => { try { web.CoreWebView2?.PostWebMessageAsString(json); } catch { } });
    }

    // ---------- 滑鼠 ----------
    IntPtr MouseHook(int code, IntPtr wParam, IntPtr lParam)
    {
        if (code >= 0 && ready && !paused)
        {
            var info = Marshal.PtrToStructure<Native.MSLLHOOKSTRUCT>(lParam);
            int msg = wParam.ToInt32();
            var screen = Screen.PrimaryScreen!.Bounds;
            int x = info.pt.X - screen.X, y = info.pt.Y - screen.Y;
            bool onScreen = x >= 0 && y >= 0 && x < screen.Width && y < screen.Height;
            bool overDesktop = onScreen && IsDesktopWindow(Native.WindowFromPoint(info.pt));

            if (overDesktop)
            {
                if (msg == Native.WM_MOUSEMOVE)
                {
                    long t = Environment.TickCount64;
                    if (t - lastMouseSend >= 15) { lastMouseSend = t; Send($"{{\"type\":\"mouse\",\"x\":{x},\"y\":{y}}}"); }
                }
                else if (msg == Native.WM_LBUTTONDOWN)
                    Send($"{{\"type\":\"click\",\"x\":{x},\"y\":{y}}}");
                mouseInside = true;
            }
            else if (mouseInside)
            {
                mouseInside = false;
                Send("{\"type\":\"leave\"}");
            }
        }
        return Native.CallNextHookEx(mouseHook, code, wParam, lParam);
    }

    // ---------- 鍵盤：只在桌面是前景、而且沒在改檔名時接管 ----------
    IntPtr KeyHook(int code, IntPtr wParam, IntPtr lParam)
    {
        if (code >= 0 && ready && (wParam.ToInt32() == Native.WM_KEYDOWN))
        {
            var info = Marshal.PtrToStructure<Native.KBDLLHOOKSTRUCT>(lParam);
            if (DesktopHasKeyboard() && !ModifierDown())
            {
                // 剛切回桌面時計時器還沒偵測到，先立刻恢復動畫
                if (paused) { paused = false; Send("{\"type\":\"resume\"}"); }
                string? key = info.vkCode switch
                {
                    >= 0x41 and <= 0x5A => ((char)('a' + info.vkCode - 0x41)).ToString(),
                    0x08 => "Backspace",
                    0x1B => "Escape",
                    0x20 => " ",
                    _ => null,
                };
                if (key != null)
                {
                    Send($"{{\"type\":\"key\",\"key\":\"{key}\"}}");
                    // 字母和空白吃掉，免得桌面跳去選圖示
                    if (key.Length == 1) return new IntPtr(1);
                }
            }
        }
        return Native.CallNextHookEx(keyHook, code, wParam, lParam);
    }

    static bool ModifierDown() =>
        (Native.GetAsyncKeyState(0x11) & 0x8000) != 0 || (Native.GetAsyncKeyState(0x12) & 0x8000) != 0 ||
        (Native.GetAsyncKeyState(0x5B) & 0x8000) != 0 || (Native.GetAsyncKeyState(0x5C) & 0x8000) != 0;

    static bool DesktopHasKeyboard()
    {
        var fg = Native.GetForegroundWindow();
        if (!IsDesktopWindow(fg)) return false;
        var gti = new Native.GUITHREADINFO { cbSize = Marshal.SizeOf<Native.GUITHREADINFO>() };
        uint tid = Native.GetWindowThreadProcessId(fg, out _);
        if (Native.GetGUIThreadInfo(tid, ref gti) && gti.hwndFocus != IntPtr.Zero)
        {
            var cls = Native.ClassName(gti.hwndFocus);
            if (cls == "Edit") return false;   // 正在重新命名桌面圖示
        }
        return true;
    }

    static Icon MakeIcon()
    {
        using var bmp = new Bitmap(32, 32);
        using (var g = Graphics.FromImage(bmp))
        {
            g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
            g.Clear(Color.Transparent);
            g.FillEllipse(new SolidBrush(Color.FromArgb(20, 32, 80)), 1, 1, 30, 30);
            var star = new PointF[10];
            for (int i = 0; i < 10; i++)
            {
                double a = -Math.PI / 2 + i * Math.PI / 5;
                float r = i % 2 == 0 ? 12f : 5f;
                star[i] = new PointF(16 + (float)(Math.Cos(a) * r), 17 + (float)(Math.Sin(a) * r));
            }
            g.FillPolygon(new SolidBrush(Color.FromArgb(255, 236, 190)), star);
        }
        return Icon.FromHandle(bmp.GetHicon());
    }
}

static class Native
{
    public const int WH_MOUSE_LL = 14, WH_KEYBOARD_LL = 13;
    public const int WM_MOUSEMOVE = 0x0200, WM_LBUTTONDOWN = 0x0201, WM_KEYDOWN = 0x0100;
    public const int GWL_STYLE = -16, GWL_EXSTYLE = -20, WS_EX_LAYERED = 0x80000;
    public const uint LWA_ALPHA = 0x2;
    [DllImport("user32.dll")] public static extern bool SetLayeredWindowAttributes(IntPtr h, uint key, byte alpha, uint flags);
    public const int WS_CHILD = 0x40000000, WS_POPUP = unchecked((int)0x80000000);
    public const int WS_EX_TOOLWINDOW = 0x80, WS_EX_NOACTIVATE = 0x08000000;
    public const uint SWP_NOSIZE = 0x1, SWP_NOMOVE = 0x2, SWP_NOZORDER = 0x4, SWP_NOACTIVATE = 0x10, SWP_SHOWWINDOW = 0x40;
    public const uint GA_ROOT = 2;
    public const uint SPI_GETDESKWALLPAPER = 0x0073, SPI_SETDESKWALLPAPER = 0x0014;

    public delegate IntPtr HookProc(int code, IntPtr wParam, IntPtr lParam);
    public delegate bool EnumProc(IntPtr hwnd, IntPtr lParam);

    [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] public struct MSLLHOOKSTRUCT { public POINT pt; public uint mouseData, flags, time; public IntPtr extra; }
    [StructLayout(LayoutKind.Sequential)] public struct KBDLLHOOKSTRUCT { public uint vkCode, scanCode, flags, time; public IntPtr extra; }
    [StructLayout(LayoutKind.Sequential)]
    public struct GUITHREADINFO
    {
        public int cbSize; public uint flags;
        public IntPtr hwndActive, hwndFocus, hwndCapture, hwndMenuOwner, hwndMoveSize, hwndCaret;
        public RECT rcCaret;
    }

    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr FindWindow(string? cls, string? name);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string? cls, string? name);
    [DllImport("user32.dll")] public static extern IntPtr SendMessageTimeout(IntPtr h, uint msg, IntPtr w, IntPtr l, uint flags, uint timeout, out IntPtr result);
    [DllImport("user32.dll")] public static extern IntPtr SetParent(IntPtr child, IntPtr parent);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
    [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int idx);
    [DllImport("user32.dll")] public static extern int SetWindowLong(IntPtr h, int idx, int val);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
    [DllImport("user32.dll")] public static extern bool ScreenToClient(IntPtr h, ref POINT p);
    [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr h, uint flags);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT p);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll")] public static extern bool GetGUIThreadInfo(uint tid, ref GUITHREADINFO info);
    [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vk);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder sb, int max);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern uint RegisterWindowMessage(string s);
    [DllImport("user32.dll")] public static extern IntPtr SetWindowsHookEx(int id, HookProc proc, IntPtr mod, uint tid);
    [DllImport("user32.dll")] public static extern bool UnhookWindowsHookEx(IntPtr h);
    [DllImport("user32.dll")] public static extern IntPtr CallNextHookEx(IntPtr h, int code, IntPtr w, IntPtr l);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr GetModuleHandle(string? name);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern bool SystemParametersInfo(uint action, uint param, StringBuilder sb, uint winIni);

    public static string ClassName(IntPtr h)
    {
        var sb = new StringBuilder(64);
        GetClassName(h, sb, sb.Capacity);
        return sb.ToString();
    }
}
