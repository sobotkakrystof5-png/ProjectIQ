import Link from 'next/link'
import { PageHeader, PageShell } from '@/components/ws/app/page-header'
import { buttonVariants } from '@/components/ui/button'
import type { Guide, GuideTopic, GuideTopicKey } from '@/lib/ws/guides'

type VisibleTopic = GuideTopic & { guides: Guide[] }

export function GuideLibrary({
  slug,
  topics,
  selectedTopic,
}: {
  slug: string
  topics: VisibleTopic[]
  selectedTopic: GuideTopicKey
}) {
  const selected = topics.find((topic) => topic.id === selectedTopic)
  if (!selected) return null

  return (
    <PageShell width="wide">
      <PageHeader title="Návody" accent="po ruce." subtitle="Krátké postupy pro běžnou práci v ZakazIQ." />
      <nav aria-label="Témata návodů" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {topics.map((topic) => (
          <Link
            key={topic.id}
            href={`/w/${slug}/navody/${topic.id}`}
            aria-current={topic.id === selected.id ? 'page' : undefined}
            className={buttonVariants({ variant: topic.id === selected.id ? 'outline' : 'ghost', className: 'shrink-0' })}
          >
            {topic.title}
          </Link>
        ))}
      </nav>
      <section aria-labelledby="guide-topic-title" className="flex flex-col gap-5">
        <h2 id="guide-topic-title" className="text-xl font-semibold">{selected.title}</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {selected.guides.map((guide) => (
            <article key={guide.id} id={guide.id} className="scroll-mt-24 rounded-panel border bg-surface p-5 sm:p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="font-num text-[11px] uppercase tracking-[0.08em] text-quiet">NÁVOD · {guide.minutes} min</p>
                <Link href={`/w/${slug}/${guide.steps.find((step) => step.href !== undefined)?.href ?? ''}`} className={buttonVariants({ variant: 'outline' })}>
                  Otevřít obrazovku
                </Link>
              </div>
              <h3 className="text-lg font-semibold">{guide.title}</h3>
              <p className="mt-1 text-sm text-quiet">{guide.description}</p>
              <div aria-label={`Ukázka rozhraní: ${guide.preview}`} className="mt-4 flex min-h-12 items-center justify-between gap-3 rounded-box border bg-ground px-4 py-3">
                <span className="truncate text-sm font-medium">{guide.preview}</span>
                <span aria-hidden className="shrink-0 rounded-full border bg-surface px-3 py-1 font-num text-[10px] text-quiet">ZakazIQ</span>
              </div>
              <ol className="mt-5 flex flex-col gap-4">
                {guide.steps.map((step, index) => (
                  <li key={step.title} className="flex gap-3">
                    <span aria-hidden className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy-50 font-num text-xs text-navy-700 dark:bg-navy-800 dark:text-navy-200">{index + 1}</span>
                    <div className="min-w-0">
                      <h4 className="text-sm font-semibold">{step.title}</h4>
                      <p className="mt-0.5 text-sm text-quiet">{step.text}</p>
                      {step.href !== undefined && (
                        <Link href={`/w/${slug}/${step.href}`} className="mt-1 inline-flex min-h-11 items-center text-sm font-semibold text-navy-700 underline-offset-4 hover:underline dark:text-navy-200">
                          Otevřít tuhle obrazovku
                        </Link>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </article>
          ))}
        </div>
      </section>
    </PageShell>
  )
}
