import { Plus } from 'lucide-react'
import { FAQ } from './content'

/**
 * Krátké dotazy vedle formuláře v bloku Poptávka (R-081). Akordeon přes <details>,
 * funguje i bez JavaScriptu a z klávesnice. Kotva `#dotazy` zůstává kvůli patičce.
 */
export function Faq({ className }: { className?: string }) {
  return (
    <div id="dotazy" className={className}>
      <h3 className="text-[20px] font-semibold tracking-[-0.015em]">Než se zaregistrujete</h3>
      <div className="mt-4 border-t border-navy-100">
        {FAQ.map((item) => (
          <details key={item.q} className="group border-b border-navy-100">
            <summary className="flex min-h-[60px] cursor-pointer list-none items-center justify-between gap-6 py-3 text-[17px] font-semibold tracking-[-0.01em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
              {item.q}
              <Plus
                size={20}
                strokeWidth={1.5}
                aria-hidden
                className="shrink-0 text-navy-500 transition-transform duration-200 ease-zq group-open:rotate-45 motion-reduce:transition-none"
              />
            </summary>
            <p className="max-w-[60ch] pb-5 text-[16px] leading-relaxed text-quiet">{item.a}</p>
          </details>
        ))}
      </div>
    </div>
  )
}
