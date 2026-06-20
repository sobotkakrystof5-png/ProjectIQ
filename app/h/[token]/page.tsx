import { notFound } from 'next/navigation'
import { CheckCircle2, ClipboardList } from 'lucide-react'
import { sql } from '@/lib/db'
import { SurveyForm } from '@/components/SurveyForm'

export const revalidate = 0

interface PageProps {
  params: { token: string }
}

export default async function SurveyPage({ params }: PageProps) {
  const rows = await sql`
    SELECT id, title, client_name FROM completed_projects WHERE survey_token = ${params.token} LIMIT 1
  `
  if (!rows.length) notFound()
  const cp = rows[0] as { id: string; title: string; client_name: string | null }

  const existing = await sql`
    SELECT 1 FROM project_surveys WHERE completed_project_id = ${cp.id} LIMIT 1
  `
  const alreadyDone = existing.length > 0

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-lg">
          <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
            {/* Brand header */}
            <div className="brand-gradient px-6 pt-7 pb-6">
              <p className="text-xs font-medium text-brand-200 uppercase tracking-wider mb-1.5">
                Dotazník spokojenosti
              </p>
              <h1 className="text-2xl font-semibold text-white">{cp.title}</h1>
              <p className="text-sm text-brand-100 mt-1.5 leading-relaxed">
                Vaše hodnocení mi pomáhá zlepšovat mé služby. Děkuji za pár minut vašeho času.
              </p>
            </div>

            {/* Content */}
            <div className="px-6 py-6">
              {alreadyDone ? (
                <div className="flex flex-col items-center gap-3 py-8 text-center">
                  <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center">
                    <CheckCircle2 size={28} strokeWidth={1.5} className="text-emerald-600" />
                  </div>
                  <p className="font-semibold text-foreground">Dotazník už byl vyplněn</p>
                  <p className="text-sm text-muted-foreground max-w-sm">
                    Děkuji, vašeho hodnocení k tomuto projektu už mám. Vážím si toho!
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-5">
                    <ClipboardList size={14} strokeWidth={1.5} className="text-brand-500" />
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Ohodnoťte spolupráci (1–5 hvězdiček)
                    </p>
                  </div>
                  <SurveyForm token={params.token} />
                </>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-center gap-2.5 mt-6">
            <div className="w-8 h-8 brand-gradient rounded-lg flex items-center justify-center shadow-md">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="2" y="2" width="5" height="5" rx="1" fill="white" fillOpacity="0.95" />
                <rect x="9" y="2" width="5" height="5" rx="1" fill="white" fillOpacity="0.55" />
                <rect x="2" y="9" width="5" height="5" rx="1" fill="white" fillOpacity="0.55" />
                <rect x="9" y="9" width="5" height="5" rx="1" fill="white" fillOpacity="0.95" />
              </svg>
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-[10px] text-muted-foreground uppercase tracking-widest">Powered by</span>
              <span className="text-sm font-bold text-brand-800 leading-none">ZakazIQ</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
