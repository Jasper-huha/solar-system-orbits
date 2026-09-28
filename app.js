'use strict';

/* =========================================================
   太陽系九大行星運行（俯瞰圖）
   - 以真實軌道半徑(AU)等比顯示、依真實公轉週期等比運行
   - 可切換「中心點」：太陽(日心) / 地球(地心) / 任何一顆行星
     切換後所有星體會以該中心重新繞行，呈現逆行迴圈軌跡
   ========================================================= */

const DEG = Math.PI / 180;

// 軌道根數 (J2000，來源：JPL approximate elements 1800–2050)
//   a 半長軸(AU)  e 離心率  inc 傾角(°)  L 平均黃經(°)  peri 近日點黃經ϖ(°)  node 升交點黃經Ω(°)
const BODIES = [
  { name:'太陽',   en:'Sun',     sun:true, color:'#ffcf45', r:14 },
  { name:'水星',   en:'Mercury', a:0.38709927, e:0.20563593, inc:7.00497902,  L:252.25032350, peri:77.45779628,  node:48.33076593,  color:'#b7b3ad', r:3 },
  { name:'金星',   en:'Venus',   a:0.72333566, e:0.00677672, inc:3.39467605,  L:181.97909950, peri:131.60246718, node:76.67984255,  color:'#e8cd8f', r:5 },
  { name:'地球',   en:'Earth',   a:1.00000261, e:0.01671123, inc:-0.00001531, L:100.46457166, peri:102.93768193, node:0.0,          color:'#4f9bff', r:5.5 },
  { name:'火星',   en:'Mars',    a:1.52371034, e:0.09339410, inc:1.84969142,  L:-4.55343205,  peri:-23.94362959, node:49.55953891,  color:'#e2654b', r:4 },
  { name:'木星',   en:'Jupiter', a:5.20288700, e:0.04838624, inc:1.30439695,  L:34.39644051,  peri:14.72847983,  node:100.47390909, color:'#d9a06b', r:10 },
  { name:'土星',   en:'Saturn',  a:9.53667594, e:0.05386179, inc:2.48599187,  L:49.95424423,  peri:92.59887831,  node:113.66242448, color:'#e3cd8b', r:9, ring:true },
  { name:'天王星', en:'Uranus',  a:19.18916464,e:0.04725744, inc:0.77263783,  L:313.23810451, peri:170.95427630, node:74.01692503,  color:'#9fe6e6', r:7 },
  { name:'海王星', en:'Neptune', a:30.06992276,e:0.00859048, inc:1.77004347,  L:304.87997031, peri:44.96476227,  node:131.78422574, color:'#5b7be8', r:7 },
  { name:'冥王星', en:'Pluto',   a:39.48211675,e:0.24882730, inc:17.14001206, L:238.92903833, peri:224.06891629, node:110.30393684, color:'#c9b8a8', r:3 },
];

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// 預先計算每顆行星的軌道常數（週期、平近點角、近焦→黃道投影旋轉係數）
BODIES.forEach(b => {
  if (b.sun) return;
  b.T  = Math.pow(b.a, 1.5);        // 公轉週期(年)，克卜勒第三定律
  b.n  = 2 * Math.PI / b.T;         // 平均角速度 (rad/年)
  b.M0 = (b.L - b.peri) * DEG;      // 曆元平近點角
  const w  = (b.peri - b.node) * DEG;                    // 近日點輻角 ω
  const om = b.node * DEG;                               // 升交點黃經 Ω
  const ci = Math.cos(b.inc * DEG), si = Math.sin(b.inc * DEG);
  const cw = Math.cos(w),  sw = Math.sin(w);
  const co = Math.cos(om), so = Math.sin(om);
  // 近焦座標(xv,yv) → 黃道座標，取 x、y 作俯瞰投影
  b.px =  cw * co - sw * so * ci;  b.qx = -sw * co - cw * so * ci;
  b.py =  cw * so + sw * co * ci;  b.qy = -sw * so + cw * co * ci;
});

// ---- 狀態 ----
let centerIdx   = 0;     // 中心天體 index（0 = 太陽）
let t           = 0;     // 模擬時間：J2000 起算的年數
let playing     = true;
let dir         = 1;     // 1 正向 / -1 反向
let sliderSpeed = 500;   // 速度滑桿 0..1000
let preview     = true;  // true: 直接畫出完整軌跡  false: 邊跑邊畫
let showLabels  = true;
let trailYears  = 8;     // 軌跡長度（年）
let pxPerAU     = 60;    // 每 AU 的像素
let panX = 0, panY = 0;  // 平移（CSS px）

const trails = BODIES.map(() => []); // preview 關閉時的即時軌跡點
const J2000 = Date.UTC(2000, 0, 1, 12, 0, 0);

