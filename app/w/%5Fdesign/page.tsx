import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { DesignShowcase } from './showcase'

// /w/_design — interní přehled design systému Dílky. Složka `%5Fdesign`, protože `_design`
// by Next.js bral jako soukromou složku mimo routování. V produkci 404.
export const metadata: Metadata = {
  title: 'Design systém Dílky',
  robots: { index: false, follow: false },
}

export default function DesignPage() {
  if (process.env.NODE_ENV === 'production') notFound()
  return <DesignShowcase />
}
