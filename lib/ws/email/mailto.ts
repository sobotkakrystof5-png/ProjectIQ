/** Bezpečná adresa pro mailto: zachová @ a zakóduje parametry v lokální části/doméně. */
export function mailtoAddress(email: string): string | null {
  const value = email.trim().toLowerCase()
  if (!/^[^\s@<>\"]+@[^\s@<>\"]+\.[^\s@<>\"]+$/.test(value)) return null
  const at = value.lastIndexOf('@')
  return `${encodeURIComponent(value.slice(0, at))}@${encodeURIComponent(value.slice(at + 1))}`
}