// ---- Canvas ----
const cv  = document.getElementById('sky');
const ctx = cv.getContext('2d');
let cssW = 0, cssH = 0, dpr = 1, viewCx = 0, viewCy = 0;
const starCv  = document.createElement('canvas');
const starCtx = starCv.getContext('2d');

let el = {}; // DOM 讀數/控制元件

function resize() {
  dpr  = window.devicePixelRatio || 1;
  cssW = window.innerWidth;
  cssH = window.innerHeight;
  cv.width  = Math.round(cssW * dpr);
  cv.height = Math.round(cssH * dpr);
  cv.style.width  = cssW + 'px';
  cv.style.height = cssH + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  viewCx = cssW / 2;
  viewCy = cssH / 2;
  buildStars();
}

function buildStars() {
  starCv.width  = Math.round(cssW * dpr);
  starCv.height = Math.round(cssH * dpr);
  const s = starCtx;
  s.setTransform(dpr, 0, 0, dpr, 0, 0);
  s.clearRect(0, 0, cssW, cssH);
  const g = s.createRadialGradient(cssW/2, cssH/2, 0, cssW/2, cssH/2, Math.max(cssW, cssH) * 0.75);
  g.addColorStop(0, '#0a1024');
  g.addColorStop(1, '#01030a');
  s.fillStyle = g;
  s.fillRect(0, 0, cssW, cssH);
  const n = Math.round(cssW * cssH / 2600);
  for (let i = 0; i < n; i++) {
    const x = Math.random() * cssW;
    const y = Math.random() * cssH;
    const r = Math.random() * 1.2 + 0.2;
    s.globalAlpha = Math.random() * 0.7 + 0.15;
    s.fillStyle = '#cdd6ff';
    s.beginPath();
    s.arc(x, y, r, 0, Math.PI * 2);
    s.fill();
  }
  s.globalAlpha = 1;
}

// ---- 數學：克卜勒橢圓軌道 / 日心座標 / 相對中心座標 ----
function solveKepler(M, e) {
  M = M - 2 * Math.PI * Math.floor(M / (2 * Math.PI)); // 正規化至 0..2π
  let E = e < 0.8 ? M + e * Math.sin(M) : Math.PI;     // 初始猜值
  for (let i = 0; i < 10; i++) {                       // 牛頓法求偏近點角
    const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-8) break;
  }
  return E;
}
function posFromE(body, E) {
  const xv = body.a * (Math.cos(E) - body.e);              // 近焦座標（太陽在焦點）
  const yv = body.a * Math.sqrt(1 - body.e * body.e) * Math.sin(E);
  return { x: body.px * xv + body.qx * yv, y: body.py * xv + body.qy * yv };
}
function helio(body, time) {
  if (body.sun) return { x: 0, y: 0 };
  return posFromE(body, solveKepler(body.M0 + body.n * time, body.e));
}
function relPos(body, time) {
  const c = helio(BODIES[centerIdx], time);
  const p = helio(body, time);
  return { x: p.x - c.x, y: p.y - c.y };
}
function toScreen(p) {
  return { x: viewCx + p.x * pxPerAU + panX, y: viewCy - p.y * pxPerAU + panY };
}

