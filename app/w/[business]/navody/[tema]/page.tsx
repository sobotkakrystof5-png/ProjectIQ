import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireBusiness, requireWorkspace } from '@/lib/ws/context'
import { getEnabledModules } from '@/lib/ws/today'
import { visibleGuideTopics } from '@/lib/ws/guides'
import { GuideLibrary } from '@/components/ws/guides/guide-library'

export const metadata: Metadata = { title: 'Návody' }

export default async function GuideTopicPage({ params }: { params: Promise<{ business: string; tema: string }> }) {
  const { business: slug, tema } = await params
  const ctx = await requireWorkspace()
  const business = await requireBusiness(ctx, slug)
  const enabled = await getEnabledModules(ctx, business)
  const topics = visibleGuideTopics(enabled)
  const selectedTopic = topics.find((topic) => topic.id === tema)
  if (!selectedTopic) notFound()
  return <GuideLibrary slug={business.slug} topics={topics} selectedTopic={selectedTopic.id} />
}
