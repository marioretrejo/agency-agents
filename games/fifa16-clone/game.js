/* =========================================================================
   Fútbol Pro 26 — un clon estilo EA FC 26 en HTML5 Canvas (sin dependencias)
   Vista 3D de retransmisión con cámara en perspectiva, estadio con gradas,
   11 vs 11, pases, tiros con potencia, globos, porteros, faltas y tarjetas,
   penaltis, modo 2 jugadores, cartas de jugador estrella, radar y marcador.
   La simulación es 2D top-down; el render proyecta a 3D.
   ========================================================================= */
"use strict";

// ------------------------------------------------------------------ Canvas
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const VIEW_W = canvas.width;
const VIEW_H = canvas.height;

// ------------------------------------------------------------- Dimensiones
// Campo de 105 m x 68 m a 10 px/m.
const PITCH_W = 1050;
const PITCH_H = 680;

const GOAL_HALF = 50;      // media boca de portería (jugable, algo más ancha que la real)
const GOAL_TOP = PITCH_H / 2 - GOAL_HALF;
const GOAL_BOT = PITCH_H / 2 + GOAL_HALF;
const CROSSBAR_Z = 30;     // altura del larguero
const GOAL_DEPTH = 22;

const BOX_W = 165, BOX_H = 403;         // área grande
const SMALL_BOX_W = 55, SMALL_BOX_H = 183; // área pequeña
const PENALTY_SPOT = 110;               // distancia del punto de penalti a la línea

// Paleta UI estilo FC 26
const VOLT = "#c9f73a";
const UI_DARK = "rgba(9, 12, 18, .92)";

// --------------------------------------------------------------- Utilidades
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
const lerp = (a, b, t) => a + (b - a) * t;
const rnd = (a, b) => a + Math.random() * (b - a);

function norm(x, y) {
  const d = Math.hypot(x, y);
  return d < 1e-6 ? { x: 0, y: 0 } : { x: x / d, y: y / d };
}

// -------------------------------------------------------------------- Audio
let audioCtx = null;
function beep(freq, dur, type = "square", gain = 0.04) {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = gain;
    o.connect(g); g.connect(audioCtx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
    o.stop(audioCtx.currentTime + dur);
  } catch (e) { /* audio opcional */ }
}
const sfx = {
  kick: () => beep(180, 0.08, "triangle", 0.06),
  pass: () => beep(240, 0.06, "triangle", 0.05),
  whistle: () => { beep(2200, 0.35, "square", 0.03); setTimeout(() => beep(2200, 0.25, "square", 0.03), 420); },
  goal: () => { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.22, "triangle", 0.06), i * 130)); },
  post: () => beep(1200, 0.12, "sine", 0.06),
  card: () => beep(320, 0.25, "sawtooth", 0.05),
};

// ------------------------------------------------------------------ Equipos
// Temporada 2026. Nombres, escudos y estrellas ficticios (homenaje, sin licencias).
const STAT_LABELS = ["PAC", "SHO", "PAS", "DRI", "DEF", "PHY"];
const TEAMS = [
  { name: "FC BLANCOS",      short: "BLA", kit: "#f5f5f5", kit2: "#22262e", rating: 89,
    star: { name: "Kili Bapé",     ovr: 91, pos: "ST · LW",           stats: [97, 90, 80, 92, 36, 78], skin: "#8d5a3b", hair: "#1c1410" } },
  { name: "AZULGRANA CF",    short: "AZG", kit: "#a5003c", kit2: "#004a9f", rating: 88,
    star: { name: "Lamin Yamalu",  ovr: 89, pos: "RW · CAM",          stats: [84, 85, 88, 94, 32, 60], skin: "#b57a4e", hair: "#14100c" } },
  { name: "MIAMI ROSA",      short: "MIA", kit: "#f2a8c4", kit2: "#101010", rating: 84,
    star: { name: "Leo Mesta",     ovr: 88, pos: "RW · ST · CAM · RM", stats: [79, 85, 87, 92, 33, 64], skin: "#d9a06b", hair: "#4a341f" } },
  { name: "CELESTE CITY",    short: "CEL", kit: "#7fc3e8", kit2: "#ffffff", rating: 88,
    star: { name: "Erlin Halan",   ovr: 90, pos: "ST",                stats: [89, 93, 70, 80, 45, 88], skin: "#e8c39a", hair: "#d8b25e" } },
  { name: "BÁVAROS FC",      short: "BAV", kit: "#c8102e", kit2: "#ffffff", rating: 87,
    star: { name: "Harri Kein",    ovr: 89, pos: "ST · CAM",          stats: [70, 93, 84, 83, 49, 83], skin: "#e8c39a", hair: "#5a4632" } },
  { name: "UNITED ROJO",     short: "URJ", kit: "#d81b2a", kit2: "#1b1b1b", rating: 83,
    star: { name: "Bruno Fernán",  ovr: 85, pos: "CAM · CM",          stats: [68, 86, 90, 86, 64, 72], skin: "#d9a06b", hair: "#241a12" } },
  { name: "LES PARISIENS",   short: "PAR", kit: "#20356b", kit2: "#d21034", rating: 86,
    star: { name: "Usmán Dembé",   ovr: 87, pos: "RW · LW",           stats: [93, 79, 86, 90, 40, 67], skin: "#7a4a2e", hair: "#100c08" } },
  { name: "VECCHIA SIGNORA", short: "VSN", kit: "#e8e8e8", kit2: "#111111", rating: 85,
    star: { name: "Dusan Vlaho",   ovr: 85, pos: "ST",                stats: [79, 87, 65, 75, 40, 85], skin: "#e0b088", hair: "#2e2218" } },
];

const FIRST = ["Leo","Cris","Karim","Luka","Andrés","Sergio","Manu","Toni","Paul","Eden","Kev","Robert","Zlatan","Gigi","Marco","Iker","David","Thiago","Iván","Gareth","Ney","Ale"];
const LAST  = ["Mesta","Ronal","Benz","Modrik","Iniesto","Ramírez","Neuar","Kross","Pogbá","Hazar","De Brainne","Lewan","Ibra","Buffo","Reus","Casillas","Silva","Motta","Rakitic","Bale","Mar","Vidal"];
function randomName() {
  return FIRST[Math.floor(Math.random() * FIRST.length)] + " " + LAST[Math.floor(Math.random() * LAST.length)];
}

// Formación 4-3-3: [x fraccional desde la propia portería, y fraccional]
const FORMATION = [
  { fx: 0.035, fy: 0.50, role: "GK" },
  { fx: 0.20,  fy: 0.16, role: "DF" },
  { fx: 0.16,  fy: 0.38, role: "DF" },
  { fx: 0.16,  fy: 0.62, role: "DF" },
  { fx: 0.20,  fy: 0.84, role: "DF" },
  { fx: 0.42,  fy: 0.28, role: "MF" },
  { fx: 0.36,  fy: 0.50, role: "MF" },
  { fx: 0.42,  fy: 0.72, role: "MF" },
  { fx: 0.66,  fy: 0.16, role: "FW" },
  { fx: 0.70,  fy: 0.50, role: "FW" },
  { fx: 0.66,  fy: 0.84, role: "FW" },
];

// ------------------------------------------------------ Mandos / controles
const KEYMAP_SOLO = {
  up: ["w", "arrowup"], down: ["s", "arrowdown"], left: ["a", "arrowleft"], right: ["d", "arrowright"],
  pass: [" "], shoot: ["e", "enter"], lob: ["q"], sprint: ["shift"], switch: ["c"],
};
const KEYMAP_P1 = {
  up: ["w"], down: ["s"], left: ["a"], right: ["d"],
  pass: [" "], shoot: ["e"], lob: ["q"], sprint: ["shift"], switch: ["c"],
};
const KEYMAP_P2 = {
  up: ["arrowup"], down: ["arrowdown"], left: ["arrowleft"], right: ["arrowright"],
  pass: ["l"], shoot: ["p"], lob: ["o"], sprint: ["k"], switch: ["m"],
};

function makeController(team, keymap, label, color) {
  return { team, keymap, label, color, shootHeld: false, shootCharge: 0, passReq: false, lobReq: false, switchReq: false };
}

const keys = {};

addEventListener("keydown", (e) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) e.preventDefault();
  const k = e.key.toLowerCase();
  keys[k] = true;
  for (const c of game.humans) {
    const m = c.keymap;
    if (m.pass.includes(k) && !e.repeat) c.passReq = true;
    if (m.shoot.includes(k) && !c.shootHeld) { c.shootHeld = true; c.shootCharge = 0; }
    if (m.lob.includes(k) && !e.repeat) c.lobReq = true;
    if (m.switch.includes(k) && !e.repeat) c.switchReq = true;
  }
  if (game.state === "menu") menuKey(e.key);
  if ((game.state === "half" || game.state === "end") && (k === " " || k === "enter")) advanceState();
});
addEventListener("keyup", (e) => {
  const k = e.key.toLowerCase();
  keys[k] = false;
  for (const c of game.humans) {
    if (c.keymap.shoot.includes(k)) {
      if (c.shootHeld) {
        if (game.state === "play") requestShot(c);
        else if (game.state === "penalty" && game.penalty && game.penalty.team === c.team) penaltyShoot(c.shootCharge);
      }
      c.shootHeld = false;
      c.shootCharge = 0;
    }
  }
});

function inputDir(c) {
  const m = c.keymap;
  let x = 0, y = 0;
  if (m.left.some(k => keys[k])) x -= 1;
  if (m.right.some(k => keys[k])) x += 1;
  if (m.up.some(k => keys[k])) y -= 1;
  if (m.down.some(k => keys[k])) y += 1;
  if (!x && !y && c === game.humans[0] && touchUI.joyId !== null && touchUI.mag > 0.15) {
    return norm(touchUI.joyDX, touchUI.joyDY);
  }
  return norm(x, y);
}

