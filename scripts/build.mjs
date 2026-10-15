// Builds every image on the profile, in light and dark:
//   dist/dog(-dark).svg        — a pixel goldendoodle walks to each patch of
//                                green on the (grey) graph and waters it; only
//                                that patch's real squares light up
//   dist/stats(-dark).svg      — this year's numbers, drawn, not boxed
//   dist/cards/<slug>(-dark).svg — one card per shipped project
// Pure SVG + CSS keyframes so everything animates inside a README <img>.
//
//   GITHUB_TOKEN=... node scripts/build.mjs [login]
import fs from "node:fs/promises";

const LOGIN = process.argv[2] || process.env.GITHUB_REPOSITORY_OWNER || "blakeb056";
const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) throw new Error("GITHUB_TOKEN is required");

const FONT = `-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif`;
const MONO = `ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,monospace`;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fmt = (n) => n.toLocaleString("en-US");

const THEMES = {
  light: {
    grid: ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"],
    text: "#1f2328", muted: "#59636e", faint: "#d1d9e0", card: "#ffffff", border: "#d1d9e0",
    a: "#0050ff", b: "#7a2cf0", pill: "#f6f8fa", pillText: "#3d4651",
    outline: "none",
  },
  dark: {
    grid: ["#161b22", "#0e4429", "#006d32", "#26a641", "#39d353"],
    text: "#f0f6fc", muted: "#9198a1", faint: "#30363d", card: "#0d1117", border: "#30363d",
    a: "#00fcfd", b: "#d450ff", pill: "#151b23", pillText: "#c9d1d9",
    outline: "#6b6b76",
  },
};

// ---- data -------------------------------------------------------------------
const query = `query($login:String!){user(login:$login){
  contributionsCollection{
    totalPullRequestContributions restrictedContributionsCount
    contributionCalendar{totalContributions weeks{contributionDays{contributionCount weekday date}}}
  }}}`;
const res = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: { authorization: `bearer ${TOKEN}`, "content-type": "application/json", "user-agent": "profile-build" },
  body: JSON.stringify({ query, variables: { login: LOGIN } }),
});
const json = await res.json();
if (!json.data?.user) throw new Error("GraphQL: " + JSON.stringify(json.errors ?? json));
const cc = json.data.user.contributionsCollection;
const weeks = cc.contributionCalendar.weeks;
const days = weeks.flatMap((w) => w.contributionDays);

const active = days.map((d) => d.contributionCount).filter((c) => c > 0).sort((a, b) => a - b);
const q = (p) => (active.length ? active[Math.min(active.length - 1, Math.floor(p * active.length))] : 1);
const [q1, q2, q3] = [q(0.25), q(0.5), q(0.75)];
const level = (c) => (c <= 0 ? 0 : c <= q1 ? 1 : c <= q2 ? 2 : c <= q3 ? 3 : 4);

// Streaks: today may still be empty, so the current streak may end yesterday.
let longest = 0, run = 0;
for (const d of days) { run = d.contributionCount > 0 ? run + 1 : 0; longest = Math.max(longest, run); }
let current = 0;
for (let i = days.length - 1; i >= 0; i--) {
  if (days[i].contributionCount > 0) current++;
  else if (i === days.length - 1) continue;
  else break;
}
const best = days.reduce((m, d) => (d.contributionCount > m.contributionCount ? d : m), days[0]);
const total = cc.contributionCalendar.totalContributions;
const privatePct = total ? Math.round((cc.restrictedContributionsCount / total) * 100) : 0;
const weekly = weeks.map((w) => w.contributionDays.reduce((s, d) => s + d.contributionCount, 0));

