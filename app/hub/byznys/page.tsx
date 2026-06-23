import Link from 'next/link'
import { Briefcase, Rocket, ArrowUpRight, ArrowLeft, Plus } from 'lucide-react'

export default function ByznysPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/hub"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft size={14} strokeWidth={1.5} />
          Zpět na Hub
        </Link>
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">Business</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Vyber sekci, kterou chceš otevřít</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
        {/* Zakázky */}
        <Link
          href="/dashboard"
          className="group bg-white border border-border rounded-2xl p-6 hover:shadow-md hover:border-brand-200 transition-all flex flex-col"
        >
          <div className="flex items-start justify-between mb-4">
            <div className="w-12 h-12 brand-gradient rounded-xl flex items-center justify-center shadow-sm">
              <Briefcase size={22} strokeWidth={1.5} className="text-white" />
            </div>
            <ArrowUpRight
              size={16}
              strokeWidth={1.5}
              className="text-muted-foreground/40 group-hover:text-brand-600 transition-colors mt-0.5"
            />
          </div>
          <h2 className="font-semibold text-foreground text-[16px] mb-1.5">Zakázky</h2>
          <p className="text-sm text-muted-foreground flex-1">
            Správa klientských zakázek, fakturace, kalendář konzultací a hodnocení.
          </p>
          <div className="mt-5 pt-3 border-t border-border">
            <span className="text-xs font-semibold text-brand-600 group-hover:text-brand-700 transition-colors">
              Otevřít Zakázky →
            </span>
          </div>
        </Link>

        {/* Startup */}
        <Link
          href="/hub/byznys/startup"
          className="group bg-white border border-border rounded-2xl p-6 hover:shadow-md hover:border-brand-200 transition-all flex flex-col"
        >
          <div className="flex items-start justify-between mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-violet-500 to-brand-600 rounded-xl flex items-center justify-center shadow-sm">
              <Rocket size={22} strokeWidth={1.5} className="text-white" />
            </div>
            <ArrowUpRight
              size={16}
              strokeWidth={1.5}
              className="text-muted-foreground/40 group-hover:text-brand-600 transition-colors mt-0.5"
            />
          </div>
          <h2 className="font-semibold text-foreground text-[16px] mb-1.5">Startup</h2>
          <p className="text-sm text-muted-foreground flex-1">
            Správa osobních projektů — fáze, finanční kalkulačka, changelog a nápady na zlepšení.
          </p>
          <div className="mt-5 pt-3 border-t border-border">
            <span className="text-xs font-semibold text-brand-600 group-hover:text-brand-700 transition-colors">
              Otevřít Startup →
            </span>
          </div>
        </Link>
      </div>
    </div>
  )
}
