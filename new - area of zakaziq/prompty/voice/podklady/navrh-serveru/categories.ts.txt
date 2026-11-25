/**
 * ZakazIQ Voice (R-148): do jaké kategorie diktát patří — podle aplikace,
 * do které se psalo. Stejné kategorie jako Wispr Flow, aby šly statistiky
 * porovnat, a podle nich se volí styl čištění.
 *
 * U prohlížeče rozhoduje titulek okna (Mac ho pošle jen jako nápovědu a
 * server ho neukládá — může obsahovat předmět e-mailu).
 */

export const VOICE_CATEGORIES = ['email', 'work_msg', 'personal_msg', 'ai_prompt', 'document', 'other'] as const
export type VoiceCategory = (typeof VOICE_CATEGORIES)[number]

export const CATEGORY_LABEL: Record<VoiceCategory, string> = {
  email: 'E-maily',
  work_msg: 'Pracovní zprávy',
  personal_msg: 'Osobní zprávy',
  ai_prompt: 'Prompty pro AI',
  document: 'Dokumenty',
  other: 'Ostatní',
}

const BY_BUNDLE: Record<string, VoiceCategory> = {
  'com.apple.mail': 'email',
  'com.microsoft.outlook': 'email',
  'com.readdle.smartemail-mac': 'email',
  'com.superhuman.electron': 'email',
  'com.tinyspeck.slackmacgap': 'work_msg',
  'com.microsoft.teams2': 'work_msg',
  'com.microsoft.teams': 'work_msg',
  'com.linear': 'work_msg',
  'com.apple.mobilesms': 'personal_msg',
  'net.whatsapp.whatsapp': 'personal_msg',
  'desktop.whatsapp': 'personal_msg',
  'ru.keepcoder.telegram': 'personal_msg',
  'com.facebook.archon': 'personal_msg',
  'org.whispersystems.signal-desktop': 'personal_msg',
  'com.hnc.discord': 'personal_msg',
  'com.anthropic.claudefordesktop': 'ai_prompt',
  'com.openai.chat': 'ai_prompt',
  'com.todesktop.230313mzl4w4u92': 'ai_prompt', // Cursor
  'com.microsoft.vscode': 'ai_prompt',
  'com.apple.terminal': 'ai_prompt',
  'com.googlecode.iterm2': 'ai_prompt',
  'dev.warp.warp-stable': 'ai_prompt',
  'com.exafunction.windsurf': 'ai_prompt',
  'com.google.antigravity': 'ai_prompt',
  'com.apple.iwork.pages': 'document',
  'com.microsoft.word': 'document',
  'notion.id': 'document',
  'md.obsidian': 'document',
  'com.apple.notes': 'document',
  'com.apple.textedit': 'document',
}

const BROWSERS = new Set([
  'com.google.chrome',
  'com.apple.safari',
  'company.thebrowser.browser',
  'org.mozilla.firefox',
  'com.brave.browser',
  'com.microsoft.edgemac',
  'com.vivaldi.vivaldi',
  'com.operasoftware.opera',
])

/** Titulek okna prohlížeče → kategorie. Pořadí je důležité (Gmail dřív než „Google“). */
const BY_TITLE: [RegExp, VoiceCategory][] = [
  [/\b(gmail|outlook|seznam email|email\.cz|mail\b|pošta)/i, 'email'],
  [/\b(slack|teams|linear|jira|asana|trello|clickup)\b/i, 'work_msg'],
  [/\b(whatsapp|messenger|instagram|telegram|discord)\b/i, 'personal_msg'],
  [/\b(claude|chatgpt|gemini|perplexity|copilot|lovable|bolt|v0)\b/i, 'ai_prompt'],
  [/\b(google docs|dokumenty google|notion|confluence|word|pages)\b/i, 'document'],
]

export function categoryFor(bundleId: string | null | undefined, titleHint?: string | null): VoiceCategory {
  const id = (bundleId ?? '').toLowerCase()
  const direct = BY_BUNDLE[id]
  if (direct) return direct
  if (BROWSERS.has(id) && titleHint) {
    for (const [re, cat] of BY_TITLE) if (re.test(titleHint)) return cat
  }
  return 'other'
}

export const STYLE_KEYS = ['formal', 'neutral', 'casual', 'exact'] as const
export type VoiceStyle = (typeof STYLE_KEYS)[number]

export const STYLE_LABEL: Record<VoiceStyle, string> = {
  formal: 'Spisovně',
  neutral: 'Přirozeně',
  casual: 'Volně',
  exact: 'Přesně (kód a prompty)',
}

export const DEFAULT_STYLES: Record<VoiceCategory, VoiceStyle> = {
  email: 'formal',
  work_msg: 'neutral',
  personal_msg: 'casual',
  ai_prompt: 'exact',
  document: 'formal',
  other: 'neutral',
}
