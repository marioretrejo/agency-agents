/**
 * OS-level input injection for remote control. Runs in the Electron main
 * process. Uses nut.js, loaded lazily so the app still runs in view-only mode
 * when the native module isn't installed/built on the host machine.
 *
 * On macOS the host must grant Accessibility + Screen Recording permission;
 * on Wayland input injection may be restricted by the compositor.
 *
 * The nut.js module is imported through a non-literal specifier so this file
 * type-checks and builds whether or not the native package is present; it's
 * declared as an optionalDependency in package.json.
 */

interface NutLike {
  mouse: {
    config: { autoDelayMs: number };
    setPosition(point: unknown): Promise<void>;
    pressButton(button: unknown): Promise<void>;
    releaseButton(button: unknown): Promise<void>;
    scrollUp(n: number): Promise<void>;
    scrollDown(n: number): Promise<void>;
    scrollLeft(n: number): Promise<void>;
    scrollRight(n: number): Promise<void>;
  };
  keyboard: {
    config: { autoDelayMs: number };
    pressKey(key: number): Promise<void>;
    releaseKey(key: number): Promise<void>;
    type(text: string): Promise<void>;
  };
  screen: { width(): Promise<number>; height(): Promise<number> };
  Point: new (x: number, y: number) => unknown;
  Button: Record<string, unknown>;
  Key: Record<string, number>;
}

let nut: NutLike | null = null;
let loadAttempted = false;

function log(message: string, ...rest: unknown[]): void {
  console.log(`[Host] ${message}`, ...rest);
}

async function getNut(): Promise<NutLike | null> {
  if (nut) return nut;
  if (loadAttempted) return null;
  loadAttempted = true;
  try {
    const specifier = '@nut-tree-fork/nut-js';
    const mod = (await import(specifier)) as unknown as NutLike;
    // Remote control needs immediate response; drop the built-in delays.
    mod.mouse.config.autoDelayMs = 0;
    mod.keyboard.config.autoDelayMs = 0;
    nut = mod;
    log('input control ready (nut.js loaded)');
  } catch (err) {
    log('input control unavailable — running in view-only mode', err);
    nut = null;
  }
  return nut;
}

export async function isControlAvailable(): Promise<boolean> {
  return (await getNut()) !== null;
}

/** Screen dimensions in the injection coordinate space, for mapping normalized coords. */
export async function getScreenSize(): Promise<{ width: number; height: number }> {
  const n = await getNut();
  if (!n) return { width: 1920, height: 1080 };
  try {
    return { width: await n.screen.width(), height: await n.screen.height() };
  } catch (err) {
    log('screen size query failed', err);
    return { width: 1920, height: 1080 };
  }
}

export async function moveMouse(nx: number, ny: number): Promise<void> {
  const n = await getNut();
  if (!n) return;
  const { width, height } = await getScreenSize();
  const x = Math.round(clamp01(nx) * width);
  const y = Math.round(clamp01(ny) * height);
  await n.mouse.setPosition(new n.Point(x, y));
}

const BUTTON_MAP: Record<string, 'LEFT' | 'MIDDLE' | 'RIGHT'> = {
  left: 'LEFT',
  middle: 'MIDDLE',
  right: 'RIGHT',
};

export async function mouseButton(
  button: string,
  down: boolean,
  nx?: number,
  ny?: number,
): Promise<void> {
  const n = await getNut();
  if (!n) return;
  if (typeof nx === 'number' && typeof ny === 'number') {
    await moveMouse(nx, ny);
  }
  const key = BUTTON_MAP[button] ?? 'LEFT';
  const btn = n.Button[key];
  if (down) {
    await n.mouse.pressButton(btn);
  } else {
    await n.mouse.releaseButton(btn);
  }
}

export async function scroll(dx: number, dy: number): Promise<void> {
  const n = await getNut();
  if (!n) return;
  // nut scroll amounts are in "ticks"; scale the pixel deltas down.
  const stepY = Math.round(Math.abs(dy) / 40) || (dy !== 0 ? 1 : 0);
  const stepX = Math.round(Math.abs(dx) / 40) || (dx !== 0 ? 1 : 0);
  if (stepY > 0) {
    if (dy > 0) await n.mouse.scrollDown(stepY);
    else await n.mouse.scrollUp(stepY);
  }
  if (stepX > 0) {
    if (dx > 0) await n.mouse.scrollRight(stepX);
    else await n.mouse.scrollLeft(stepX);
  }
}

