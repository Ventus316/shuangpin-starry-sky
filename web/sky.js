// 雙拼星空：程式畫的星空桌布。滑鼠會撥動星星，按鍵時星星聚成拼音。
"use strict";

const P = window.Pinyin;
const cv = document.getElementById("sky");
const ctx = cv.getContext("2d");

const IDLE_MS = 15000;       // 多久沒按鍵就讓星星散回去
const FONT = '"Segoe UI", "Microsoft JhengHei", sans-serif';

let W = 0, H = 0, DPR = 1;
let bg = null;               // 預先畫好的背景（漸層、銀河）
let stars = [];
let glow = null;             // 光暈貼圖

const mouse = { x: -9999, y: -9999, active: false, lastMove: 0 };
const ripples = [];

const state = {
  first: null, second: null, word: "", zy: "", syl: "", caption: "", bad: false,
  cand: new Map(),           // 鍵盤上要亮的鍵 → 拼出來的音節
  lastKey: -1e9, box: null, links: [], formedAt: 0,
};
let activeAlpha = 0;          // 0 = 閒置，1 = 正在打字
const keyLvl = {};            // 每個鍵的亮度動畫
const kb = { on: false, formedAt: 0, alpha: 0 };   // 鍵盤：星星匯聚後才淡入
const ZFONT = '"Microsoft JhengHei", "Segoe UI", sans-serif';

// ---------- 工具 ----------
const rand = (a, b) => a + Math.random() * (b - a);
const gauss = () => (Math.random() + Math.random() + Math.random() + Math.random() - 2) / 2;
const now = () => performance.now();

// ---------- 初始化 ----------
function makeGlow() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.15, "rgba(220,235,255,0.55)");
  grd.addColorStop(0.45, "rgba(150,180,255,0.12)");
  grd.addColorStop(1, "rgba(120,150,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return c;
}

// ---------- 真實北天星空 ----------
// 以北天極為中心的立體投影；北斗七星在左、仙后座在右。
const D2R = Math.PI / 180;
const VIEW = { raRight: 14, tilt: 12, halfFov: 47 };   // 右邊指向的赤經°、整體旋轉°、水平半視角°
let proj = { cx: 0, cy: 0, s: 1 };

function setupProjection() {
  proj.cx = W / 2; proj.cy = H * 0.5;
  proj.s = (W / 2) / (2 * Math.tan(VIEW.halfFov / 2 * D2R));
}
// 赤經赤緯 → 螢幕座標（從地面往上看，北天極附近赤經順時針增加）
function skyToScreen(ra, dec) {
  const th = (90 - dec) * D2R;
  const r = 2 * Math.tan(th / 2) * proj.s;
  const a = (-(ra - VIEW.raRight) + VIEW.tilt) * D2R;
  return [proj.cx + r * Math.cos(a), proj.cy - r * Math.sin(a)];
}
function screenToSky(x, y) {
  const mx = (x - proj.cx) / proj.s, my = -(y - proj.cy) / proj.s;
  const th = 2 * Math.atan(Math.hypot(mx, my) / 2);
  const a = Math.atan2(my, mx) / D2R;
  return [VIEW.raRight - (a - VIEW.tilt), 90 - th / D2R];
}
// 銀河座標（銀緯 b、銀經 l，單位°）
function galactic(ra, dec) {
  const aG = 192.859 * D2R, dG = 27.128 * D2R, lN = 122.932;
  const a = ra * D2R, d = dec * D2R;
  const sb = Math.sin(d) * Math.sin(dG) + Math.cos(d) * Math.cos(dG) * Math.cos(a - aG);
  const l = lN - Math.atan2(Math.cos(d) * Math.sin(a - aG),
    Math.sin(d) * Math.cos(dG) - Math.cos(d) * Math.sin(dG) * Math.cos(a - aG)) / D2R;
  return [Math.asin(sb) / D2R, l];
}

