import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireBusiness, requireWorkspace } from '@/lib/ws/context'
import { getEnabledModules } from '@/lib/ws/today'
import { visibleGuideTopics } from '@/lib/ws/guides'
import { GuideLibrary } from '@/components/ws/guides/guide-library'

export const metadata: Metadata = { title: 'Návody' }

export default async function GuidesPage({ params }: { params: Promise<{ business: string }> }) {
  const { business: slug } = await params
  const ctx = await requireWorkspace()
  const business = await requireBusiness(ctx, slug)
  const enabled = await getEnabledModules(ctx, business)
  const topics = visibleGuideTopics(enabled)
  if (topics.length === 0) notFound()
  return <GuideLibrary slug={business.slug} topics={topics} selectedTopic="zacinate" />
}
