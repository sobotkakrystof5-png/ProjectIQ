#!/usr/bin/env node
// Kolik JavaScriptu stáhne prohlížeč na jedné trase (AD00 — výchozí měření).
//
//   npm run build && node scripts/bundle-stats.mjs
//   node scripts/bundle-stats.mjs --vystup route-bundle-stats.json
//   node scripts/bundle-stats.mjs --server http://localhost:3000 --cookie "<session>"
//
// Bez --server čte manifesty v .next: společné soubory každé stránky
// (polyfill + rootMainFiles) a to, co k nim trasa přidává. Turbopack v Next 16
// ale per-route klientské chunky v manifestech neuvádí — proto je tu --server:
// stáhne HTML běžící aplikace (npm run start) a sečte skripty, které v něm
// opravdu jsou. To je číslo, které stáhne prohlížeč.
//
// Velikosti se berou ze souborů na disku a gzip se počítá tady, takže jsou
// porovnatelné před a po, nezávisle na rychlosti sítě.
//
// Výsledek se ukládá do route-bundle-stats.json (není ve gitu) a čísla pro
// porovnání se opisují do docs/admin/MODERNIZACE-ADMIN-PLAN.md → sekce 11.

import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const NEXT = path.join(ROOT, '.next')

const args = process.argv.slice(2)
const arg = (name) => {
  const i = args.indexOf(name)
  return i === -1 ? null : args[i + 1]
}
const outFile = path.join(ROOT, arg('--vystup') ?? 'route-bundle-stats.json')
const server = arg('--server')
const cookie = arg('--cookie')

/** Trasy, které se měří proti běžícímu serveru. */
const MEASURED_PATHS = [
  '/login',
  '/',
  '/dashboard',
  '/dashboard/zakazky',
  '/dashboard/calls',
  '/dashboard/calendar',
  '/dashboard/faktury',
  '/dashboard/naklady',
  '/hub',
  '/hub/finance',
  '/dashboard/poptavky',
]

function readJson(file) {
  if (!fs.existsSync(file)) {
    console.error(`Chybí ${path.relative(ROOT, file)} — nejdřív spusťte npm run build.`)
    process.exit(1)
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

const sizes = new Map()
function sizeOf(relative) {
  if (sizes.has(relative)) return sizes.get(relative)
  const file = path.join(NEXT, relative)
  let value = { bytes: 0, gzip: 0 }
  if (fs.existsSync(file)) {
    const buffer = fs.readFileSync(file)
    value = { bytes: buffer.length, gzip: zlib.gzipSync(buffer).length }
  }
  sizes.set(relative, value)
  return value
}

// Next 16 (Turbopack) nemá jeden app-build-manifest.json — každá trasa má svůj
// v .next/server/app/<trasa>/page/build-manifest.json. První načtení trasy =
// polyfillFiles + rootMainFiles + otherChunks té trasy, bez duplikátů.
function routeManifests(dir, found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) routeManifests(full, found)
    else if (entry.name === 'build-manifest.json') found.push(full)
  }
  return found
}

const APP_DIR = path.join(NEXT, 'server', 'app')
if (!fs.existsSync(APP_DIR)) {
  console.error('Chybí .next/server/app — nejdřív spusťte npm run build.')
  process.exit(1)
}

function total(files) {
  let bytes = 0
  let gzip = 0
  for (const file of new Set(files)) {
    const size = sizeOf(file)
    bytes += size.bytes
    gzip += size.gzip
  }
  return { bytes, gzip }
}

const rootManifest = readJson(path.join(NEXT, 'build-manifest.json'))
const shared = [...(rootManifest.polyfillFiles ?? []), ...(rootManifest.rootMainFiles ?? [])].filter((f) => f.endsWith('.js'))
const sharedTotal = total(shared)

const routes = routeManifests(APP_DIR)
  .map((file) => {
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'))
    const params = manifest.pagesChunkGroupBootstrapParams ?? {}
    const key = Object.keys(params)[0]
    if (!key) return null
    const route = key.replace(/\/(page|route|default)$/, '') || '/'
    const chunks = [
      ...(manifest.polyfillFiles ?? []),
      ...(manifest.rootMainFiles ?? []),
      ...(params[key].otherChunks ?? []),
    ].filter((f) => f.endsWith('.js'))
    const own = total(chunks.filter((f) => !shared.includes(f)))
    const firstLoad = total(chunks)
    return {
      route,
      files: new Set(chunks).size,
      ownBytes: own.bytes,
      ownGzip: own.gzip,
      firstLoadBytes: firstLoad.bytes,
      firstLoadGzip: firstLoad.gzip,
    }
  })
  .filter(Boolean)
  .sort((a, b) => b.firstLoadGzip - a.firstLoadGzip)

/** Skripty, které jsou opravdu v HTML dané trasy. */
async function measureFromServer(base) {
  const rows = []
  for (const route of MEASURED_PATHS) {
    const res = await fetch(new URL(route, base), {
      redirect: 'manual',
      headers: cookie ? { cookie } : {},
    })
    const html = res.status >= 200 && res.status < 300 ? await res.text() : ''
    const files = [...html.matchAll(/\/_next\/(static\/[^"']+?\.js)/g)].map((m) => m[1])
    const sum = total(files)
    rows.push({
      route,
      status: res.status,
      files: new Set(files).size,
      firstLoadBytes: sum.bytes,
      firstLoadGzip: sum.gzip,
    })
  }
  return rows
}

const measured = server ? await measureFromServer(server) : null

const out = {
  generatedAt: new Date().toISOString(),
  note: 'Velikosti ze souborů na disku, gzip spočítaný tady (ne měření v prohlížeči).',
  manifestNote:
    'manifestRoutes jsou jen společné soubory: Turbopack v Next 16 per-route klientské chunky ' +
    'v manifestech neuvádí. Skutečná čísla jsou v measured (potřebuje --server).',
  shared: { files: shared.length, bytes: sharedTotal.bytes, gzip: sharedTotal.gzip },
  manifestRoutes: routes,
  ...(measured ? { measured: { server, routes: measured } } : {}),
}
fs.writeFileSync(outFile, JSON.stringify(out, null, 2) + '\n')

const kb = (n) => `${(n / 1024).toFixed(1)} kB`
console.log(`Společné pro každou stránku: ${kb(sharedTotal.gzip)} gzip (${shared.length} souborů)`)
console.log(`Tras v buildu: ${routes.length}. Per-route rozpad Turbopack v manifestech nedává — použijte --server.`)
if (measured) {
  console.log('\nZ HTML běžícího serveru (co opravdu stáhne prohlížeč):')
  console.log('Trasa'.padEnd(46) + 'stav'.padStart(6) + 'JS (gzip)'.padStart(14))
  for (const r of measured) {
    console.log(r.route.padEnd(46) + String(r.status).padStart(6) + (r.status < 300 ? kb(r.firstLoadGzip) : '—').padStart(14))
  }
}

console.log(`\nVšech tras: ${routes.length}. Celý výpis: ${path.relative(ROOT, outFile)}`)
