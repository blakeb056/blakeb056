// Draws the "good boy" contribution animation: your real GitHub contribution
// calendar, a dog that trots in, waters it (the squares behind him bloom
// green), wags, and trots off. Pure SVG + CSS keyframes, so it animates inside
// a README <img>. Writes dist/dog.svg (light) and dist/dog-dark.svg (dark).
//
//   GITHUB_TOKEN=... node scripts/dog.mjs [login]
import fs from "node:fs/promises";

const LOGIN = process.argv[2] || process.env.GITHUB_REPOSITORY_OWNER || "blakeb056";
const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) throw new Error("GITHUB_TOKEN is required");

// ---- data -------------------------------------------------------------------
const query = `query($login:String!){user(login:$login){contributionsCollection{contributionCalendar{weeks{contributionDays{contributionCount weekday}}}}}}`;
const res = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: { authorization: `bearer ${TOKEN}`, "content-type": "application/json", "user-agent": "dog-graph" },
  body: JSON.stringify({ query, variables: { login: LOGIN } }),
});
const json = await res.json();
if (!json.data?.user) throw new Error("GraphQL: " + JSON.stringify(json.errors ?? json));
const weeks = json.data.user.contributionsCollection.contributionCalendar.weeks;

const counts = weeks.flatMap((w) => w.contributionDays.map((d) => d.contributionCount)).filter((c) => c > 0).sort((a, b) => a - b);
const q = (p) => counts.length ? counts[Math.min(counts.length - 1, Math.floor(p * counts.length))] : 1;
const [q1, q2, q3] = [q(0.25), q(0.5), q(0.75)];
const level = (c) => (c <= 0 ? 0 : c <= q1 ? 1 : c <= q2 ? 2 : c <= q3 ? 3 : 4);

// ---- layout -----------------------------------------------------------------
const CELL = 11, PITCH = 14, PAD = 16;
const COLS = weeks.length;
const GRID_W = COLS * PITCH - (PITCH - CELL);
const GROUND = PAD + 7 * PITCH + 10;          // dog's feet
const W = GRID_W + PAD * 2, H = GROUND + 12;
const T = 14;                                  // loop length, seconds

// Dog path: in from the left, stop, water, out to the right.
const STOP_X = PAD + Math.round(COLS * 0.62) * PITCH;
const WALK_IN_END = 0.38, PEE_START = 0.44, PEE_END = 0.58, WALK_OUT_START = 0.62, WALK_OUT_END = 0.9;
const START_X = -70, END_X = W + 20;

// Puddle: lands just behind the dog's rear, on the bottom rows.
const IMPACT_COL = Math.floor((STOP_X - 18 - PAD) / PITCH);
const IMPACT_ROW = 6, RADIUS = 3.6;

const pct = (t) => `${(t * 100).toFixed(3)}%`;

// Leg swing, generated over the whole loop so the legs stop while he waters.
function legKeyframes(name, phase) {
  const steps = [];
  const walking = (u) => (u >= 0 && u <= WALK_IN_END) || (u >= WALK_OUT_START && u <= WALK_OUT_END);
  for (let i = 0; i <= 224; i++) {
    const u = i / 224, s = u * T;
    const a = walking(u) ? 26 * Math.sin((2 * Math.PI * s) / 0.5 + phase) : 0;
    steps.push(`${pct(u)}{transform:rotate(${a.toFixed(1)}deg)}`);
  }
  return `@keyframes ${name}{${steps.join("")}}`;
}

