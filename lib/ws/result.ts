// Tvar výsledku server actions Workspace (AGENTS.md B11): žádné throw do UI,
// chyba je česká věta pro člověka (skill zakaziq-ux-texty-cs), bez kódů a ID.

export type Result<T> = { ok: true; data: T } | { ok: false; error: string }

export const ok = <T>(data: T): Result<T> => ({ ok: true, data })

export const fail = (error: string): { ok: false; error: string } => ({ ok: false, error })
