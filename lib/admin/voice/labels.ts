/**
 * ZakazIQ Voice (R-150): české popisky stavů diktátu a pojistek pro admin.
 * Kód pojistky se ukládá do `voice_dictations.guards` (guards.ts); tady je jen
 * to, co uvidí člověk. Bez importů ze serveru — čtou to i komponenty v prohlížeči.
 */

export const DICTATION_STATUSES = ['ok', 'raw', 'snippet', 'empty', 'blocked', 'error', 'cancelled'] as const
export type DictationStatus = (typeof DICTATION_STATUSES)[number]

export const STATUS_LABEL: Record<DictationStatus, string> = {
  ok: 'Učesáno',
  raw: 'Jen přepis',
  snippet: 'Zkratka',
  empty: 'Nic se neřeklo',
  blocked: 'Zahozeno pojistkou',
  error: 'Přepis selhal',
  cancelled: 'Zrušeno',
}

/** Kdy stav nastane, jednou větou (detail v Historii). */
export const STATUS_HINT: Record<DictationStatus, string> = {
  ok: 'Text prošel čištěním a kontrolou.',
  raw: 'Čištění neprošlo kontrolou, vložil se přepis beze změn.',
  snippet: 'Diktát odpovídal zkratce, vložil se její text.',
  empty: 'V nahrávce nebyla řeč.',
  blocked: 'Pojistka poznala, že si přepis text vymyslel, a nic nevložila.',
  error: 'Přepis řeči se nepovedl.',
  cancelled: 'Diktát zrušila klávesa Esc.',
}

export const GUARD_LABEL: Readonly<Record<string, string>> = {
  no_speech: 'V nahrávce nebyla řeč',
  prompt_echo: 'Přepis zopakoval nápovědu',
  segments: 'Vyřazený úsek bez řeči',
  repeat: 'Sloučené opakování',
  blocklist: 'Blokovaná fráze',
  too_fast: 'Víc slov, než šlo říct',
  stt_fallback: 'Přepis přes zálohu',
  stt_failed: 'Přepis selhal',
  stt_not_configured: 'Chybí klíč k přepisu',
  cleanup_assistant: 'Čištění odpovídalo jako asistent',
  cleanup_length: 'Čištění změnilo délku',
  cleanup_novel: 'Čištění přidalo slova',
  cleanup_negation: 'Čištění otočilo zápor',
  cleanup_numbers: 'Čištění změnilo číslo',
  cleanup_format: 'Čištění vrátilo špatný tvar',
  cleanup_timeout: 'Čištění nestihlo čas',
  cleanup_error: 'Čištění selhalo',
  cleanup_refusal: 'Model čištění odmítl',
  cleanup_truncated: 'Čištění bylo useknuté',
  cleanup_not_configured: 'Chybí klíč k čištění',
  cleanup_off: 'Čištění je vypnuté',
  cost_cap: 'Denní strop nákladů',
}

export const guardLabel = (code: string): string => GUARD_LABEL[code] ?? code

export const isDictationStatus = (v: unknown): v is DictationStatus =>
  typeof v === 'string' && (DICTATION_STATUSES as readonly string[]).includes(v)

export const SUGGESTION_KIND_LABEL = {
  term: 'Slovo do slovníku',
  blocklist: 'Blokovaná fráze',
  rule: 'Pravidlo stylu',
} as const
