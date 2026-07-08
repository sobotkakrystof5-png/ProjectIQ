import { Wallet, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { getFinanceGoals, getSavingsSnapshots, getSavingsTrend, getWishlistItems } from './finance-plan-actions'
import { FinanceClient } from './FinanceClient'

export default async function FinancePlanyPage() {
  const [goals, snapshots, trend, wishlist] = await Promise.all([
    getFinanceGoals(),
    getSavingsSnapshots(),
    getSavingsTrend(),
    getWishlistItems(),
  ])

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/hub/plany"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft size={14} strokeWidth={1.5} />
          Plány
        </Link>
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-lg flex items-center justify-center shadow-sm">
            <Wallet size={16} strokeWidth={1.5} className="text-white" />
          </div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">Finanční cíle</h1>
        </div>
        <p className="text-sm text-muted-foreground">Cíle, úspory, investice a přání na jednom místě</p>
      </div>

      <FinanceClient goals={goals} snapshots={snapshots} trend={trend} wishlist={wishlist} />
    </div>
  )
}