// ---- 主繪圖 ----
function draw() {
  ctx.drawImage(starCv, 0, 0, cssW, cssH);
  const sunCenter = BODIES[centerIdx].sun;

  // 軌道 / 軌跡
  if (preview) {
    for (let i = 0; i < BODIES.length; i++) {
      if (i === centerIdx) continue;
      const b = BODIES[i];
      if (sunCenter) {
        drawOrbitEllipse(b);
      } else {
        drawWindowPath(b);
      }
    }
  } else {
    for (let i = 0; i < BODIES.length; i++) {
      if (i === centerIdx) continue;
      const arr = trails[i];
      if (arr.length < 2) continue;
      const b = BODIES[i];
      for (let k = 1; k < arr.length; k++) {
        const s0 = toScreen(arr[k - 1]);
        const s1 = toScreen(arr[k]);
        const age = (t - arr[k].t) / trailYears; // 0 新 → 1 舊
        ctx.beginPath();
        ctx.moveTo(s0.x, s0.y);
        ctx.lineTo(s1.x, s1.y);
        ctx.strokeStyle = b.color;
        ctx.globalAlpha = clamp(0.8 * (1 - age), 0, 0.8);
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  // 天體本體
  for (let i = 0; i < BODIES.length; i++) {
    const b = BODIES[i];
    const p = (i === centerIdx) ? { x: 0, y: 0 } : relPos(b, t);
    drawBody(b, toScreen(p), i === centerIdx);
  }

  // 中心十字
  const cs = toScreen({ x: 0, y: 0 });
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cs.x - 9, cs.y); ctx.lineTo(cs.x + 9, cs.y);
  ctx.moveTo(cs.x, cs.y - 9); ctx.lineTo(cs.x, cs.y + 9);
  ctx.stroke();

  updateReadout();
}

function drawOrbitEllipse(b) {
  const path = new Path2D();
  const n = 256;
  for (let k = 0; k <= n; k++) {
    const s = toScreen(posFromE(b, 2 * Math.PI * k / n)); // 日心座標即相對太陽
    if (k === 0) path.moveTo(s.x, s.y); else path.lineTo(s.x, s.y);
  }
  ctx.strokeStyle = b.color;
  ctx.globalAlpha = 0.32;
  ctx.lineWidth = 1;
  ctx.stroke(path);
  ctx.globalAlpha = 1;
}

function drawWindowPath(b) {
  const N = trailYears;
  const n = clamp(Math.round(N * 400), 400, 3000);
  // 過去（實線）
  let path = new Path2D();
  for (let k = 0; k <= n; k++) {
    const ti = t - N + N * k / n;
    const s = toScreen(relPos(b, ti));
    if (k === 0) path.moveTo(s.x, s.y); else path.lineTo(s.x, s.y);
  }
  ctx.strokeStyle = b.color;
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = 1.5;
  ctx.stroke(path);
  // 未來（虛線、淡）
  path = new Path2D();
  for (let k = 0; k <= n; k++) {
    const ti = t + N * k / n;
    const s = toScreen(relPos(b, ti));
    if (k === 0) path.moveTo(s.x, s.y); else path.lineTo(s.x, s.y);
  }
  ctx.setLineDash([4, 5]);
  ctx.globalAlpha = 0.22;
  ctx.lineWidth = 1.2;
  ctx.stroke(path);
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

function drawBody(b, s, isCenter) {
  if (b.sun) {
    const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, b.r * 2.6);
    g.addColorStop(0, '#fff3b0');
    g.addColorStop(0.4, '#ffcf45');
    g.addColorStop(1, 'rgba(255,160,30,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(s.x, s.y, b.r * 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
  if (b.ring) {
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(-0.5);
    ctx.strokeStyle = 'rgba(220,205,150,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, b.r * 1.9, b.r * 0.7, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  ctx.beginPath();
  ctx.arc(s.x, s.y, b.r, 0, Math.PI * 2);
  ctx.fillStyle = b.color;
  ctx.fill();
  if (isCenter) {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  if (showLabels) {
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText(b.name, s.x + b.r + 3, s.y - b.r - 2);
  }
}

// ---- 讀數 ----
function fmtDate() {
  const ms = J2000 + t * 365.25 * 86400000;
  const d = new Date(ms);
  if (isNaN(d.getTime())) return '—';
  const y  = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const da = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}
function daysPerSec() { return 0.2 * Math.pow(10, sliderSpeed / 250); }
function updateReadout() {
  el.oDate.textContent   = fmtDate();
  el.oCenter.textContent = BODIES[centerIdx].name;
  const dps = daysPerSec();
  el.oSpeed.textContent  = dps >= 365
    ? (dps / 365.25).toFixed(2) + ' 年/秒'
    : dps.toFixed(1) + ' 天/秒';
}

// ---- 即時軌跡記錄 ----
function record() {
  for (let i = 0; i < BODIES.length; i++) {
    if (i === centerIdx) continue;
    const p = relPos(BODIES[i], t);
    p.t = t;
    const arr = trails[i];
    arr.push(p);
    while (arr.length && arr[0].t < t - trailYears) arr.shift();
    if (arr.length > 4000) arr.splice(0, arr.length - 4000);
  }
}
function clearTrails() { for (const a of trails) a.length = 0; }

// ---- 動畫迴圈 ----
let lastTs = null;
function loop(ts) {
  if (lastTs == null) lastTs = ts;
  let dt = (ts - lastTs) / 1000;
  lastTs = ts;
  if (dt > 0.1) dt = 0.1; // 切換分頁等情況的跳動鉗制
  if (playing) {
    t += dir * daysPerSec() * dt / 365.25;
    if (!preview) record();
  }
  draw();
  requestAnimationFrame(loop);
}

// ---- 視圖 ----
function fitAU(au) {
  pxPerAU = Math.min(cssW, cssH) / 2 * 0.9 / au;
  panX = 0;
  panY = 0;
}

function pickCenter(mx, my) {
  for (let i = 0; i < BODIES.length; i++) {
    const p = (i === centerIdx) ? { x: 0, y: 0 } : relPos(BODIES[i], t);
    const s = toScreen(p);
    const rr = BODIES[i].r + 6;
    if ((mx - s.x) ** 2 + (my - s.y) ** 2 <= rr * rr) {
      centerIdx = i;
      el.selCenter.value = String(i);
      clearTrails();
      return;
    }
  }
}

// ---- 初始化 / 事件綁定 ----
function init() {
  el = {
    selCenter: document.getElementById('selCenter'),
    btnPlay:   document.getElementById('btnPlay'),
    btnRev:    document.getElementById('btnRev'),
    rngSpeed:  document.getElementById('rngSpeed'),
    rngTrail:  document.getElementById('rngTrail'),
    lblTrail:  document.getElementById('lblTrail'),
    chkPreview:document.getElementById('chkPreview'),
    chkLabels: document.getElementById('chkLabels'),
    btnInner:  document.getElementById('btnInner'),
    btnMid:    document.getElementById('btnMid'),
    btnAll:    document.getElementById('btnAll'),
    btnReset:  document.getElementById('btnReset'),
    btnClear:  document.getElementById('btnClear'),
    oDate:     document.getElementById('oDate'),
    oCenter:   document.getElementById('oCenter'),
    oSpeed:    document.getElementById('oSpeed'),
    legend:    document.getElementById('legend'),
    panel:     document.getElementById('panel'),
    panelHead: document.getElementById('panelHead'),
  };

  // 中心點選單
  BODIES.forEach((b, i) => {
    const o = document.createElement('option');
    o.value = String(i);
    o.textContent = b.name;
    el.selCenter.appendChild(o);
  });
  el.selCenter.value = String(centerIdx);

  // 圖例
  BODIES.forEach((b) => {
    const item = document.createElement('span');
    item.className = 'lg';
    item.innerHTML = `<i style="background:${b.color}"></i>${b.name}`;
    el.legend.appendChild(item);
  });

  // 事件
  el.selCenter.addEventListener('change', e => { centerIdx = +e.target.value; clearTrails(); });
  el.btnPlay.addEventListener('click', () => { playing = !playing; el.btnPlay.textContent = playing ? '⏸ 暫停' : '▶ 播放'; });
  el.btnRev.addEventListener('click', () => { dir = -dir; el.btnRev.textContent = dir > 0 ? '⏩ 正向' : '⏪ 反向'; });
  el.rngSpeed.addEventListener('input', e => { sliderSpeed = +e.target.value; });
  el.rngTrail.addEventListener('input', e => {
    trailYears = +e.target.value;
    el.lblTrail.textContent = trailYears + ' 年';
    clearTrails();
  });
  el.chkPreview.addEventListener('change', e => { preview = e.target.checked; clearTrails(); });
  el.chkLabels.addEventListener('change', e => { showLabels = e.target.checked; });
  el.btnInner.addEventListener('click', () => fitAU(1.7));
  el.btnMid.addEventListener('click',   () => fitAU(5.8));
  el.btnAll.addEventListener('click',   () => fitAU(50));
  el.btnReset.addEventListener('click', () => { t = 0; clearTrails(); fitAU(5.8); playing = true; el.btnPlay.textContent = '⏸ 暫停'; });
  el.btnClear.addEventListener('click', clearTrails);
  el.panelHead.addEventListener('click', () => el.panel.classList.toggle('collapsed'));

  // 縮放（以游標為中心）
  cv.addEventListener('wheel', e => {
    e.preventDefault();
    const mx = e.clientX, my = e.clientY;
    const wx = (mx - viewCx - panX) / pxPerAU;
    const wy = -(my - viewCy - panY) / pxPerAU;
    const f = Math.exp(-e.deltaY * 0.0015);
    pxPerAU = clamp(pxPerAU * f, 0.05, 100000);
    panX = mx - viewCx - wx * pxPerAU;
    panY = my - viewCy + wy * pxPerAU;
  }, { passive: false });

  // 拖曳平移 + 點擊選中心
  let dragging = false, lastX = 0, lastY = 0, downX = 0, downY = 0, moved = false;
  cv.addEventListener('mousedown', e => {
    dragging = true; moved = false;
    lastX = downX = e.clientX; lastY = downY = e.clientY;
  });
  window.addEventListener('mousemove', e => {
    if (!dragging) return;
    panX += e.clientX - lastX;
    panY += e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    if (Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY) > 4) moved = true;
  });
  window.addEventListener('mouseup', e => {
    if (dragging && !moved) pickCenter(e.clientX, e.clientY);
    dragging = false;
  });

  // 鍵盤
  window.addEventListener('keydown', e => {
    if (e.code === 'Space') { e.preventDefault(); el.btnPlay.click(); }
  });

  window.addEventListener('resize', resize);

  resize();
  fitAU(5.8);
  el.lblTrail.textContent = trailYears + ' 年';
  requestAnimationFrame(loop);
}

init();
