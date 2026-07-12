/* =========================================================================
   Fútbol Pro 16 — un clon de FIFA 16 en HTML5 Canvas (sin dependencias)
   11 vs 11, cámara que sigue el balón, pases, tiros con potencia, globos,
   porteros, faltas y tarjetas, penaltis, modo 2 jugadores, saques de
   banda/esquina/puerta simplificados, radar y marcador.
   ========================================================================= */
"use strict";

// ------------------------------------------------------------------ Canvas
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const VIEW_W = canvas.width;
const VIEW_H = canvas.height;

// ------------------------------------------------------------- Dimensiones
// Campo de 105 m x 68 m a 10 px/m, con margen exterior.
const PITCH_W = 1050;
const PITCH_H = 680;
const MARGIN = 60;
const WORLD_W = PITCH_W + MARGIN * 2;
const WORLD_H = PITCH_H + MARGIN * 2;

const GOAL_HALF = 50;      // media boca de portería (jugable, algo más ancha que la real)
const GOAL_TOP = PITCH_H / 2 - GOAL_HALF;
const GOAL_BOT = PITCH_H / 2 + GOAL_HALF;
const CROSSBAR_Z = 30;     // altura del larguero
const GOAL_DEPTH = 22;

const BOX_W = 165, BOX_H = 403;         // área grande
const SMALL_BOX_W = 55, SMALL_BOX_H = 183; // área pequeña
const PENALTY_SPOT = 110;               // distancia del punto de penalti a la línea

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
// Nombres y jugadores ficticios (homenaje, sin licencias).
const TEAMS = [
  { name: "FC BLANCOS",     short: "BLA", kit: "#f5f5f5", kit2: "#22262e", rating: 88 },
  { name: "AZULGRANA CF",   short: "AZG", kit: "#a5003c", kit2: "#004a9f", rating: 88 },
  { name: "UNITED ROJO",    short: "URJ", kit: "#d81b2a", kit2: "#1b1b1b", rating: 84 },
  { name: "CELESTE CITY",   short: "CEL", kit: "#7fc3e8", kit2: "#ffffff", rating: 86 },
  { name: "BÁVAROS FC",     short: "BAV", kit: "#c8102e", kit2: "#ffffff", rating: 87 },
  { name: "VECCHIA SIGNORA",short: "VSN", kit: "#e8e8e8", kit2: "#111111", rating: 84 },
  { name: "LES PARISIENS",  short: "PAR", kit: "#20356b", kit2: "#d21034", rating: 85 },
  { name: "PORTEÑOS CA",    short: "POR", kit: "#ffd800", kit2: "#1b3a6b", rating: 81 },
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
// Cada humano tiene un "mando" con su mapa de teclas.
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
  return norm(x, y);
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
  return {
    team, idx, role: f.role,
    name: randomName(),
    number: idx === 0 ? 1 : idx + 1 + Math.floor(Math.random() * 3) * 10,
    x: 0, y: 0, vx: 0, vy: 0,
    facing: attackRight ? 0 : Math.PI,
    speed: (f.role === "GK" ? 150 : f.role === "DF" ? 165 : f.role === "MF" ? 175 : 185) * (0.9 + skill * 0.18),
    skill,
    tackleCooldown: 0,
    kickCooldown: 0,
    gkHoldUntil: 0,
    yellows: 0,
    cardFlash: null,   // { type, until } para dibujar la tarjeta sobre el jugador
  };
}

