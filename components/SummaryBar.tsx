import { Briefcase, TrendingUp, AlertCircle } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import type { Project } from '@/lib/types'

interface SummaryBarProps {
  projects: Project[]
}

export function SummaryBar({ projects }: SummaryBarProps) {
  const active = projects.filter(p => p.status !== 'paid' && p.status !== 'done').length
  const totalRevenue = projects.reduce((sum, p) => sum + (p.price ?? 0), 0)
  const unpaid = projects.filter(p => !p.paid && p.price).reduce((sum, p) => sum + (p.price ?? 0), 0)

  return (
    <div className="grid grid-cols-3 gap-3">
      <StatCard
        icon={<Briefcase size={17} strokeWidth={1.5} className="text-brand-600" />}
        iconBg="bg-brand-50"
        label="Aktivní zakázky"
        value={String(active)}
      />
      <StatCard
        icon={<TrendingUp size={17} strokeWidth={1.5} className="text-emerald-600" />}
        iconBg="bg-emerald-50"
        label="Celkový objem"
        value={formatCurrency(totalRevenue)}
      />
      <StatCard
        icon={<AlertCircle size={17} strokeWidth={1.5} className="text-amber-600" />}
        iconBg="bg-amber-50"
        label="Nezaplaceno"
        value={formatCurrency(unpaid)}
      />
    </div>
  )
}

function StatCard({ icon, iconBg, label, value }: { icon: React.ReactNode; iconBg: string; label: string; value: string }) {
  return (
    <div className="bg-white border border-border rounded-xl p-4 shadow-sm">
      <div className={`w-8 h-8 ${iconBg} rounded-lg flex items-center justify-center mb-3`}>
        {icon}
      </div>
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className="text-lg font-semibold text-foreground tabular-nums leading-tight">{value}</p>
    </div>
  )
}