export async function keyAction(
  code: string,
  down: boolean,
  modifiers?: { ctrl?: boolean; alt?: boolean; shift?: boolean; meta?: boolean },
): Promise<void> {
  const n = await getNut();
  if (!n) return;
  const key = mapCodeToKey(n, code);
  if (key === null) return;
  void modifiers; // modifiers arrive as their own key events (ControlLeft, etc.)
  if (down) {
    await n.keyboard.pressKey(key);
  } else {
    await n.keyboard.releaseKey(key);
  }
}

/** Type a string (used for pastes / IME composed text). */
export async function typeText(text: string): Promise<void> {
  const n = await getNut();
  if (!n || !text) return;
  await n.keyboard.type(text);
}

function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

/**
 * Map a browser KeyboardEvent.code to a nut.js Key. Returns null for
 * unmapped keys so they're silently ignored rather than crashing.
 */
function mapCodeToKey(n: NutLike, code: string): number | null {
  const K = n.Key;
  const map: Record<string, number> = {
    // Letters
    KeyA: K.A, KeyB: K.B, KeyC: K.C, KeyD: K.D, KeyE: K.E, KeyF: K.F,
    KeyG: K.G, KeyH: K.H, KeyI: K.I, KeyJ: K.J, KeyK: K.K, KeyL: K.L,
    KeyM: K.M, KeyN: K.N, KeyO: K.O, KeyP: K.P, KeyQ: K.Q, KeyR: K.R,
    KeyS: K.S, KeyT: K.T, KeyU: K.U, KeyV: K.V, KeyW: K.W, KeyX: K.X,
    KeyY: K.Y, KeyZ: K.Z,
    // Digits
    Digit0: K.Num0, Digit1: K.Num1, Digit2: K.Num2, Digit3: K.Num3,
    Digit4: K.Num4, Digit5: K.Num5, Digit6: K.Num6, Digit7: K.Num7,
    Digit8: K.Num8, Digit9: K.Num9,
    // Whitespace / editing
    Enter: K.Enter, NumpadEnter: K.Enter, Space: K.Space, Tab: K.Tab,
    Backspace: K.Backspace, Delete: K.Delete, Escape: K.Escape,
    Insert: K.Insert, Home: K.Home, End: K.End, PageUp: K.PageUp,
    PageDown: K.PageDown,
    // Arrows
    ArrowUp: K.Up, ArrowDown: K.Down, ArrowLeft: K.Left, ArrowRight: K.Right,
    // Modifiers
    ShiftLeft: K.LeftShift, ShiftRight: K.RightShift,
    ControlLeft: K.LeftControl, ControlRight: K.RightControl,
    AltLeft: K.LeftAlt, AltRight: K.RightAlt,
    MetaLeft: K.LeftSuper, MetaRight: K.RightSuper,
    CapsLock: K.CapsLock,
    // Punctuation
    Minus: K.Minus, Equal: K.Equal, BracketLeft: K.LeftBracket,
    BracketRight: K.RightBracket, Backslash: K.Backslash,
    Semicolon: K.Semicolon, Quote: K.Quote, Backquote: K.Grave,
    Comma: K.Comma, Period: K.Period, Slash: K.Slash,
    // Function keys
    F1: K.F1, F2: K.F2, F3: K.F3, F4: K.F4, F5: K.F5, F6: K.F6,
    F7: K.F7, F8: K.F8, F9: K.F9, F10: K.F10, F11: K.F11, F12: K.F12,
    // Numpad
    Numpad0: K.NumPad0, Numpad1: K.NumPad1, Numpad2: K.NumPad2,
    Numpad3: K.NumPad3, Numpad4: K.NumPad4, Numpad5: K.NumPad5,
    Numpad6: K.NumPad6, Numpad7: K.NumPad7, Numpad8: K.NumPad8,
    Numpad9: K.NumPad9, NumpadAdd: K.Add, NumpadSubtract: K.Subtract,
    NumpadMultiply: K.Multiply, NumpadDivide: K.Divide,
    NumpadDecimal: K.Decimal,
  };
  return code in map ? map[code] : null;
}
