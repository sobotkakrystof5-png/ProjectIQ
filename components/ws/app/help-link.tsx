import Link from 'next/link'
import { CircleHelp } from 'lucide-react'
import type { GuideTopicKey } from '@/lib/ws/guides'

export function HelpLink({ slug, topic, guide }: { slug: string; topic: GuideTopicKey; guide: string }) {
  return (
    <Link
      href={`/w/${slug}/navody/${topic}#${guide}`}
      aria-label="Otevřít návod k této obrazovce"
      title="Návod k této obrazovce"
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-navy-700 transition-colors hover:bg-navy-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-navy-200 dark:hover:bg-navy-800"
    >
      <CircleHelp aria-hidden size={20} strokeWidth={1.6} />
    </Link>
  )
}
