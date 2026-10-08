'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { MotionConfig } from 'framer-motion'
import { PortalContainerProvider } from '@/components/ui/portal'
import { setToastTheme } from '@/components/ui/toast'
import { cn } from '@/lib/ws/utils'

type Theme = 'light' | 'dark'

const ThemeContext = createContext<{ theme: Theme; setTheme: (t: Theme) => void }>({
  theme: 'light',
  setTheme: () => {},
})

/** Světlý / tmavý režim Workspace. Ukládání volby a systémové nastavení přijdou v S18. */
export function useWsTheme() {
  return useContext(ThemeContext)
}

/**
 * Kořen všeho, co vypadá podle Dílků (Workspace, landing page, později portál a objednávací
 * stránka): `data-app="ws"` zapne tokeny z app/ws-tokens.css, třídy písem nadefinují
 * Instrument Sans/Serif a JetBrains Mono a dialogy se vykreslují dovnitř (R-027).
 */
export function WsRoot({
  fontClassName,
  className,
  children,
}: {
  fontClassName: string
  className?: string
  children: React.ReactNode
}) {
  const [theme, setTheme] = useState<Theme>('light')
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const value = useMemo(() => ({ theme, setTheme }), [theme])

  useEffect(() => {
    setToastTheme(theme)
  }, [theme])

  return (
    <ThemeContext.Provider value={value}>
      <MotionConfig reducedMotion="user">
        <div
          ref={setContainer}
          data-app="ws"
          data-theme={theme}
          className={cn(fontClassName, 'min-h-screen antialiased', className)}
        >
          <PortalContainerProvider value={container}>{children}</PortalContainerProvider>
        </div>
      </MotionConfig>
    </ThemeContext.Provider>
  )
}
