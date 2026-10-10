import type { TaxSettings } from './schema'
export const DEFAULT_TAX: TaxSettings = { mode:'flat_expenses', flatRate:60, vatPayer:false, sideActivity:false, months:12, healthMinimum:true, taxpayerCredit:true, flatBand:1, filing:'electronic', advances:0 }
