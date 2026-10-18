import { describe, expect, it } from 'vitest'
import { loyaltyCardView } from '../loyalty-card-view'

describe('loyaltyCardView', () => {
  it('rozliší prázdnou, rozpracovanou, plnou a uplatněnou kartu', () => {
    expect(loyaltyCardView({ stamps: 0, needed: 5, reward: 'Odměna' })).toMatchObject({
      status: 'empty',
      progress: '0 z 5 razítek',
      message: 'Do odměny zbývá 5 razítek: Odměna',
    })
    expect(loyaltyCardView({ stamps: 3, needed: 5, reward: 'Odměna' })).toMatchObject({
      status: 'active',
      message: 'Do odměny zbývají 2 razítka: Odměna',
    })
    expect(loyaltyCardView({ stamps: 5, needed: 5, reward: 'Odměna' })).toMatchObject({
      status: 'full',
      message: 'Odměna připravena: Odměna',
    })
    expect(loyaltyCardView({ stamps: 5, needed: 5, reward: 'Odměna', status: 'redeemed' })).toMatchObject({
      status: 'redeemed',
      message: 'Odměna uplatněna. Začíná nová karta.',
    })
  })
})
