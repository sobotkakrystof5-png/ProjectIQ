import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { ProjectForm } from '@/components/ProjectForm'

export default function NewAltenoProjectPage() {
  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-8">
        <Link
          href="/alteno"
          className="p-1.5 rounded-lg text-muted-foreground hover:text-amber-800 hover:bg-amber-50 transition-colors"
        >
          <ArrowLeft size={18} strokeWidth={1.5} />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">Nová zakázka</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Vyplň detaily ALTENO zakázky</p>
        </div>
      </div>

      <div className="bg-white border border-border rounded-2xl p-6 shadow-sm">
        <ProjectForm business="alteno" />
      </div>
    </div>
  )
}
