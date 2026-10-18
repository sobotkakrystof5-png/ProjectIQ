import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { findGuideForScreen, GUIDES, searchGuides, visibleGuideTopics, visibleGuides } from '../guides'

const workspaceRoutes = join(process.cwd(), 'app/w/[business]')

describe('Návody RD14', () => {
  it('každý odkaz v návodu vede na existující obrazovku Workspace', () => {
    for (const guide of GUIDES) {
      for (const step of guide.steps) {
        if (step.href === undefined) continue
        const route = step.href ? join(workspaceRoutes, step.href) : workspaceRoutes
        expect(existsSync(route), `${guide.id}: ${step.href}`).toBe(true)
      }
    }
  })

  it('skryje návody a témata pro vypnuté funkce', () => {
    const enabled = new Set(['calendar', 'requests', 'invoices'])
    const guides = visibleGuides(enabled)
    expect(guides.some((guide) => guide.id === 'rezervace-v-kalendari')).toBe(true)
    expect(guides.some((guide) => guide.id === 'potvrdit-poptavku')).toBe(true)
    expect(guides.some((guide) => guide.id === 'sledovat-zakazku')).toBe(false)
    expect(guides.some((guide) => guide.id === 'nastavit-dane')).toBe(false)
    expect(visibleGuideTopics(enabled).some((topic) => topic.id === 'dane')).toBe(false)
  })

  it('najde návod podle názvu bez ohledu na diakritiku a přiřadí ho k obrazovce', () => {
    const result = searchGuides('vernost', GUIDES)
    expect(result.map((guide) => guide.id)).toContain('vernostni-karta')
    expect(findGuideForScreen('zakaznici', new Set(['customers']))?.id).toBe('kontakt-zakaznika')
  })
})