// ---- the dog ----------------------------------------------------------------
// A pixel-art sprite of Blake's dog: a salt-and-pepper grey goldendoodle with
// a tan beard. Drawn on a 40x30 pixel raster from simple shapes, coat colours
// picked by a fixed hash so the curls look hand-dithered and never change
// between builds. Legs and tail are frame-swapped (no smooth rotation), so he
// moves like a game sprite.
const CELL = 14, PITCH = 18, PAD = 20;
const COLS = weeks.length;
const GRID_W = COLS * PITCH - (PITCH - CELL);
const GRID_BOTTOM = PAD + 7 * PITCH - (PITCH - CELL);
const W = GRID_W + PAD * 2, H = GRID_BOTTOM + PAD;

const PX = 3.6;                                  // one sprite pixel, in SVG units
const SPR_W = 40, SPR_H = 30;                    // sprite raster; feet on row 29
const TOP = GRID_BOTTOM - SPR_H * PX + 2;        // he stands on the bottom row of the graph

// ---- route: one stop per patch of green --------------------------------------
// Weeks with any contributions, merged into one patch when separated by at most
// MERGE_GAP empty weeks. He walks to each patch in turn, stops, pees, and only
// that patch's real green squares light up. Empty squares never change.
const MERGE_GAP = 0, MAX_STOPS = 3;
const greenCols = weeks.map((w) => w.contributionDays.some((d) => level(d.contributionCount) > 0));
let patches = [];
greenCols.forEach((g, x) => {
  if (!g) return;
  const last = patches[patches.length - 1];
  if (last && x - last.to <= MERGE_GAP + 1) last.to = x;
  else patches.push({ from: x, to: x });
});
while (patches.length > MAX_STOPS) {          // too many stops: merge the closest pair
  let bi = 0, bg = Infinity;
  for (let i = 0; i < patches.length - 1; i++) {
    const g = patches[i + 1].from - patches[i].to;
    if (g < bg) { bg = g; bi = i; }
  }
  patches.splice(bi, 2, { from: patches[bi].from, to: patches[bi + 1].to });
}
// He stands over the bulk of each patch (mean column of its green squares).
patches = patches.map((pt) => {
  let sum = 0, n = 0;
  for (let x = pt.from; x <= pt.to; x++)
    for (const d of weeks[x].contributionDays) if (level(d.contributionCount) > 0) { sum += x; n++; }
  const col = n ? sum / n : (pt.from + pt.to) / 2;
  const impactPx = PAD + col * PITCH + CELL / 2;
  // The stream lands 2 sprite px behind him; keep his whole body inside the graph.
  return { ...pt, col, dogX: Math.min(impactPx + 2 * PX, W - PAD / 2 - SPR_W * PX) };
});

const SPEED = 190;                  // px/s while walking
const STAND = 2.4, LIFT_A = 0.35, LIFT_B = 1.95; // seconds at a stop; leg up between A and B
const HOLD = 2.6;                   // the whole year lit, after he trots off
const START_X = -SPR_W * PX - 10, END_X = W + 10;
const route = [];
{
  let t = 0, x = START_X;
  patches.forEach((pt, i) => {
    const dur = Math.abs(pt.dogX - x) / SPEED;
    route.push({ t0: t, t1: t + dur, x0: x, kind: "walk" }); t += dur; x = pt.dogX;
    route.push({ t0: t, t1: t + STAND, x0: x, kind: "stop", patch: i }); t += STAND;
  });
  const dur = Math.abs(END_X - x) / SPEED;
  route.push({ t0: t, t1: t + dur, x0: x, kind: "walk" }); t += dur;
  route.push({ t0: t, t1: t + HOLD, x0: END_X, kind: "off" }); t += HOLD;
}
const T = route[route.length - 1].t1;
const stops = route.filter((r) => r.kind === "stop");
const pct = (u) => `${(u * 100).toFixed(3)}%`;
const at = (sec) => pct(Math.min(1, Math.max(0, sec / T)));

