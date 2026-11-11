'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { LazyMotion, MotionConfig } from 'framer-motion'
import { PortalContainerProvider } from '@/components/ui/portal'
import { setToastApp, setToastTheme } from '@/components/ui/toast'
import { SYSTEM_THEME_SCRIPT, themeCookie, type Theme, type ThemePref } from '@/lib/ws/theme'
import { setPrivacyModeAction } from '@/app/w/privacy-actions'
import type { Result } from '@/lib/ws/result'
import { cn } from '@/lib/ws/utils'

type ThemeValue = { theme: Theme; pref: ThemePref; setPref: (p: ThemePref) => void }
type PrivacyValue = { enabled: boolean; setEnabled: (enabled: boolean) => Promise<Result<null>> }

const ThemeContext = createContext<ThemeValue>({ theme: 'light', pref: 'light', setPref: () => {} })
const PrivacyContext = createContext<PrivacyValue>({ enabled: false, setEnabled: async () => ({ ok: false, error: 'Nastavení soukromí není dostupné.' }) })

/** Světlý / tmavý režim Workspace; `pref` je volba z Účtu (S18), `theme` výsledný vzhled. */
export function useWsTheme() {
  return useContext(ThemeContext)
}

export function useWsPrivacy() {
  return useContext(PrivacyContext)
}

const DARK_QUERY = '(prefers-color-scheme: dark)'

// Animace se doplní, až je prohlížeč stáhne; do té doby se prvky ukážou bez pohybu.
const loadMotionFeatures = () => import('@/lib/ws/motion-features').then((mod) => mod.default)

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
  privacyMode = false,
  nonce,
  children,
}: {
  fontClassName: string
  className?: string
  themePref?: ThemePref
  privacyMode?: boolean
  nonce?: string
  children: React.ReactNode
}) {
  const [pref, setPrefState] = useState<ThemePref>(themePref)
  const [privateMode, setPrivateMode] = useState(privacyMode)
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
  const setEnabled = useCallback(async (enabled: boolean) => {
    const previous = privateMode
    setPrivateMode(enabled)
    const result = await setPrivacyModeAction({ enabled })
    if (!result.ok) setPrivateMode(previous)
    return result
  }, [privateMode])
  const value = useMemo(() => ({ theme, pref, setPref }), [theme, pref, setPref])
  const privacy = useMemo(() => ({ enabled: privateMode, setEnabled }), [privateMode, setEnabled])

  useEffect(() => {
    setToastApp('ws')
  }, [])

  useEffect(() => {
    setToastTheme(theme)
  }, [theme])

  // U „Podle systému“ drží data-theme do prvního efektu inline skript níž
  // (spustí se dřív, než prohlížeč vykreslí obsah), React ho nepřepisuje.
  const waitingForSystem = pref === 'system' && systemDark === null
  return (
    <ThemeContext.Provider value={value}>
      <PrivacyContext.Provider value={privacy}>
      <LazyMotion features={loadMotionFeatures}>
        <MotionConfig reducedMotion="user">
          <div
            ref={setContainer}
            data-app="ws"
            data-ws-private={privateMode ? 'on' : 'off'}
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
      </LazyMotion>
      </PrivacyContext.Provider>
    </ThemeContext.Provider>
  )
}
