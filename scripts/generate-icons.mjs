// scripts/generate-icons.mjs
//
// Draws the app icon and writes it out as real PNG files.
//
// WHY THIS EXISTS: a PWA needs actual raster icons (192px and 512px at minimum) before a
// phone will offer to install it. We didn't want to add an image library just to draw a
// circle, and we didn't want to commit a binary blob nobody on the team could regenerate.
// So this script builds the PNGs from scratch using only Node's built-in zlib — the icon is
// defined in code, and running `npm run icons` reproduces every file exactly.
//
// The mark itself is the reaction pad: a ring with a filled centre, i.e. a target you tap.
//
// A PNG is simpler than it sounds: an 8-byte signature, then a series of chunks. We write
// three — IHDR (dimensions and colour format), IDAT (the zlib-compressed pixels), and IEND.
// Every chunk carries a CRC32 checksum, which is the only fiddly part.

import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';

/* ── CRC32, as the PNG spec defines it ────────────────────────────────────────────── */
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = -1;
  for (let i = 0; i < buffer.length; i++) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, crc]);
}

/** Build a PNG from a function that returns [r,g,b,a] for each pixel. */
function encodePng(size, pixelAt) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); // width
  ihdr.writeUInt32BE(size, 4); // height
  ihdr[8] = 8; // 8 bits per channel
  ihdr[9] = 6; // colour type 6 = RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlacing

  // Each scanline is prefixed with a filter byte. 0 means "no filter" — larger files than
  // a smart filter would give, but the icons are tiny and this keeps the code obvious.
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let offset = 0;
  for (let y = 0; y < size; y++) {
    raw[offset++] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixelAt(x, y);
      raw[offset++] = r;
      raw[offset++] = g;
      raw[offset++] = b;
      raw[offset++] = a;
    }
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ── The mark ─────────────────────────────────────────────────────────────────────── */

const INK = [11, 15, 18]; // --color-ink
const WHITE = [255, 255, 255];
const SIGNAL = [11, 95, 255]; // --color-signal

/** Blend `over` onto `under` by `alpha` (0-1). */
function blend(under, over, alpha) {
  return [
    Math.round(under[0] + (over[0] - under[0]) * alpha),
    Math.round(under[1] + (over[1] - under[1]) * alpha),
    Math.round(under[2] + (over[2] - under[2]) * alpha),
  ];
}

/**
 * Coverage of a shape edge at `distance` from its boundary, smoothed across roughly one
 * pixel. This is what stops the circles looking jagged at 192px.
 */
function coverage(distance, feather) {
  if (distance <= -feather) return 1;
  if (distance >= feather) return 0;
  return 0.5 - distance / (2 * feather);
}

/**
 * @param size    pixel dimensions
 * @param inset   how much of the canvas the mark occupies (smaller = more padding). Maskable
 *                icons get a smaller mark, because the launcher may crop up to 20% off each
 *                edge to fit whatever shape the device uses.
 */
function drawIcon(size, inset) {
  const centre = size / 2;
  const feather = size * 0.004;

  const ringOuter = size * inset * 0.42;
  const ringInner = size * inset * 0.32;
  const dotRadius = size * inset * 0.18;

  return (x, y) => {
    const dx = x + 0.5 - centre;
    const dy = y + 0.5 - centre;
    const distance = Math.sqrt(dx * dx + dy * dy);

    let colour = INK;

    // The ring: inside the outer edge AND outside the inner edge.
    const ring = Math.min(coverage(distance - ringOuter, feather), 1 - coverage(distance - ringInner, feather));
    if (ring > 0) colour = blend(colour, WHITE, ring);

    // The centre dot.
    const dot = coverage(distance - dotRadius, feather);
    if (dot > 0) colour = blend(colour, SIGNAL, dot);

    return [colour[0], colour[1], colour[2], 255];
  };
}

/* ── Write the files ──────────────────────────────────────────────────────────────── */

const root = path.resolve(import.meta.dirname, '..');

const targets = [
  { file: 'public/icons/icon-192.png', size: 192, inset: 1 },
  { file: 'public/icons/icon-512.png', size: 512, inset: 1 },
  // Maskable: the mark is pulled in so a circular or squircle crop never clips it.
  { file: 'public/icons/maskable-512.png', size: 512, inset: 0.7 },
  // Next.js picks these up automatically as the favicon and the iOS home-screen icon.
  { file: 'app/icon.png', size: 256, inset: 1 },
  { file: 'app/apple-icon.png', size: 180, inset: 0.82 },
];

for (const target of targets) {
  const absolute = path.join(root, target.file);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, encodePng(target.size, drawIcon(target.size, target.inset)));
  console.log(`wrote ${target.file} (${target.size}x${target.size})`);
}
