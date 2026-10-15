// Builds every image on the profile, in light and dark:
//   dist/dog(-dark).svg        — a black goldendoodle trots in, waters the
//                                (grey) contribution graph, and the real green
//                                spreads out from his puddle across the year
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
const CELL = 14, PITCH = 18, PAD = 20;
const COLS = weeks.length;
const GRID_W = COLS * PITCH - (PITCH - CELL);
const GRID_BOTTOM = PAD + 7 * PITCH - (PITCH - CELL);
const S = 2.0;                                   // dog scale (~108px tall: fits the 7 rows)
const GROUND = GRID_BOTTOM - 2;                  // feet on the bottom row: he walks on the graph
const W = GRID_W + PAD * 2, H = GRID_BOTTOM + PAD;
const T = 16;

const STOP_X = PAD + Math.round(COLS * 0.55) * PITCH;
const IN_END = 0.2, PEE_A = 0.24, PEE_B = 0.36, OUT_A = 0.4, OUT_B = 0.62;
const START_X = -125, END_X = W + 10;
const IMPACT_X = STOP_X - 24 * S;
const IMPACT_COL = Math.max(0, Math.min(COLS - 1, Math.round((IMPACT_X - PAD) / PITCH)));
const pct = (u) => `${(u * 100).toFixed(3)}%`;

function legKeyframes(name, phase) {
  const walking = (u) => (u >= 0 && u <= IN_END) || (u >= OUT_A && u <= OUT_B);
  const steps = [];
  for (let i = 0; i <= 256; i++) {
    const u = i / 256, s = u * T;
    const a = walking(u) ? 24 * Math.sin((2 * Math.PI * s) / 0.46 + phase) : 0;
    steps.push(`${pct(u)}{transform:rotate(${a.toFixed(1)}deg)}`);
  }
  return `@keyframes ${name}{${steps.join("")}}`;
}