const PAL = {
  K: "#141416", D: "#2b2b30", G: "#4a4b52", L: "#74767e", S: "#a3a5ad",
  T: "#b07a4f", t: "#7d5233", N: "#050505", W: "#ffffff", P: "#ff7b9c",
};
function hash(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
const coat = (x, y, dark = 0) => {
  const v = hash(x, y) - dark;
  return v > 0.82 ? "S" : v > 0.55 ? "L" : v > 0.24 ? "G" : "D";
};

class Raster {
  constructor() { this.px = new Map(); }
  set(x, y, c) { if (x >= -8 && x < SPR_W + 4 && y >= 0 && y < SPR_H) this.px.set(`${x},${y}`, c); }
  get(x, y) { return this.px.get(`${x},${y}`); }
  ellipse(cx, cy, rx, ry, color) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++)
        if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1) this.set(x, y, color(x, y));
  }
  circle(cx, cy, r, color) { this.ellipse(cx, cy, r, r, color); }
  // A leg: 3px wide from the hip to the foot, plus a 5px paw.
  leg(hx, hy, fx, fy, dark) {
    const n = 16;
    for (let i = 0; i <= n; i++) {
      const x = Math.round(hx + ((fx - hx) * i) / n), y = Math.round(hy + ((fy - hy) * i) / n);
      for (let k = 0; k < 3; k++) this.set(x + k, y, coat(x + k, y, dark));
    }
    for (let k = -1; k < 4; k++) this.set(Math.round(fx) + k, Math.round(fy), coat(fx + k, fy, dark + 0.25));
  }
  outline() {
    const add = [];
    for (const key of this.px.keys()) {
      const [x, y] = key.split(",").map(Number);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
        if (!this.px.has(`${x + dx},${y + dy}`)) add.push([x + dx, y + dy]);
    }
    for (const [x, y] of add) this.set(x, y, "K");
    return this;
  }
  // Horizontal runs of one colour → one <rect> each.
  svg() {
    const rows = new Map();
    for (const [key, c] of this.px) {
      const [x, y] = key.split(",").map(Number);
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y).push([x, c]);
    }
    let out = "";
    for (const [y, cells] of rows) {
      cells.sort((a, b) => a[0] - b[0]);
      let i = 0;
      while (i < cells.length) {
        let j = i;
        while (j + 1 < cells.length && cells[j + 1][0] === cells[j][0] + 1 && cells[j + 1][1] === cells[i][1]) j++;
        out += `<rect x="${cells[i][0]}" y="${y}" width="${j - i + 1}" height="1" fill="${PAL[cells[i][1]]}"/>`;
        i = j + 1;
      }
    }
    return out;
  }
}

