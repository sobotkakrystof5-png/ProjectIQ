'use client'

import { useState } from 'react'
import { AiAssistantModal } from '@/components/AiAssistantModal'
import { CONSULT_MODES, CONSULT_PROFILES, type ConsultMode } from '@/lib/ai/consultants'

/**
 * Dlaždice konzultantů u startupového projektu.
 *
 * Seznam rolí i jejich popis bere z `lib/ai/consultants.ts` — ze stejného
 * číselníku, ze kterého server skládá systémový prompt (AD14). Komponenta
 * tak nemůže nabídnout roli, kterou server nezná, a prompt ani data projektu
 * se už nestaví v prohlížeči.
 */

interface Props {
  projectId: string
  projectName: string
}

export function AiAssistantsSection({ projectId, projectName }: Props) {
  const [mode, setMode] = useState<ConsultMode | null>(null)

  return (
    <>
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-ink">Konzultanti</h2>
          <p className="text-sm text-quiet mt-0.5">
            Poraďte se k projektu. Konzultant odpovídá, nic sám nemění ani neposílá.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {CONSULT_MODES.map((key) => {
            const profile = CONSULT_PROFILES[key]
            return (
              <button
                key={key}
                type="button"
                onClick={() => setMode(key)}
                className="group min-h-[44px] text-left bg-surface border border-navy-100 rounded-panel p-4 transition-all hover:border-navy-300 hover:shadow-md"
              >
                <div className="text-2xl mb-2" aria-hidden="true">{profile.icon}</div>
                <h3 className="font-medium text-ink text-sm mb-1">{profile.name}</h3>
                <p className="text-xs text-quiet leading-relaxed">{profile.description}</p>
                <div className="mt-3 pt-3 border-t border-navy-100">
                  <span className="text-xs font-semibold text-navy-700">Zeptat se →</span>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <AiAssistantModal
        mode={mode}
        projectId={projectId}
        projectName={projectName}
        onClose={() => setMode(null)}
      />
    </>
  )
}
