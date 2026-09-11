import { getBlockTemplates } from '@/app/block-templates-actions'
import { BlockTemplateLibrary } from '@/components/BlockTemplateLibrary'

export default async function BlockTemplatesPage() {
  const templates = await getBlockTemplates()

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">Šablony bloků</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Osobní knihovna typů bloků webu — vytvoř si vlastní, žádný pevný seznam. Použiješ je pak u jednotlivých zakázek.
        </p>
      </div>

      <div className="bg-white border border-border rounded-2xl p-6 shadow-sm">
        <BlockTemplateLibrary initialTemplates={templates} />
      </div>
    </div>
  )
}
