import Link from 'next/link'
import { ArrowLeft, Bot } from 'lucide-react'

export default function AltenoPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/hub/byznys"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft size={14} strokeWidth={1.5} />
          Zpět na Business
        </Link>
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">ALTENO</h1>
        <p className="text-sm text-muted-foreground mt-0.5">AI automatizace — procesy, agenti a integrace</p>
      </div>

      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
          <Bot size={24} strokeWidth={1.5} className="text-slate-400" />
        </div>
        <h2 className="text-base font-medium text-foreground mb-1.5">Zatím prázdné</h2>
        <p className="text-sm text-muted-foreground max-w-xs">
          Tady poroste sekce ALTENO — zakázky na automatizace, AI agenty a integrace.
        </p>
      </div>
    </div>
  )
}
