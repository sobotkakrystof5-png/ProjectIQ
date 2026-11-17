import 'server-only'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

/**
 * Šifrování obnovovacího tokenu Googlu (R-112). AES-256-GCM, klíč
 * `GOOGLE_TOKEN_KEY` (32 bajtů v base64) jen v prostředí — databáze sama
 * o sobě token neotevře. Výstup: `v1.<iv>.<tag>.<data>` v base64url.
 *
 * Klíč se čte ve funkci, ne do konstanty při načtení modulu (R-105).
 */

function key(): Buffer {
  const raw = process.env.GOOGLE_TOKEN_KEY
  if (!raw) throw new Error('Chybí GOOGLE_TOKEN_KEY.')
  const buf = Buffer.from(raw, 'base64')
  if (buf.length !== 32) throw new Error('GOOGLE_TOKEN_KEY musí mít 32 bajtů v base64.')
  return buf
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), data.toString('base64url')].join('.')
}

export function decryptSecret(sealed: string): string {
  const [v, iv, tag, data] = sealed.split('.')
  if (v !== 'v1' || !iv || !tag || !data) throw new Error('Neznámý tvar zašifrované hodnoty.')
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8')
}