// 平滑雜訊（給銀河一點雲狀起伏）
const NOISE_SEED = Math.random() * 1000;
function hash(x, y) {
  const h = Math.sin(x * 127.1 + y * 311.7 + NOISE_SEED) * 43758.5453;
  return h - Math.floor(h);
}
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y) {
  let s = 0, amp = 0.5;
  for (let i = 0; i < 5; i++) { s += vnoise(x, y) * amp; x *= 2.03; y *= 2.03; amp *= 0.5; }
  return s;
}

// 某個螢幕位置的銀河亮度 0~1
function milkyWay(x, y) {
  const [ra, dec] = screenToSky(x, y);
  const [b, l] = galactic(ra, dec);
  const width = 13 + 4 * Math.sin(l * D2R * 2);
  const core = Math.exp(-(((b + 1.5) / width) ** 2));
  const n = fbm(x / 170, y / 170);
  return Math.max(0, core * (0.3 + 1.1 * n) - 0.04);
}

// B-V 色指數 → 星星顏色
const BV_COLORS = [
  [-0.3, [155, 180, 255]], [0, [200, 214, 255]], [0.3, [240, 242, 255]],
  [0.6, [255, 244, 230]], [1.0, [255, 214, 168]], [1.6, [255, 182, 125]],
];
function bvColor(bv) {
  if (bv <= BV_COLORS[0][0]) return BV_COLORS[0][1];
  for (let i = 1; i < BV_COLORS.length; i++) {
    const [b1, c1] = BV_COLORS[i];
    if (bv <= b1) {
      const [b0, c0] = BV_COLORS[i - 1], k = (bv - b0) / (b1 - b0);
      return c0.map((v, j) => Math.round(v + (c1[j] - v) * k));
    }
  }
  return BV_COLORS[BV_COLORS.length - 1][1];
}

function buildBg() {
  setupProjection();
  bg = document.createElement("canvas");
  bg.width = W * DPR; bg.height = H * DPR;
  const g = bg.getContext("2d");
  g.setTransform(DPR, 0, 0, DPR, 0, 0);

  // 夜空：中間深、四周略帶藍
  const sky = g.createRadialGradient(W * 0.5, H * 0.45, 0, W * 0.5, H * 0.45, Math.hypot(W, H) * 0.6);
  sky.addColorStop(0, "#03050d");
  sky.addColorStop(0.6, "#050a1c");
  sky.addColorStop(1, "#0a1330");
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);

  // 銀河的光：先在小畫布逐點算亮度，再放大成柔和的光帶
  const sc = 6, mw = document.createElement("canvas");
  mw.width = Math.ceil(W / sc); mw.height = Math.ceil(H / sc);
  const mg = mw.getContext("2d"), img = mg.createImageData(mw.width, mw.height);
  for (let j = 0; j < mw.height; j++)
    for (let i = 0; i < mw.width; i++) {
      const x = i * sc, y = j * sc, v = Math.min(1, milkyWay(x, y));
      const warm = fbm(x / 300 + 50, y / 300);
      const o = (j * mw.width + i) * 4;
      img.data[o] = 120 + 80 * warm; img.data[o + 1] = 140 + 50 * warm; img.data[o + 2] = 230;
      img.data[o + 3] = Math.round(v * 85);
    }
  mg.putImageData(img, 0, 0);
  g.globalCompositeOperation = "lighter";
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
  g.filter = "blur(14px)";
  g.drawImage(mw, 0, 0, W, H);
  g.filter = "none";

  // 銀河裡密密麻麻的微小星點（只在亮的地方多）
  const dust = Math.round(W * H / 60);
  for (let i = 0; i < dust; i++) {
    const x = rand(0, W), y = rand(0, H);
    if (Math.random() > milkyWay(x, y) * 1.4) continue;
    g.fillStyle = `rgba(215,225,255,${rand(0.05, 0.3)})`;
    const s = Math.random() < 0.92 ? 0.6 : 1.0;
    g.fillRect(x, y, s, s);
  }
  // 全天空的淡星
  for (let i = 0; i < W * H / 1100; i++) {
    g.fillStyle = `rgba(230,236,255,${rand(0.05, 0.25)})`;
    g.fillRect(rand(0, W), rand(0, H), 0.7, 0.7);
  }
  g.globalCompositeOperation = "source-over";
}

