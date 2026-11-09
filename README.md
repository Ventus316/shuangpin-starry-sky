# 雙拼星空桌布

一張用程式碼畫出來的 Windows 動態桌布，用來練習**小鶴雙拼**。

平常是一片真實的北天星空；在桌面上按鍵時，星星會飛過來組成你打出的拼音，並在一個由星星聚成的鍵盤上標出「下一鍵可以按哪些」。

不需要 Wallpaper Engine 之類的付費軟體，也不用任何圖片。

## 畫面

- **星空**：依真實星表（Hipparcos 亮星，星等 ≤ 6）畫出以北極星為中心的北天，北斗七星在左、仙后座在右；每顆星的位置、亮度、顏色都照實際資料。
- **銀河**：依真實的銀河座標計算位置，畫成柔和的雲狀光帶。
- **滑鼠**：游標經過會把星星撥開，附近的星星連成星座線；點一下會有波紋把星星推開。

## 怎麼練雙拼

先點一下桌面空白處，然後直接打字：

1. **第一鍵**（聲母）：星星聚成一個鍵盤，亮起所有能接在後面的韻母鍵，每個亮鍵上寫出拼出來的拼音和注音。
2. **第二鍵**（韻母）：星星組成完整的音節（拼音＋注音），這時不亮任何鍵，等你打下一個字。
3. 鍵盤只在第一次出現時由星星匯聚，之後只換亮起的鍵。

- `Backspace` 退一鍵，`Esc` 或空白鍵清掉。
- **15 秒**沒按鍵，鍵盤和字會化成星光散回天空。
- 零聲母打法照小鶴設定：`aa`、`ai`、`an`、`ah`、`ao`、`er` 等。
- 只有桌面是作用中視窗、而且沒在改圖示名稱時才會接管字母鍵，不會影響其他程式打字。

其他視窗最大化或全螢幕時，動畫會自動暫停以省電。

## 系統需求

- Windows 10 / 11（已在 Windows 11 24H2 測試）
- [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)（Windows 11 內建）
- 編譯需要 [.NET 10 SDK](https://dotnet.microsoft.com/download)

## 安裝與執行

```bash
git clone https://github.com/Ventus316/shuangpin-starry-sky.git
cd shuangpin-starry-sky
dotnet publish host -c Release -o app
```

執行 `app\PinyinSky.exe`，桌布就會出現在桌面圖示後面。程式會從執行檔所在位置往上找 `web\index.html`，所以 `app` 和 `web` 資料夾要放在同一層。

### 開機自動啟動

按 `Win + R` 輸入 `shell:startup` 開啟「啟動」資料夾，把 `app\PinyinSky.exe` 用滑鼠右鍵拖進去，選「在此建立捷徑」。不想自動啟動時，刪掉那個捷徑，或到「工作管理員 → 啟動應用程式」停用。

### 結束

右下角系統匣的星星圖示按右鍵 →「結束」，原本的桌布就會回來。

## 修改

| 路徑 | 內容 |
| --- | --- |
| `web/sky.js` | 星空、銀河、滑鼠互動、星星組字、鍵盤高亮 |
| `web/pinyin.js` | 小鶴雙拼對照表、合法音節表、拼音轉注音 |
| `web/stars.js` | 真實亮星資料（赤經、赤緯、星等、色指數） |
| `host/Program.cs` | 把網頁嵌到桌面圖示後面、轉送滑鼠與鍵盤（C# WinForms + WebView2） |

- 改了 `web/` 裡的檔案：在系統匣星星圖示按右鍵 →「重新載入桌布」即可套用，不用重新編譯。
- 改了 `host/`：先結束 PinyinSky，再重新執行上面的 `dotnet publish`。
- 換別的雙拼方案：改 `web/pinyin.js` 裡的對照表。
- 換星空視角：改 `web/sky.js` 裡的 `VIEW`（右側指向的赤經、旋轉角度、水平半視角）。
- 改消散時間：改 `web/sky.js` 開頭的 `IDLE_MS`。

## 運作原理

- 宿主程式用 WebView2 開啟 `web/index.html`，把視窗 `SetParent` 到桌面的 `Progman`，夾在桌面圖示（`SHELLDLL_DefView`）與 `WorkerW` 之間，所以圖示仍然可以點。
- 用低階滑鼠／鍵盤 hook 把桌面上的游標位置和按鍵轉送給網頁。
- 畫面全部用 Canvas 2D 即時繪製。

## 已知限制

- 只畫在主螢幕。
- 要先點一下桌面空白處，桌布才會收到按鍵。

## 資料來源

星表資料取自 [ofrohn/d3-celestial](https://github.com/ofrohn/d3-celestial) 的 `data/stars.6.json`（BSD-3-Clause 授權），原始資料為 ESA Hipparcos 星表。
