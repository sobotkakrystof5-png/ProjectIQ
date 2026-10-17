// Ikony PWA Workspace z geometrie loga (components/ws/brand/logo.tsx, S18).
// Pustí se ručně po změně loga: node scripts/ws-pwa-icons.mjs
// Výstup: public/ikony/*.png. sharp je v projektu jako závislost Nextu.
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const OUT = path.join(process.cwd(), 'public', 'ikony')
const NAVY_600 = '#2b57a8'
const NAVY_800 = '#1b3868'

/** `bleed` = plný čtverec bez zaoblení (maskable, Apple); dílky pak v bezpečné zóně. */
function svg(size, { bleed = false } = {}) {
  const scale = bleed ? 0.8 : 1
  const unit = (size * scale) / 32
  const tile = 9 * unit
  const gap = 4 * unit
  const grid = tile * 2 + gap
  const start = (size - grid) / 2
  const r = bleed ? 0 : size * 0.28
  const tr = Math.max(1.5, tile * 0.28)
  const tiles = [0, 1, 2, 3]
    .map((i) => {
      const x = start + (i % 2) * (tile + gap)
      const y = start + Math.floor(i / 2) * (tile + gap)
      return `<rect x="${x}" y="${y}" width="${tile}" height="${tile}" rx="${tr}" fill="#fff"/>`
    })
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${NAVY_600}"/><stop offset="1" stop-color="${NAVY_800}"/></linearGradient></defs>
<rect width="${size}" height="${size}" rx="${r}" fill="url(#g)"/>${tiles}</svg>`
}

const targets = [
  ['ikona-192.png', 192, {}],
  ['ikona-512.png', 512, {}],
  ['ikona-maskable-512.png', 512, { bleed: true }],
  ['apple-touch-icon.png', 180, { bleed: true }],
]

fs.mkdirSync(OUT, { recursive: true })
for (const [name, size, opts] of targets) {
  await sharp(Buffer.from(svg(size, opts))).png({ compressionLevel: 9 }).toFile(path.join(OUT, name))
  console.log('hotovo', name)
}
fs.writeFileSync(path.join(OUT, 'ikona.svg'), svg(64))
