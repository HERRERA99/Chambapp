// Draws the Chambapp mark (public/brand/chambapp.svg, left square) as PNG icons.
// No dependencies: shapes are rasterised with 4x4 supersampling and encoded with zlib.
// Usage: node extension/scripts/make-icons.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
const bg = [0x18, 0x18, 0x1b];
const border = [0x27, 0x27, 0x2a];
const accent = [0xff, 0x2e, 0x56];
const white = [0xff, 0xff, 0xff];

// Coordinates in the 32x32 viewBox of the mark (SVG rect at 2,4 moved to 0,0).
function sample(x, y) {
  const inside = roundedRect(x, y, 0.75, 0.75, 30.5, 30.5, 8);
  if (!inside) return null;
  let color = roundedRect(x, y, 1.5, 1.5, 29, 29, 7.2) ? bg : border;
  const cx = 16;
  const cy = 16;
  const r = Math.hypot(x - cx, y - cy);
  // Dashed ring: 45 units drawn, 15 gap on a circumference of ~62.8, starting at 3 o'clock.
  const angle = (Math.atan2(y - cy, x - cx) + 2 * Math.PI) % (2 * Math.PI);
  if (Math.abs(r - 10) <= 1.25 && angle * 10 <= 45) color = accent;
  if (r <= 4) color = accent;
  if (segment(x, y, 16, 9, 16, 16, 1) || segment(x, y, 16, 16, 20, 18, 1)) color = white;
  return color;
}

function roundedRect(x, y, left, top, width, height, radius) {
  const dx = Math.max(left + radius - x, 0, x - (left + width - radius));
  const dy = Math.max(top + radius - y, 0, y - (top + height - radius));
  return (
    x >= left &&
    x <= left + width &&
    y >= top &&
    y <= top + height &&
    dx * dx + dy * dy <= radius * radius
  );
}

function segment(x, y, x1, y1, x2, y2, halfWidth) {
  const vx = x2 - x1;
  const vy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((x - x1) * vx + (y - y1) * vy) / (vx * vx + vy * vy)));
  return Math.hypot(x - (x1 + t * vx), y - (y1 + t * vy)) <= halfWidth;
}

function render(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const steps = 4;
  for (let py = 0; py < size; py += 1)
    for (let px = 0; px < size; px += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < steps; sy += 1)
        for (let sx = 0; sx < steps; sx += 1) {
          const color = sample(
            ((px + (sx + 0.5) / steps) / size) * 32,
            ((py + (sy + 0.5) / steps) / size) * 32,
          );
          if (!color) continue;
          r += color[0];
          g += color[1];
          b += color[2];
          a += 1;
        }
      const i = (py * size + px) * 4;
      if (a) {
        pixels[i] = Math.round(r / a);
        pixels[i + 1] = Math.round(g / a);
        pixels[i + 2] = Math.round(b / a);
      }
      pixels[i + 3] = Math.round((a / (steps * steps)) * 255);
    }
  return png(size, pixels);
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}
function png(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const rows = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1)
    pixels.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(out, { recursive: true });
for (const size of [16, 32, 48, 128]) writeFileSync(join(out, `icon-${size}.png`), render(size));
console.log(`Iconos escritos en ${out}`);
