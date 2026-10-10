// Jeden zdroj projektových skillů a bezpečnostní paměti pro Claude Code a Codex.
import { cp, readdir, readFile, lstat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const mode = process.argv[2] ?? '--check'
if (!['--check', '--write'].includes(mode) || process.argv.length > 3) {
  console.error('Použití: node scripts/sync-agent-context.mjs [--check | --write]')
  process.exit(2)
}

async function files(directory, relative = '') {
  const result = []
  for (const entry of await readdir(path.join(directory, relative), { withFileTypes: true })) {
    const name = path.join(relative, entry.name)
    if (entry.isDirectory()) result.push(...await files(directory, name))
    else if (entry.isFile()) result.push(name)
    else throw new Error(`Kontext smí obsahovat jen běžné soubory a složky: ${name}`)
  }
  return result.sort()
}

try {
  for (const area of ['skills', 'security']) {
    const source = path.join(root, '.claude', area)
    const target = path.join(root, '.agents', area)
    const sourceFiles = await files(source)
    // Odmítnout symlinky v cíli před zápisem, aby kopie zůstala uvnitř projektu.
    for (const directory of [path.dirname(target), target]) {
      try {
        const stat = await lstat(directory)
        if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Neplatný cíl: ${directory}`)
      } catch (error) {
        if (error.code !== 'ENOENT') throw error
      }
    }
    try { await files(target) } catch (error) { if (error.code !== 'ENOENT') throw error }
    if (mode === '--write') await cp(source, target, { recursive: true, preserveTimestamps: true })
    const targetFiles = await files(target)
    if (JSON.stringify(sourceFiles) !== JSON.stringify(targetFiles)) {
      throw new Error(`Seznam souborů v .agents/${area} se liší; synchronizujte kopii (nadbytečné soubory se automaticky nemažou).`)
    }
    for (const name of sourceFiles) {
      const a = path.join(source, name)
      const b = path.join(target, name)
      if (!(await readFile(a)).equals(await readFile(b)) || ((await lstat(a)).mode & 0o111) !== ((await lstat(b)).mode & 0o111)) {
        throw new Error(`Neshoda obsahu nebo spustitelnosti: .agents/${area}/${name}`)
      }
    }
    console.log(`.agents/${area}: ${sourceFiles.length} souborů shodných se zdrojem.`)
  }
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
