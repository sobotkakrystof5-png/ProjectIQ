'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { MotionConfig } from 'framer-motion'
import { PortalContainerProvider } from '@/components/ui/portal'
import { setToastTheme } from '@/components/ui/toast'
import { SYSTEM_THEME_SCRIPT, themeCookie, type Theme, type ThemePref } from '@/lib/ws/theme'
import { cn } from '@/lib/ws/utils'

type ThemeValue = { theme: Theme; pref: ThemePref; setPref: (p: ThemePref) => void }

const ThemeContext = createContext<ThemeValue>({ theme: 'light', pref: 'light', setPref: () => {} })

/** Světlý / tmavý režim Workspace; `pref` je volba z Účtu (S18), `theme` výsledný vzhled. */
export function useWsTheme() {
  return useContext(ThemeContext)
}

const DARK_QUERY = '(prefers-color-scheme: dark)'

/**
 * Kořen všeho, co vypadá podle Dílků (Workspace, landing page, portál a objednávací
 * stránka): `data-app="ws"` zapne tokeny z app/ws-tokens.css, třídy písem nadefinují
 * Instrument Sans/Serif a JetBrains Mono a dialogy se vykreslují dovnitř (R-027).
 * `themePref` posílá jen layout /w (cookie); bez něj je stránka vždy světlá.
 */
export function WsRoot({
  fontClassName,
  className,
  themePref = 'light',
  nonce,
  children,
}: {
  fontClassName: string
  className?: string
  themePref?: ThemePref
  nonce?: string
  children: React.ReactNode
}) {
  const [pref, setPrefState] = useState<ThemePref>(themePref)
  const [systemDark, setSystemDark] = useState<boolean | null>(null)
  const [container, setContainer] = useState<HTMLDivElement | null>(null)

  useEffect(() => {
    if (pref !== 'system') return
    const mq = window.matchMedia(DARK_QUERY)
    const sync = () => setSystemDark(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [pref])

  const theme: Theme = pref === 'system' ? (systemDark ? 'dark' : 'light') : pref
  const setPref = useCallback((p: ThemePref) => {
    document.cookie = themeCookie(p)
    setPrefState(p)
  }, [])
  const value = useMemo(() => ({ theme, pref, setPref }), [theme, pref, setPref])

  useEffect(() => {
    setToastTheme(theme)
  }, [theme])

  // U „Podle systému“ drží data-theme do prvního efektu inline skript níž
  // (spustí se dřív, než prohlížeč vykreslí obsah), React ho nepřepisuje.
  const waitingForSystem = pref === 'system' && systemDark === null
  return (
    <ThemeContext.Provider value={value}>
      <MotionConfig reducedMotion="user">
        <div
          ref={setContainer}
          data-app="ws"
          {...(waitingForSystem ? {} : { 'data-theme': theme })}
          suppressHydrationWarning
          className={cn(fontClassName, 'min-h-screen antialiased', className)}
        >
          {themePref === 'system' && (
            <script nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: SYSTEM_THEME_SCRIPT }} />
          )}
          <PortalContainerProvider value={container}>{children}</PortalContainerProvider>
        </div>
      </MotionConfig>
    </ThemeContext.Provider>
  )
}
