'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AccentHeading, EmptyState } from '@/components/ws/brand'
import { buttonVariants } from '@/components/ui/button'

// Neznámá adresa nebo vypnutá funkce pod /w/[byznys] (např. Zakázky u oboru,
// který je nemá). not-found nedostává params, slug se vezme z adresy.
export default function BusinessNotFound() {
  const slug = usePathname()?.split('/')[2] ?? ''
  const base = `/w/${slug}`
  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <AccentHeading>Tahle stránka tu není</AccentHeading>
      <EmptyState
        title="Funkci možná máte vypnutou"
        description="Zapnete ji v Nastavení v části Co v aplikaci používáte. Jinak je odkaz nejspíš starý."
        action={
          <div className="flex flex-wrap gap-2">
            <Link href={base} className={buttonVariants()}>Zpět na Dnes</Link>
            <Link href={`${base}/nastaveni`} className={buttonVariants({ variant: 'outline' })}>Nastavení</Link>
          </div>
        }
      />
    </div>
  )
}
