export type LoyaltyCardStatus = 'active' | 'full' | 'redeemed' | 'empty'

export type LoyaltyCardView = {
  stamps: number
  needed: number
  status: LoyaltyCardStatus
  progress: string
  message: string
}

function stampWord(count: number): string {
  if (count === 1) return 'razítko'
  if (count >= 2 && count <= 4) return 'razítka'
  return 'razítek'
}

/** Společný text a stav karty pro aplikaci, portál i e-mail. */
export function loyaltyCardView(input: {
  stamps: number
  needed: number
  reward: string | null | undefined
  status?: LoyaltyCardStatus | null
}): LoyaltyCardView {
  const needed = Math.max(1, Math.min(50, Math.trunc(input.needed) || 1))
  const stamps = Math.max(0, Math.min(needed, Math.trunc(input.stamps) || 0))
  const status: LoyaltyCardStatus =
    input.status === 'redeemed' ? 'redeemed' : input.status === 'full' || stamps >= needed ? 'full' : stamps > 0 ? 'active' : 'empty'
  const reward = input.reward?.trim() || 'odměna'
  const remaining = needed - stamps
  const remainingVerb = remaining >= 2 && remaining <= 4 ? 'zbývají' : 'zbývá'
  const message =
    status === 'redeemed'
      ? 'Odměna uplatněna. Začíná nová karta.'
      : status === 'full'
        ? `Odměna připravena: ${reward}`
        : `Do odměny ${remainingVerb} ${remaining} ${stampWord(remaining)}: ${reward}`

  return { stamps, needed, status, progress: `${stamps} z ${needed} razítek`, message }
}
