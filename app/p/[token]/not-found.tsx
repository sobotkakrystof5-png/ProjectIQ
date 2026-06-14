import { Zap } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="text-center">
        <div className="w-12 h-12 bg-gray-900 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Zap size={20} strokeWidth={1.5} className="text-white" />
        </div>
        <h1 className="text-xl font-semibold text-gray-900 mb-2">Projekt nenalezen</h1>
        <p className="text-sm text-gray-400">Tento odkaz je neplatný nebo projekt byl smazán.</p>
      </div>
    </div>
  )
}
