/**
 * Meze dotazu na asistenta. Vlastní soubor proto, že je čte i prohlížeč
 * (okénko si na nich staví `maxLength`), zatímco `lib/ai/assistant.ts` je
 * `server-only` a systémové prompty do prohlížeče posílat nepotřebujeme.
 */

/** Nejdelší věta, kterou asistent přijme. */
export const TEXT_MAX = 2000

/** Kolik předchozích replik si hovor nese. Víc stejně nikdo nepřečte a každá stojí tokeny. */
export const HISTORY_MAX = 20