function buildStars() {
  stars = [];
  const add = (x, y, r, a, col) => stars.push({
    hx: x, hy: y, x, y, vx: 0, vy: 0, r, a,
    f: rand(0.4, 2.2), p: rand(0, Math.PI * 2), col,
    tx: 0, ty: 0, on: false, delay: 0,
  });
  // 真實亮星：位置、亮度、顏色都照星表
  for (const [ra, dec, mag, bv] of window.STAR_CATALOG || []) {
    if (dec < 0) continue;
    const [x, y] = skyToScreen(ra, dec);
    if (x < -10 || x > W + 10 || y < -10 || y > H + 10) continue;
    const r = Math.max(0.7, 3.5 - 0.46 * mag);
    const a = Math.max(0.42, Math.min(1, 1.5 - 0.15 * mag));
    const c = bvColor(bv);
    // 暗星顏色淡一點，亮星保留原色
    const k = Math.min(1, Math.max(0.35, (5.5 - mag) / 3));
    add(x, y, r, a, c.map(v => Math.round(255 + (v - 255) * k)).join(","));
  }
  // 不夠組字的話，用暗星補到足夠數量（銀河附近多一些）
  const n = Math.max(500, Math.min(2000, Math.round(W * H / 1300)));
  let guard = 0;
  while (stars.length < n && guard++ < n * 20) {
    const x = rand(0, W), y = rand(0, H);
    if (Math.random() > 0.3 + milkyWay(x, y) * 1.2) continue;
    add(x, y, rand(0.4, 0.8), rand(0.2, 0.55), Math.random() < 0.75 ? "235,240,255" : "255,236,215");
  }
}

function resize() {
  DPR = window.devicePixelRatio || 1;
  W = window.innerWidth; H = window.innerHeight;
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  buildBg();
  buildStars();
  if (kb.on) formKeyboard();
  if (state.word) formWord(state.word);
}

// ---------- 星星組字 ----------
function textPoints(text, fs) {
  const c = document.createElement("canvas");
  const g = c.getContext("2d");
  g.font = `700 ${fs}px ${FONT}`;
  const tw = Math.ceil(g.measureText(text).width) + 20;
  const th = Math.ceil(fs * 1.25);
  c.width = tw; c.height = th;
  g.font = `700 ${fs}px ${FONT}`;
  g.textBaseline = "middle";
  g.fillStyle = "#fff";
  g.fillText(text, 10, th / 2);
  const data = g.getImageData(0, 0, tw, th).data;
  const budget = Math.min(800, Math.floor(stars.filter((s) => !s.kb).length * 0.7));
  let step = Math.max(3, Math.round(fs / 30));
  let pts;
  for (;;) {
    pts = [];
    for (let y = 0; y < th; y += step)
      for (let x = 0; x < tw; x += step)
        if (data[(y * tw + x) * 4 + 3] > 150) pts.push([x, y]);
    if (pts.length <= budget) break;
    step++;
  }
  return { pts, tw, th, step };
}

function release() {
  for (const s of stars) s.on = false;
  state.links = [];
}

