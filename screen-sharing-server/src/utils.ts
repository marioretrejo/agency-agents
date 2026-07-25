/** Characters chosen to avoid ambiguous glyphs (0/O, 1/I/L). */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateRoomCode(length = 6): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export function isValidCode(raw: string): boolean {
  return /^[A-Z0-9]{6}$/.test(normalizeCode(raw));
}

export function log(scope: 'Server' | 'Room' | 'Signal', message: string, ...rest: unknown[]): void {
  console.log(`[${scope}] ${new Date().toISOString()} ${message}`, ...rest);
}