// ------------------------------------------------ Controles táctiles (móvil)
const touchUI = {
  enabled: ("ontouchstart" in window) || navigator.maxTouchPoints > 0,
  joyId: null, joyBX: 0, joyBY: 0, joyDX: 0, joyDY: 0, mag: 0,
  pointers: new Map(),   // pointerId -> id de botón
};
const JOY_R = 54;
const TOUCH_BTNS = [
  { id: "shoot",  label: "TIRO",  x: 876, y: 462, r: 44 },
  { id: "pass",   label: "PASE",  x: 772, y: 536, r: 38 },
  { id: "lob",    label: "GLOBO", x: 786, y: 396, r: 30 },
  { id: "switch", label: "CAM",   x: 682, y: 474, r: 26 },
];

canvas.style.touchAction = "none";
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

function canvasPos(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (VIEW_W / rect.width),
    y: (e.clientY - rect.top) * (VIEW_H / rect.height),
  };
}

canvas.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  if (canvas.setPointerCapture) { try { canvas.setPointerCapture(e.pointerId); } catch (err) {} }
  const pos = canvasPos(e);
  if (game.state === "menu") { menuTap(pos); return; }
  if (game.state === "half" || game.state === "end") { advanceState(); return; }
  if (!touchUI.enabled) return;
  const c = game.humans[0];
  if (!c) return;
  for (const b of TOUCH_BTNS) {
    if (dist(pos.x, pos.y, b.x, b.y) <= b.r + 10) {
      touchUI.pointers.set(e.pointerId, b.id);
      if (b.id === "pass") c.passReq = true;
      if (b.id === "lob") c.lobReq = true;
      if (b.id === "switch") c.switchReq = true;
      if (b.id === "shoot") { c.shootHeld = true; c.shootCharge = 0; }
      return;
    }
  }
  if (pos.x < VIEW_W * 0.55 && touchUI.joyId === null) {
    touchUI.joyId = e.pointerId;
    touchUI.joyBX = pos.x; touchUI.joyBY = pos.y;
    touchUI.joyDX = touchUI.joyDY = 0;
    touchUI.mag = 0;
  }
});

canvas.addEventListener("pointermove", (e) => {
  if (e.pointerId !== touchUI.joyId) return;
  e.preventDefault();
  const pos = canvasPos(e);
  let dx = pos.x - touchUI.joyBX;
  let dy = pos.y - touchUI.joyBY;
  const d = Math.hypot(dx, dy);
  if (d > JOY_R) { dx = dx / d * JOY_R; dy = dy / d * JOY_R; }
  touchUI.joyDX = dx;
  touchUI.joyDY = dy;
  touchUI.mag = Math.min(d / JOY_R, 1);
});

function releasePointer(e) {
  if (e.pointerId === touchUI.joyId) {
    touchUI.joyId = null;
    touchUI.joyDX = touchUI.joyDY = 0;
    touchUI.mag = 0;
  }
  const btn = touchUI.pointers.get(e.pointerId);
  if (btn) {
    touchUI.pointers.delete(e.pointerId);
    const c = game.humans[0];
    if (btn === "shoot" && c && c.shootHeld) {
      if (game.state === "play") requestShot(c);
      else if (game.state === "penalty" && game.penalty && game.penalty.team === c.team) penaltyShoot(c.shootCharge);
      c.shootHeld = false;
      c.shootCharge = 0;
    }
  }
}
canvas.addEventListener("pointerup", releasePointer);
canvas.addEventListener("pointercancel", releasePointer);

function menuTap(pos) {
  const colX = 56, colW = 460;
  for (let i = 0; i < MENU_ROWS; i++) {
    const y = 156 + i * 74;
    if (pos.x >= colX && pos.x <= colX + colW && pos.y >= y - 26 && pos.y <= y + 30) {
      game.menuRow = i;
      if (i === MENU_ROWS - 1) { startMatch(); return; }
      menuAdjust(i, pos.x < colX + colW / 2 ? -1 : 1);
      return;
    }
  }
}

// ------------------------------------------------------------------- Balón
const ball = {
  x: PITCH_W / 2, y: PITCH_H / 2, z: 0,
  vx: 0, vy: 0, vz: 0,
  r: 6,
  owner: null,        // jugador que lo conduce
  lastTouchTeam: 0,   // último equipo en tocarlo (para saques)
  shieldUntil: 0,     // tiempo de gracia tras un saque (nadie roba)
};

function giveBall(p) {
  ball.owner = p;
  ball.lastTouchTeam = p.team;
  ball.vx = ball.vy = ball.vz = 0;
  ball.z = 0;
}

function looseBall(vx, vy, vz = 0) {
  if (ball.owner) ball.lastTouchTeam = ball.owner.team;
  ball.owner = null;
  ball.vx = vx; ball.vy = vy; ball.vz = vz;
}

// ---------------------------------------------------------------- Jugadores
function makePlayer(team, idx, attackRight, teamDef) {
  const f = FORMATION[idx];
  const skill = teamDef.rating / 100;
  const isStar = idx === 9 && teamDef.star;
  return {
    team, idx, role: f.role,
    name: isStar ? teamDef.star.name : randomName(),
    number: idx === 0 ? 1 : idx + 1 + Math.floor(Math.random() * 3) * 10,
    x: 0, y: 0, vx: 0, vy: 0,
    facing: attackRight ? 0 : Math.PI,
    speed: (f.role === "GK" ? 150 : f.role === "DF" ? 165 : f.role === "MF" ? 175 : 185) * (0.9 + skill * 0.18),
    skill: isStar ? Math.min(1, skill + 0.05) : skill,
    runPhase: Math.random() * Math.PI * 2,
    tackleCooldown: 0,
    kickCooldown: 0,
    gkHoldUntil: 0,
    yellows: 0,
    cardFlash: null,
  };
}

// ------------------------------------------------------------------- Estado
const game = {
  state: "menu",          // menu | kickoff | play | goal | penalty | half | end
  menuIndex: [0, 2],      // selección de equipos [P1, P2/CPU]
  menuRow: 0,             // 0 equipo P1 · 1 rival · 2 modo · 3 duración · 4 jugar
  menuLenIdx: 1,
  mode: 0,                // 0 = 1 jugador vs CPU · 1 = 2 jugadores
  matchLengths: [150, 240, 360],   // segundos reales por partido completo
  teams: [null, null],
  players: [],
  attackRight: [true, false],
  score: [0, 0],
  clock: 0,
  half: 1,
  stateTimer: 0,
  banner: "",
  bannerSub: "",
  kickoffTeam: 0,
  humans: [],
  controlled: [null, null],
  penalty: null,
  lastFoul: -99,
  stats: { fouls: 0, yellows: 0, reds: 0, penalties: 0 },
  camX: PITCH_W / 2,      // panorámica de la cámara (coordenada X del mundo)
  time: 0,
};

function isHuman(team) { return game.humans.some(c => c.team === team); }
function humanController(team) { return game.humans.find(c => c.team === team) || null; }

function goalX(team) { // portería que DEFIENDE el equipo
  return game.attackRight[team] ? 0 : PITCH_W;
}
function targetGoalX(team) { // portería a la que ATACA
  return game.attackRight[team] ? PITCH_W : 0;
}

function inPenaltyBox(x, y, goalSide) {
  const inY = y > (PITCH_H - BOX_H) / 2 && y < (PITCH_H + BOX_H) / 2;
  return inY && (goalSide === 0 ? x < BOX_W : x > PITCH_W - BOX_W);
}

function matchLengthSec() { return game.matchLengths[game.menuLenIdx]; }
function displayMinute() {
  const total = matchLengthSec();
  return Math.min(90, Math.floor((game.clock / total) * 90));
}

// -------------------------------------------------------------- Menú inicial
const MENU_ROWS = 5;
function menuAdjust(row, step) {
  if (row === 0) game.menuIndex[0] = (game.menuIndex[0] + step + TEAMS.length) % TEAMS.length;
  if (row === 1) game.menuIndex[1] = (game.menuIndex[1] + step + TEAMS.length) % TEAMS.length;
  if (row === 2) game.mode = 1 - game.mode;
  if (row === 3) game.menuLenIdx = (game.menuLenIdx + step + 3) % 3;
  beep(300, 0.04, "square", 0.03);
}

function menuKey(key) {
  const k = key.toLowerCase();
  if (k === "arrowup" || k === "w") game.menuRow = (game.menuRow + MENU_ROWS - 1) % MENU_ROWS;
  if (k === "arrowdown" || k === "s") game.menuRow = (game.menuRow + 1) % MENU_ROWS;
  const step = (k === "arrowleft" || k === "a") ? -1 : (k === "arrowright" || k === "d") ? 1 : 0;
  if (step !== 0) menuAdjust(game.menuRow, step);
  if ((k === "enter" || k === " ") && game.menuRow === MENU_ROWS - 1) startMatch();
  if ((k === "enter" || k === " ") && game.menuRow !== MENU_ROWS - 1) game.menuRow = Math.min(MENU_ROWS - 1, game.menuRow + 1);
}

function startMatch() {
  if (game.menuIndex[0] === game.menuIndex[1]) {
    game.menuIndex[1] = (game.menuIndex[1] + 1) % TEAMS.length;
  }
  game.teams = [TEAMS[game.menuIndex[0]], TEAMS[game.menuIndex[1]]];
  game.players = [];
  for (let t = 0; t < 2; t++) {
    for (let i = 0; i < 11; i++) {
      game.players.push(makePlayer(t, i, game.attackRight[t], game.teams[t]));
    }
  }
  game.humans = game.mode === 0
    ? [makeController(0, KEYMAP_SOLO, "J1", "#ffe14d")]
    : [makeController(0, KEYMAP_P1, "J1", "#ffe14d"), makeController(1, KEYMAP_P2, "J2", "#66e0ff")];
  game.controlled = [null, null];
  game.score = [0, 0];
  game.clock = 0;
  game.half = 1;
  game.kickoffTeam = 0;
  game.penalty = null;
  game.lastFoul = -99;
  game.stats = { fouls: 0, yellows: 0, reds: 0, penalties: 0 };
  setupKickoff(game.kickoffTeam);
  sfx.whistle();
}

// ------------------------------------------------------------ Colocaciones
function homePos(p) {
  const f = FORMATION[p.idx];
  const right = game.attackRight[p.team];
  const x = right ? f.fx * PITCH_W : (1 - f.fx) * PITCH_W;
  return { x, y: f.fy * PITCH_H };
}