function formWord(text) {
  release();
  const fs = Math.min(W * 0.08, H * 0.13);
  const { pts, tw, th, step } = textPoints(text, fs);
  const cx = W / 2, cy = H * 0.15;
  const ox = cx - tw / 2, oy = cy - th / 2;
  state.box = { l: ox + 10, r: ox + tw - 10, t: oy, b: oy + th, cy, fs };

  // 每個目標點從隨機幾顆星裡挑最近、還沒被用的
  const free = stars.filter((s) => !s.kb);
  const chosen = [];
  pts.sort(() => Math.random() - 0.5);
  for (const [px, py] of pts) {
    const tx = ox + px, ty = oy + py;
    let best = -1, bd = Infinity;
    for (let k = 0; k < 14 && free.length; k++) {
      const i = (Math.random() * free.length) | 0;
      const s = free[i];
      const d = (s.x - tx) ** 2 + (s.y - ty) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    if (best < 0) break;
    const s = free[best];
    free[best] = free[free.length - 1]; free.pop();
    const j = step * 0.12;
    s.on = true; s.tx = tx + rand(-j, j); s.ty = ty + rand(-j, j);
    s.delay = now() + rand(0, 180);
    chosen.push(s);
  }
  // 相鄰的星星連成星座線
  const links = [];
  const lim = (step * 1.5) ** 2;
  for (let i = 0; i < chosen.length; i++) {
    let n = 0;
    for (let j = i + 1; j < chosen.length && n < 2; j++) {
      const a = chosen[i], b = chosen[j];
      if ((a.tx - b.tx) ** 2 + (a.ty - b.ty) ** 2 < lim) { links.push([a, b]); n++; }
    }
  }
  state.links = links;
  state.formedAt = now();
}

// ---------- 按鍵 ----------
function clearWord(dissolve = true) {
  state.first = state.second = null;
  state.word = ""; state.zy = ""; state.syl = ""; state.caption = ""; state.bad = false;
  state.cand = new Map();
  release();
  if (dissolve) dissolveKeyboard();
}

// 鍵盤第一次出現：星星飛到每個鍵的外框上，聚好之後鍵盤才淡入
function formKeyboard() {
  for (const s of stars) s.kb = false;
  const L = kbLayout(), sz = L.s, pad = 3;
  const pts = [];
  for (const row of ROWS) for (const k of row) {
    const { x, y } = L.keys[k];
    const x0 = x + pad, y0 = y + pad, w = sz - pad * 2;
    const per = Math.max(3, Math.round(w / (sz / 3.4)));
    for (let i = 0; i < per; i++) {
      const u = i / per;
      pts.push([x0 + u * w, y0], [x0 + w, y0 + u * w], [x0 + w - u * w, y0 + w], [x0, y0 + w - u * w]);
    }
  }
  const free = stars.filter((s) => !s.on);
  pts.sort(() => Math.random() - 0.5);
  for (const [tx, ty] of pts) {
    let best = -1, bd = Infinity;
    for (let k = 0; k < 10 && free.length; k++) {
      const i = (Math.random() * free.length) | 0;
      const d = (free[i].x - tx) ** 2 + (free[i].y - ty) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    if (best < 0) break;
    const s = free[best];
    free[best] = free[free.length - 1]; free.pop();
    s.kb = true; s.kx = tx; s.ky = ty; s.delay = now() + rand(0, 220);
  }
}

// 鍵盤消散：外框上的星星往外散開再飄回原位，鍵盤同時淡出
function dissolveKeyboard() {
  if (!kb.on) return;
  kb.on = false;
  for (const s of stars) {
    if (!s.kb) continue;
    s.kb = false;
    const a = rand(0, Math.PI * 2), v = rand(60, 220);
    s.vx += Math.cos(a) * v; s.vy += Math.sin(a) * v;
  }
}

function onKey(key) {
  if (!key) return;
  const k = key.length === 1 ? key.toLowerCase() : key;
  if (k === "Escape" || k === " ") { clearWord(); return; }
  if (k === "Backspace") {
    if (state.second) { const f = state.first; clearWord(false); onKey(f); }
    else clearWord();
    return;
  }
  if (!/^[a-z]$/.test(k)) return;
  state.lastKey = now();
  if (!kb.on) { kb.on = true; kb.formedAt = now(); formKeyboard(); }

  if (state.first && !state.second) {
    // 第二鍵：韻母。鍵盤改亮「能放在這個鍵前面的鍵」
    state.second = k;
    const syl = P.combine(state.first, k);
    state.bad = !syl;
    state.syl = syl || "";
    state.word = syl ? P.show(syl) : P.firstLabel(state.first) + "?";
    state.zy = syl ? P.zhuyin(syl) : "";
    state.caption = syl
      ? `${state.first.toUpperCase()} ${k.toUpperCase()}`
      : `${state.first.toUpperCase()} ${k.toUpperCase()}　沒有這個音節`;
    // 音節完整了就不亮任何鍵，等下一個字的第一鍵
    state.cand = new Map();
  } else {
    // 第一鍵：聲母（a / o / e 是零聲母）。鍵盤亮「後面能接的鍵」
    state.first = k; state.second = null; state.bad = false; state.syl = "";
    state.word = P.firstLabel(k);
    state.zy = P.firstZhuyin(k);
    state.caption = `${k.toUpperCase()}　·　${P.INITIAL_KEYS[k] ? "聲母" : "零聲母"}`;
    state.cand = new Map(P.followers(k).map((o) => [o.key, o.syl]));
  }
  formWord(state.word);
}

// ---------- 鍵盤版面 ----------
const ROWS = ["qwertyuiop", "asdfghjkl;", "zxcvbnm"];
function kbLayout() {
  const s = Math.min(W * 0.068, H * 0.112);
  const x0 = W / 2 - (10.5 * s) / 2, y0 = H * 0.35;
  const keys = {};
  ROWS.forEach((row, r) => [...row].forEach((k, i) => {
    keys[k] = { x: x0 + r * 0.5 * s + i * s, y: y0 + r * s };
  }));
  const zw = s * 0.82, zh = s * 0.38;
  const zx0 = W / 2 - (P.ZERO_LIST.length * zw) / 2, zy0 = y0 + 3 * s + s * 0.42;
  return { s, keys, zw, zh, zx0, zy0 };
}


// ---------- 輸入來源：瀏覽器事件，或桌布主程式轉送 ----------
addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  onKey(e.key);
});
addEventListener("pointermove", (e) => moveMouse(e.clientX, e.clientY));
addEventListener("pointerdown", (e) => clickAt(e.clientX, e.clientY));
document.documentElement.addEventListener("pointerleave", () => { mouse.active = false; });

