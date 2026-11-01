#!/usr/bin/env node
// Odešle hlášení o dokončené práci do ZakazIQ jako koncept ke schválení (KP04).
// Bez závislostí. Nic nestahuje, nic nespouští, nikam nezapisuje; klíč nikdy
// nevypisuje. Určeno ke zkopírování do repozitáře klienta (scripts/).
//
// Proměnné prostředí: ZAKAZIQ_URL, ZAKAZIQ_PROJECT_ID, ZAKAZIQ_AGENT_KEY
// Použití:
//   node scripts/zakaziq-report.mjs --kind hotovo --title "Nový kontakt" --body "Popis pro klienta"
//   echo "Popis pro klienta" | node scripts/zakaziq-report.mjs --title "Nový kontakt"

const KINDS = ['hotovo', 'rozpracováno', 'otázka']
const TIMEOUT_MS = 15_000

function fail(message) {
  console.error(`Hlášení se neodeslalo: ${message}`)
  process.exit(1)
}

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith('--')) fail(`neznámý argument „${arg}“.`)
    const name = arg.slice(2)
    if (!['kind', 'title', 'body'].includes(name)) fail(`neznámý přepínač --${name}.`)
    const value = argv[++i]
    if (value === undefined) fail(`chybí hodnota u --${name}.`)
    out[name] = value
  }
  return out
}

async function readStdin() {
  if (process.stdin.isTTY) return ''
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

const args = parseArgs(process.argv.slice(2))
const baseUrl = (process.env.ZAKAZIQ_URL ?? '').replace(/\/+$/, '')
const projectId = process.env.ZAKAZIQ_PROJECT_ID ?? ''
const key = process.env.ZAKAZIQ_AGENT_KEY ?? ''

if (!baseUrl || !projectId || !key) fail('chybí ZAKAZIQ_URL, ZAKAZIQ_PROJECT_ID nebo ZAKAZIQ_AGENT_KEY.')
if (!/^https:\/\//.test(baseUrl) && !/^http:\/\/localhost(:\d+)?$/.test(baseUrl)) fail('ZAKAZIQ_URL musí začínat https://.')
if (!/^[0-9a-f-]{36}$/i.test(projectId)) fail('ZAKAZIQ_PROJECT_ID nemá správný tvar.')

const kind = args.kind ?? 'hotovo'
if (!KINDS.includes(kind)) fail(`--kind musí být ${KINDS.join(', ')}.`)
const title = (args.title ?? '').trim()
const body = (args.body ?? (await readStdin())).trim()
if (!title) fail('chybí --title.')
if (!body) fail('chybí text hlášení (--body nebo standardní vstup).')

try {
  const res = await fetch(`${baseUrl}/api/agent/v1/projects/${projectId}/reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ kind, title, body }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (res.status === 201) {
    console.log('Hlášení odesláno ke schválení.')
  } else if (res.status === 401) {
    fail('klíč neplatí pro tenhle projekt. Zkontrolujte ZAKAZIQ_AGENT_KEY a ZAKAZIQ_PROJECT_ID.')
  } else if (res.status === 429) {
    fail('příliš mnoho hlášení v krátkém čase. Zkuste to později.')
  } else if (res.status === 400 || res.status === 413) {
    fail('hlášení je prázdné nebo příliš dlouhé (nadpis do 160, text do 4000 znaků).')
  } else {
    fail(`server vrátil chybu ${res.status}.`)
  }
} catch (err) {
  fail(err instanceof Error && err.name === 'TimeoutError' ? 'server neodpověděl včas.' : 'nepodařilo se spojit se serverem.')
}
