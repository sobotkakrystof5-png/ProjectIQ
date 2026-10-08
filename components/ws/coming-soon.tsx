import Link from 'next/link'
import { Logo } from '@/components/ws/brand'
import { EmptyState } from '@/components/ws/brand'
import { Button } from '@/components/ui/button'
import { SUPPORT_MAILTO } from '@/components/marketing/content'

/**
 * Dočasná stránka místo registrace a přihlášení, než je postaví S07 (Clerk).
 * Tlačítka z landing page tak nevedou na 404.
 */
export function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-[720px] flex-col gap-10 px-5 py-8 sm:px-7">
      <Link href="/" className="inline-flex min-h-[44px] items-center self-start" aria-label="ZakazIQ, úvod">
        <Logo size={34} wordmark />
      </Link>
      <EmptyState
        size="large"
        title={title}
        description={description}
        action={
          <div className="flex flex-wrap justify-center gap-3">
            <Button asChild variant="inverse">
              <a href={SUPPORT_MAILTO}>Napište nám</a>
            </Button>
            <Button asChild variant="ghost" className="text-white hover:bg-white/10">
              <Link href="/">Zpět na úvod</Link>
            </Button>
          </div>
        }
      />
    </main>
  )
}