function setupKickoff(team) {
  for (const p of game.players) {
    const h = homePos(p);
    p.x = h.x; p.y = h.y;
    p.vx = p.vy = 0;
    const right = game.attackRight[p.team];
    if (right) p.x = Math.min(p.x, PITCH_W / 2 - 30);
    else p.x = Math.max(p.x, PITCH_W / 2 + 30);
    if (p.role === "GK") { const h2 = homePos(p); p.x = h2.x; }
  }
  ball.x = PITCH_W / 2; ball.y = PITCH_H / 2; ball.z = 0;
  ball.vx = ball.vy = ball.vz = 0;
  const striker = game.players.find(p => p.team === team && p.role === "FW") ||
                  nearestPlayer(team, PITCH_W / 2, PITCH_H / 2, true);
  striker.x = PITCH_W / 2 + (game.attackRight[team] ? -16 : 16);
  striker.y = PITCH_H / 2;
  giveBall(striker);
  ball.shieldUntil = game.time + 1.2;
  for (const c of game.humans) {
    game.controlled[c.team] = c.team === team ? striker : nearestPlayer(c.team, ball.x, ball.y, true);
  }
  game.state = "kickoff";
  game.stateTimer = 1.4;
  game.banner = game.half === 1 && game.clock === 0 ? "¡COMIENZA EL PARTIDO!" : "SAQUE DE CENTRO";
  game.bannerSub = "";
}