// ------------------------------------------------------------------- Estado
const game = {
  state: "menu",          // menu | kickoff | play | goal | penalty | half | end
  menuIndex: [0, 1],      // selección de equipos [P1, P2/CPU]
  menuRow: 0,             // 0 equipo P1 · 1 rival · 2 modo · 3 duración · 4 jugar
  menuLenIdx: 1,
  mode: 0,                // 0 = 1 jugador vs CPU · 1 = 2 jugadores
  matchLengths: [150, 240, 360],   // segundos reales por partido completo
  teams: [null, null],    // definiciones
  players: [],            // 22 jugadores
  attackRight: [true, false], // el equipo 0 ataca a la derecha
  score: [0, 0],
  clock: 0,               // segundos reales transcurridos de partido
  half: 1,
  stateTimer: 0,
  banner: "",
  bannerSub: "",
  kickoffTeam: 0,
  humans: [],             // mandos activos
  controlled: [null, null], // jugador controlado por cada equipo humano
  penalty: null,          // { team, shooter, gk, aimY, cpuTimer, shot }
  lastFoul: -99,
  stats: { fouls: 0, yellows: 0, reds: 0, penalties: 0 },
  camX: 0, camY: 0,
  time: 0,                // reloj global (s)
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
function menuKey(key) {
  const k = key.toLowerCase();
  if (k === "arrowup" || k === "w") game.menuRow = (game.menuRow + MENU_ROWS - 1) % MENU_ROWS;
  if (k === "arrowdown" || k === "s") game.menuRow = (game.menuRow + 1) % MENU_ROWS;
  const step = (k === "arrowleft" || k === "a") ? -1 : (k === "arrowright" || k === "d") ? 1 : 0;
  if (step !== 0) {
    if (game.menuRow === 0) game.menuIndex[0] = (game.menuIndex[0] + step + TEAMS.length) % TEAMS.length;
    if (game.menuRow === 1) game.menuIndex[1] = (game.menuIndex[1] + step + TEAMS.length) % TEAMS.length;
    if (game.menuRow === 2) game.mode = 1 - game.mode;
    if (game.menuRow === 3) game.menuLenIdx = (game.menuLenIdx + step + 3) % 3;
    beep(300, 0.04, "square", 0.03);
  }
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
    // Restringir a su propia mitad
    const right = game.attackRight[p.team];
    if (right) p.x = Math.min(p.x, PITCH_W / 2 - 30);
    else p.x = Math.max(p.x, PITCH_W / 2 + 30);
    if (p.role === "GK") { const h2 = homePos(p); p.x = h2.x; }
  }
  ball.x = PITCH_W / 2; ball.y = PITCH_H / 2; ball.z = 0;
  ball.vx = ball.vy = ball.vz = 0;
  // Un delantero del equipo que saca se coloca en el balón
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
    const align = n.x * prefer.x + n.y * prefer.y; // -1..1
    if (align < 0.1) continue;
    const forward = game.attackRight[p.team] ? dx : -dx;
    const score = align * 220 - d * 0.25 + forward * 0.15;
    if (score > bestScore) { bestScore = score; best = q; }
  }
  if (!best) { // sin opción clara: pase corto hacia delante
    const v = lob ? 420 : 340;
    looseBall(prefer.x * v, prefer.y * v, lob ? 130 : 0);
    sfx.pass();
    return;
  }
  // Pase al espacio: apuntar un poco por delante del receptor
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
  // Evitar una lluvia de pitidos: mínimo 5 s entre faltas
  if (game.time - game.lastFoul < 5) {
    looseBall(rnd(-90, 90), rnd(-90, 90));
    return;
  }
  game.lastFoul = game.time;
  game.stats.fouls++;
  const fx = clamp(ball.x, 10, PITCH_W - 10);
  const fy = clamp(ball.y, 10, PITCH_H - 10);
  sfx.whistle();

  // Tarjeta según la dureza de la entrada
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
  // Todos los demás, fuera del área
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
  // más potencia = más error; puede irse fuera
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
      // perseguir balón suelto (con predicción simple)
      const t = clamp(dist(p.x, p.y, ball.x, ball.y) / 300, 0, 0.6);
      moveToward(p, ball.x + ball.vx * t, ball.y + ball.vy * t, p.speed, dt);
    } else if (!myTeamHasBall && carrier && presserFor(p.team) === p) {
      moveToward(p, carrier.x, carrier.y, p.speed, dt);
      tryTackle(p);
    } else if (!myTeamHasBall && carrier && p.role === "DF" &&
               Math.abs(carrier.x - goalX(p.team)) < 330 &&
               dist(p.x, p.y, carrier.x, carrier.y) < 230) {
      // los defensas cierran sobre el portador en zona peligrosa
      moveToward(p, carrier.x, carrier.y, p.speed, dt);
      tryTackle(p);
    } else {
      moveToward(p, h.x, h.y, p.speed * 0.85, dt);
    }
  }
}

// posición base desplazada según el balón (el bloque se mueve junto)
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
  // ¿Rival presionando?
  let pressure = Infinity;
  for (const q of game.players) {
    if (q.team === p.team) continue;
    pressure = Math.min(pressure, dist(q.x, q.y, p.x, p.y));
  }
  // Disparar si está cerca de portería
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
  // Pasar si hay presión
  if (pressure < 55 && p.kickCooldown <= 0 && Math.random() < dt * 4) {
    aiPass(p);
    return;
  }
  // Conducir hacia la portería rival, sorteando un poco
  const dir = norm(gx - p.x, (PITCH_H / 2 - p.y) * 0.35 + Math.sin(game.time * 2 + p.idx) * 60);
  moveToward(p, p.x + dir.x * 100, p.y + dir.y * 100, p.speed * 0.92, dt);
}

