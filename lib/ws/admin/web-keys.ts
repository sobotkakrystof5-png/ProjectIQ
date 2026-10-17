import 'server-only'
import type { WsContext } from '../context'
import { ensureIntegration, isKeyConfigured, rotateSecretKey } from '../keys'
import { loadIntakeConfig } from '../intake/intake'
import { buildClaudePrompt } from '../intake/claude-prompt'
import { buildPublicSchema } from '../intake/schema'
import { emailOrigin } from '../email/links'
import { type AdminIdentity } from './auth'
import { auditAdmin } from './clients'

// „Klíče a prompt pro web“ z /dashboard/klienti (S17). Stejná logika jako
// Nastavení › Napojený web (S11): napojení, nový tajný klíč, prompt pro
// Claude Code. Zápis jde rolí ws_app pod RLS účtu, který admin ověřil.

export type WebKeysResult = {
  secretKey: string
  publicKey: string
  prompt: string
  widgetCode: string
  orderUrl: string
}

export class WebKeysUnavailable extends Error {}

/** Účet jako kontext Workspace pro zápis pod RLS — jen pro ověřený účet z adminu. */
const adminScope = (accountId: string): WsContext => ({ accountId, userId: 'admin', role: 'owner' })

export async function generateWebKeys(
  admin: AdminIdentity,
  business: { accountId: string; id: string; slug: string },
): Promise<WebKeysResult> {
  if (!isKeyConfigured()) throw new WebKeysUnavailable('WS_KEY_PEPPER')
  const ctx = adminScope(business.accountId)
  const integration = await ensureIntegration(ctx, business)
  const secretKey = await rotateSecretKey(ctx, business)
  const config = await loadIntakeConfig(business.accountId, business.id)
  if (!config) throw new WebKeysUnavailable('config')
  const origin = emailOrigin()
  await auditAdmin(admin, {
    accountId: business.accountId,
    businessId: business.id,
    action: 'admin.web_keys_generated',
    entity: 'web_integration',
    entityId: integration.id,
  })
  return {
    secretKey,
    publicKey: integration.public_key,
    prompt: buildClaudePrompt({ apiOrigin: origin, schema: buildPublicSchema(config, []) }),
    widgetCode: `<script src="${origin}/embed/${business.slug}.js" async></script>`,
    orderUrl: `${origin}/r/${business.slug}`,
  }
}
