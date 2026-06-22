/**
 * LernSax scraper — přihlásí se přes Puppeteer a scrapuje zprávy, úkoly a rozvrh.
 *
 * Env: LERNSAX_USER (email tvaru user@skola.lernsax.de), LERNSAX_PASS
 *
 * LernSax architecture:
 * - Login: fsg.lernsax.de (school subdomain), POST → www.lernsax.de
 * - Session: URL-based SID parameter (not cookies)
 * - Modules: accessed via numeric PHP IDs (240761=messages, 105500=tasks, 131589=timetable)
 * - Navigation: must click links IN main_frame iframe (JS intercepts location.href changes)
 */

export type LernSaxMessage = {
  sender: string
  subject: string
  body: string
  read: boolean
  receivedAt: Date
}

export type LernSaxDeadline = {
  title: string
  subject: string | null
  dueDate: Date
  type: 'test' | 'homework' | 'presentation'
}

export type LernSaxTimetableSlot = {
  dayOfWeek: number   // 1 = Pondělí … 5 = Pátek
  lessonNum: number
  subject: string
  teacher: string | null
  room: string | null
  timeStart: string | null  // HH:MM
  timeEnd: string | null
}

export type LernSaxData = {
  messages: LernSaxMessage[]
  deadlines: LernSaxDeadline[]
  timetable: LernSaxTimetableSlot[]
}

async function getBrowser() {
  if (process.env.NODE_ENV === 'production') {
    const chromium = (await import('@sparticuz/chromium')).default
    const puppeteer = (await import('puppeteer-core')).default
    return puppeteer.launch({
      args: [...chromium.args, '--ignore-certificate-errors'],
      defaultViewport: { width: 1280, height: 800 },
      executablePath: await chromium.executablePath(),
      headless: true,
    })
  } else {
    const puppeteer = (await import('puppeteer-core')).default
    const executablePath =
      process.env.CHROME_PATH ??
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    return puppeteer.launch({
      executablePath,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors'],
    })
  }
}

function guessDeadlineType(title: string): 'test' | 'homework' | 'presentation' {
  const t = title.toLowerCase()
  if (t.includes('referat') || t.includes('präsentation') || t.includes('vortrag')) return 'presentation'
  if (t.includes('arbeit') || t.includes('test') || t.includes('klausur') || t.includes('prüfung')) return 'test'
  return 'homework'
}

/** Parsuje německý datum formát "DD.MM.YYYY HH:MM" → Date */
function parseGermanDate(str: string): Date | null {
  if (!str) return null
  const m = str.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/)
  if (!m) return null
  const [, d, mo, y, h = '0', min = '0'] = m
  const date = new Date(+y, +mo - 1, +d, +h, +min)
  return isNaN(date.getTime()) ? null : date
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

type Page = Awaited<ReturnType<Awaited<ReturnType<typeof getBrowser>>['newPage']>>

async function getMainFrame(page: Page, timeout = 8000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const f = page.frames().find(fr => fr !== page.mainFrame() && fr.name() === 'main_frame')
    if (f) return f
    await sleep(200)
  }
  return page.frames().find(f => f.name() === 'main_frame') ?? page.mainFrame()
}

/** Klikne na link uvnitř main_frame a počká 3s */
async function clickModuleLink(page: Page, mf: Awaited<ReturnType<typeof getMainFrame>>, phpModule: string) {
  await mf.evaluate((php) => {
    const a = document.querySelector(`a[href*="${php}"]`) as HTMLAnchorElement | null
    if (a) a.click()
  }, phpModule)
  await sleep(3500)
  return getMainFrame(page)
}

