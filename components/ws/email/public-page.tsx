import { Logo } from '@/components/ws/brand'

/** Rám veřejné stránky z e-mailu: logo, jedna karta, nic navíc. */
export function PublicPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-ground">
      <main className="mx-auto flex w-full max-w-[520px] flex-col gap-6 px-4 pb-16 pt-8 sm:pt-12">
        <Logo size={28} wordmark />
        <section className="flex flex-col gap-5 rounded-panel border border-navy-100 bg-surface p-5 sm:p-7">
          <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.02em] text-ink">{title}</h1>
          {children}
        </section>
      </main>
    </div>
  )
}