function spriteBody() {
  const r = new Raster();
  const c = (d = 0) => (x, y) => coat(x, y, d + (y >= 19 ? 0.18 : 0));
  r.ellipse(16.5, 16, 11, 5.5, c());                                  // body
  for (const [x, y] of [[9, 11], [13, 10], [17, 10], [21, 10], [25, 11]]) r.circle(x, y, 2.3, c());
  r.circle(26, 15, 4, c());                                           // chest
  for (let y = 9; y <= 16; y++) for (let x = 25; x <= 29; x++) r.set(x, y, coat(x, y));
  r.circle(30, 8, 5.5, c(-0.12));                                    // head (a touch lighter than the coat)
  for (const [x, y] of [[27, 3], [30, 2], [33, 3]]) r.circle(x, y, 2.6, c(-0.08)); // topknot
  // Snout with the tan beard: top stays grey, the lower half goes tan.
  r.ellipse(35.5, 10, 3.2, 2.4, (x, y) => (y >= 10 ? (hash(x, y) > 0.45 ? "T" : "t") : coat(x, y, -0.05)));
  for (const [x, y] of [[34, 12.2], [36.2, 12.8]]) r.circle(x, y, 1.6, (x, y) => (hash(x, y) > 0.5 ? "T" : "t"));
  r.outline();
  // Long fluffy ear hanging past the cheek: darker than the head, with its own
  // dark rim on the face side so it reads as a separate shape.
  const EX = 28.6, EY = 12.2, ERX = 2.7, ERY = 6.2;
  r.ellipse(EX, EY, ERX, ERY, (x, y) => coat(x, y, 0.42));
  for (let y = Math.floor(EY - ERY) + 1; y <= Math.ceil(EY + ERY); y++) {
    const half = ERX * Math.sqrt(Math.max(0, 1 - ((y + 0.5 - EY) / ERY) ** 2));
    r.set(Math.round(EX + half), y, "K");                              // rim on the face side
    if (y > EY + 2) r.set(Math.round(EX - half) - 1, y, "K");          // rim where it hangs past the neck
  }
  for (let x = Math.round(EX - ERX); x <= Math.round(EX + ERX); x++) r.set(x, Math.ceil(EY + ERY) + 1, "K");
  for (const [x, y] of [[37, 8], [38, 8], [37, 9], [38, 9]]) r.set(x, y, "N"); // nose
  for (const [x, y] of [[32, 7], [33, 7], [32, 8], [33, 8]]) r.set(x, y, "N"); // eye
  r.set(33, 7, "W");
  r.set(35, 11, "t"); r.set(36, 11, "t");                              // mouth
  r.set(36, 12, "P"); r.set(37, 12, "P"); r.set(36, 13, "P");          // tongue
  return r;
}
function spriteTail(lean) {
  const r = new Raster();
  const pts = lean ? [[6, 13], [6, 10], [7, 7], [8.5, 4.6]] : [[6, 13], [4, 10], [3, 7], [3.6, 4.4]];
  for (const [x, y] of pts) r.circle(x, y, 1.9, (x, y) => coat(x, y, -0.05));
  return r.outline();
}
// Leg poses: [rear far, rear near, front far, front near] foot x-offsets.
const HIPS = [[8, 19], [11, 19], [21, 19], [24, 19]];
function spriteLegs(offsets, near, liftRearNear = false) {
  const r = new Raster();
  HIPS.forEach(([hx, hy], i) => {
    const isNear = i === 1 || i === 3;
    if (isNear !== near) return;
    if (liftRearNear && i === 1) r.leg(hx, hy, 3, 13, -0.12);
    else r.leg(hx, hy, hx + offsets[i], 28, isNear ? 0 : 0.22);
  });
  return r.outline();
}
const POSES = {
  a: [-2, 2, 2, -2],
  b: [2, -2, -2, 2],
  stand: [0, 0, 0, 0],
};

// Which leg frame shows when, over one loop.
function poseAt(u) {
  const sec = u * T;
  const seg = route.find((r) => sec >= r.t0 && sec < r.t1) || route[route.length - 1];
  if (seg.kind === "stop") { const k = sec - seg.t0; return k >= LIFT_A && k <= LIFT_B ? "lift" : "stand"; }
  if (seg.kind === "off") return "stand";
  return Math.floor(sec / 0.16) % 2 ? "b" : "a";
}
function frameKeyframes() {
  const names = ["a", "b", "stand", "lift"];
  const out = Object.fromEntries(names.map((n) => [n, []]));
  let prev = null;
  const N = Math.ceil(T * 60);
  for (let i = 0; i <= N; i++) {
    const u = i / N, cur = poseAt(Math.min(u, 0.9999));
    if (cur !== prev || i === N) {
      for (const n of names) out[n].push(`${pct(u)}{opacity:${n === cur ? 1 : 0}}`);
      prev = cur;
    }
  }
  return names.map((n) => `@keyframes f-${n}{${out[n].join("")}}.f-${n}{animation:f-${n} ${T}s step-end infinite}`).join("\n");
}