function dogSvg(theme) {
  const th = THEMES[theme];
  const coat = "#1e1e22", curl = "#34343b", ol = th.outline;
  const olAttr = ol === "none" ? "" : ` stroke="${ol}" stroke-width="0.7"`;

  let cells = "", reveal = "";
  weeks.forEach((w, x) => {
    w.contributionDays.forEach((d) => {
      const cx = PAD + x * PITCH, cy = PAD + d.weekday * PITCH;
      cells += `<rect x="${cx}" y="${cy}" width="${CELL}" height="${CELL}" rx="2.5" fill="${th.grid[0]}"/>`;
      const lv = level(d.contributionCount);
      if (lv > 0) {
        const dist = Math.hypot(x - IMPACT_COL, (6 - d.weekday) * 1.2);
        reveal += `<rect class="r" style="animation-delay:${(dist * 0.055).toFixed(2)}s" x="${cx}" y="${cy}" width="${CELL}" height="${CELL}" rx="2.5" fill="${th.grid[lv]}"/>`;
      }
    });
  });

  const leg = (x, cls, fill) =>
    `<g class="${cls}"><rect x="${x}" y="-16" width="6.6" height="15" rx="3.2" fill="${fill}"${olAttr}/><ellipse cx="${x + 3.6}" cy="-1.6" rx="4.4" ry="2.1" fill="${fill}"${olAttr}/></g>`;
  const curls = (pts, r = 1.4) => pts.map(([x, y]) => `<path d="M${x - r} ${y} a${r} ${r} 0 1 1 ${r * 1.6} ${r * 0.9}" fill="none" stroke="${curl}" stroke-width="0.8" stroke-linecap="round" opacity="0.8"/>`).join("");
  const fluff = (pts, r) => pts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${coat}"/>`).join("");

  // Black goldendoodle, facing right, feet on y=0. Fluff = overlapping circles.
  const dog = `
<g class="dog"><g transform="scale(${S})">
  <path class="stream" d="M4 -18 Q -6 -22 -13 0" fill="none" stroke="#f5d33a" stroke-width="2" stroke-linecap="round" opacity="0"/>
  <g class="tail">
    <path d="M5 -27 Q -3 -33 -6 -43" fill="none" stroke="${coat}" stroke-width="6" stroke-linecap="round"${olAttr}/>
    ${fluff([[-6, -43], [-3, -38], [-8, -39]], 3.4)}
    ${curls([[-6, -42], [-3, -37]])}
  </g>
  ${leg(7, "lb", coat)}
  ${leg(30, "la", coat)}
  <ellipse cx="21" cy="-23" rx="19.5" ry="10.5" fill="${coat}"${olAttr}/>
  ${fluff([[6, -29], [11, -32], [16, -33], [21, -33], [26, -33], [31, -32], [35, -29], [4, -22], [8, -15], [14, -13], [20, -12.5], [26, -13], [32, -15]], 4.2)}
  ${curls([[9, -27], [15, -24], [21, -28], [27, -24], [32, -27], [12, -18], [19, -19], [26, -18], [17, -30], [24, -31]])}
  <g class="lift">${leg(11, "la", coat)}</g>
  ${leg(34, "lb", coat)}
  <g class="head">
    <rect x="33" y="-36" width="9" height="16" rx="4" fill="${coat}"/>
    <rect x="33" y="-28" width="9" height="3.2" rx="1.2" fill="#e5484d"/>
    <circle cx="42" cy="-39" r="10" fill="${coat}"${olAttr}/>
    ${fluff([[36, -47], [41, -49.5], [46, -48], [49.5, -44]], 4)}
    ${curls([[38, -46], [43, -48], [47, -45]], 1.4)}
    <ellipse cx="50.5" cy="-35" rx="7.6" ry="5.4" fill="${coat}"${olAttr}/>
    ${fluff([[48, -30.5], [52, -30], [55.5, -31.5]], 3.1)}
    <ellipse cx="57.6" cy="-37.2" rx="2.6" ry="2.1" fill="#050505"/>
    <circle cx="46" cy="-41.5" r="1.9" fill="#050505"/>
    <circle cx="46.6" cy="-42.1" r="0.65" fill="#ffffff"/>
    <ellipse cx="52.5" cy="-27.6" rx="2" ry="2.9" fill="#ff7b9c"/>
    <g class="ear">
      <ellipse cx="36.5" cy="-34" rx="5" ry="10" fill="${coat}"${olAttr}/>
      ${fluff([[35, -26], [38.5, -25.5], [35.5, -30]], 3.2)}
      ${curls([[36.5, -36], [36, -30], [37.5, -27]], 1.3)}
    </g>
  </g>
</g></g>`;

  const css = `
.dog{animation:walk ${T}s linear infinite}
@keyframes walk{0%{transform:translate(${START_X}px,${GROUND}px)}${pct(IN_END)},${pct(OUT_A)}{transform:translate(${STOP_X}px,${GROUND}px)}${pct(OUT_B)},100%{transform:translate(${END_X}px,${GROUND}px)}}
.la,.lb,.lift,.tail,.head,.ear{transform-box:fill-box}
.la{transform-origin:50% 0;animation:la ${T}s linear infinite}
.lb{transform-origin:50% 0;animation:lb ${T}s linear infinite}
${legKeyframes("la", 0)}
${legKeyframes("lb", Math.PI)}
.lift{transform-origin:50% 0;animation:lift ${T}s ease-in-out infinite}
@keyframes lift{0%,${pct(PEE_A - 0.015)}{transform:rotate(0)}${pct(PEE_A + 0.01)},${pct(PEE_B)}{transform:rotate(68deg)}${pct(PEE_B + 0.02)},100%{transform:rotate(0)}}
.tail{transform-origin:85% 100%;animation:wag .3s ease-in-out infinite alternate}
@keyframes wag{from{transform:rotate(-20deg)}to{transform:rotate(24deg)}}
.ear{transform-origin:50% 10%;animation:flop .46s ease-in-out infinite alternate}
@keyframes flop{from{transform:rotate(-6deg)}to{transform:rotate(7deg)}}
.head{transform-origin:15% 90%;animation:look ${T}s ease-in-out infinite}
@keyframes look{0%,${pct(PEE_A)}{transform:rotate(0)}${pct(PEE_A + 0.03)},${pct(PEE_B)}{transform:rotate(-12deg)}${pct(PEE_B + 0.03)},100%{transform:rotate(0)}}
.stream{stroke-dasharray:2.4 2;animation:flow .22s linear infinite,pee ${T}s linear infinite}
@keyframes flow{to{stroke-dashoffset:-8.8}}
@keyframes pee{0%,${pct(PEE_A + 0.015)}{opacity:0}${pct(PEE_A + 0.025)},${pct(PEE_B - 0.01)}{opacity:1}${pct(PEE_B)},100%{opacity:0}}
.puddle{transform-box:fill-box;transform-origin:50% 50%;animation:puddle ${T}s ease-out infinite}
@keyframes puddle{0%,${pct(PEE_A + 0.02)}{transform:scale(0);opacity:0}${pct(PEE_B)}{transform:scale(1);opacity:.8}${pct(0.8)}{transform:scale(1.05);opacity:.65}${pct(0.9)},100%{transform:scale(1.1);opacity:0}}
.r{opacity:0;animation:reveal ${T}s ease-out infinite}
@keyframes reveal{0%,${pct(PEE_A + 0.04)}{opacity:0}${pct(PEE_A + 0.07)},95%{opacity:1}99%,100%{opacity:0}}
@media (prefers-reduced-motion:reduce){.dog,.la,.lb,.lift,.tail,.head,.ear,.stream,.puddle,.r{animation:none}.r{opacity:1}.dog{transform:translate(${STOP_X}px,${GROUND}px)}}
`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<title>${esc(LOGIN)}'s contribution graph, watered by a black goldendoodle</title>
<style>${css}</style>
${cells}
${reveal}
<ellipse class="puddle" cx="${IMPACT_X}" cy="${GROUND - 5}" rx="${15 * S}" ry="${3.4 * S}" fill="${th.grid[4]}"/>
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
