'use client'

import { createContext, useContext } from 'react'

// Tokeny Dílků platí jen uvnitř [data-app="ws"]. Dialogy, menu a tooltipy se proto nevykreslují
// do <body> (tam tokeny nejsou), ale do kořene Workspace, který tenhle kontext poskytuje (WsRoot).
const PortalContainerContext = createContext<HTMLElement | null>(null)

export const PortalContainerProvider = PortalContainerContext.Provider

/** Kontejner pro Radix `Portal container={…}`; mimo Workspace `undefined` = <body>. */
export function usePortalContainer(): HTMLElement | undefined {
  return useContext(PortalContainerContext) ?? undefined
}