function moveMouse(x, y) {
  mouse.x = x; mouse.y = y; mouse.active = true; mouse.lastMove = now();
}
function clickAt(x, y) {
  moveMouse(x, y);
  ripples.push({ x, y, t0: now() });
  for (const s of stars) {
    if (s.on) continue;
    const dx = s.x - x, dy = s.y - y, d = Math.hypot(dx, dy);
    if (d < 240 && d > 0.1) {
      const f = (1 - d / 240) * 520;
      s.vx += dx / d * f; s.vy += dy / d * f;
    }
  }
}

let paused = false;
if (window.chrome && window.chrome.webview) {
  window.chrome.webview.addEventListener("message", (e) => {
    let m = e.data;
    if (typeof m === "string") { try { m = JSON.parse(m); } catch { return; } }
    if (m.type === "key") onKey(m.key);
    else if (m.type === "mouse") moveMouse(m.x / DPR, m.y / DPR);
    else if (m.type === "click") clickAt(m.x / DPR, m.y / DPR);
    else if (m.type === "leave") mouse.active = false;
    else if (m.type === "pause") paused = true;
    else if (m.type === "resume") { if (paused) { paused = false; last = now(); requestAnimationFrame(frame); } }
  });
}

// ---------- 繪圖 ----------
function drawStar(s, alpha, size) {
  ctx.fillStyle = `rgba(${s.col},${alpha})`;
  if (size < 1.1) ctx.fillRect(s.x - size / 2, s.y - size / 2, size, size);
  else { ctx.beginPath(); ctx.arc(s.x, s.y, size / 2, 0, Math.PI * 2); ctx.fill(); }
}

