import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  const checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function insideRoundedRect(x, y, left, top, right, bottom, radius) {
  const cx = Math.max(left + radius, Math.min(x, right - radius));
  const cy = Math.max(top + radius, Math.min(y, bottom - radius));
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
}

function renderIcon(size) {
  const stride = size * 4 + 1;
  const pixels = Buffer.alloc(stride * size);
  const scale = size / 192;

  const rectangles = [
    [55, 48, 77, 112],
    [38, 125, 77, 144],
    [55, 106, 77, 132],
    [98, 48, 152, 67],
    [130, 48, 152, 104],
    [98, 85, 152, 104],
    [98, 85, 120, 144],
    [98, 125, 153, 144],
  ];

  for (let y = 0; y < size; y += 1) {
    pixels[y * stride] = 0;
    for (let x = 0; x < size; x += 1) {
      const offset = y * stride + 1 + x * 4;
      const px = x / scale;
      const py = y / scale;
      const inCard = insideRoundedRect(px, py, 16, 16, 176, 176, 16);
      const inLetter = rectangles.some(
        ([left, top, right, bottom]) =>
          px >= left && px <= right && py >= top && py <= bottom,
      );

      const color = inLetter
        ? [9, 15, 29, 255]
        : inCard
          ? [94, 234, 212, 255]
          : [9, 15, 29, 255];
      pixels.set(color, offset);
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const outputs = [
  ["ios/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png", 1024],
  ["ios/Assets.xcassets/LaunchIcon.imageset/LaunchIcon.png", 192],
  ["ios/Assets.xcassets/LaunchIcon.imageset/LaunchIcon@2x.png", 384],
  ["ios/Assets.xcassets/LaunchIcon.imageset/LaunchIcon@3x.png", 576],
];

for (const [relativePath, size] of outputs) {
  const output = resolve(root, relativePath);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, renderIcon(size));
  console.log(`Generated ${relativePath}`);
}