function dogSvg(theme) {
  const th = THEMES[theme];

  let cells = "", reveal = "";
  weeks.forEach((w, x) => {
    const pi = patches.findIndex((pt) => x >= pt.from && x <= pt.to);
    w.contributionDays.forEach((d) => {
      const cx = PAD + x * PITCH, cy = PAD + d.weekday * PITCH;
      cells += `<rect x="${cx}" y="${cy}" width="${CELL}" height="${CELL}" rx="2.5" fill="${th.grid[0]}"/>`;
      const lv = level(d.contributionCount);
      if (lv > 0 && pi >= 0) {
        const dist = Math.hypot(x - patches[pi].col, (6 - d.weekday) * 1.1);
        reveal += `<rect class="r rv${pi}" style="animation-delay:${(dist * 0.05).toFixed(2)}s" x="${cx}" y="${cy}" width="${CELL}" height="${CELL}" rx="2.5" fill="${th.grid[lv]}"/>`;
      }
    });
  });

  const legs = (near) =>
    ["a", "b", "stand"].map((p) => `<g class="f-${p}" opacity="0">${spriteLegs(POSES[p], near).svg()}</g>`).join("") +
    `<g class="f-lift" opacity="0">${spriteLegs(POSES.stand, near, true).svg()}</g>`;

  const dog = `
<g class="dog"><g transform="scale(${PX})" shape-rendering="crispEdges">
  <path class="stream" d="M4.5 15.5 Q 0.5 16 -2 29" fill="none" stroke="#f5d33a" stroke-width="1" opacity="0"/>
  ${legs(false)}
  <g class="ta">${spriteTail(false).svg()}</g>
  <g class="tb" opacity="0">${spriteTail(true).svg()}</g>
  ${spriteBody().svg()}
  ${legs(true)}
</g></g>`;

  const css = `
.dog{animation:walk ${T}s linear infinite}
@keyframes walk{${route.map((r) => `${at(r.t0)}{transform:translate(${r.x0.toFixed(1)}px,${TOP}px)}`).join("")}100%{transform:translate(${END_X}px,${TOP}px)}}
${frameKeyframes()}
.ta{animation:ta .36s step-end infinite}.tb{animation:tb .36s step-end infinite}
@keyframes ta{0%{opacity:1}50%{opacity:0}}@keyframes tb{0%{opacity:0}50%{opacity:1}}
.stream{stroke-dasharray:1 1;animation:flow .2s steps(2) infinite,pee ${T}s linear infinite}
@keyframes flow{to{stroke-dashoffset:-2}}
@keyframes pee{0%{opacity:0}${stops.map((r) => `${at(r.t0 + LIFT_A + 0.08)}{opacity:0}${at(r.t0 + LIFT_A + 0.12)},${at(r.t0 + LIFT_B - 0.12)}{opacity:1}${at(r.t0 + LIFT_B - 0.06)}{opacity:0}`).join("")}100%{opacity:0}}
.r{opacity:0}
${stops.map((r) => { const a = r.t0 + LIFT_A + 0.15; return `.rv${r.patch}{animation:rv${r.patch} ${T}s ease-out infinite}@keyframes rv${r.patch}{0%,${at(a)}{opacity:0}${at(a + 0.35)},${at(T - 0.9)}{opacity:1}${at(T - 0.25)},100%{opacity:0}}`; }).join("\n")}
@media (prefers-reduced-motion:reduce){.dog,.f-a,.f-b,.f-stand,.f-lift,.ta,.tb,.stream,.r{animation:none!important}.r,.f-stand{opacity:1!important}.dog{transform:translate(${(patches[0]?.dogX ?? 40).toFixed(1)}px,${TOP}px)}}
`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<title>${esc(LOGIN)}'s contribution graph, watered by a pixel goldendoodle</title>
<style>${css}</style>
${cells}
${reveal}
${dog}
</svg>`;
}

// ---- stats ------------------------------------------------------------------
function statsSvg(theme) {
  const th = THEMES[theme];
  const SW = 900, SH = 250;
  // Weekly area chart.
  const cx0 = 24, cw = 520, cy0 = 112, ch = 112;
  const max = Math.max(...weekly, 1);
  const pts = weekly.map((v, i) => [cx0 + (i / (weekly.length - 1)) * cw, cy0 + ch - (v / max) * ch]);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `${line} L${cx0 + cw} ${cy0 + ch} L${cx0} ${cy0 + ch} Z`;
  const peakI = weekly.indexOf(max);
  const [px, py] = pts[peakI];
  const months = [];
  weeks.forEach((w, i) => {
    const d = new Date(w.contributionDays[0].date + "T00:00:00Z");
    if (d.getUTCDate() <= 7 && i > 0 && i < weeks.length - 2)
      months.push(`<text x="${pts[i][0].toFixed(1)}" y="${cy0 + ch + 18}" font-size="11" fill="${th.muted}" text-anchor="middle">${d.toLocaleString("en-US", { month: "short", timeZone: "UTC" })}</text>`);
  });

  const bestDate = new Date(best.date + "T00:00:00Z").toLocaleString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const tiles = [
    [fmt(current), current === 1 ? "day streak, going now" : "day streak, going now"],
    [fmt(longest), "longest streak, days"],
    [fmt(best.contributionCount), `best day · ${bestDate}`],
    [fmt(cc.totalPullRequestContributions), "pull requests"],
  ];
  const tx0 = 596, ty0 = 38;
  const tileSvg = tiles.map(([n, label], i) => {
    const x = tx0 + (i % 2) * 152, y = ty0 + Math.floor(i / 2) * 96;
    return `<text x="${x}" y="${y + 38}" font-size="40" font-weight="800" fill="url(#g)" font-family="${FONT}">${n}</text>
<text x="${x}" y="${y + 60}" font-size="12.5" fill="${th.muted}">${esc(label)}</text>`;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SW}" height="${SH}" viewBox="0 0 ${SW} ${SH}" font-family="${FONT}">
<title>${esc(LOGIN)}: ${fmt(total)} contributions in the last year</title>
<defs>
  <linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="${th.a}"/><stop offset="1" stop-color="${th.b}"/></linearGradient>
  <linearGradient id="fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${th.a}" stop-opacity=".32"/><stop offset="1" stop-color="${th.b}" stop-opacity="0"/></linearGradient>
  <clipPath id="draw"><rect class="wipe" x="0" y="0" width="${SW}" height="${SH}"/></clipPath>
</defs>
<style>
.wipe{transform-origin:0 0;animation:wipe 2.2s cubic-bezier(.2,.7,.2,1) both}
@keyframes wipe{from{transform:scaleX(0)}to{transform:scaleX(1)}}
.pulse{transform-box:fill-box;transform-origin:50% 50%;animation:pulse 2s ease-in-out infinite}
@keyframes pulse{0%,100%{transform:scale(1);opacity:.35}50%{transform:scale(2.2);opacity:0}}
@media (prefers-reduced-motion:reduce){.wipe,.pulse{animation:none}}
</style>
<text x="24" y="58" font-size="52" font-weight="800" fill="url(#g)" letter-spacing="-1">${fmt(total)}</text>
<text x="24" y="84" font-size="15" fill="${th.text}" font-weight="600">contributions in the last year</text>
<text x="${24 + 232}" y="84" font-size="13" fill="${th.muted}">· ${privatePct}% of it in private repos</text>
${[0.25, 0.5, 0.75].map((f) => `<line x1="${cx0}" x2="${cx0 + cw}" y1="${cy0 + ch * f}" y2="${cy0 + ch * f}" stroke="${th.faint}" stroke-dasharray="2 4"/>`).join("")}
<line x1="${cx0}" x2="${cx0 + cw}" y1="${cy0 + ch}" y2="${cy0 + ch}" stroke="${th.faint}"/>
<g clip-path="url(#draw)">
  <path d="${area}" fill="url(#fill)"/>
  <path d="${line}" fill="none" stroke="url(#g)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
  <circle class="pulse" cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="5" fill="${th.b}"/>
  <circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="4.5" fill="${th.b}" stroke="${th.card}" stroke-width="2"/>
  <text x="${Math.min(px, cx0 + cw - 70).toFixed(1)}" y="${(py - 12).toFixed(1)}" font-size="11.5" fill="${th.text}" font-weight="600" text-anchor="middle">${fmt(max)} in one week</text>
</g>
${months.join("")}
<line x1="568" x2="568" y1="34" y2="218" stroke="${th.faint}"/>
${tileSvg}
</svg>`;
}

