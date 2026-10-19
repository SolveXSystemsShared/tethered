// Palette-quantise the generated icons to keep the download small.
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';
for (const n of ['icon-192', 'icon-512', 'maskable-512']) {
  const p = new URL(`../icons/${n}.png`, import.meta.url);
  const out = await sharp(readFileSync(p)).png({ palette: true, colors: 96, compressionLevel: 9, effort: 10, dither: 0.6 }).toBuffer();
  writeFileSync(p, out);
  console.log(n, out.length);
}
