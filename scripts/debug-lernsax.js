/**
 * LernSax debug scraper — zkouší fsg.lernsax.de + různé username formáty
 * Spusť: node scripts/debug-lernsax.js
 */

const puppeteer = require('puppeteer-core')
const fs = require('fs')
const path = require('path')

try {
  const envFile = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf8')
  for (const line of envFile.split('\n')) {
    const [k, ...v] = line.split('=')
    if (k && v.length && !process.env[k.trim()]) process.env[k.trim()] = v.join('=').trim()
  }
} catch {}

const userFull = process.env.LERNSAX_USER?.trim()   // sobotka.krystof23@fsg.lernsax.de
const pass     = process.env.LERNSAX_PASS?.trim()   // Krystof5585
if (!userFull || !pass) { console.error('Nastav LERNSAX_USER a LERNSAX_PASS'); process.exit(1) }

// Zkus různé varianty username
const userVariants = [
  userFull,                                // sobotka.krystof23@fsg.lernsax.de
  userFull.split('@')[0],                  // sobotka.krystof23
]
const baseVariants = [
  'https://fsg.lernsax.de',
  'https://www.lernsax.de',
]

const OUT_DIR = path.join(__dirname, '../.debug-lernsax')
fs.mkdirSync(OUT_DIR, { recursive: true })

