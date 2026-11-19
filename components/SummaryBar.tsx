import { Briefcase, TrendingUp, AlertCircle } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import type { Project } from '@/lib/types'

export type SummaryProject = Pick<Project, 'status' | 'price' | 'paid' | 'deposit_amount' | 'deposit_paid'> & {
  /** Zálohy zapsané z Finance › Podnikání (R-110). */
  extra_deposits?: number | null
  /** Zaplacené korunové faktury zakázky (R-125). */
  invoice_payments?: number | null
}

interface SummaryBarProps {
  projects: SummaryProject[]
  /** Rozpracované zakázky, nebo výpis Dokončených (R-109). */
  mode?: 'active' | 'finished'
}

export function SummaryBar({ projects, mode = 'active' }: SummaryBarProps) {
  const active = mode === 'finished'
    ? projects.length
    : projects.filter(p => p.status !== 'paid' && p.status !== 'done').length
  const totalRevenue = projects.reduce((sum, p) => sum + Number(p.price ?? 0), 0)
  const unpaid = projects
    .filter(p => !p.paid && p.price)
    .reduce((sum, p) => {
      // Stejně jako `remainingToPay` (lib/admin/project-payments.ts): vlastní
      // záloha, zálohy z Podnikání a zaplacené faktury, nikdy pod nulu.
      const alreadyPaid = (p.deposit_paid && p.deposit_amount ? Number(p.deposit_amount) : 0)
        + Number(p.extra_deposits ?? 0)
        + Number(p.invoice_payments ?? 0)
      return sum + Math.max(0, Number(p.price ?? 0) - alreadyPaid)
    }, 0)

  return (
    <div className="grid grid-cols-3 gap-3">
      <StatCard
        icon={<Briefcase size={17} strokeWidth={1.5} className="text-navy-600" />}
        iconBg="bg-navy-50"
        label={mode === 'finished' ? 'Dokončené zakázky' : 'Aktivní zakázky'}
        value={String(active)}
      />
      <StatCard
        icon={<TrendingUp size={17} strokeWidth={1.5} className="text-navy-600" />}
        iconBg="bg-navy-50"
        label="Celkový objem"
        value={formatCurrency(totalRevenue)}
      />
      <StatCard
        icon={<AlertCircle size={17} strokeWidth={1.5} className="text-signal-ink" />}
        iconBg="bg-signal-bg"
        label="Nezaplaceno"
        value={formatCurrency(unpaid)}
      />
    </div>
  )
}

function StatCard({ icon, iconBg, label, value }: { icon: React.ReactNode; iconBg: string; label: string; value: string }) {
  return (
    <div className="bg-surface border border-navy-100 rounded-chip p-4 shadow-sm">
      <div className={`w-8 h-8 ${iconBg} rounded-chip flex items-center justify-center mb-3`}>
        {icon}
      </div>
      <p className="text-xs text-quiet mb-1">{label}</p>
      <p className="text-lg font-semibold text-ink tabular-nums leading-tight">{value}</p>
    </div>
  )
}