// ---- project cards ----------------------------------------------------------
function wrap(text, max) {
  const words = text.split(" "), lines = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > max) { lines.push(cur.trim()); cur = w; } else cur += " " + w;
  }
  if (cur.trim()) lines.push(cur.trim());
  return lines;
}

async function cardSvg(p, theme) {
  const th = THEMES[theme];
  const CW = 420, IH = 236;
  const img = (await fs.readFile(`assets/${p.image}`)).toString("base64");
  const lines = wrap(p.tagline, 50).slice(0, 3);
  let px = 22;
  const pills = p.tags.map((t) => {
    const w = Math.round(t.length * 6.3 + 20);
    const s = `<rect x="${px}" y="0" width="${w}" height="22" rx="11" fill="${th.pill}" stroke="${th.border}"/><text x="${px + w / 2}" y="15" font-size="11" fill="${th.pillText}" text-anchor="middle">${esc(t)}</text>`;
    px += w + 6;
    return s;
  }).join("");
  const ty = IH + 30;
  const CH = ty + 50 + 3 * 19 + 46;   // fixed: cards in a row line up
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CW}" height="${CH}" viewBox="0 0 ${CW} ${CH}" font-family="${FONT}">
<title>${esc(p.name)}: ${esc(p.tagline)}</title>
<defs>
  <linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="${th.a}"/><stop offset="1" stop-color="${th.b}"/></linearGradient>
  <clipPath id="c"><rect x="0.5" y="0.5" width="${CW - 1}" height="${CH - 1}" rx="14"/></clipPath>