function aiPass(p) {
  const gx = targetGoalX(p.team);
  let best = null, bestScore = -Infinity;
  for (const q of teammates(p)) {
    if (q.role === "GK") continue;
    const d = dist(p.x, p.y, q.x, q.y);
    if (d < 40 || d > 420) continue;
    const forward = game.attackRight[p.team] ? (q.x - p.x) : (p.x - q.x);
    // penalizar receptores marcados
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
    // robo limpio
    giveBall(p);
    if (isHuman(p.team)) game.controlled[p.team] = p;
    beep(150, 0.06, "sawtooth", 0.05);
  } else if (Math.random() < 0.22 && game.state === "play") {
    // entrada dura: falta
    commitFoul(p, c);
  } else {
    // el balón queda suelto
    looseBall(rnd(-90, 90), rnd(-90, 90));
  }
}

// -------------------------------------------------------------------- Portero
function gkThink(p, dt) {
  const gx = goalX(p.team);
  const defendsLeft = gx === 0;
  const lineX = defendsLeft ? 14 : PITCH_W - 14;

  if (ball.owner === p) {
    // despeje largo tras atrapar
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
    // interceptar la trayectoria en la línea de gol
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
    tx = ball.x; ty = ball.y; // salir a por el balón muerto
  }
  moveToward(p, tx, ty, p.speed * 1.15, dt);

  // Atrapar o despejar
  if (!ball.owner && game.time > ball.shieldUntil) {
    const d = dist(p.x, p.y, ball.x, ball.y);
    const sp = Math.hypot(ball.vx, ball.vy);
    if (d < 27 && ball.z < 36 && sp < 560) {
      giveBall(p);
      p.gkHoldUntil = game.time + 1.0;
      beep(500, 0.08, "sine", 0.05);
    } else if (d < 38 && ball.z < 48 && sp >= 300) {
      // palmea el balón lejos de la portería
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
  const sprint = c.keymap.sprint.some(k => keys[k]);
  const speed = p.speed * (sprint ? 1.28 : 1) * (ball.owner === p ? 0.92 : 1);
  p.vx = dir.x * speed;
  p.vy = dir.y * speed;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  if (dir.x || dir.y) p.facing = Math.atan2(dir.y, dir.x);

  // Entrada / presión con el botón de pase cuando no tenemos el balón
  if (c.passReq && ball.owner && ball.owner.team !== c.team) {
    tryTackle(p);
    c.passReq = false;
  }
  // Pase con balón
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

  // Cambio manual de jugador
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
  if (ball.owner && ball.owner.team === t) return; // GK con balón
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
  ball.vz -= 380 * dt;              // gravedad
  if (ball.z <= 0) {
    ball.z = 0;
    if (ball.vz < -60) { ball.vz = -ball.vz * 0.45; } // bote
    else ball.vz = 0;
  }
  const fr = ball.z > 0 ? 0.995 : 0.985; // fricción (menos en el aire)
  ball.vx *= Math.pow(fr, dt * 60);
  ball.vy *= Math.pow(fr, dt * 60);

  // Postes y larguero
  for (const gx of [0, PITCH_W]) {
    for (const gy of [GOAL_TOP, GOAL_BOT]) {
      if (dist(ball.x, ball.y, gx, gy) < ball.r + 4 && ball.z < CROSSBAR_Z + 6) {
        ball.vx *= -0.55; ball.vy *= -0.55;
        ball.x += ball.vx * dt * 2;
        sfx.post();
      }
    }
  }

  // Control por jugadores cercanos
  if (game.time > ball.shieldUntil && ball.z < 22) {
    const sp = Math.hypot(ball.vx, ball.vy);
    for (const p of game.players) {
      if (p.kickCooldown > 0) continue;
      if (dist(p.x, p.y, ball.x, ball.y) < 15) {
        if (sp > 520 && Math.random() < 0.4) { // demasiado fuerte: rebote
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

  // ¿Gol?
  if (ball.x < 0 || ball.x > PITCH_W) {
    const side = ball.x < 0 ? 0 : PITCH_W; // línea cruzada
    const inMouth = ball.y > GOAL_TOP && ball.y < GOAL_BOT && ball.z < CROSSBAR_Z;
    if (inMouth && Math.abs(ball.x - side) < GOAL_DEPTH + 10) {
      // equipo que ataca esa portería
      const scorer = game.attackRight[0] ? (side === PITCH_W ? 0 : 1) : (side === 0 ? 0 : 1);
      goalScored(scorer);
      return;
    }
    if (Math.abs(ball.x - side) > 4) {
      // Fuera por línea de fondo: saque de puerta o córner (simplificado)
      const defTeam = goalX(0) === side ? 0 : 1;   // equipo que defiende esa línea
      if (ball.lastTouchTeam === defTeam) {
        // córner para el atacante
        const atk = 1 - defTeam;
        const cy = ball.y < PITCH_H / 2 ? 12 : PITCH_H - 12;
        restartPlay(atk, side === 0 ? 12 : PITCH_W - 12, cy, "CÓRNER");
      } else {
        // saque de puerta
        const gx = side === 0 ? SMALL_BOX_W : PITCH_W - SMALL_BOX_W;
        restartPlay(defTeam, gx, PITCH_H / 2, "SAQUE DE PUERTA");
      }
      return;
    }
  }

  // Fuera por banda
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
  game.state = "kickoff"; // pequeña pausa con cartel
  // separar rivales cercanos
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
    // durante la pausa el poseedor mantiene el balón
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

  // los jugadores no salen del mundo
  for (const p of game.players) {
    p.x = clamp(p.x, -30, PITCH_W + 30);
    p.y = clamp(p.y, -20, PITCH_H + 20);
  }

  updateBall(dt);
  checkGoalAndBounds();
  updateCamera(dt);
}

function updateCamera(dt) {
  const tx = clamp(ball.x + MARGIN - VIEW_W / 2, 0, WORLD_W - VIEW_W);
  const ty = clamp(ball.y + MARGIN - VIEW_H / 2, 0, WORLD_H - VIEW_H);
  game.camX = lerp(game.camX, tx, 1 - Math.pow(0.001, dt));
  game.camY = lerp(game.camY, ty, 1 - Math.pow(0.001, dt));
}

// ==================================================================== RENDER
function render() {
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);
  if (game.state === "menu") { renderMenu(); return; }

  ctx.save();
  ctx.translate(-game.camX, -game.camY);
  drawPitch();
  drawGoals();

  // sombras + jugadores ordenados por y
  const sorted = [...game.players].sort((a, b) => a.y - b.y);
  for (const p of sorted) drawPlayer(p);
  drawBall();
  drawPenaltyAim();
  ctx.restore();

  drawHUD();
  drawRadar();
  if (game.banner) drawBanner();
}

function drawPitch() {
  // césped con franjas
  ctx.fillStyle = "#0b5a22";
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  for (let i = 0; i < 12; i++) {
    ctx.fillStyle = i % 2 ? "#0d6427" : "#0b5a22";
    ctx.fillRect(MARGIN + (PITCH_W / 12) * i, MARGIN, PITCH_W / 12, PITCH_H);
  }
  ctx.save();
  ctx.translate(MARGIN, MARGIN);
  ctx.strokeStyle = "rgba(255,255,255,.85)";
  ctx.lineWidth = 3;
  ctx.strokeRect(0, 0, PITCH_W, PITCH_H);
  // línea central y círculo
  ctx.beginPath(); ctx.moveTo(PITCH_W / 2, 0); ctx.lineTo(PITCH_W / 2, PITCH_H); ctx.stroke();
  ctx.beginPath(); ctx.arc(PITCH_W / 2, PITCH_H / 2, 91, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(PITCH_W / 2, PITCH_H / 2, 4, 0, Math.PI * 2); ctx.fillStyle = "#fff"; ctx.fill();
  // áreas
  for (const left of [true, false]) {
    const x = left ? 0 : PITCH_W - BOX_W;
    ctx.strokeRect(x, (PITCH_H - BOX_H) / 2, BOX_W, BOX_H);
    const sx = left ? 0 : PITCH_W - SMALL_BOX_W;
    ctx.strokeRect(sx, (PITCH_H - SMALL_BOX_H) / 2, SMALL_BOX_W, SMALL_BOX_H);
    // punto de penalti y semicírculo
    const px = left ? PENALTY_SPOT : PITCH_W - PENALTY_SPOT;
    ctx.beginPath(); ctx.arc(px, PITCH_H / 2, 3, 0, Math.PI * 2); ctx.fillStyle = "#fff"; ctx.fill();
    ctx.beginPath();
    ctx.arc(px, PITCH_H / 2, 91, left ? -0.93 : Math.PI - 0.93, left ? 0.93 : Math.PI + 0.93);
    ctx.stroke();
  }
  ctx.restore();
}

function drawGoals() {
  ctx.save();
  ctx.translate(MARGIN, MARGIN);
  for (const left of [true, false]) {
    const x = left ? -GOAL_DEPTH : PITCH_W;
    ctx.fillStyle = "rgba(255,255,255,.14)";
    ctx.fillRect(x, GOAL_TOP, GOAL_DEPTH, GOAL_BOT - GOAL_TOP);
    // red
    ctx.strokeStyle = "rgba(255,255,255,.25)";
    ctx.lineWidth = 1;
    for (let i = 1; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(x + (GOAL_DEPTH / 5) * i, GOAL_TOP);
      ctx.lineTo(x + (GOAL_DEPTH / 5) * i, GOAL_BOT);
      ctx.stroke();
    }
    for (let i = 1; i < 8; i++) {
      const y = GOAL_TOP + ((GOAL_BOT - GOAL_TOP) / 8) * i;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + GOAL_DEPTH, y); ctx.stroke();
    }
    // postes
    ctx.fillStyle = "#fff";
    const px = left ? 0 : PITCH_W;
    ctx.fillRect(px - 3, GOAL_TOP - 3, 6, 6);
    ctx.fillRect(px - 3, GOAL_BOT - 3, 6, 6);
  }
  ctx.restore();
}

function drawPlayer(p) {
  const x = p.x + MARGIN, y = p.y + MARGIN;
  const team = game.teams[p.team];
  // sombra
  ctx.fillStyle = "rgba(0,0,0,.3)";
  ctx.beginPath(); ctx.ellipse(x, y + 4, 8, 3.5, 0, 0, Math.PI * 2); ctx.fill();

  // anillo del jugador controlado (color por mando)
  const c = game.humans.find(h => game.controlled[h.team] === p);
  if (c && game.state !== "end") {
    ctx.strokeStyle = c.color;
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(x, y + 3, 12, 0, Math.PI * 2); ctx.stroke();
  }

  // cuerpo
  const kit = p.role === "GK" ? "#2fbf4f" : team.kit;
  ctx.fillStyle = kit;
  ctx.beginPath(); ctx.arc(x, y - 3, 7.5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = p.role === "GK" ? "#0c3" : team.kit2;
  ctx.lineWidth = 2;
  ctx.stroke();
  // indicador de orientación
  ctx.fillStyle = team.kit2;
  ctx.beginPath();
  ctx.arc(x + Math.cos(p.facing) * 6, y - 3 + Math.sin(p.facing) * 6, 2.2, 0, Math.PI * 2);
  ctx.fill();

  // tarjeta sobre la cabeza
  if (p.cardFlash && game.time < p.cardFlash.until) {
    ctx.fillStyle = p.cardFlash.type === "red" ? "#e53935" : "#ffd600";
    ctx.fillRect(x - 4, y - 30, 8, 12);
    ctx.strokeStyle = "rgba(0,0,0,.4)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 4, y - 30, 8, 12);
  }

  // nombre bajo el controlado / portador
  if (c || ball.owner === p) {
    ctx.font = "10px 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,.9)";
    ctx.fillText(p.name, x, y + 20);
  }
}

function drawBall() {
  const x = ball.x + MARGIN, y = ball.y + MARGIN;
  ctx.fillStyle = "rgba(0,0,0,.35)";
  ctx.beginPath(); ctx.ellipse(x, y + 3, 5 - ball.z * 0.015, 2.5, 0, 0, Math.PI * 2); ctx.fill();
  const r = ball.r * (1 + ball.z / 160);
  ctx.fillStyle = "#ffffff";
  ctx.beginPath(); ctx.arc(x, y - ball.z * 0.55, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#999";
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawPenaltyAim() {
  if (game.state !== "penalty" || !game.penalty) return;
  const pen = game.penalty;
  if (!humanController(pen.team)) return;
  const gx = targetGoalX(pen.team) + MARGIN + (targetGoalX(pen.team) === 0 ? -8 : 8);
  const y = pen.aimY + MARGIN;
  ctx.strokeStyle = "#ffe14d";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(gx, y, 8, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(gx - 12, y); ctx.lineTo(gx + 12, y);
  ctx.moveTo(gx, y - 12); ctx.lineTo(gx, y + 12);
  ctx.stroke();
}

// ------------------------------------------------------------------- HUD
function drawHUD() {
  // marcador estilo FIFA (arriba izquierda)
  const t0 = game.teams[0], t1 = game.teams[1];
  ctx.save();
  ctx.font = "bold 15px 'Segoe UI', sans-serif";
  ctx.textBaseline = "middle";
  const y = 26, h = 30;
  ctx.fillStyle = "rgba(8,12,24,.88)";
  roundRect(16, y - h / 2, 262, h, 6); ctx.fill();
  ctx.fillStyle = t0.kit; ctx.fillRect(24, y - 8, 6, 16);
  ctx.fillStyle = t1.kit; ctx.fillRect(160, y - 8, 6, 16);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "left";
  ctx.fillText(t0.short, 36, y);
  ctx.fillText(t1.short, 172, y);
  ctx.textAlign = "center";
  ctx.font = "bold 17px 'Segoe UI', sans-serif";
  ctx.fillText(game.score[0] + " - " + game.score[1], 120, y);
  // reloj
  const min = displayMinute();
  const halfTag = game.half === 1 ? "1T" : "2T";
  ctx.font = "bold 15px 'Segoe UI', sans-serif";
  ctx.fillStyle = "#ffe14d";
  ctx.fillText(min + "'  " + halfTag, 236, y);

  // barras de potencia de tiro (una por mando)
  let barSlot = 0;
  for (const c of game.humans) {
    const charging = c.shootHeld && c.shootCharge > 0;
    if (!charging) continue;
    const w = 160, bx = VIEW_W / 2 - w / 2, by = VIEW_H - 34 - barSlot * 26;
    ctx.fillStyle = "rgba(0,0,0,.5)";
    roundRect(bx - 24, by - 4, w + 28, 18, 5); ctx.fill();
    ctx.fillStyle = c.color;
    ctx.font = "bold 11px 'Segoe UI', sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(c.label, bx - 18, by + 5);
    const t = clamp(c.shootCharge / 0.9, 0, 1);
    const grad = ctx.createLinearGradient(bx, 0, bx + w, 0);
    grad.addColorStop(0, "#4caf50"); grad.addColorStop(0.6, "#ffc107"); grad.addColorStop(1, "#f44336");
    ctx.fillStyle = grad;
    ctx.fillRect(bx, by, w * t, 10);
    barSlot++;
  }

  // ayuda de controles (pequeña, abajo izquierda)
  ctx.font = "11px 'Segoe UI', sans-serif";
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(255,255,255,.55)";
  if (game.mode === 0) {
    ctx.fillText("WASD/Flechas mover · Espacio pase/entrada · E tiro (mantén) · Q globo · Shift sprint · C cambiar", 16, VIEW_H - 10);
  } else {
    ctx.fillText("J1: WASD · Espacio pase · E tiro · Q globo · Shift sprint · C cambiar     J2: Flechas · L pase · P tiro · O globo · K sprint · M cambiar", 16, VIEW_H - 10);
  }
  ctx.restore();
}

function drawRadar() {
  const w = 170, h = 110;
  const x = VIEW_W - w - 16, y = VIEW_H - h - 16;
  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = "rgba(6,40,16,.85)";
  roundRect(x, y, w, h, 6); ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,.5)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 4, y + 4, w - 8, h - 8);
  ctx.beginPath(); ctx.moveTo(x + w / 2, y + 4); ctx.lineTo(x + w / 2, y + h - 4); ctx.stroke();
  const sx = (w - 8) / PITCH_W, sy = (h - 8) / PITCH_H;
  for (const p of game.players) {
    ctx.fillStyle = p.team === 0 ? game.teams[0].kit : game.teams[1].kit;
    ctx.fillRect(x + 4 + p.x * sx - 1.5, y + 4 + p.y * sy - 1.5, 3, 3);
  }
  ctx.fillStyle = "#ffe14d";
  ctx.beginPath();
  ctx.arc(x + 4 + ball.x * sx, y + 4 + ball.y * sy, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBanner() {
  ctx.save();
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(8,12,24,.85)";
  const big = ["goal", "half", "end"].includes(game.state);
  const bh = big ? 110 : 70;
  roundRect(VIEW_W / 2 - 260, VIEW_H / 2 - bh / 2, 520, bh, 10); ctx.fill();
  ctx.fillStyle = game.state === "goal" ? "#ffe14d" : "#fff";
  ctx.font = "bold " + (big ? 34 : 24) + "px 'Segoe UI', sans-serif";
  ctx.fillText(game.banner, VIEW_W / 2, VIEW_H / 2 - (game.bannerSub ? 12 : -6));
  if (game.bannerSub) {
    ctx.font = "15px 'Segoe UI', sans-serif";
    ctx.fillStyle = "rgba(255,255,255,.85)";
    ctx.fillText(game.bannerSub, VIEW_W / 2, VIEW_H / 2 + 22);
  }
  if (game.state === "half" || game.state === "end") {
    ctx.font = "13px 'Segoe UI', sans-serif";
    ctx.fillStyle = "#ffe14d";
    ctx.fillText("Pulsa ESPACIO para continuar", VIEW_W / 2, VIEW_H / 2 + 44);
  }
  ctx.restore();
}

// ------------------------------------------------------------------- Menú
function renderMenu() {
  // fondo: campo desenfocado
  ctx.fillStyle = "#07130a";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  for (let i = 0; i < 12; i++) {
    ctx.fillStyle = i % 2 ? "rgba(13,100,39,.35)" : "rgba(11,90,34,.35)";
    ctx.fillRect((VIEW_W / 12) * i, 0, VIEW_W / 12, VIEW_H);
  }
  ctx.strokeStyle = "rgba(255,255,255,.12)";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(VIEW_W / 2, VIEW_H / 2, 140, 0, Math.PI * 2); ctx.stroke();

  ctx.textAlign = "center";
  ctx.fillStyle = "#fff";
  ctx.font = "bold 42px 'Segoe UI', sans-serif";
  ctx.fillText("FÚTBOL PRO 16", VIEW_W / 2, 76);
  ctx.font = "14px 'Segoe UI', sans-serif";
  ctx.fillStyle = "#8fd6a0";
  ctx.fillText("Un homenaje jugable a FIFA 16 · HTML5 Canvas", VIEW_W / 2, 102);

  const rows = [
    { label: "EQUIPO JUGADOR 1", value: TEAMS[game.menuIndex[0]].name + "  (" + TEAMS[game.menuIndex[0]].rating + ")" },
    { label: game.mode === 0 ? "RIVAL (CPU)" : "EQUIPO JUGADOR 2", value: TEAMS[game.menuIndex[1]].name + "  (" + TEAMS[game.menuIndex[1]].rating + ")" },
    { label: "MODO", value: game.mode === 0 ? "1 JUGADOR vs CPU" : "2 JUGADORES" },
    { label: "DURACIÓN", value: ["CORTA (2:30)", "NORMAL (4:00)", "LARGA (6:00)"][game.menuLenIdx] },
    { label: "", value: "▶  JUGAR PARTIDO" },
  ];
  rows.forEach((r, i) => {
    const y = 156 + i * 58;
    const sel = game.menuRow === i;
    ctx.fillStyle = sel ? "rgba(255,225,77,.15)" : "rgba(8,12,24,.6)";
    roundRect(VIEW_W / 2 - 260, y - 22, 520, 46, 8); ctx.fill();
    if (sel) {
      ctx.strokeStyle = "#ffe14d"; ctx.lineWidth = 2;
      roundRect(VIEW_W / 2 - 260, y - 22, 520, 46, 8); ctx.stroke();
    }
    if (r.label) {
      ctx.fillStyle = "rgba(255,255,255,.6)";
      ctx.font = "11px 'Segoe UI', sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(r.label, VIEW_W / 2 - 244, y - 5);
      ctx.font = "bold 17px 'Segoe UI', sans-serif";
      ctx.fillStyle = sel ? "#ffe14d" : "#fff";
      ctx.fillText("◄  " + r.value + "  ►", VIEW_W / 2 - 244, y + 14);
    } else {
      ctx.font = "bold 20px 'Segoe UI', sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = sel ? "#ffe14d" : "#fff";
      ctx.fillText(r.value, VIEW_W / 2, y + 6);
    }
    ctx.textAlign = "center";
  });

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