function save(name, html) {
  fs.writeFileSync(`${OUT_DIR}/${name}.html`, html)
  console.log(`  Saved ${name}.html (${html.length} chars)`)
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function getMainFrame(page, waitMs = 5000) {
  const deadline = Date.now() + waitMs
  while (Date.now() < deadline) {
    const f = page.frames().find(f => f !== page.mainFrame() && f.name() === 'main_frame')
    if (f) return f
    await sleep(200)
  }
  return page.frames().find(f => f.name() === 'main_frame') ?? page.mainFrame()
}

async function tryLogin(page, base, user) {
  console.log(`\n  === Zkouším: base=${base} user="${user}" ===`)

  // Načti homepage
  await page.goto(`${base}/wws/9.php`, { waitUntil: 'networkidle2' })
  await sleep(1500)

  let mf = await getMainFrame(page)
  const homeHtml = await mf.content()
  const m = homeHtml.match(/href="(100001\.php\?sid=[^"]+)"/)
  if (!m) {
    console.log('  Login URL nenalezena na homepage')
    return false
  }
  const loginUrl = `${base}/wws/${m[1]}`

  // Naviguj na login page
  await page.goto(loginUrl, { waitUntil: 'networkidle2' })
  await sleep(2000)

  mf = await getMainFrame(page)
  const hasForm = (await mf.content()).includes('login_login')
  if (!hasForm) {
    console.log('  Login formulář nenalezen')
    return false
  }
  console.log('  ✓ Formulář nalezen')

  // Vyplň typ() — skutečné klávesnicové znaky
  await mf.click('input[name="login_login"]')
  await sleep(200)
  // Vymaž pole (Ctrl+A + Delete)
  await mf.evaluate(() => { document.querySelector('input[name="login_login"]').value = '' })
  await mf.type('input[name="login_login"]', user, { delay: 40 })

  await mf.click('input[name="login_password"]')
  await sleep(200)
  await mf.type('input[name="login_password"]', pass, { delay: 40 })
  await sleep(400)

  // Screenshot vyplněného formuláře
  await page.screenshot({ path: `${OUT_DIR}/form-filled.png` })

  // Submit
  const submitBtn = await mf.$('input[name="login_submit"]')
  const frameUrlBefore = mf.url()
  await submitBtn.click()
  console.log('  Submit kliknuto...')
  await sleep(6000)

  // Zkontroluj
  mf = await getMainFrame(page)
  const afterHtml = await mf.content()
  const bodyClass = afterHtml.match(/<body[^>]*class="([^"]+)"/)?.[1] ?? ''
  const title = afterHtml.match(/<title>(.*?)<\/title>/)?.[1] ?? ''
  console.log(`  After login title: "${title}"`)
  console.log(`  Body class (50): ${bodyClass.substring(0, 80)}`)

  const isLoggedIn = bodyClass.includes('logged_in') && !bodyClass.includes('logged_out')
  if (isLoggedIn) {
    console.log('  ✓✓✓ PŘIHLÁŠEN! ✓✓✓')
    console.log(`  Frame URL: ${mf.url().substring(0, 90)}`)
    return { mf, base, frameUrl: mf.url() }
  }

  // Hledej chybové hlášení
  const errText = await mf.evaluate(() => {
    const sel = '.noti_error, .noti_box, [class*="error"], .login_error, .message_error'
    return Array.from(document.querySelectorAll(sel))
      .map(e => e.textContent?.trim())
      .filter(Boolean)
      .join(' | ')
  })
  console.log(`  Výsledek: ${errText ? 'Chyba: ' + errText.substring(0, 100) : 'přesměrováno zpět na login'}`)
  return false
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH ??
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: false,
    slowMo: 20,
    protocolTimeout: 60_000,
    args: ['--no-sandbox', '--ignore-certificate-errors', '--ignore-ssl-errors'],
    defaultViewport: { width: 1440, height: 900 },
  })

  const page = await browser.newPage()
  page.setDefaultNavigationTimeout(30_000)

  // Log all POST requests to debug what's being sent
  page.on('request', req => {
    if (req.method() === 'POST') {
      console.log(`  POST ${req.url().substring(0, 80)}`)
      const body = req.postData() ?? ''
      if (body) console.log(`  Body: ${body.substring(0, 200)}`)
    }
  })
  page.on('response', res => {
    if (res.request().method() === 'POST') {
      console.log(`  POST Response: ${res.status()} ${res.url().substring(0, 60)}`)
    }
  })
  await page.setRequestInterception(false)

  let success = null

  // Zkus všechny kombinace base × user
  outer: for (const base of baseVariants) {
    for (const user of userVariants) {
      const result = await tryLogin(page, base, user)
      if (result) { success = result; break outer }
    }
  }

  if (!success) {
    console.error('\n⚠️  Žádná kombinace nefungovala.')
    console.error('Zkontroluj screenshoty v .debug-lernsax/')
    console.error('nebo otevři fsg.lernsax.de v prohlížeči a zkontroluj heslo')
    await browser.close()
    return
  }

  console.log(`\n✓ Přihlášen!`)

  const { frameUrl: loggedFrameUrl } = success

  // Extrahuj session ID z frame URL (URL-based sessions v LernSax)
  const sidMatch = loggedFrameUrl.match(/[?&]sid=([^&]+)/)
  const sessionId = sidMatch?.[1]
  const WWW = 'https://www.lernsax.de'
  console.log(`  Session: ${sessionId?.substring(0, 20)}...`)

  // Naviguje IFRAME (ne outer stránku) — zachová session
  async function gotoModule(modulePhp) {
    const url = `${WWW}/wws/${modulePhp}${modulePhp.includes('?') ? '&' : '?'}sid=${sessionId}`
    console.log(`  → iframe navigate: ${url.substring(0, 90)}`)
    await page.evaluate((u) => {
      const iframe = document.querySelector('iframe[name="main_frame"]')
      if (iframe?.contentWindow) iframe.contentWindow.location.href = u
    }, url)
    await sleep(3000)
    return await getMainFrame(page)
  }

  // ── Zobraz logged-in homepage a najdi správné moduly ────────────────────
  console.log('\n→ Logged-in homepage...')
  let mf = await gotoModule('101505.php')
  const homeLoggedHtml = await mf.content()
  save('04-home-logged-in', homeLoggedHtml)
  await page.screenshot({ path: `${OUT_DIR}/04-home-logged-in.png` })

  const homeBodyClass = homeLoggedHtml.match(/<body[^>]*class="([^"]+)"/)?.[1] ?? ''
  console.log(`  Body class: ${homeBodyClass.substring(0, 100)}`)
  const loggedInOk = homeBodyClass.includes('logged_in') && !homeBodyClass.includes('logged_out')
  console.log(`  Logged in: ${loggedInOk}`)

  // Najdi moduly ze sidebar/navigation
  const navLinks = await mf.evaluate(() => {
    const links = []
    document.querySelectorAll('a[href]').forEach(a => {
      const text = a.textContent?.trim()
      const href = a.getAttribute('href')
      if (text && href && href.includes('.php') && text.length > 1 && text.length < 50) {
        links.push({ text, href: href.substring(0, 300) })
      }
    })
    return links
  })
  console.log('  Navigační linky (první 30):')
  navLinks.slice(0, 30).forEach(l => console.log(`    "${l.text}": ${l.href.substring(0, 60)}`))

  // Filtruj relevantní linky
  const relevantLinks = navLinks.filter(l =>
    /nach|aufgab|stunden|kalend|mail|message|task|timetable|hausauf|termin|e-mail|kommunik/i.test(l.text)
  )
  console.log('\n  Relevantní moduly:')
  relevantLinks.forEach(l => console.log(`    "${l.text}": ${l.href}`))

  // ── Scrape sekcí — naviguj iframe ────────────────────────────────────────
  for (const [secName, sectionKey] of [
    ['05-messages', /nach|mail|kommunik|e-mail/i],
    ['06-tasks',    /aufgab|task|hausauf/i],
    ['07-timetable', /stunden|timetable|kalender/i],
  ]) {
    const link = relevantLinks.find(l => sectionKey.test(l.text))
    if (!link) {
      console.log(`\n  ✗ Sekce ${secName} nenalezena v navigaci (zkouším přímé URL)`)
      // Zkus přímé URL bez navigace
      continue
    }
    // Klikni na link UVNITŘ main_frame — LernSax JS zpracuje navigaci správně
    const phpFile = link.href.split('?')[0]
    console.log(`\n→ ${secName}: "${link.text}" (${phpFile})`)
    try {
      // Klikni na první link vedoucí na daný php soubor
      const clicked = await mf.evaluate((php) => {
        const a = document.querySelector(`a[href*="${php}"]`)
        if (a) { a.click(); return true }
        return false
      }, phpFile)
      console.log(`  Click: ${clicked}`)
    } catch (e) {
      console.log(`  Click error: ${e.message.substring(0, 60)}`)
    }
    await sleep(4000)
    mf = await getMainFrame(page)
    await page.screenshot({ path: `${OUT_DIR}/${secName}.png` })

    const html = await mf.content()
    save(secName, html)
    const bclass = html.match(/<body[^>]*class="([^"]+)"/)?.[1] ?? ''
    console.log(`  Frame: ${mf.url().substring(0, 80)}`)
    console.log(`  Body: ${bclass.substring(0, 80)}`)

    const elems = await mf.evaluate(() => {
      const r = []
      document.querySelectorAll('table').forEach(t =>
        r.push(`TABLE id="${t.id}" class="${t.className.substring(0, 60)}"`)
      )
      document.querySelectorAll('[class]').forEach(el => {
        const c = el.className.toString()
        if (/message|task|timetable|list|row|item|entry|noti/i.test(c))
          r.push(`${el.tagName} class="${c.substring(0, 80)}"`)
      })
      return [...new Set(r)].slice(0, 20)
    })
    if (elems.length) console.log('  Elementy:\n   ' + elems.join('\n   '))
  }

  await browser.close()
  console.log(`\n✓ Hotovo! Soubory v: ${OUT_DIR}`)
}

main().catch(e => { console.error('Chyba:', e.message); process.exit(1) })