export async function scrapeLernSax(): Promise<LernSaxData> {
  const userEmail = process.env.LERNSAX_USER?.trim()
  const pass = process.env.LERNSAX_PASS?.trim()
  if (!userEmail || !pass) throw new Error('LERNSAX_USER nebo LERNSAX_PASS není nastaveno')

  // Detekuj školní subdoménu z emailu (user@skola.lernsax.de → skola.lernsax.de)
  const emailDomain = userEmail.includes('@') ? userEmail.split('@')[1] : 'www.lernsax.de'
  const loginBase = `https://${emailDomain}`

  const browser = await getBrowser()
  const page = await browser.newPage()
  await page.setDefaultNavigationTimeout(30_000)

  try {
    // ── Krok 1: načti homepage a získej session + login URL ─────────────────
    await page.goto(`${loginBase}/wws/9.php`, { waitUntil: 'networkidle2' })
    await sleep(1500)

    let mf = await getMainFrame(page)
    const homeHtml = await mf.content()
    const loginLinkM = homeHtml.match(/href="(100001\.php\?sid=[^"]+)"/)
    if (!loginLinkM) throw new Error('LernSax: login URL nenalezena — možná jiný BASE URL')
    const loginUrl = `https://www.lernsax.de/wws/${loginLinkM[1]}`

    // ── Krok 2: naviguj hlavní stránku na login URL ──────────────────────────
    await page.goto(loginUrl, { waitUntil: 'networkidle2' })
    await sleep(1500)

    mf = await getMainFrame(page)
    const loginHtml = await mf.content()
    if (!loginHtml.includes('login_login')) {
      throw new Error('LernSax: login formulář nenalezen')
    }

    // ── Krok 3: vyplň login formulář a odešli ───────────────────────────────
    await mf.click('input[name="login_login"]')
    await sleep(100)
    await mf.type('input[name="login_login"]', userEmail, { delay: 40 })
    await mf.click('input[name="login_password"]')
    await sleep(100)
    await mf.type('input[name="login_password"]', pass, { delay: 40 })
    await sleep(300)

    const submitBtn = await mf.$('input[name="login_submit"]')
    if (!submitBtn) throw new Error('LernSax: submit button nenalezen')
    await submitBtn.click()
    await sleep(6000)

    // ── Krok 4: ověř přihlášení ──────────────────────────────────────────────
    mf = await getMainFrame(page)
    const afterLoginHtml = await mf.content()
    const bodyClass = afterLoginHtml.match(/<body[^>]*class="([^"]+)"/)?.[1] ?? ''
    if (bodyClass.includes('logged_out')) {
      throw new Error('LernSax: přihlášení selhalo — zkontroluj LERNSAX_USER / LERNSAX_PASS')
    }

    // ── Krok 5: naviguj na home page (101505) pro sidebar navigaci ───────────
    // Extrahuj session SID z aktuální frame URL
    const loginFrameUrl = mf.url()
    const sidM = loginFrameUrl.match(/[?&]sid=([^&]+)/)
    const sessionId = sidM?.[1]
    if (!sessionId) throw new Error('LernSax: session ID nenalezen po přihlášení')

    // Naviguj iframe na home
    await page.evaluate((sid) => {
      const iframe = document.querySelector('iframe[name="main_frame"]') as HTMLIFrameElement | null
      if (iframe?.contentWindow) iframe.contentWindow.location.href =
        `https://www.lernsax.de/wws/101505.php?sid=${sid}`
    }, sessionId)
    await sleep(3000)
    mf = await getMainFrame(page)

    // ── Krok 6: zprávy (Systemnachrichten 240761) ────────────────────────────
    const messages: LernSaxMessage[] = []
    try {
      mf = await clickModuleLink(page, mf, '240761.php')
      const html = await mf.content()

      const rows = Array.from(html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g))
      for (const [, rowHtml] of rows) {
        const getCell = (cls: string) => {
          const m = rowHtml.match(new RegExp(`<td[^>]*class="[^"]*${cls}[^"]*"[^>]*>([\\s\\S]*?)<\\/td>`))
          return m ? m[1].replace(/<[^>]+>/g, '').trim() : ''
        }
        const sender  = getCell('c_from')
        const subject = getCell('c_message')
        const dateStr = getCell('c_date')
        if (!sender || !subject) continue
        const receivedAt = parseGermanDate(dateStr) ?? new Date()
        messages.push({ sender, subject, body: '', read: true, receivedAt })
      }
    } catch {
      // zprávy nejsou kritické
    }

    // ── Krok 7: úkoly (Aufgaben 105500) ─────────────────────────────────────
    const deadlines: LernSaxDeadline[] = []
    try {
      mf = await clickModuleLink(page, mf, '105500.php')
      const html = await mf.content()

      // LernSax úkoly: tabulka s c_task_name, c_subject, c_due_date nebo podobné
      const rows = Array.from(html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g))
      for (const [, rowHtml] of rows) {
        const getCell = (cls: string) => {
          const m = rowHtml.match(new RegExp(`<td[^>]*class="[^"]*${cls}[^"]*"[^>]*>([\\s\\S]*?)<\\/td>`))
          return m ? m[1].replace(/<[^>]+>/g, '').trim() : ''
        }
        const title   = getCell('c_title') || getCell('c_name') || getCell('c_text')
        const subject = getCell('c_subject') || getCell('c_course') || null
        const dateStr = getCell('c_date') || getCell('c_due') || getCell('c_deadline')
        if (!title) continue
        const dueDate = parseGermanDate(dateStr)
        if (!dueDate) continue
        deadlines.push({ title, subject, dueDate, type: guessDeadlineType(title) })
      }
    } catch {
      // úkoly nejsou kritické
    }

    // ── Krok 8: rozvrh (Stundenplan 131589) ──────────────────────────────────
    const timetable: LernSaxTimetableSlot[] = []
    try {
      mf = await clickModuleLink(page, mf, '131589.php')
      const html = await mf.content()

      // Stundenplan tabulka: řádky = hodiny, sloupce = dny
      const tableM = html.match(/<table[^>]*>([\s\S]*?)<\/table>/)
      if (tableM) {
        const tableHtml = tableM[1]
        const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g
        let rowMatch: RegExpExecArray | null
        let rowIdx = 0
        while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
          const rowHtml = rowMatch[1]
          const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/g
          let cellMatch: RegExpExecArray | null
          let colIdx = 0
          while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
            const text = cellMatch[1].replace(/<[^>]+>/g, '').trim()
            if (text && text !== '-' && colIdx >= 1 && colIdx <= 5) {
              timetable.push({
                dayOfWeek: colIdx,
                lessonNum: rowIdx + 1,
                subject: text.split('\n')[0]?.trim() ?? text,
                teacher: null,
                room: null,
                timeStart: null,
                timeEnd: null,
              })
            }
            colIdx++
          }
          rowIdx++
        }
      }
    } catch {
      // rozvrh není kritický
    }

    return { messages, deadlines, timetable }
  } finally {
    await browser.close()
  }
}
