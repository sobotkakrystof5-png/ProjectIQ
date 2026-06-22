/**
 * Beste Schule scraper — přihlásí se přes Puppeteer a scrapuje známky a rozvrh.
 * Env: BESTESCHULE_USER, BESTESCHULE_PASS, BESTESCHULE_URL (výchozí https://besteschule.de)
 */

export type BsGrade = {
  subject: string
  grade: number
  gradeLabel: string
  weight: number
  teacher: string | null
  date: Date | null
}

export type BsTimetableSlot = {
  dayOfWeek: number
  lessonNum: number
  subject: string
  teacher: string | null
  room: string | null
  timeStart: string | null
  timeEnd: string | null
}

export type BsDeadline = {
  title: string
  subject: string | null
  dueDate: Date
  type: 'test' | 'homework' | 'presentation'
}

export type BesteSchuleData = {
  grades: BsGrade[]
  timetable: BsTimetableSlot[]
  deadlines: BsDeadline[]
}

async function getBrowser() {
  if (process.env.NODE_ENV === 'production') {
    const chromium = (await import('@sparticuz/chromium')).default
    const puppeteer = (await import('puppeteer-core')).default
    return puppeteer.launch({
      args: chromium.args,
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
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })
  }
}

function gradeToLabel(grade: number): string {
  if (grade <= 1.5) return 'Sehr gut'
  if (grade <= 2.5) return 'Gut'
  if (grade <= 3.5) return 'Befriedigend'
  if (grade <= 4.5) return 'Ausreichend'
  if (grade <= 5.5) return 'Mangelhaft'
  return 'Ungenügend'
}

function guessDeadlineType(title: string): 'test' | 'homework' | 'presentation' {
  const t = title.toLowerCase()
  if (t.includes('referat') || t.includes('präsentation') || t.includes('vortrag')) return 'presentation'
  if (t.includes('arbeit') || t.includes('test') || t.includes('klausur') || t.includes('prüfung')) return 'test'
  return 'homework'
}

