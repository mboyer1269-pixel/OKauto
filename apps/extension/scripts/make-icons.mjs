// Generates simple PNG icons (no external assets): rounded-square "OK" mark.
// Hand-rolled PNG encoder (zlib + CRC32) so the repo carries no binary blobs.
import { deflateSync } from "node:zlib";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (const byte of buf) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(width, height, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function drawIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const radius = size * 0.22;
  const bg = [15, 118, 110]; // teal-700
  const fg = [240, 253, 250];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const idx = (y * size + x) * 4;
      const inX = x >= radius && x < size - radius ? true : y >= radius && y < size - radius;
      const corner =
        (x < radius && y < radius && Math.hypot(radius - x, radius - y) > radius) ||
        (x >= size - radius && y < radius && Math.hypot(x - (size - radius - 1), radius - y) > radius) ||
        (x < radius && y >= size - radius && Math.hypot(radius - x, y - (size - radius - 1)) > radius) ||
        (x >= size - radius && y >= size - radius && Math.hypot(x - (size - radius - 1), y - (size - radius - 1)) > radius);
      const inside = !corner && (inX || (x >= 0 && x < size));
      const [r, g, b, a] = inside ? [...bg, 255] : [0, 0, 0, 0];
      rgba[idx] = r;
      rgba[idx + 1] = g;
      rgba[idx + 2] = b;
      rgba[idx + 3] = a;
    }
  }
  // Simple road-stripe glyph.
  const stripeW = Math.max(2, Math.floor(size * 0.08));
  const cx = Math.floor(size / 2);
  for (let y = Math.floor(size * 0.2); y < size * 0.8; y += 1) {
    for (let x = cx - stripeW; x < cx + stripeW; x += 1) {
      const idx = (y * size + x) * 4;
      rgba[idx] = fg[0];
      rgba[idx + 1] = fg[1];
      rgba[idx + 2] = fg[2];
      rgba[idx + 3] = 255;
    }
  }
  return rgba;
}

await mkdir(root, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  await writeFile(join(root, `icon-${size}.png`), png(size, size, drawIcon(size)));
}
console.info(`icons written to ${root}`);