function svg(theme) {
  const dark = theme === "dark";
  const pal = dark
    ? ["#161b22", "#0e4429", "#006d32", "#26a641", "#39d353"]
    : ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"];
  const bloom = dark ? "#56f06a" : "#3fd45a";
  const fur = "#d9a05b", furDark = "#a8692c", ink = "#1b1b1b";

  let cells = "", puddle = "";
  weeks.forEach((w, x) => {
    w.contributionDays.forEach((d) => {
      const cx = PAD + x * PITCH, cy = PAD + d.weekday * PITCH;
      cells += `<rect x="${cx}" y="${cy}" width="${CELL}" height="${CELL}" rx="2" fill="${pal[level(d.contributionCount)]}"/>`;
      const dist = Math.hypot(x - IMPACT_COL, (d.weekday - IMPACT_ROW) * 1.15);
      if (dist <= RADIUS) {
        puddle += `<rect class="p" style="animation-delay:${(dist * 0.14).toFixed(2)}s" x="${cx}" y="${cy}" width="${CELL}" height="${CELL}" rx="2" fill="${bloom}"/>`;
      }
    });
  });

  const leg = (x, cls, color) =>
    `<g class="${cls}"><rect x="${x}" y="-15" width="5" height="14" rx="2.5" fill="${color}"/><ellipse cx="${x + 3}" cy="-1.5" rx="3.6" ry="1.8" fill="${color}"/></g>`;

  const css = `
.dog{animation:walk ${T}s linear infinite}
@keyframes walk{0%{transform:translate(${START_X}px,${GROUND}px)}${pct(WALK_IN_END)}{transform:translate(${STOP_X}px,${GROUND}px)}${pct(WALK_OUT_START)}{transform:translate(${STOP_X}px,${GROUND}px)}${pct(WALK_OUT_END)}{transform:translate(${END_X}px,${GROUND}px)}100%{transform:translate(${END_X}px,${GROUND}px)}}
.la,.lb,.lift,.tail{transform-box:fill-box}
.la{transform-origin:50% 0;animation:la ${T}s linear infinite}
.lb{transform-origin:50% 0;animation:lb ${T}s linear infinite}
${legKeyframes("la", 0)}
${legKeyframes("lb", Math.PI)}
.lift{transform-origin:50% 0;animation:lift ${T}s ease-in-out infinite}
@keyframes lift{0%,${pct(PEE_START - 0.02)}{transform:rotate(0)}${pct(PEE_START + 0.01)},${pct(PEE_END)}{transform:rotate(70deg)}${pct(PEE_END + 0.025)},100%{transform:rotate(0)}}
.tail{transform-origin:100% 100%;animation:wag .32s ease-in-out infinite alternate}
@keyframes wag{from{transform:rotate(-22deg)}to{transform:rotate(26deg)}}
.stream{stroke-dasharray:3 2.5;animation:flow .25s linear infinite,pee ${T}s linear infinite}
@keyframes flow{to{stroke-dashoffset:-11}}
@keyframes pee{0%,${pct(PEE_START + 0.02)}{opacity:0}${pct(PEE_START + 0.03)},${pct(PEE_END - 0.01)}{opacity:1}${pct(PEE_END)},100%{opacity:0}}
.p{opacity:0;animation:bloom ${T}s ease-out infinite}
@keyframes bloom{0%,${pct(PEE_START + 0.04)}{opacity:0}${pct(PEE_START + 0.07)}{opacity:1}92%{opacity:1}98%,100%{opacity:0}}
.head{transform-box:fill-box;transform-origin:20% 90%;animation:bob ${T}s ease-in-out infinite}
@keyframes bob{0%,${pct(PEE_START)}{transform:rotate(0)}${pct(PEE_START + 0.03)},${pct(PEE_END)}{transform:rotate(-10deg)}${pct(PEE_END + 0.03)},100%{transform:rotate(0)}}
@media (prefers-reduced-motion:reduce){.dog,.la,.lb,.lift,.tail,.stream,.p,.head{animation:none}.dog{transform:translate(${STOP_X}px,${GROUND}px)}}
`;

  // Dog faces right; feet on y=0 of its own group.
  const dog = `
<g class="dog">
  <path class="stream" d="M3 -17 Q -9 -27 -19 -${GROUND - (PAD + IMPACT_ROW * PITCH + 6)}" fill="none" stroke="#f2d024" stroke-width="3" stroke-linecap="round" opacity="0"/>
  <path class="tail" d="M5 -24 Q -4 -30 -9 -40" fill="none" stroke="${fur}" stroke-width="4.5" stroke-linecap="round"/>
  ${leg(7, "lb", furDark)}
  ${leg(29, "la", furDark)}
  <ellipse cx="20" cy="-21" rx="18" ry="9" fill="${fur}"/>
  <ellipse cx="22" cy="-17" rx="9" ry="4" fill="#f3d7ae"/>
  <g class="lift">${leg(11, "la", fur)}</g>
  ${leg(33, "lb", fur)}
  <g class="head">
    <rect x="31" y="-31" width="7" height="12" rx="3" fill="${fur}"/>
    <rect x="31" y="-26" width="7" height="3" rx="1" fill="#e5484d"/>
    <circle cx="39" cy="-34" r="8.5" fill="${fur}"/>
    <ellipse cx="46.5" cy="-31" rx="6.5" ry="4.3" fill="#f3d7ae"/>
    <circle cx="52.4" cy="-32.6" r="2.2" fill="${ink}"/>
    <circle cx="41.5" cy="-37" r="1.5" fill="${ink}"/>
    <path d="M34 -40 Q 30 -36 32 -28 Q 36 -31 37 -38 Z" fill="${furDark}"/>
    <ellipse cx="47.5" cy="-26.4" rx="2" ry="2.8" fill="#ff7b9c"/>
  </g>
</g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<style>${css}</style>
<title>${LOGIN}'s contributions, with a dog</title>
${cells}
${puddle}
${dog}
</svg>`;
}

await fs.mkdir("dist", { recursive: true });
await fs.writeFile("dist/dog.svg", svg("light"));
await fs.writeFile("dist/dog-dark.svg", svg("dark"));
console.log(`wrote dist/dog.svg + dist/dog-dark.svg (${COLS} weeks, ${counts.length} active days, puddle at col ${IMPACT_COL})`);