export async function scrapeBesteSchule(): Promise<BesteSchuleData> {
  const user = process.env.BESTESCHULE_USER
  const pass = process.env.BESTESCHULE_PASS
  if (!user || !pass) throw new Error('BESTESCHULE_USER nebo BESTESCHULE_PASS není nastaveno')

  const baseUrl = (process.env.BESTESCHULE_URL ?? 'https://besteschule.de').replace(/\/$/, '')

  const browser = await getBrowser()
  const page = await browser.newPage()
  await page.setDefaultNavigationTimeout(30_000)

  try {
    // ── Přihlášení ───────────────────────────────────────────────────────────
    await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle2' })

    // Zkus různé selektory pro login formulář
    const userSelector = 'input[name="username"], input[name="email"], input[type="email"], #username, #email'
    const passSelector = 'input[name="password"], input[type="password"], #password'

    await page.waitForSelector(userSelector, { timeout: 10_000 })
    await page.type(userSelector, user, { delay: 20 })
    await page.type(passSelector, pass, { delay: 20 })
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
      page.click('button[type="submit"], input[type="submit"]'),
    ])

    // Ověř přihlášení
    const loggedIn = await page.$('.dashboard, .user-menu, nav.logged-in, #main-content')
    if (!loggedIn) throw new Error('Beste Schule: přihlášení selhalo — zkontroluj BESTESCHULE_USER / BESTESCHULE_PASS')

    // ── Žákovský deník / Notenbuch ───────────────────────────────────────────
    const grades: BsGrade[] = []
    try {
      const gradeUrls = [
        `${baseUrl}/noten`, `${baseUrl}/notenbook`, `${baseUrl}/grades`,
        `${baseUrl}/zeugnis`, `${baseUrl}/notenbuch`,
      ]
      for (const url of gradeUrls) {
        await page.goto(url, { waitUntil: 'networkidle2' })
        const found = await page.$('table.grades, .notenbook, table.noten, .grade-list')
        if (found) break
      }

      const rawGrades = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll(
          'table.grades tbody tr, .notenbook tr, table.noten tbody tr, .grade-item'
        ))
        return rows.map(row => {
          const cells = Array.from(row.querySelectorAll('td, .cell'))
          return {
            subject: cells[0]?.textContent?.trim() ?? '',
            grade: cells[1]?.textContent?.trim() ?? '',
            teacher: cells[2]?.textContent?.trim() ?? null,
            date: cells[3]?.textContent?.trim() ?? null,
          }
        }).filter(r => r.subject && r.grade)
      })

      for (const r of rawGrades) {
        const gradeNum = parseFloat(r.grade.replace(',', '.'))
        if (isNaN(gradeNum)) continue
        const date = r.date ? new Date(r.date) : null
        grades.push({
          subject: r.subject,
          grade: gradeNum,
          gradeLabel: gradeToLabel(gradeNum),
          weight: 1,
          teacher: r.teacher || null,
          date: date && !isNaN(date.getTime()) ? date : null,
        })
      }
    } catch {
      // známky nejsou kritické — pokračuj
    }

    // ── Rozvrh ──────────────────────────────────────────────────────────────
    const timetable: BsTimetableSlot[] = []
    try {
      const ttUrls = [`${baseUrl}/stundenplan`, `${baseUrl}/timetable`, `${baseUrl}/schedule`]
      for (const url of ttUrls) {
        await page.goto(url, { waitUntil: 'networkidle2' })
        const found = await page.$('table.timetable, table.stundenplan, .schedule-grid')
        if (found) break
      }

      const rawSlots = await page.evaluate(() => {
        const table = document.querySelector('table.timetable, table.stundenplan, .schedule-grid table')
        if (!table) return []
        const rows = Array.from(table.querySelectorAll('tbody tr')).slice(0)
        const slots: Array<{ day: number; lesson: number; subject: string; teacher: string; room: string; timeStart: string; timeEnd: string }> = []

        rows.forEach((row, rowIdx) => {
          const cells = Array.from(row.querySelectorAll('td'))
          // Přeskočit první sloupec = číslo hodiny / čas
          const timeCellText = cells[0]?.textContent?.trim() ?? ''
          const [timeStart, timeEnd] = timeCellText.includes('-')
            ? timeCellText.split('-').map(s => s.trim())
            : ['', '']

          cells.slice(1).forEach((cell, colIdx) => {
            const text = cell.textContent?.trim() ?? ''
            if (!text || text === '—' || text === '-') return
            const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
            slots.push({
              day: colIdx + 1,
              lesson: rowIdx + 1,
              subject: lines[0] ?? text,
              teacher: lines[1] ?? '',
              room: lines[2] ?? '',
              timeStart,
              timeEnd,
            })
          })
        })
        return slots
      })

      for (const s of rawSlots) {
        if (s.day < 1 || s.day > 5) continue
        timetable.push({
          dayOfWeek: s.day,
          lessonNum: s.lesson,
          subject: s.subject,
          teacher: s.teacher || null,
          room: s.room || null,
          timeStart: s.timeStart || null,
          timeEnd: s.timeEnd || null,
        })
      }
    } catch {
      // rozvrh není kritický — pokračuj
    }

    // ── Domácí úkoly ────────────────────────────────────────────────────────
    const deadlines: BsDeadline[] = []
    try {
      const hwUrls = [`${baseUrl}/hausaufgaben`, `${baseUrl}/homework`, `${baseUrl}/aufgaben`]
      for (const url of hwUrls) {
        await page.goto(url, { waitUntil: 'networkidle2' })
        const found = await page.$('table.homework, .homework-list, .aufgaben-list')
        if (found) break
      }

      const rawHw = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll(
          'table.homework tbody tr, .homework-item, .aufgaben-item'
        ))
        return rows.map(row => {
          const cells = Array.from(row.querySelectorAll('td, .cell'))
          return {
            title: cells[0]?.textContent?.trim() ?? row.textContent?.trim() ?? '',
            subject: cells[1]?.textContent?.trim() ?? null,
            dueDate: cells[2]?.textContent?.trim() ?? null,
          }
        }).filter(r => r.title)
      })

      for (const h of rawHw) {
        const d = h.dueDate ? new Date(h.dueDate) : null
        if (!d || isNaN(d.getTime())) continue
        deadlines.push({
          title: h.title,
          subject: h.subject,
          dueDate: d,
          type: guessDeadlineType(h.title),
        })
      }
    } catch {
      // domácí úkoly nejsou kritické — pokračuj
    }

    return { grades, timetable, deadlines }
  } finally {
    await browser.close()
  }
}
