import { randomBytes } from 'crypto'

// Předání zadání do Claude Code, úroveň 2 (KP09): příkaz pro terminál, který
// otevře Claude Code se zadáním. Nic se nespouští samo, příkaz vkládá a spouští
// člověk v repozitáři projektu. Text klienta je nedůvěryhodný, proto jde do
// dočasného souboru přes heredoc na nejvyšší úrovni (ne do $(…): bash 3.2 na
// macOS v něm hledá závorku i uvnitř textu a řádek `)"` v textu by ukončil
// substituci a spustil zbytek). Oddělovač je uvozený, náhodný a v textu se
// nevyskytuje, takže ho text nemůže ukončit. Obsah souboru se do argumentu
// dostane jako data, shell ho znovu nevyhodnocuje.

const DELIMITER_PREFIX = 'ZAKAZIQ_ZADANI_'

/** Odstraní znaky, které by v terminálu dělaly neplechu (řídicí kromě nového řádku a tabulátoru). */
export function sanitizeForTerminal(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g, '')
}

/** Oddělovač, který se v textu nevyskytuje jako samostatný řádek ani jako podřetězec. */
export function pickDelimiter(text: string, random: () => string = () => randomBytes(8).toString('hex').toUpperCase()): string {
  for (let i = 0; i < 20; i++) {
    const candidate = `${DELIMITER_PREFIX}${random()}`
    if (!text.includes(candidate)) return candidate
  }
  throw new Error('Nepodařilo se vybrat oddělovač.')
}

export function buildTerminalCommand(prompt: string, random?: () => string): string {
  const clean = sanitizeForTerminal(prompt)
  const delimiter = pickDelimiter(clean, random)
  return [
    `f=$(mktemp) && cat > "$f" <<'${delimiter}'`,
    clean,
    delimiter,
    'claude "$(cat "$f")"; rm -f "$f"',
  ].join('\n')
}
