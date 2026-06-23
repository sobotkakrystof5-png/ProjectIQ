'use client'

import { useState } from 'react'
import { AiAssistantModal } from '@/components/AiAssistantModal'
import type { StartupProject, StartupChangelogEntry, StartupImprovement } from '@/lib/types'

interface Assistant {
  icon: string
  name: string
  description: string
  role: string
}

const ASSISTANTS: Assistant[] = [
  {
    icon: '📣',
    name: 'Marketingový stratég',
    description: 'Pomáhá s propagací, obsahovou strategií a growth hackingem',
    role: 'marketing',
  },
  {
    icon: '📰',
    name: 'PR & komunikace',
    description: 'Tiskové zprávy, mediální strategie, budování značky',
    role: 'pr',
  },
  {
    icon: '🚀',
    name: 'Launch Manager',
    description: 'Plánování spuštění, go-to-market strategie, product hunt',
    role: 'launch',
  },
  {
    icon: '💰',
    name: 'Byznys poradce',
    description: 'Byznysová rozhodnutí, pricing, partnerství, škálování',
    role: 'business',
  },
  {
    icon: '🎨',
    name: 'Grafický designér',
    description: 'Brand identity, vizuální styl, UI/UX doporučení',
    role: 'design',
  },
  {
    icon: '📊',
    name: 'Finanční analytik',
    description: 'Finanční projekce, unit economics, fundraising',
    role: 'finance',
  },
  {
    icon: '⚙️',
    name: 'Operations Manager',
    description: 'Procesy, automatizace, chod firmy a týmu',
    role: 'operations',
  },
  {
    icon: '🤝',
    name: 'Tvoje pravá ruka',
    description: 'Sleduje vše — rozhodnutí, plány, změny projektu. Tvůj osobní COO.',
    role: 'pravá ruka',
  },
]

interface Props {
  project: StartupProject
  changelog?: StartupChangelogEntry[]
  improvements?: StartupImprovement[]
}

export function AiAssistantsSection({ project, changelog, improvements }: Props) {
  const [activeAssistant, setActiveAssistant] = useState<Assistant | null>(null)

  return (
    <>
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">AI Asistenti</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Konzultuj projekt s AI specialisty zaměřenými na konkrétní oblast</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {ASSISTANTS.map(assistant => (
            <button
              key={assistant.name}
              type="button"
              onClick={() => setActiveAssistant(assistant)}
              className="group text-left bg-white border border-border rounded-2xl p-4 hover:shadow-md hover:border-brand-200 transition-all"
            >
              <div className="text-2xl mb-2">{assistant.icon}</div>
              <h3 className="font-medium text-foreground text-sm mb-1 group-hover:text-brand-700 transition-colors">
                {assistant.name}
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{assistant.description}</p>
              <div className="mt-3 pt-3 border-t border-border">
                <span className="text-xs font-semibold text-brand-600 group-hover:text-brand-700 transition-colors">
                  Konzultovat →
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      <AiAssistantModal
        assistant={activeAssistant}
        project={project}
        changelog={changelog}
        improvements={improvements}
        onClose={() => setActiveAssistant(null)}
      />
    </>
  )
}
