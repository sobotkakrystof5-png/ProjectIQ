import fs from 'fs'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { AI_MODEL_DEFAULTS, AI_MODEL_ENV, aiModel, isAiConfigured } from '@/lib/ai/models'

const ROOT = path.resolve(__dirname, '../..')

/** Jediný soubor, kde se smí název modelu objevit. Testy se do seznamu nedávají (viz `walk`). */
const ALLOWED = new Set(['lib/ai/models.ts'])

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`
    if (entry.isDirectory()) {
      // Testy smějí konkrétní model pojmenovat — právě o to v nich jde.
      if (entry.name === 'node_modules' || entry.name === '__tests__' || entry.name.startsWith('.')) continue
      walk(rel, out)
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(rel)
    }
  }
  return out
}

describe('názvy modelů mají jediné místo (AD14)', () => {
  it('nikde v kódu není napsaný model natvrdo', () => {
    const files = ['app', 'lib', 'components', 'scripts'].flatMap((dir) => walk(dir))
    const offenders = files.filter((file) => {
      if (ALLOWED.has(file)) return false
      return /['"`]claude-(opus|sonnet|haiku)[\w.-]*['"`]/.test(fs.readFileSync(path.join(ROOT, file), 'utf8'))
    })
    expect(offenders).toEqual([])
  })

  it('přepis faktury jede na levném modelu, ne na opusu', () => {
    expect(AI_MODEL_DEFAULTS.vision).toBe('claude-haiku-5-5')
    expect(AI_MODEL_DEFAULTS.fast).toBe('claude-haiku-5-5')
    expect(AI_MODEL_DEFAULTS.smart).toBe('claude-sonnet-5-5')
  })
})

describe('výběr modelu', () => {
  const saved = { ...process.env }
  afterEach(() => {
    for (const name of Object.values(AI_MODEL_ENV)) {
      if (saved[name] === undefined) delete process.env[name]
      else process.env[name] = saved[name]
    }
    if (saved.ANTHROPIC_API_KEY === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = saved.ANTHROPIC_API_KEY
    if (saved.ANTHROPIC_AUTH_TOKEN === undefined) delete process.env.ANTHROPIC_AUTH_TOKEN
    else process.env.ANTHROPIC_AUTH_TOKEN = saved.ANTHROPIC_AUTH_TOKEN
  })

  it('bez proměnné platí výchozí hodnota z kódu', () => {
    delete process.env[AI_MODEL_ENV.fast]
    expect(aiModel('fast')).toBe(AI_MODEL_DEFAULTS.fast)
  })

  it('proměnná prostředí model přebije', () => {
    process.env[AI_MODEL_ENV.smart] = 'claude-neco-noveho'
    expect(aiModel('smart')).toBe('claude-neco-noveho')
  })

  it('prázdná proměnná se chová jako nenastavená', () => {
    process.env[AI_MODEL_ENV.vision] = '   '
    expect(aiModel('vision')).toBe(AI_MODEL_DEFAULTS.vision)
  })

  it('bez klíče hlásí, že AI není nakonfigurovaná', () => {
    delete process.env.ANTHROPIC_API_KEY
    delete process.env.ANTHROPIC_AUTH_TOKEN
    expect(isAiConfigured()).toBe(false)
    process.env.ANTHROPIC_AUTH_TOKEN = 'token'
    expect(isAiConfigured()).toBe(true)
  })
})