// 鍵盤：閒置時半透明當對照表，打字時亮出能接的鍵和拼出來的音
function drawKeyboard(dt) {
  const L = kbLayout(), s = L.s;
  const typing = !!state.word;
  const pressed = [state.first, state.second].filter(Boolean);
  const base = kb.alpha;
  if (base < 0.01) return;

  ctx.save();
  ctx.textBaseline = "middle";
  for (const row of ROWS) for (const k of row) {
    const { x, y } = L.keys[k];
    const isPressed = pressed.includes(k);
    const target = state.cand.has(k) ? 1 : 0;
    keyLvl[k] = (keyLvl[k] ?? 0) + (target - (keyLvl[k] ?? 0)) * Math.min(1, dt * 9);
    const lv = keyLvl[k];
    // 第一鍵按下後才把不能接的鍵調暗；音節完整時整個鍵盤維持正常亮度
    const dim = typing && !state.second && !isPressed && lv < 0.5 ? 0.45 : 1;
    ctx.globalAlpha = base * dim;

    // 鍵框
    const pad = 3;
    ctx.beginPath();
    ctx.roundRect(x + pad, y + pad, s - pad * 2, s - pad * 2, 7);
    if (isPressed) {
      ctx.fillStyle = "rgba(255,200,120,0.22)";
      ctx.strokeStyle = "rgba(255,214,150,0.95)";
      ctx.shadowColor = "rgba(255,200,120,0.8)"; ctx.shadowBlur = 16;
    } else {
      ctx.fillStyle = `rgba(${18 + 50 * lv},${28 + 80 * lv},${70 + 150 * lv},${0.32 + 0.15 * lv})`;
      ctx.strokeStyle = `rgba(${160 - 20 * lv},${185 + 30 * lv},255,${0.32 + 0.6 * lv})`;
      ctx.shadowColor = "rgba(120,190,255,0.9)"; ctx.shadowBlur = 14 * lv;
    }
    ctx.lineWidth = 1.2;
    ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0;
    if (k === ";") continue;

    // 左上：按鍵字母
    ctx.textAlign = "left";
    ctx.font = `700 ${Math.round(s * 0.22)}px ${FONT}`;
    ctx.fillStyle = isPressed ? "#ffe6bd" : "#dce4ff";
    ctx.fillText(k.toUpperCase(), x + s * 0.12, y + s * 0.2);

    // 右上：聲母（zh / ch / sh 另外標拼音）
    // 亮起來的鍵這時是當韻母用，聲母標示先藏起來免得混淆
    const ini = P.INITIAL_KEYS[k];
    if (ini && lv < 0.5) {
      ctx.textAlign = "right";
      ctx.font = `600 ${Math.round(s * 0.2)}px ${ZFONT}`;
      ctx.fillStyle = "#ff9b6e";
      const zy = P.INI_ZY[ini];
      ctx.fillText(zy, x + s * 0.88, y + s * 0.21);
      if (ini.length > 1) {
        const w = ctx.measureText(zy).width;
        ctx.font = `700 ${Math.round(s * 0.17)}px ${FONT}`;
        ctx.fillText(ini, x + s * 0.88 - w - 4, y + s * 0.21);
      }
    }

    // 下半：平常顯示韻母，亮起來時改顯示拼出的音節（拼音 + 注音）
    const syl = state.cand.get(k);
    const lines = P.FINAL_LABELS[k] || [];
    if (1 - lv > 0.02) {
      ctx.globalAlpha = base * dim * (1 - lv);
      ctx.textAlign = "right";
      lines.forEach(([py, zy], i) => {
        const ly = y + s * (lines.length > 1 ? 0.55 + i * 0.22 : 0.64);
        ctx.font = `500 ${Math.round(s * 0.16)}px ${ZFONT}`;
        ctx.fillStyle = "rgba(190,205,255,0.95)";
        ctx.fillText(zy, x + s * 0.88, ly);
        const w = ctx.measureText(zy).width;
        ctx.font = `500 ${Math.round(s * 0.15)}px ${FONT}`;
        ctx.fillStyle = "rgba(150,165,205,0.95)";
        ctx.fillText(py, x + s * 0.88 - w - 5, ly);
      });
    }
    if (syl && lv > 0.02) {
      ctx.globalAlpha = base * lv;
      ctx.textAlign = "center";
      ctx.font = `700 ${Math.round(s * 0.21)}px ${FONT}`;
      ctx.fillStyle = "#ffffff";
      ctx.fillText(P.show(syl), x + s / 2, y + s * 0.56);
      ctx.font = `600 ${Math.round(s * 0.18)}px ${ZFONT}`;
      ctx.fillStyle = "#9fd4ff";
      ctx.fillText(P.zhuyin(syl), x + s / 2, y + s * 0.8);
    }
  }

  // 零聲母
  ctx.globalAlpha = base * 0.9;
  ctx.textAlign = "center";
  ctx.font = `500 ${Math.round(s * 0.15)}px ${ZFONT}`;
  ctx.fillStyle = "rgba(170,185,230,0.8)";
  ctx.fillText("零聲母", W / 2, L.zy0 - s * 0.16);
  P.ZERO_LIST.forEach(([syl, keys], i) => {
    const x = L.zx0 + i * L.zw, y = L.zy0;
    const on = typing && (state.second ? state.syl === syl && state.first === keys[0]
                                       : state.first === keys[0]);
    ctx.globalAlpha = base * (typing && !on ? 0.5 : 1);
    ctx.beginPath();
    ctx.roundRect(x + 2, y, L.zw - 4, L.zh, 5);
    ctx.fillStyle = on ? "rgba(70,120,230,0.4)" : "rgba(18,28,70,0.32)";
    ctx.strokeStyle = on ? "rgba(140,200,255,0.9)" : "rgba(160,185,255,0.3)";
    ctx.fill(); ctx.stroke();
    ctx.textAlign = "left";
    ctx.font = `500 ${Math.round(s * 0.15)}px ${ZFONT}`;
    ctx.fillStyle = "rgba(190,205,255,0.9)";
    ctx.fillText(P.zhuyin(syl), x + L.zw * 0.12, y + L.zh / 2 + 1);
    ctx.textAlign = "right";
    ctx.font = `700 ${Math.round(s * 0.15)}px ${FONT}`;
    ctx.fillStyle = on ? "#fff" : "rgba(220,228,255,0.9)";
    ctx.fillText(keys, x + L.zw * 0.88, y + L.zh / 2 + 1);
  });
  ctx.restore();
}

