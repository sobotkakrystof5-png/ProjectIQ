export const PRIVACY_COOKIE = 'ws_soukromi'

export function parsePrivacyMode(value: string | undefined | null): boolean {
  return value === '1'
}