// ---------------------------------------------------------------- Búsquedas
function nearestPlayer(team, x, y, excludeGK = false) {
  let best = null, bd = Infinity;
  for (const p of game.players) {
    if (p.team !== team) continue;
    if (excludeGK && p.role === "GK") continue;
    const d = dist(p.x, p.y, x, y);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

function teammates(p) { return game.players.filter(q => q.team === p.team && q !== p); }

// ----------------------------------------------------------------- Acciones
function requestShot(c) {
  const p = game.controlled[c.team];
  if (!p || ball.owner !== p) return;
  const gx = targetGoalX(p.team);
  const gy = PITCH_H / 2 + clamp((ball.y - PITCH_H / 2) * 0.25, -GOAL_HALF * 0.7, GOAL_HALF * 0.7)
    + rnd(-14, 14) * (1.2 - p.skill);
  const power = lerp(380, 660, clamp(c.shootCharge / 0.9, 0, 1));
  const dir = norm(gx - ball.x, gy - ball.y);
  const d = dist(ball.x, ball.y, gx, gy);
  const vz = clamp(c.shootCharge, 0, 0.9) * 90 + clamp(d / 12, 0, 40);
  looseBall(dir.x * power, dir.y * power, vz * 0.9);
  p.kickCooldown = 0.4;
  sfx.kick();
}

function doPass(p, c, lob = false) {
  const input = c ? inputDir(c) : { x: 0, y: 0 };
  const prefer = (input.x || input.y) ? input : norm(Math.cos(p.facing), Math.sin(p.facing));
  let best = null, bestScore = -Infinity;
  for (const q of teammates(p)) {
    if (q.role === "GK") continue;
    const dx = q.x - p.x, dy = q.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d < 25 || d > (lob ? 560 : 380)) continue;
    const n = norm(dx, dy);
    const align = n.x * prefer.x + n.y * prefer.y;
    if (align < 0.1) continue;
    const forward = game.attackRight[p.team] ? dx : -dx;
    const score = align * 220 - d * 0.25 + forward * 0.15;
    if (score > bestScore) { bestScore = score; best = q; }
  }
  if (!best) {
    const v = lob ? 420 : 340;
    looseBall(prefer.x * v, prefer.y * v, lob ? 130 : 0);
    sfx.pass();
    return;
  }
  const lead = 0.28;
  const tx = best.x + best.vx * lead;
  const ty = best.y + best.vy * lead;
  const d = dist(ball.x, ball.y, tx, ty);
  const speed = lob ? clamp(300 + d * 0.9, 380, 620) : clamp(260 + d * 1.1, 300, 480);
  const dir = norm(tx - ball.x, ty - ball.y);
  const err = (1.15 - p.skill) * 0.1;
  const a = Math.atan2(dir.y, dir.x) + rnd(-err, err);
  looseBall(Math.cos(a) * speed, Math.sin(a) * speed, lob ? clamp(d * 0.35, 90, 190) : 0);
  p.kickCooldown = 0.35;
  if (isHuman(p.team)) game.controlled[p.team] = best;
  sfx.pass();
}

// ------------------------------------------------------ Faltas y tarjetas
function commitFoul(offender, victim) {
  if (game.time - game.lastFoul < 5) {
    looseBall(rnd(-90, 90), rnd(-90, 90));
    return;
  }
  game.lastFoul = game.time;
  game.stats.fouls++;
  const fx = clamp(ball.x, 10, PITCH_W - 10);
  const fy = clamp(ball.y, 10, PITCH_H - 10);
  sfx.whistle();

  let label = "FALTA";
  const r = Math.random();
  let card = r < 0.06 ? "red" : r < 0.30 ? "yellow" : null;
  if (card === "yellow") {
    offender.yellows++;
    game.stats.yellows++;
    if (offender.yellows >= 2) { card = "red"; label = "SEGUNDA AMARILLA · ¡EXPULSADO!"; }
    else label = "FALTA · TARJETA AMARILLA";
  } else if (card === "red") {
    label = "¡TARJETA ROJA DIRECTA!";
  }
  if (card) {
    offender.cardFlash = { type: card, until: game.time + 3 };
    sfx.card();
  }

  const offName = offender.name + " (" + game.teams[offender.team].short + ")";
  const insideBox = inPenaltyBox(fx, fy, goalX(offender.team));
  if (card === "red") {
    game.stats.reds++;
    sendOff(offender);
  }
  if (insideBox) {
    startPenalty(victim.team, label + " · " + offName);
  } else {
    restartPlay(victim.team, fx, fy, label);
    game.bannerSub = offName;
  }
}

function sendOff(p) {
  const i = game.players.indexOf(p);
  if (i >= 0) game.players.splice(i, 1);
  if (ball.owner === p) looseBall(0, 0);
  for (let t = 0; t < 2; t++) {
    if (game.controlled[t] === p) game.controlled[t] = nearestPlayer(t, ball.x, ball.y, true);
  }
}

// -------------------------------------------------------------- Penaltis
function startPenalty(team, label) {
  game.stats.penalties++;
  const goal = targetGoalX(team);
  const spotX = goal === 0 ? PENALTY_SPOT : PITCH_W - PENALTY_SPOT;
  ball.x = spotX; ball.y = PITCH_H / 2; ball.z = 0;
  ball.vx = ball.vy = ball.vz = 0;
  ball.owner = null;
  ball.lastTouchTeam = team;

  const shooter = game.players.find(p => p.team === team && p.idx === 9) ||
                  nearestPlayer(team, spotX, PITCH_H / 2, true);
  const gk = game.players.find(p => p.team !== team && p.role === "GK");
  shooter.x = spotX + (goal === 0 ? 28 : -28);
  shooter.y = PITCH_H / 2;
  shooter.facing = Math.atan2(0, goal - spotX);
  shooter.vx = shooter.vy = 0;
  if (gk) {
    gk.x = goal === 0 ? 8 : PITCH_W - 8;
    gk.y = PITCH_H / 2;
    gk.vx = gk.vy = 0;
  }
  for (const q of game.players) {
    if (q === shooter || q === gk) continue;
    if (inPenaltyBox(q.x, q.y, goal) || dist(q.x, q.y, spotX, PITCH_H / 2) < 95) {
      q.x = goal === 0 ? BOX_W + rnd(15, 70) : PITCH_W - BOX_W - rnd(15, 70);
      q.y = clamp(q.y + rnd(-40, 40), 20, PITCH_H - 20);
    }
  }
  game.penalty = { team, shooter, gk, aimY: PITCH_H / 2, cpuTimer: rnd(1.8, 2.6), shot: false };
  if (isHuman(team)) game.controlled[team] = shooter;
  game.state = "penalty";
  game.banner = "¡PENALTI!";
  game.bannerSub = label;
  game.stateTimer = 1.6;
}

function penaltyShoot(charge) {
  const pen = game.penalty;
  if (!pen || pen.shot) return;
  pen.shot = true;
  const goal = targetGoalX(pen.team);
  const power = lerp(430, 680, clamp(charge / 0.9, 0, 1));
  const err = 4 + charge * 16 + (1 - pen.shooter.skill) * 14;
  const aim = pen.aimY + rnd(-err, err);
  const dir = norm(goal - ball.x, aim - ball.y);
  const vz = charge > 0.85 ? rnd(24, 62) : rnd(4, 26);
  looseBall(dir.x * power, dir.y * power, vz);
  ball.lastTouchTeam = pen.team;
  pen.shooter.kickCooldown = 0.6;
  sfx.kick();
  game.state = "play";
  game.banner = "";
  game.bannerSub = "";
  game.penalty = null;
}

function updatePenalty(dt) {
  game.stateTimer -= dt;
  if (game.stateTimer <= 0 && game.banner === "¡PENALTI!") { game.banner = ""; game.bannerSub = ""; }
  const pen = game.penalty;
  if (!pen) return;
  if (pen.gk) pen.gk.y = PITCH_H / 2 + Math.sin(game.time * 2.5) * 7;
  const c = humanController(pen.team);
  if (c) {
    const dir = inputDir(c);
    pen.aimY = clamp(pen.aimY + dir.y * 150 * dt, GOAL_TOP + 5, GOAL_BOT - 5);
    if (c.shootHeld) c.shootCharge = Math.min(c.shootCharge + dt, 1.1);
  } else {
    pen.cpuTimer -= dt;
    if (pen.cpuTimer <= 0 && !pen.shot) {
      pen.aimY = PITCH_H / 2 + rnd(-GOAL_HALF * 0.85, GOAL_HALF * 0.85);
      penaltyShoot(rnd(0.45, 0.95));
    }
  }
  updateCamera(dt);
}

// --------------------------------------------------------- IA de los equipos
function aiThink(dt) {
  const carrier = ball.owner;
  for (const p of game.players) {
    if (isHuman(p.team) && p === game.controlled[p.team] && game.state === "play") continue;
    if (p.role === "GK") { gkThink(p, dt); continue; }

    const myTeamHasBall = carrier && carrier.team === p.team;
    const h = dynamicHome(p);

    if (carrier === p) {
      aiCarrier(p, dt);
    } else if (!carrier && chaserFor(p.team) === p && ball.z < 60) {
      const t = clamp(dist(p.x, p.y, ball.x, ball.y) / 300, 0, 0.6);
      moveToward(p, ball.x + ball.vx * t, ball.y + ball.vy * t, p.speed, dt);
    } else if (!myTeamHasBall && carrier && presserFor(p.team) === p) {
      moveToward(p, carrier.x, carrier.y, p.speed, dt);
      tryTackle(p);
    } else if (!myTeamHasBall && carrier && p.role === "DF" &&
               Math.abs(carrier.x - goalX(p.team)) < 330 &&
               dist(p.x, p.y, carrier.x, carrier.y) < 230) {
      moveToward(p, carrier.x, carrier.y, p.speed, dt);
      tryTackle(p);
    } else {
      moveToward(p, h.x, h.y, p.speed * 0.85, dt);
    }
  }
}

function dynamicHome(p) {
  const h = homePos(p);
  const shiftX = (ball.x - PITCH_W / 2) * (p.role === "DF" ? 0.22 : p.role === "MF" ? 0.3 : 0.34);
  const shiftY = (ball.y - PITCH_H / 2) * 0.22;
  return {
    x: clamp(h.x + shiftX, 20, PITCH_W - 20),
    y: clamp(h.y + shiftY, 15, PITCH_H - 15),
  };
}

const chaserCache = { t: -1, val: [null, null] };
function chaserFor(team) {
  if (chaserCache.t !== game.time) {
    chaserCache.t = game.time;
    for (let t = 0; t < 2; t++) chaserCache.val[t] = nearestPlayer(t, ball.x, ball.y, true);
  }
  return chaserCache.val[team];
}
function presserFor(team) { return chaserFor(team); }

function aiCarrier(p, dt) {
  const gx = targetGoalX(p.team);
  const dGoal = dist(p.x, p.y, gx, PITCH_H / 2);
  let pressure = Infinity;
  for (const q of game.players) {
    if (q.team === p.team) continue;
    pressure = Math.min(pressure, dist(q.x, q.y, p.x, p.y));
  }
  if (dGoal < 210 && Math.abs(p.y - PITCH_H / 2) < 190 && p.kickCooldown <= 0) {
    if (Math.random() < (0.9 * p.skill) * dt * 1.6) {
      const gy = PITCH_H / 2 + rnd(-GOAL_HALF * 0.8, GOAL_HALF * 0.8) * (1.3 - p.skill);
      const dir = norm(gx - ball.x, gy - ball.y);
      const power = rnd(480, 640);
      looseBall(dir.x * power, dir.y * power, rnd(20, 80));
      p.kickCooldown = 0.5;
      sfx.kick();
      return;
    }
  }
  if (pressure < 55 && p.kickCooldown <= 0 && Math.random() < dt * 4) {
    aiPass(p);
    return;
  }
  const dir = norm(gx - p.x, (PITCH_H / 2 - p.y) * 0.35 + Math.sin(game.time * 2 + p.idx) * 60);
  moveToward(p, p.x + dir.x * 100, p.y + dir.y * 100, p.speed * 0.92, dt);
}

function aiPass(p) {
  let best = null, bestScore = -Infinity;
  for (const q of teammates(p)) {
    if (q.role === "GK") continue;
    const d = dist(p.x, p.y, q.x, q.y);
    if (d < 40 || d > 420) continue;
    const forward = game.attackRight[p.team] ? (q.x - p.x) : (p.x - q.x);
    let marked = Infinity;
    for (const r of game.players) {
      if (r.team === p.team) continue;
      marked = Math.min(marked, dist(r.x, r.y, q.x, q.y));
    }
    const score = forward * 0.8 + marked * 1.4 - d * 0.3 - Math.abs(q.y - PITCH_H / 2) * 0.1;
    if (score > bestScore) { bestScore = score; best = q; }
  }
  if (!best) best = teammates(p).find(q => q.role === "MF") || teammates(p)[1];
  if (!best) return;
  const d = dist(ball.x, ball.y, best.x, best.y);
  const dir = norm(best.x + best.vx * 0.25 - ball.x, best.y + best.vy * 0.25 - ball.y);
  const speed = clamp(260 + d * 1.05, 300, 520);
  const lob = d > 260;
  looseBall(dir.x * speed, dir.y * speed, lob ? d * 0.3 : 0);
  p.kickCooldown = 0.4;
  sfx.pass();
}

function tryTackle(p) {
  if (p.tackleCooldown > 0) return;
  const c = ball.owner;
  if (!c || c.team === p.team) return;
  if (game.time < ball.shieldUntil) return;
  if (dist(p.x, p.y, ball.x, ball.y) > 20) return;
  const defBonus = p.role === "DF" ? 0.25 : 0;
  p.tackleCooldown = 0.9;
  if (Math.random() < 0.45 + defBonus + (p.skill - c.skill) * 0.5) {
    giveBall(p);
    if (isHuman(p.team)) game.controlled[p.team] = p;
    beep(150, 0.06, "sawtooth", 0.05);
  } else if (Math.random() < 0.22 && game.state === "play") {
    commitFoul(p, c);
  } else {
    looseBall(rnd(-90, 90), rnd(-90, 90));
  }
}

// -------------------------------------------------------------------- Portero
function gkThink(p, dt) {
  const gx = goalX(p.team);
  const defendsLeft = gx === 0;
  const lineX = defendsLeft ? 14 : PITCH_W - 14;

  if (ball.owner === p) {
    if (game.time > p.gkHoldUntil) {
      const tx = targetGoalX(p.team);
      const dir = norm(tx - p.x + rnd(-80, 80), rnd(-220, 220));
      looseBall(dir.x * 560, dir.y * 560, 170);
      p.kickCooldown = 0.6;
      sfx.kick();
    }
    return;
  }

  const ballComing = (defendsLeft ? ball.vx < -40 : ball.vx > 40) && Math.abs(ball.x - gx) < 340;
  const ballClose = Math.abs(ball.x - gx) < 190;

  let ty = PITCH_H / 2;
  if (ballComing || ballClose) {
    if (Math.abs(ball.vx) > 30) {
      const t = (lineX - ball.x) / ball.vx;
      if (t > 0 && t < 3) ty = ball.y + ball.vy * t;
    } else {
      ty = ball.y;
    }
    ty = clamp(ty, GOAL_TOP - 12, GOAL_BOT + 12);
  }
  let tx = lineX;
  if (ballClose && !ball.owner && ball.z < 25 && Math.hypot(ball.vx, ball.vy) < 160) {
    tx = ball.x; ty = ball.y;
  }
  moveToward(p, tx, ty, p.speed * 1.15, dt);

  if (!ball.owner && game.time > ball.shieldUntil) {
    const d = dist(p.x, p.y, ball.x, ball.y);
    const sp = Math.hypot(ball.vx, ball.vy);
    if (d < 27 && ball.z < 36 && sp < 560) {
      giveBall(p);
      p.gkHoldUntil = game.time + 1.0;
      beep(500, 0.08, "sine", 0.05);
    } else if (d < 38 && ball.z < 48 && sp >= 300) {
      const away = norm(ball.x - gx, ball.y - p.y + rnd(-60, 60));
      ball.vx = away.x * sp * 0.6;
      ball.vy = away.y * sp * 0.6 + rnd(-80, 80);
      ball.vz = Math.max(ball.vz, 60);
      ball.lastTouchTeam = p.team;
      beep(700, 0.07, "sine", 0.05);
    }
  }
}

// --------------------------------------------------------------- Movimiento
function moveToward(p, tx, ty, speed, dt) {
  const d = dist(p.x, p.y, tx, ty);
  if (d < 3) { p.vx = p.vy = 0; return; }
  const dir = norm(tx - p.x, ty - p.y);
  p.vx = dir.x * speed;
  p.vy = dir.y * speed;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.facing = Math.atan2(dir.y, dir.x);
}

function updateControlled(c, dt) {
  const p = game.controlled[c.team];
  if (!p) return;
  const dir = inputDir(c);
  const sprint = c.keymap.sprint.some(k => keys[k]) ||
    (c === game.humans[0] && touchUI.joyId !== null && touchUI.mag > 0.92);
  const speed = p.speed * (sprint ? 1.28 : 1) * (ball.owner === p ? 0.92 : 1);
  p.vx = dir.x * speed;
  p.vy = dir.y * speed;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  if (dir.x || dir.y) p.facing = Math.atan2(dir.y, dir.x);

  if (c.passReq && ball.owner && ball.owner.team !== c.team) {
    tryTackle(p);
    c.passReq = false;
  }
  if (c.passReq && ball.owner === p && p.kickCooldown <= 0) {
    doPass(p, c, false);
    c.passReq = false;
  }
  if (c.lobReq && ball.owner === p && p.kickCooldown <= 0) {
    doPass(p, c, true);
    c.lobReq = false;
  }
  c.passReq = false;
  c.lobReq = false;

  if (c.shootHeld) c.shootCharge = Math.min(c.shootCharge + dt, 1.1);

  if (c.switchReq) {
    if (!ball.owner || ball.owner.team !== c.team) {
      const cands = game.players
        .filter(q => q.team === c.team && q.role !== "GK" && q !== p)
        .sort((a, b) => dist(a.x, a.y, ball.x, ball.y) - dist(b.x, b.y, ball.x, ball.y));
      if (cands[0]) game.controlled[c.team] = cands[0];
    }
    c.switchReq = false;
  }
}

function autoSwitchTeam(t) {
  if (ball.owner && ball.owner.team === t && ball.owner.role !== "GK") {
    game.controlled[t] = ball.owner;
    return;
  }
  const cur = game.controlled[t];
  if (!cur) { game.controlled[t] = nearestPlayer(t, ball.x, ball.y, true); return; }
  if (ball.owner && ball.owner.team === t) return;
  const near = nearestPlayer(t, ball.x, ball.y, true);
  if (near && near !== cur) {
    const dNear = dist(near.x, near.y, ball.x, ball.y);
    const dCur = dist(cur.x, cur.y, ball.x, ball.y);
    if (dNear < dCur * 0.55 && dCur > 90) game.controlled[t] = near;
  }
}

// ------------------------------------------------------------- Física balón
function updateBall(dt) {
  if (ball.owner) {
    const p = ball.owner;
    const off = p.role === "GK" ? 0 : 13;
    ball.x = p.x + Math.cos(p.facing) * off;
    ball.y = p.y + Math.sin(p.facing) * off;
    ball.z = 0;
    return;
  }
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
  ball.z += ball.vz * dt;
  ball.vz -= 380 * dt;
  if (ball.z <= 0) {
    ball.z = 0;
    if (ball.vz < -60) { ball.vz = -ball.vz * 0.45; }
    else ball.vz = 0;
  }
  const fr = ball.z > 0 ? 0.995 : 0.985;
  ball.vx *= Math.pow(fr, dt * 60);
  ball.vy *= Math.pow(fr, dt * 60);

  for (const gx of [0, PITCH_W]) {
    for (const gy of [GOAL_TOP, GOAL_BOT]) {
      if (dist(ball.x, ball.y, gx, gy) < ball.r + 4 && ball.z < CROSSBAR_Z + 6) {
        ball.vx *= -0.55; ball.vy *= -0.55;
        ball.x += ball.vx * dt * 2;
        sfx.post();
      }
    }
  }

  if (game.time > ball.shieldUntil && ball.z < 22) {
    const sp = Math.hypot(ball.vx, ball.vy);
    for (const p of game.players) {
      if (p.kickCooldown > 0) continue;
      if (dist(p.x, p.y, ball.x, ball.y) < 15) {
        if (sp > 520 && Math.random() < 0.4) {
          ball.vx *= 0.35; ball.vy *= 0.35;
          continue;
        }
        giveBall(p);
        if (isHuman(p.team) && p.role !== "GK") game.controlled[p.team] = p;
        break;
      }
    }
  }
}

// ------------------------------------------------ Goles y fuera de banda
function checkGoalAndBounds() {
  if (ball.owner) return;

  if (ball.x < 0 || ball.x > PITCH_W) {
    const side = ball.x < 0 ? 0 : PITCH_W;
    const inMouth = ball.y > GOAL_TOP && ball.y < GOAL_BOT && ball.z < CROSSBAR_Z;
    if (inMouth && Math.abs(ball.x - side) < GOAL_DEPTH + 10) {
      const scorer = game.attackRight[0] ? (side === PITCH_W ? 0 : 1) : (side === 0 ? 0 : 1);
      goalScored(scorer);
      return;
    }
    if (Math.abs(ball.x - side) > 4) {
      const defTeam = goalX(0) === side ? 0 : 1;
      if (ball.lastTouchTeam === defTeam) {
        const atk = 1 - defTeam;
        const cy = ball.y < PITCH_H / 2 ? 12 : PITCH_H - 12;
        restartPlay(atk, side === 0 ? 12 : PITCH_W - 12, cy, "CÓRNER");
      } else {
        const gx = side === 0 ? SMALL_BOX_W : PITCH_W - SMALL_BOX_W;
        restartPlay(defTeam, gx, PITCH_H / 2, "SAQUE DE PUERTA");
      }
      return;
    }
  }

  if (ball.y < 0 || ball.y > PITCH_H) {
    const team = 1 - ball.lastTouchTeam;
    const y = ball.y < 0 ? 6 : PITCH_H - 6;
    restartPlay(team, clamp(ball.x, 20, PITCH_W - 20), y, "SAQUE DE BANDA");
  }
}

function restartPlay(team, x, y, label) {
  ball.x = x; ball.y = y; ball.z = 0;
  ball.vx = ball.vy = ball.vz = 0;
  const p = nearestPlayer(team, x, y, true);
  p.x = x - Math.cos(Math.atan2(y - PITCH_H / 2, x - PITCH_W / 2)) * 2;
  p.y = y;
  giveBall(p);
  ball.shieldUntil = game.time + 1.1;
  if (isHuman(team)) game.controlled[team] = p;
  game.banner = label;
  game.bannerSub = game.teams[team].name;
  game.stateTimer = 1.0;
  game.state = "kickoff";
  for (const q of game.players) {
    if (q.team !== team && dist(q.x, q.y, x, y) < 70) {
      const d = norm(q.x - x, q.y - y);
      q.x = clamp(x + d.x * 80, 10, PITCH_W - 10);
      q.y = clamp(y + d.y * 80, 10, PITCH_H - 10);
    }
  }
}

function goalScored(team) {
  game.score[team]++;
  game.state = "goal";
  game.stateTimer = 3.2;
  game.banner = "¡¡¡GOOOOL!!!";
  game.bannerSub = game.teams[team].name + "  " + game.score[0] + " – " + game.score[1];
  game.kickoffTeam = 1 - team;
  sfx.goal();
}

function advanceState() {
  if (game.state === "half") {
    game.half = 2;
    game.kickoffTeam = 1;
    setupKickoff(game.kickoffTeam);
    sfx.whistle();
  } else if (game.state === "end") {
    game.state = "menu";
  }
}

// ------------------------------------------------------------ Bucle principal
let lastT = performance.now();
function frame(now) {
  const dt = Math.min((now - lastT) / 1000, 0.033);
  lastT = now;
  game.time += dt;
  update(dt);
  render();
  requestAnimationFrame(frame);
}

function update(dt) {
  if (game.state === "menu") {
    for (const c of game.humans) { c.passReq = c.lobReq = c.switchReq = false; }
    return;
  }

  for (const p of game.players) {
    p.tackleCooldown = Math.max(0, p.tackleCooldown - dt);
    p.kickCooldown = Math.max(0, p.kickCooldown - dt);
  }

  if (game.state === "kickoff") {
    game.stateTimer -= dt;
    if (game.stateTimer <= 0) { game.state = "play"; game.banner = ""; game.bannerSub = ""; }
    updateBall(dt);
    updateCamera(dt);
    return;
  }

  if (game.state === "goal") {
    game.stateTimer -= dt;
    updateBall(dt);
    updateCamera(dt);
    if (game.stateTimer <= 0) setupKickoff(game.kickoffTeam);
    return;
  }

  if (game.state === "penalty") { updatePenalty(dt); return; }

  if (game.state === "half" || game.state === "end") return;

  // ------- estado "play"
  game.clock += dt;
  const halfLen = matchLengthSec() / 2;
  if (game.half === 1 && game.clock >= halfLen) {
    game.state = "half";
    game.banner = "DESCANSO";
    game.bannerSub = game.score[0] + " – " + game.score[1];
    sfx.whistle();
    return;
  }
  if (game.half === 2 && game.clock >= matchLengthSec()) {
    game.state = "end";
    game.banner = "FINAL DEL PARTIDO";
    const [a, b] = game.score;
    game.bannerSub = a === b ? "EMPATE " + a + " – " + b
      : (a > b ? game.teams[0].name : game.teams[1].name) + " GANA " + Math.max(a, b) + " – " + Math.min(a, b);
    sfx.whistle();
    return;
  }

  for (const c of game.humans) autoSwitchTeam(c.team);
  for (const c of game.humans) updateControlled(c, dt);
  aiThink(dt);

  for (const p of game.players) {
    p.x = clamp(p.x, -30, PITCH_W + 30);
    p.y = clamp(p.y, -20, PITCH_H + 20);
    p.runPhase += Math.hypot(p.vx, p.vy) * dt * 0.09;
  }

  updateBall(dt);
  checkGoalAndBounds();
  updateCamera(dt);
}

function updateCamera(dt) {
  const target = clamp(ball.x, 185, PITCH_W - 185);
  game.camX = lerp(game.camX, target, 1 - Math.pow(0.002, dt));
}

// ============================================================ RENDER 3D
// Cámara de retransmisión: elevada tras la banda cercana, inclinada hacia
// el campo. La simulación sigue siendo 2D; aquí solo se proyecta.
const CAM = { D: 340, H: 320, tilt: 0.40, f: 800, cx: VIEW_W / 2, cy: 300 };
const camCos = Math.cos(CAM.tilt), camSin = Math.sin(CAM.tilt);

function project(wx, wy, wz = 0) {
  const dx = wx - game.camX;
  const fy = wy + CAM.D;
  const dz = wz - CAM.H;
  const Z = fy * camCos - dz * camSin;
  const U = fy * camSin + dz * camCos;
  return { x: CAM.cx + CAM.f * dx / Z, y: CAM.cy - CAM.f * U / Z, s: CAM.f / Z };
}

function quad3(x1, y1, z1, x2, y2, z2, x3, y3, z3, x4, y4, z4, fill) {
  const a = project(x1, y1, z1), b = project(x2, y2, z2), c = project(x3, y3, z3), d = project(x4, y4, z4);
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y);
  ctx.closePath();
  ctx.fill();
}

