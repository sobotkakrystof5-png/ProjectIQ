import { Zap } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-navy-50 flex items-center justify-center px-4">
      <div className="text-center">
        <div className="w-12 h-12 bg-navy-950 rounded-box flex items-center justify-center mx-auto mb-4">
          <Zap size={20} strokeWidth={1.5} className="text-white" />
        </div>
        <h1 className="text-xl font-semibold text-ink mb-2">Projekt nenalezen</h1>
        <p className="text-sm text-quiet">Tento odkaz je neplatný nebo projekt byl smazán.</p>
      </div>
    </div>
  )
}
