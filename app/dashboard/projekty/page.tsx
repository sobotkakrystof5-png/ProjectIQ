import { Layers } from 'lucide-react'

export default function ProjektyPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">Projekty</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Osobní projekty a vlastní produkty</p>
      </div>
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-14 h-14 bg-brand-50 rounded-2xl flex items-center justify-center mb-4">
          <Layers size={24} strokeWidth={1.5} className="text-brand-400" />
        </div>
        <p className="font-medium text-foreground mb-1">Tato sekce se připravuje</p>
        <p className="text-sm text-muted-foreground max-w-xs">
          Brzy zde budeš moci evidovat vlastní aplikace, systémy a automatizace.
        </p>
      </div>
    </div>
  )
}
