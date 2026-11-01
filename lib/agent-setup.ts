// Návod pro projekt klienta (KP04): blok do jeho CLAUDE.md a proměnné prostředí.
// Čisté funkce bez klíče — klíč se v textu nikdy neobjeví, jen název proměnné.

export interface AgentSetupInput {
  projectId: string
  /** Adresa aplikace ZakazIQ bez lomítka na konci (např. https://www.zakaziq.cz). */
  baseUrl: string
}

/** Proměnné, které si Kryštof nastaví v projektu klienta (hodnotu klíče doplní sám). */
export function buildAgentEnvBlock({ projectId, baseUrl }: AgentSetupInput): string {
  return [
    `ZAKAZIQ_URL=${baseUrl.replace(/\/+$/, '')}`,
    `ZAKAZIQ_PROJECT_ID=${projectId}`,
    'ZAKAZIQ_AGENT_KEY=   # klíč z adminu ZakazIQ, ukazuje se jen jednou',
  ].join('\n')
}

/** Pravidlo do CLAUDE.md projektu klienta. */
export function buildClaudeMdBlock(): string {
  return [
    '## Hlášení klientovi (ZakazIQ)',
    '',
    'Na konci dokončené práce pošli klientovi krátké hlášení ke schválení:',
    '',
    '    node scripts/zakaziq-report.mjs --kind hotovo --title "Co se změnilo" --body "Srozumitelný popis pro klienta"',
    '',
    '- Hlásit po dokončené změně, ne po každém příkazu. Druh: `hotovo`, `rozpracováno` nebo `otázka`.',
    '- Piš pro člověka bez technických znalostí: co se změnilo, co to pro něj znamená, co bude dál.',
    '- Do hlášení nikdy nedávej diff, názvy souborů, příkazy, cesty ani přístupové údaje.',
    '- Hlášení se jen uloží jako koncept. Klientovi se ukáže až poté, co ho Kryštof schválí.',
    '- Klíč (`ZAKAZIQ_AGENT_KEY`) nikdy nevypisuj ani necommituj.',
  ].join('\n')
}
