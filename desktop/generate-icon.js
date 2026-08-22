// Генерирует build/icon.ico (PNG-в-ICO, 256x256) — простая «небульная» иконка.
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const S = 256;
const px = Buffer.alloc(S * S * 4);

function lerp(a, b, t) { return a + (b - a) * t; }

for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    const dx = (x / S) - 0.5;
    const dy = (y / S) - 0.5;
    const d = Math.sqrt(dx * dx + dy * dy) * 2; // 0 центр .. ~1.41 край
    const inside = d < 0.92;
    if (inside) {
      const t = Math.min(1, d / 0.92);
      // градиент сине-фиолетовый
      const r = Math.round(lerp(90, 40, t));
      const g = Math.round(lerp(180, 90, t));
      const b = Math.round(lerp(255, 200, t));
      px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255;
      // блик
      const bx = (x / S) - 0.38, by = (y / S) - 0.36;
      const bd = Math.sqrt(bx * bx + by * by) * 2;
      if (bd < 0.18) { const a = (1 - bd / 0.18) * 90; px[i] = Math.min(255, r + a); px[i + 1] = Math.min(255, g + a); px[i + 2] = Math.min(255, b + a); }
    } else {
      px[i] = 14; px[i + 1] = 17; px[i + 2] = 22; px[i + 3] = 0; // прозрачно
    }
  }
}

// PNG
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])) >>> 0, 0);
  return Buffer.concat([len, t, data, crc]);
}
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
  }
  return ~c;
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

const raw = Buffer.alloc((S * 4 + 1) * S);
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0; // filter none
  px.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, y * S * 4 + S * 4);
}
const idat = zlib.deflateSync(raw);

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
  chunk('IHDR', ihdr),
  chunk('IDAT', idat),
  chunk('IEND', Buffer.alloc(0))
]);

// ICO (PNG-embedded)
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
const dir = Buffer.alloc(16);
dir[0] = S === 256 ? 0 : S; dir[1] = S === 256 ? 0 : S; dir[2] = 0; dir[3] = 0;
dir.writeUInt16LE(1, 4); dir.writeUInt16LE(32, 6);
dir.writeUInt32LE(png.length, 8); dir.writeUInt32LE(22, 12);
const ico = Buffer.concat([header, dir, png]);

const out = path.join(__dirname, 'build', 'icon.ico');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, ico);
console.log('wrote', out, ico.length, 'bytes');