function line3(x1, y1, x2, y2, w = 2, color = "rgba(255,255,255,.9)", z1 = 0, z2 = 0) {
  const a = project(x1, y1, z1), b = project(x2, y2, z2);
  ctx.strokeStyle = color;
  ctx.lineWidth = w * (a.s + b.s) / 2;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

function arc3(cx, cy, r, a0, a1, w = 2, color = "rgba(255,255,255,.9)") {
  ctx.strokeStyle = color;
  ctx.beginPath();
  const steps = 28;
  let started = false;
  let sAcc = 0;
  for (let i = 0; i <= steps; i++) {
    const a = a0 + (a1 - a0) * (i / steps);
    const p = project(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0);
    sAcc += p.s;
    if (!started) { ctx.moveTo(p.x, p.y); started = true; }
    else ctx.lineTo(p.x, p.y);
  }
  ctx.lineWidth = w * (sAcc / (steps + 1));
  ctx.stroke();
}

// Multitud pre-renderizada (se genera una vez)
const crowdCanvas = document.createElement("canvas");
crowdCanvas.width = 1600; crowdCanvas.height = 150;
(function buildCrowd() {
  const c = crowdCanvas.getContext("2d");
  c.fillStyle = "#10131c";
  c.fillRect(0, 0, 1600, 150);
  const palette = ["#3a4a6b", "#6b3a3f", "#d8d2c4", "#4a6b52", "#2c3448", "#8a4a52", "#c4b490", "#5a6a8a"];
  for (let i = 0; i < 5200; i++) {
    c.fillStyle = palette[Math.floor(Math.random() * palette.length)];
    c.globalAlpha = rnd(0.35, 0.9);
    c.fillRect(Math.random() * 1600, Math.random() * 150, 2, 2.5);
  }
  c.globalAlpha = 1;
  // pasillos y separadores de gradas
  c.fillStyle = "rgba(6,8,12,.8)";
  for (let x = 0; x < 1600; x += 200) c.fillRect(x, 0, 5, 150);
  c.fillRect(0, 72, 1600, 5);
})();

const AD_BRANDS = ["FÚTBOL PRO 26", "VOLT", "CLAW COLA", "AERO LÍNEAS", "HIGGS TEL", "BANCO SUR"];

function drawStadium() {
  // referencia de filas fijas de la proyección
  const boardTop = project(game.camX, 694, 30).y;
  const boardBot = project(game.camX, 694, 0).y;

  // cielo nocturno
  const sky = ctx.createLinearGradient(0, 0, 0, boardTop);
  sky.addColorStop(0, "#05070e");
  sky.addColorStop(1, "#0d1322");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, VIEW_W, boardTop);

  // grada superior con público (parallax con la cámara)
  const crowdTop = Math.max(26, boardTop - 128);
  const off = ((game.camX * 0.55) % 1600 + 1600) % 1600;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, crowdTop, VIEW_W, boardTop - crowdTop);
  ctx.clip();
  const ch = boardTop - crowdTop;
  ctx.drawImage(crowdCanvas, off, 0, 1600 - off, 150, 0, crowdTop, (1600 - off) * (VIEW_W / 1600) * 1.4, ch);
  ctx.drawImage(crowdCanvas, 0, 0, 1600, 150, (1600 - off) * (VIEW_W / 1600) * 1.4, crowdTop, 1600 * (VIEW_W / 1600) * 1.4, ch);
  ctx.restore();
  // techo del estadio y focos
  ctx.fillStyle = "#03040a";
  ctx.fillRect(0, crowdTop - 26, VIEW_W, 26);
  ctx.fillStyle = "rgba(255,244,214,.85)";
  for (let i = 0; i < 8; i++) {
    ctx.beginPath();
    ctx.arc(60 + i * 120 - (game.camX * 0.2) % 120, crowdTop - 13, 3.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // césped exterior (explanada completa bajo el campo)
  quad3(game.camX - 900, -70, 0, game.camX + 900, -70, 0, game.camX + 900, 694, 0, game.camX - 900, 694, 0, "#2a7a36");

  // vallas publicitarias en el fondo
  for (let bx = -240; bx < PITCH_W + 240; bx += 220) {
    quad3(bx, 692, 0, bx + 208, 692, 0, bx + 208, 692, 30, bx, 692, 30, "#0c1018");
    const mid = project(bx + 104, 692, 15);
    if (mid.x > -80 && mid.x < VIEW_W + 80) {
      ctx.fillStyle = VOLT;
      ctx.font = "bold " + Math.round(11 * mid.s) + "px 'Segoe UI', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(AD_BRANDS[(Math.round(bx / 220) % AD_BRANDS.length + AD_BRANDS.length) % AD_BRANDS.length], mid.x, mid.y);
    }
  }
  ctx.textBaseline = "alphabetic";
  // franja de sombra bajo las vallas
  ctx.fillStyle = "rgba(0,0,0,.25)";
  ctx.fillRect(0, boardBot, VIEW_W, 3);
}

function drawPitch3D() {
  // franjas de césped segadas
  for (let i = 0; i < 14; i++) {
    const x0 = -75 + i * 85.7;
    const x1 = x0 + 85.7;
    quad3(x0, 0, 0, x1, 0, 0, x1, PITCH_H, 0, x0, PITCH_H, 0, i % 2 ? "#3da24b" : "#369044");
  }
  const LINE = "rgba(255,255,255,.92)";
  // perímetro
  line3(0, 0, PITCH_W, 0, 2.2, LINE);
  line3(0, PITCH_H, PITCH_W, PITCH_H, 2.2, LINE);
  line3(0, 0, 0, PITCH_H, 2.2, LINE);
  line3(PITCH_W, 0, PITCH_W, PITCH_H, 2.2, LINE);
  // centro
  line3(PITCH_W / 2, 0, PITCH_W / 2, PITCH_H, 2.2, LINE);
  arc3(PITCH_W / 2, PITCH_H / 2, 91, 0, Math.PI * 2, 2.2, LINE);
  const cs = project(PITCH_W / 2, PITCH_H / 2, 0);
  ctx.fillStyle = "#fff";
  ctx.beginPath(); ctx.arc(cs.x, cs.y, 2.6 * cs.s, 0, Math.PI * 2); ctx.fill();
  // áreas
  for (const left of [true, false]) {
    const bx = left ? BOX_W : PITCH_W - BOX_W;
    const gx = left ? 0 : PITCH_W;
    const y0 = (PITCH_H - BOX_H) / 2, y1 = (PITCH_H + BOX_H) / 2;
    line3(gx, y0, bx, y0, 2.2, LINE);
    line3(gx, y1, bx, y1, 2.2, LINE);
    line3(bx, y0, bx, y1, 2.2, LINE);
    const sx = left ? SMALL_BOX_W : PITCH_W - SMALL_BOX_W;
    const sy0 = (PITCH_H - SMALL_BOX_H) / 2, sy1 = (PITCH_H + SMALL_BOX_H) / 2;
    line3(gx, sy0, sx, sy0, 2.2, LINE);
    line3(gx, sy1, sx, sy1, 2.2, LINE);
    line3(sx, sy0, sx, sy1, 2.2, LINE);
    // punto de penalti + semicírculo
    const px = left ? PENALTY_SPOT : PITCH_W - PENALTY_SPOT;
    const ps = project(px, PITCH_H / 2, 0);
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(ps.x, ps.y, 2.2 * ps.s, 0, Math.PI * 2); ctx.fill();
    arc3(px, PITCH_H / 2, 91, left ? -0.93 : Math.PI - 0.93, left ? 0.93 : Math.PI + 0.93, 2.2, LINE);
  }
}

function drawGoal3D(side) {
  const gx = side; // 0 o PITCH_W
  const out = side === 0 ? -1 : 1;
  const bx = gx + out * GOAL_DEPTH;
  const NET = "rgba(255,255,255,.28)";
  // red: fondo
  for (let i = 0; i <= 6; i++) {
    const y = GOAL_TOP + (GOAL_BOT - GOAL_TOP) * (i / 6);
    const a = project(bx, y, 0), b = project(bx, y, CROSSBAR_Z - 4);
    ctx.strokeStyle = NET; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  for (let i = 0; i <= 4; i++) {
    const z = (CROSSBAR_Z - 4) * (i / 4);
    const a = project(bx, GOAL_TOP, z), b = project(bx, GOAL_BOT, z);
    ctx.strokeStyle = NET; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  // laterales de la red
  for (const gy of [GOAL_TOP, GOAL_BOT]) {
    const a = project(gx, gy, CROSSBAR_Z), b = project(bx, gy, CROSSBAR_Z - 4);
    const c = project(bx, gy, 0), d = project(gx, gy, 0);
    ctx.strokeStyle = NET; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(c.x, c.y); ctx.stroke();
  }
  // postes y larguero
  const POST = "rgba(250,250,250,.98)";
  const p1 = project(gx, GOAL_TOP, 0), p2 = project(gx, GOAL_TOP, CROSSBAR_Z);
  const p3 = project(gx, GOAL_BOT, 0), p4 = project(gx, GOAL_BOT, CROSSBAR_Z);
  ctx.strokeStyle = POST;
  ctx.lineCap = "round";
  ctx.lineWidth = 3 * p1.s;
  ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(p3.x, p3.y); ctx.lineTo(p4.x, p4.y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(p2.x, p2.y); ctx.lineTo(p4.x, p4.y); ctx.stroke();
  ctx.lineCap = "butt";
}

function drawPlayer3D(p) {
  const g = project(p.x, p.y, 0);
  const S = g.s;
  const team = game.teams[p.team];
  const star = p.idx === 9 && team.star;
  const kit = p.role === "GK" ? "#3ecf5e" : team.kit;
  const kit2 = p.role === "GK" ? "#0a5c26" : team.kit2;
  const skin = star ? team.star.skin : "#d9a06b";
  const hair = star ? team.star.hair : "#241a12";

  // sombra
  ctx.fillStyle = "rgba(0,0,0,.35)";
  ctx.beginPath();
  ctx.ellipse(g.x + 2 * S, g.y + 1 * S, 6.5 * S, 2.4 * S, 0, 0, Math.PI * 2);
  ctx.fill();

  // anillo del jugador controlado
  const c = game.humans.find(h => game.controlled[h.team] === p);
  if (c && game.state !== "end") {
    ctx.strokeStyle = c.color;
    ctx.lineWidth = 2.2 * S;
    ctx.beginPath();
    ctx.ellipse(g.x, g.y + 0.6 * S, 9.5 * S, 3.6 * S, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  const moving = Math.hypot(p.vx, p.vy) > 12;
  const swing = moving ? Math.sin(p.runPhase) : 0;
  const lean = clamp(p.vx / 400, -0.25, 0.25);

  // piernas
  ctx.strokeStyle = skin;
  ctx.lineWidth = 2.2 * S;
  ctx.lineCap = "round";
  const hipY = g.y - 10 * S;
  ctx.beginPath();
  ctx.moveTo(g.x - 1.4 * S, hipY);
  ctx.lineTo(g.x - 1.4 * S + swing * 3.4 * S, g.y);
  ctx.moveTo(g.x + 1.4 * S, hipY);
  ctx.lineTo(g.x + 1.4 * S - swing * 3.4 * S, g.y);
  ctx.stroke();
  // medias
  ctx.strokeStyle = kit2;
  ctx.lineWidth = 2.3 * S;
  ctx.beginPath();
  ctx.moveTo(g.x - 1.4 * S + swing * 2.5 * S, g.y - 3.4 * S);
  ctx.lineTo(g.x - 1.4 * S + swing * 3.4 * S, g.y);
  ctx.moveTo(g.x + 1.4 * S - swing * 2.5 * S, g.y - 3.4 * S);
  ctx.lineTo(g.x + 1.4 * S - swing * 3.4 * S, g.y);
  ctx.stroke();
  ctx.lineCap = "butt";

  // pantalón
  ctx.fillStyle = kit2;
  ctx.fillRect(g.x - 3.2 * S, g.y - 14 * S, 6.4 * S, 4.6 * S);
  // camiseta (con leve inclinación al correr)
  ctx.save();
  ctx.translate(g.x, g.y - 14 * S);
  ctx.rotate(lean * 0.5);
  ctx.fillStyle = kit;
  ctx.fillRect(-3.8 * S, -9.5 * S, 7.6 * S, 10 * S);
  // brazos
  ctx.strokeStyle = kit;
  ctx.lineWidth = 2 * S;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-3.6 * S, -7.5 * S);
  ctx.lineTo(-4.6 * S - swing * 2 * S, -1.5 * S);
  ctx.moveTo(3.6 * S, -7.5 * S);
  ctx.lineTo(4.6 * S + swing * 2 * S, -1.5 * S);
  ctx.stroke();
  ctx.lineCap = "butt";
  // franja del kit
  ctx.fillStyle = kit2;
  ctx.fillRect(-3.8 * S, -9.5 * S, 1.5 * S, 10 * S);
  ctx.restore();

  // cabeza
  const headY = g.y - 26 * S;
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(g.x + lean * 6 * S, headY, 2.9 * S, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = hair;
  ctx.beginPath();
  ctx.arc(g.x + lean * 6 * S, headY - 0.8 * S, 2.7 * S, Math.PI, Math.PI * 2);
  ctx.fill();

  // tarjeta sobre la cabeza
  if (p.cardFlash && game.time < p.cardFlash.until) {
    ctx.fillStyle = p.cardFlash.type === "red" ? "#e53935" : "#ffd600";
    ctx.fillRect(g.x - 3 * S, headY - 12 * S, 6 * S, 9 * S);
    ctx.strokeStyle = "rgba(0,0,0,.4)";
    ctx.lineWidth = 1;
    ctx.strokeRect(g.x - 3 * S, headY - 12 * S, 6 * S, 9 * S);
  }

  // nombre bajo el controlado / portador
  if (c || ball.owner === p) {
    ctx.font = "600 " + Math.max(9, 6.5 * S) + "px 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,.92)";
    ctx.fillText(p.name, g.x, g.y + 8 * S);
  }
}

function drawBall3D() {
  const sh = project(ball.x, ball.y, 0);
  ctx.fillStyle = "rgba(0,0,0,.4)";
  ctx.beginPath();
  ctx.ellipse(sh.x + ball.z * 0.06 * sh.s, sh.y, 3.4 * sh.s * (1 - ball.z / 500), 1.4 * sh.s, 0, 0, Math.PI * 2);
  ctx.fill();
  const b = project(ball.x, ball.y, ball.z + 3);
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(b.x, b.y, 3.1 * b.s, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#8a8a8a";
  ctx.lineWidth = 0.8 * b.s;
  ctx.stroke();
  // costura simple
  ctx.strokeStyle = "rgba(40,40,40,.5)";
  ctx.beginPath();
  ctx.arc(b.x, b.y, 1.7 * b.s, 0.4, 2.6);
  ctx.stroke();
}

function drawPenaltyAim() {
  if (game.state !== "penalty" || !game.penalty) return;
  const pen = game.penalty;
  if (!humanController(pen.team)) return;
  const gx = targetGoalX(pen.team);
  const m = project(gx, pen.aimY, 12);
  ctx.strokeStyle = VOLT;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(m.x, m.y, 8 * m.s, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(m.x - 12 * m.s, m.y); ctx.lineTo(m.x + 12 * m.s, m.y);
  ctx.moveTo(m.x, m.y - 12 * m.s); ctx.lineTo(m.x, m.y + 12 * m.s);
  ctx.stroke();
}

// ==================================================================== RENDER
function render() {
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);
  if (game.state === "menu") { renderMenu(); return; }

  drawStadium();
  drawPitch3D();
  drawGoal3D(0);
  drawGoal3D(PITCH_W);

  // entidades ordenadas por profundidad (lejos primero = wy mayor)
  const ents = game.players.map(p => ({ wy: p.y, kind: "p", p }));
  ents.push({ wy: ball.y, kind: "b" });
  ents.sort((a, b) => b.wy - a.wy);
  for (const e of ents) {
    if (e.kind === "p") drawPlayer3D(e.p);
    else drawBall3D();
  }

  drawPenaltyAim();
  drawHUD();
  drawTouchControls();
  drawRadar();
  if (game.banner) drawBanner();
}

// ------------------------------------------------------------------- HUD
function drawHUD() {
  const t0 = game.teams[0], t1 = game.teams[1];
  ctx.save();
  ctx.textBaseline = "middle";
  const y = 27, h = 32;
  // barra principal
  ctx.fillStyle = UI_DARK;
  roundRect(16, y - h / 2, 284, h, 4); ctx.fill();
  ctx.fillStyle = VOLT;
  ctx.fillRect(16, y - h / 2, 3, h);
  ctx.fillStyle = t0.kit; ctx.fillRect(30, y - 9, 6, 18);
  ctx.fillStyle = t1.kit; ctx.fillRect(168, y - 9, 6, 18);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "left";
  ctx.font = "italic bold 15px 'Segoe UI', sans-serif";
  ctx.fillText(t0.short, 42, y);
  ctx.fillText(t1.short, 180, y);
  ctx.textAlign = "center";
  ctx.font = "italic bold 18px 'Segoe UI', sans-serif";
  ctx.fillText(game.score[0] + " - " + game.score[1], 128, y);
  const min = displayMinute();
  const halfTag = game.half === 1 ? "1T" : "2T";
  ctx.font = "italic bold 15px 'Segoe UI', sans-serif";
  ctx.fillStyle = VOLT;
  ctx.fillText(min + "'  " + halfTag, 252, y);

  // barras de potencia de tiro (una por mando)
  let barSlot = 0;
  for (const c of game.humans) {
    const charging = c.shootHeld && c.shootCharge > 0;
    if (!charging) continue;
    const w = 160, bx = VIEW_W / 2 - w / 2, by = VIEW_H - 40 - barSlot * 26;
    ctx.fillStyle = UI_DARK;
    roundRect(bx - 26, by - 4, w + 30, 18, 4); ctx.fill();
    ctx.fillStyle = c.color;
    ctx.font = "bold 11px 'Segoe UI', sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(c.label, bx - 20, by + 5);
    const t = clamp(c.shootCharge / 0.9, 0, 1);
    const grad = ctx.createLinearGradient(bx, 0, bx + w, 0);
    grad.addColorStop(0, VOLT); grad.addColorStop(0.65, "#ffc107"); grad.addColorStop(1, "#f44336");
    ctx.fillStyle = grad;
    ctx.fillRect(bx, by, w * t, 10);
    barSlot++;
  }

  // ayuda de controles
  if (!touchUI.enabled) {
    ctx.font = "11px 'Segoe UI', sans-serif";
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(255,255,255,.5)";
    if (game.mode === 0) {
      ctx.fillText("WASD/Flechas mover · Espacio pase/entrada · E tiro (mantén) · Q globo · Shift sprint · C cambiar", 16, VIEW_H - 10);
    } else {
      ctx.fillText("J1: WASD · Espacio pase · E tiro · Q globo · Shift sprint · C cambiar     J2: Flechas · L pase · P tiro · O globo · K sprint · M cambiar", 16, VIEW_H - 10);
    }
  }
  ctx.restore();
}

function drawTouchControls() {
  if (!touchUI.enabled) return;
  if (!["play", "kickoff", "goal", "penalty"].includes(game.state)) return;
  ctx.save();

  // joystick
  if (touchUI.joyId !== null) {
    ctx.strokeStyle = "rgba(255,255,255,.4)";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(touchUI.joyBX, touchUI.joyBY, JOY_R, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = touchUI.mag > 0.92 ? "rgba(201,247,58,.5)" : "rgba(255,255,255,.35)";
    ctx.beginPath();
    ctx.arc(touchUI.joyBX + touchUI.joyDX, touchUI.joyBY + touchUI.joyDY, 26, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.strokeStyle = "rgba(255,255,255,.18)";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.beginPath(); ctx.arc(150, 470, JOY_R, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(255,255,255,.3)";
    ctx.font = "11px 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("MOVER", 150, 474);
  }

  // botones
  const c = game.humans[0];
  for (const b of TOUCH_BTNS) {
    const pressed = [...touchUI.pointers.values()].includes(b.id);
    ctx.fillStyle = pressed ? "rgba(201,247,58,.30)" : "rgba(9,12,18,.55)";
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = pressed ? VOLT : "rgba(201,247,58,.45)";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.stroke();
    // carga del tiro alrededor del botón
    if (b.id === "shoot" && c && c.shootHeld && c.shootCharge > 0) {
      ctx.strokeStyle = "#ffc107";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r + 5, -Math.PI / 2, -Math.PI / 2 + clamp(c.shootCharge / 0.9, 0, 1) * Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(255,255,255,.85)";
    ctx.font = "bold " + (b.r > 35 ? 14 : 11) + "px 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(b.label, b.x, b.y);
  }
  ctx.textBaseline = "alphabetic";
  ctx.restore();
}

function drawRadar() {
  const w = 170, h = 108;
  // en táctil el radar sube para dejar sitio a los botones
  const x = VIEW_W - w - 16;
  const y = touchUI.enabled ? 52 : VIEW_H - h - 20;
  ctx.save();
  ctx.globalAlpha = 0.88;
  ctx.fillStyle = "rgba(8, 20, 12, .85)";
  roundRect(x, y, w, h, 4); ctx.fill();
  ctx.strokeStyle = "rgba(201,247,58,.45)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 4, y + 4, w - 8, h - 8);
  ctx.beginPath(); ctx.moveTo(x + w / 2, y + 4); ctx.lineTo(x + w / 2, y + h - 4); ctx.stroke();
  const sx = (w - 8) / PITCH_W, sy = (h - 8) / PITCH_H;
  for (const p of game.players) {
    ctx.fillStyle = p.team === 0 ? game.teams[0].kit : game.teams[1].kit;
    ctx.fillRect(x + 4 + p.x * sx - 1.5, y + 4 + p.y * sy - 1.5, 3, 3);
  }
  ctx.fillStyle = VOLT;
  ctx.beginPath();
  ctx.arc(x + 4 + ball.x * sx, y + 4 + ball.y * sy, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBanner() {
  ctx.save();
  ctx.textAlign = "center";
  ctx.fillStyle = UI_DARK;
  const big = ["goal", "half", "end"].includes(game.state);
  const bh = big ? 112 : 72;
  roundRect(VIEW_W / 2 - 260, VIEW_H / 2 - bh / 2, 520, bh, 6); ctx.fill();
  ctx.fillStyle = VOLT;
  ctx.fillRect(VIEW_W / 2 - 260, VIEW_H / 2 - bh / 2, 520, 3);
  ctx.fillStyle = game.state === "goal" ? VOLT : "#fff";
  ctx.font = "italic bold " + (big ? 34 : 24) + "px 'Segoe UI', sans-serif";
  ctx.fillText(game.banner, VIEW_W / 2, VIEW_H / 2 - (game.bannerSub ? 12 : -6));
  if (game.bannerSub) {
    ctx.font = "15px 'Segoe UI', sans-serif";
    ctx.fillStyle = "rgba(255,255,255,.85)";
    ctx.fillText(game.bannerSub, VIEW_W / 2, VIEW_H / 2 + 22);
  }
  if (game.state === "half" || game.state === "end") {
    ctx.font = "13px 'Segoe UI', sans-serif";
    ctx.fillStyle = VOLT;
    ctx.fillText("Pulsa ESPACIO para continuar", VIEW_W / 2, VIEW_H / 2 + 44);
  }
  ctx.restore();
}

// -------------------------------------------------------- Menú estilo FC 26
function statColor(v) {
  return v >= 80 ? "#8ef58a" : v >= 60 ? "#f5e08a" : "#f58a8a";
}

function drawStarCard(x, y, w, h, teamDef) {
  const star = teamDef.star;
  ctx.save();
  // panel
  ctx.fillStyle = "rgba(13, 17, 26, .96)";
  roundRect(x, y, w, h, 8); ctx.fill();
  ctx.strokeStyle = "rgba(201,247,58,.35)";
  ctx.lineWidth = 1.5;
  roundRect(x, y, w, h, 8); ctx.stroke();
  ctx.fillStyle = VOLT;
  ctx.fillRect(x, y, w, 3);

  // busto del jugador
  const cxp = x + w / 2, headY = y + 92;
  ctx.fillStyle = "rgba(201,247,58,.06)";
  ctx.beginPath(); ctx.arc(cxp, headY + 26, 84, Math.PI, Math.PI * 2); ctx.fill();
  // hombros / camiseta
  ctx.fillStyle = teamDef.kit;
  ctx.beginPath();
  ctx.moveTo(cxp - 62, y + 178);
  ctx.quadraticCurveTo(cxp - 58, headY + 26, cxp - 26, headY + 20);
  ctx.lineTo(cxp + 26, headY + 20);
  ctx.quadraticCurveTo(cxp + 58, headY + 26, cxp + 62, y + 178);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = teamDef.kit2;
  ctx.fillRect(cxp - 62, y + 158, 124, 4);
  // cuello
  ctx.fillStyle = star.skin;
  ctx.fillRect(cxp - 8, headY + 8, 16, 16);
  // cabeza
  ctx.beginPath(); ctx.arc(cxp, headY, 24, 0, Math.PI * 2); ctx.fill();
  // pelo y barba
  ctx.fillStyle = star.hair;
  ctx.beginPath(); ctx.arc(cxp, headY - 6, 23, Math.PI, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cxp, headY + 10, 15, 0.35, Math.PI - 0.35); ctx.fill();

  // media y posiciones
  ctx.textAlign = "left";
  ctx.fillStyle = VOLT;
  ctx.font = "italic bold 44px 'Segoe UI', sans-serif";
  ctx.fillText(String(star.ovr), x + 18, y + 52);
  ctx.fillStyle = "rgba(255,255,255,.65)";
  ctx.font = "bold 12px 'Segoe UI', sans-serif";
  ctx.fillText(star.pos, x + 18, y + 70);

  // nombre
  ctx.textAlign = "center";
  ctx.fillStyle = "#fff";
  ctx.font = "italic bold 22px 'Segoe UI', sans-serif";
  ctx.fillText(star.name.toUpperCase(), cxp, y + 208);
  ctx.fillStyle = "rgba(255,255,255,.5)";
  ctx.font = "11px 'Segoe UI', sans-serif";
  ctx.fillText(teamDef.name + " · TEMPORADA 2026", cxp, y + 226);

  // estadísticas
  const sw = (w - 36) / 6;
  for (let i = 0; i < 6; i++) {
    const sx = x + 18 + sw * i + sw / 2;
    ctx.fillStyle = "rgba(255,255,255,.45)";
    ctx.font = "bold 10px 'Segoe UI', sans-serif";
    ctx.fillText(STAT_LABELS[i], sx, y + h - 40);
    ctx.fillStyle = statColor(star.stats[i]);
    ctx.font = "italic bold 20px 'Segoe UI', sans-serif";
    ctx.fillText(String(star.stats[i]), sx, y + h - 18);
  }
  ctx.restore();
}

function renderMenu() {
  // fondo oscuro con resplandor volt
  ctx.fillStyle = "#080b11";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  const glow = ctx.createRadialGradient(VIEW_W * 0.75, VIEW_H * 0.2, 40, VIEW_W * 0.75, VIEW_H * 0.2, 520);
  glow.addColorStop(0, "rgba(201,247,58,.10)");
  glow.addColorStop(1, "rgba(201,247,58,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  // líneas diagonales sutiles
  ctx.strokeStyle = "rgba(255,255,255,.03)";
  ctx.lineWidth = 1;
  for (let i = -10; i < 30; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 60, 0); ctx.lineTo(i * 60 + 220, VIEW_H);
    ctx.stroke();
  }

  // título
  ctx.textAlign = "left";
  ctx.font = "italic bold 44px 'Segoe UI', sans-serif";
  ctx.fillStyle = "#fff";
  ctx.fillText("FÚTBOL PRO", 56, 78);
  ctx.fillStyle = VOLT;
  ctx.fillText("26", 336, 78);
  ctx.font = "13px 'Segoe UI', sans-serif";
  ctx.fillStyle = "rgba(255,255,255,.55)";
  ctx.fillText("TEMPORADA 2026 · HOMENAJE JUGABLE SIN LICENCIAS · HTML5", 58, 100);

  // filas del menú (columna izquierda)
  const rows = [
    { label: "EQUIPO JUGADOR 1", value: TEAMS[game.menuIndex[0]].name + "  (" + TEAMS[game.menuIndex[0]].rating + ")" },
    { label: game.mode === 0 ? "RIVAL (CPU)" : "EQUIPO JUGADOR 2", value: TEAMS[game.menuIndex[1]].name + "  (" + TEAMS[game.menuIndex[1]].rating + ")" },
    { label: "MODO", value: game.mode === 0 ? "1 JUGADOR vs CPU" : "2 JUGADORES" },
    { label: "DURACIÓN", value: ["CORTA (2:30)", "NORMAL (4:00)", "LARGA (6:00)"][game.menuLenIdx] },
    { label: "", value: "▶  JUGAR PARTIDO" },
  ];
  const colX = 56, colW = 460;
  rows.forEach((r, i) => {
    const y = 156 + i * 74;
    const sel = game.menuRow === i;
    ctx.fillStyle = sel ? "rgba(201,247,58,.10)" : "rgba(13,17,26,.85)";
    roundRect(colX, y - 26, colW, 56, 5); ctx.fill();
    ctx.fillStyle = sel ? VOLT : "rgba(255,255,255,.12)";
    ctx.fillRect(colX, y - 26, 3, 56);
    if (sel) {
      ctx.strokeStyle = "rgba(201,247,58,.5)"; ctx.lineWidth = 1.5;
      roundRect(colX, y - 26, colW, 56, 5); ctx.stroke();
    }
    if (r.label) {
      ctx.fillStyle = "rgba(255,255,255,.5)";
      ctx.font = "bold 11px 'Segoe UI', sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(r.label, colX + 18, y - 8);
      ctx.font = "italic bold 19px 'Segoe UI', sans-serif";
      ctx.fillStyle = sel ? VOLT : "#fff";
      ctx.fillText("◄  " + r.value + "  ►", colX + 18, y + 17);
    } else {
      ctx.font = "italic bold 22px 'Segoe UI', sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = sel ? VOLT : "#fff";
      ctx.fillText(r.value, colX + colW / 2, y + 10);
    }
  });

  // carta de la estrella del equipo seleccionado (columna derecha)
  const cardTeam = TEAMS[game.menuIndex[game.menuRow === 1 ? 1 : 0]];
  drawStarCard(576, 140, 328, 330, cardTeam);
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,.4)";
  ctx.font = "11px 'Segoe UI', sans-serif";
  ctx.fillText("ESTRELLA DEL CLUB", 576 + 164, 132);

  ctx.font = "13px 'Segoe UI', sans-serif";
  ctx.fillStyle = "rgba(255,255,255,.5)";
  ctx.fillText("↑↓ elegir fila · ←→ cambiar · ENTER confirmar", VIEW_W / 2, VIEW_H - 22);
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ----------------------------------------------------------------- Arranque
requestAnimationFrame(frame);