</defs>
<g clip-path="url(#c)">
  <rect width="${CW}" height="${CH}" fill="${th.card}"/>
  <rect y="0" width="${CW}" height="${IH}" fill="${p.imageBg || "#000"}"/>
  <image href="data:image/jpeg;base64,${img}" x="0" y="0" width="${CW}" height="${IH}" preserveAspectRatio="${p.fit === "contain" ? "xMidYMid meet" : "xMidYMin slice"}"/>
  <rect y="0" width="${CW}" height="3" fill="url(#g)"/>
  <line x1="0" x2="${CW}" y1="${IH}" y2="${IH}" stroke="${th.border}"/>
</g>
<rect x="0.5" y="0.5" width="${CW - 1}" height="${CH - 1}" rx="14" fill="none" stroke="${th.border}"/>
<text x="22" y="${ty}" font-size="11" font-weight="700" letter-spacing="1.4" fill="${th.a}">${esc(p.kind.toUpperCase())}</text>
<text x="22" y="${ty + 30}" font-size="24" font-weight="800" fill="${th.text}" letter-spacing="-0.3">${esc(p.name)}</text>
${lines.map((l, i) => `<text x="22" y="${ty + 54 + i * 19}" font-size="14" fill="${th.muted}">${esc(l)}</text>`).join("")}
<g transform="translate(0 ${CH - 40})">${pills}</g>
<text x="${CW - 22}" y="${ty + 30}" font-size="13" font-weight="700" fill="url(#g)" text-anchor="end">${esc(p.cta)} →</text>
</svg>`;
}

// ---- write ------------------------------------------------------------------
const projects = JSON.parse(await fs.readFile("projects.json", "utf8"));
await fs.mkdir("dist/cards", { recursive: true });
for (const theme of ["light", "dark"]) {
  const sfx = theme === "dark" ? "-dark" : "";
  await fs.writeFile(`dist/dog${sfx}.svg`, dogSvg(theme));
  await fs.writeFile(`dist/stats${sfx}.svg`, statsSvg(theme));
  for (const p of projects) await fs.writeFile(`dist/cards/${p.slug}${sfx}.svg`, await cardSvg(p, theme));
}
console.log(`built: ${fmt(total)} contributions (${privatePct}% private), streak ${current}/${longest}, best ${best.contributionCount} on ${best.date}, ${projects.length} cards`);