// 字的上方說明、下方注音
function drawWordInfo(alpha) {
  if (!state.word || !state.box || alpha <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.font = `600 17px ${ZFONT}`;
  ctx.fillStyle = state.bad ? "rgba(255,170,170,0.95)" : "rgba(205,220,255,0.8)";
  ctx.fillText(state.caption, W / 2, state.box.t - 4);
  // 星星聚好之後，在後面淡淡浮出字形，讓拼音看得清楚
  {
    const k = Math.max(0, Math.min(1, (now() - state.formedAt - 450) / 600));
    if (k > 0) {
      ctx.save();
      ctx.globalAlpha = alpha * k * 0.32;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.font = `700 ${state.box.fs}px ${FONT}`;
      ctx.shadowColor = state.bad ? "rgba(255,140,140,0.9)" : "rgba(140,190,255,0.9)";
      ctx.shadowBlur = 22;
      ctx.fillStyle = state.bad ? "#ffc4c4" : "#dbe9ff";
      ctx.fillText(state.word, state.box.l, (state.box.t + state.box.b) / 2);
      ctx.restore();
    }
  }
  if (state.zy) {
    const k = Math.min(1, (now() - state.formedAt) / 500);
    ctx.globalAlpha = alpha * k;
    ctx.textBaseline = "top";
    ctx.font = `600 ${Math.round(Math.min(W * 0.03, H * 0.05))}px ${ZFONT}`;
    ctx.shadowColor = "rgba(130,190,255,0.9)"; ctx.shadowBlur = 18;
    ctx.fillStyle = "#cfe6ff";
    ctx.fillText(state.zy, W / 2, state.box.b + 4 + (1 - k) * 10);
  }
  ctx.restore();
}


let last = now();
let skip = false;
function frame() {
  if (paused) return;
  requestAnimationFrame(frame);
  const t = now();
  // 沒在打字也沒動滑鼠時降到 30fps 省電
  const calm = t - state.lastKey > IDLE_MS + 3000 && t - mouse.lastMove > 2000;
  if (calm && (skip = !skip)) return;
  const dt = Math.min(0.05, (t - last) / 1000);
  last = t;
  const ts = t / 1000;

  // 太久沒按鍵：星星散回原位
  if (state.word && t - state.lastKey > IDLE_MS) clearWord();
  activeAlpha += ((state.word ? 1 : 0) - activeAlpha) * Math.min(1, dt * 5);
  const kbTarget = kb.on && t - kb.formedAt > 650 ? 1 : 0;
  kb.alpha += (kbTarget - kb.alpha) * Math.min(1, dt * (kbTarget ? 4 : 7));

  ctx.globalCompositeOperation = "source-over";
  ctx.drawImage(bg, 0, 0, W, H);

  // 物理：彈簧回到目標 + 滑鼠推開
  const mR = 120;
  for (const s of stars) {
    let tx = s.hx, ty = s.hy, K = 10, D = 5;
    if (s.on && t >= s.delay) { tx = s.tx; ty = s.ty; K = 38; D = 10; }
    else if (s.kb && t >= s.delay) { tx = s.kx; ty = s.ky; K = 30; D = 9; }
    s.vx += ((tx - s.x) * K - s.vx * D) * dt;
    s.vy += ((ty - s.y) * K - s.vy * D) * dt;
    if (mouse.active && !s.on && !s.kb) {
      const dx = s.x - mouse.x, dy = s.y - mouse.y, d2 = dx * dx + dy * dy;
      if (d2 < mR * mR && d2 > 0.01) {
        const d = Math.sqrt(d2), f = (1 - d / mR) ** 2 * 1400 * dt;
        s.vx += dx / d * f; s.vy += dy / d * f;
      }
    }
    s.x += s.vx * dt; s.y += s.vy * dt;
  }

  // 星座線：游標附近的星星互相連線
  ctx.globalCompositeOperation = "lighter";
  if (mouse.active) {
    const near = [];
    for (const s of stars) {
      if (s.on) continue;
      const d = Math.hypot(s.x - mouse.x, s.y - mouse.y);
      if (d < 190) near.push(s);
    }
    ctx.lineWidth = 0.7;
    for (let i = 0; i < near.length; i++)
      for (let j = i + 1; j < near.length; j++) {
        const a = near[i], b = near[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < 80) {
          const md = Math.hypot((a.x + b.x) / 2 - mouse.x, (a.y + b.y) / 2 - mouse.y);
          ctx.strokeStyle = `rgba(150,190,255,${(1 - d / 80) * (1 - md / 190) * 0.55})`;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
  }
  // 字的星座線
  if (state.links.length) {
    const k = Math.min(1, (t - state.formedAt) / 900);
    ctx.strokeStyle = state.bad ? `rgba(255,150,150,${0.22 * k})` : `rgba(160,200,255,${0.25 * k})`;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (const [a, b] of state.links) { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
    ctx.stroke();
  }

  // 星星
  for (const s of stars) {
    const tw = 0.62 + 0.38 * Math.sin(ts * s.f + s.p);
    if (s.on || s.kb) {
      // 鍵盤外框的星星在鍵盤淡入後變淡，只留一點閃光
      const a = Math.min(1, 0.35 + s.a * 0.4 + tw * 0.35) * (s.kb ? 1 - 0.55 * kb.alpha : 1);
      const g = 6 + s.r * 5;
      ctx.globalAlpha = 0.55 * a;
      ctx.drawImage(glow, s.x - g / 2, s.y - g / 2, g, g);
      ctx.globalAlpha = 1;
      drawStar(s, a, s.r + 1.1);
    } else {
      const a = s.a * tw;
      if (s.r > 1.3) {
        const g = s.r * 7;
        ctx.globalAlpha = a * 0.5;
        ctx.drawImage(glow, s.x - g / 2, s.y - g / 2, g, g);
        ctx.globalAlpha = 1;
      }
      drawStar(s, a, s.r);
    }
  }

  // 點擊的波紋
  for (let i = ripples.length - 1; i >= 0; i--) {
    const r = ripples[i], age = (t - r.t0) / 1000;
    if (age > 1.2) { ripples.splice(i, 1); continue; }
    ctx.strokeStyle = `rgba(170,200,255,${0.35 * (1 - age / 1.2)})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(r.x, r.y, 20 + age * 260, 0, Math.PI * 2); ctx.stroke();
  }

  ctx.globalCompositeOperation = "source-over";
  drawKeyboard(dt);
  drawWordInfo(activeAlpha);
}

glow = makeGlow();
addEventListener("resize", resize);
resize();
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && !paused) last = now();
});
requestAnimationFrame(frame);
