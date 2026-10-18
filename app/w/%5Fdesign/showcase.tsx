'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  CalendarDays,
  ChevronDown,
  Copy,
  Inbox,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Search,
  Settings,
  Trash2,
  Users,
} from 'lucide-react'
import { useWsTheme } from '@/components/ws/ws-root'
import { PageHeader } from '@/components/ws/app/page-header'
import { PillNav } from '@/components/ws/app/toolbar'
import { TodayFocus } from '@/components/ws/app/today/focus'
import type { FocusItem } from '@/lib/ws/today'
import {
  AccentHeading,
  ConfirmedBlock,
  EmptyState,
  LiveDot,
  Logo,
  LoyaltyCard,
  Money,
  NewRequestBlock,
  SectionLabel,
  TileField,
  TileGlyph,
  TimeRange,
} from '@/components/ws/brand'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Checkbox } from '@/components/ui/checkbox'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
  useCommandShortcut,
} from '@/components/ui/command'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from '@/components/ui/toast'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/ws/utils'
import { zqIn } from '@/lib/ws/motion'

// Ukázková data jen pro tuhle interní stránku.
const SAMPLE_REQUESTS = [
  { customer: 'Tereza Malá', service: 'Střih a foukaná', start: '2026-10-09T07:00:00Z', end: '2026-10-09T08:00:00Z' },
  { customer: 'Jan Dvořák', service: 'Výměna zámku', start: '2026-10-09T09:30:00Z', end: '2026-10-09T10:30:00Z' },
  { customer: 'Eva Horáková', service: 'Barvení', start: '2026-10-09T11:00:00Z', end: '2026-10-09T13:00:00Z' },
  { customer: 'Petr Novotný', service: 'Kontrola studny', start: '2026-10-09T13:30:00Z', end: '2026-10-09T15:00:00Z' },
]

const COLORS: { name: string; hex: string; cls: string; light?: boolean }[] = [
  { name: 'navy-950', hex: '#0c1a36', cls: 'bg-navy-950' },
  { name: 'navy-900', hex: '#132850', cls: 'bg-navy-900' },
  { name: 'navy-800', hex: '#1b3868', cls: 'bg-navy-800' },
  { name: 'navy-700', hex: '#23478b', cls: 'bg-navy-700' },
  { name: 'navy-600', hex: '#2b57a8', cls: 'bg-navy-600' },
  { name: 'navy-500', hex: '#3a6ec4', cls: 'bg-navy-500' },
  { name: 'navy-400', hex: '#5c8dd3', cls: 'bg-navy-400', light: true },
  { name: 'navy-300', hex: '#8aaee3', cls: 'bg-navy-300', light: true },
  { name: 'navy-200', hex: '#b8ceef', cls: 'bg-navy-200', light: true },
  { name: 'navy-100', hex: '#dce7f7', cls: 'bg-navy-100', light: true },
  { name: 'navy-50', hex: '#eef2fb', cls: 'bg-navy-50', light: true },
]

const ROLES: { name: string; note: string; cls: string; ink: string }[] = [
  { name: 'ground', note: 'pozadí stránky', cls: 'bg-ground border', ink: 'text-ink' },
  { name: 'surface', note: 'karty', cls: 'bg-surface border', ink: 'text-ink' },
  { name: 'ink', note: 'hlavní text', cls: 'bg-ink', ink: 'text-ground' },
  { name: 'quiet', note: 'vedlejší text', cls: 'bg-quiet', ink: 'text-ground' },
  { name: 'signal', note: 'jen nová poptávka', cls: 'bg-signal', ink: 'text-signal-ink' },
  { name: 'signal-bg', note: 'plocha poptávky', cls: 'bg-signal-bg border border-dashed border-signal-line', ink: 'text-signal-ink' },
  { name: 'reward', note: 'odměna na kartě', cls: 'bg-reward', ink: 'text-signal-ink' },
  { name: 'danger', note: 'mazání, po splatnosti', cls: 'bg-danger', ink: 'text-white' },
]

const RADII = [
  { name: 'tiny', px: '9 px', cls: 'rounded-tiny' },
  { name: 'chip', px: '12 px', cls: 'rounded-chip' },
  { name: 'box', px: '20 px', cls: 'rounded-box' },
  { name: 'panel', px: '24 px', cls: 'rounded-panel' },
  { name: 'slab', px: '32 px', cls: 'rounded-slab' },
  { name: 'hero', px: '40 px', cls: 'rounded-hero' },
]

const CHART = [42, 58, 35, 71, 64, 88, 52]

// Ukázkové podklady pro blok „Teď na řadě“ (pevné datum, ať se server a prohlížeč shodnou).
const FOCUS_TODAY = '2026-10-09'
const FOCUS_NOW = new Date('2026-10-09T06:00:00Z')
const FOCUS_CASES: { title: string; focus: FocusItem }[] = [
  {
    title: 'Nová poptávka',
    focus: {
      kind: 'request',
      request: {
        id: 'ukazka',
        customer_id: null,
        customer_name: 'Tereza Testová',
        service_name: 'Střih a barva',
        wanted_start: new Date('2026-10-10T07:00:00Z'),
        wanted_end: new Date('2026-10-10T09:00:00Z'),
        created_at: new Date('2026-10-09T04:25:00Z'),
        source: 'web',
      },
    },
  },
  {
    title: 'Dnešní termín',
    focus: {
      kind: 'visit',
      visit: {
        id: 'ukazka',
        customer_id: null,
        customer_name: 'Jana Ukázková',
        service_name: 'Střih',
        start: new Date('2026-10-09T08:00:00Z'),
        end: new Date('2026-10-09T09:00:00Z'),
      },
    },
  },
  {
    title: 'Faktura po splatnosti',
    focus: {
      kind: 'invoice',
      invoice: { id: 'ukazka', number: '2026-000004', customer_name: 'Marta Dnešní', amount: 1850, currency: 'CZK', due_on: '2026-10-04', total: 2 },
    },
  },
  { title: 'Nic k řešení', focus: { kind: 'none' } },
]
const DAYS = ['po', 'út', 'st', 'čt', 'pá', 'so', 'ne']

function Section({
  number,
  label,
  title,
  children,
}: {
  number: string
  label: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="border-t py-14 first:border-t-0 sm:py-20" aria-labelledby={`s-${number}`}>
      <SectionLabel number={number}>{label}</SectionLabel>
      <h2 id={`s-${number}`} className="mt-3 text-[24px] font-semibold tracking-[-0.02em] sm:text-[28px]">
        {title}
      </h2>
      <div className="mt-8">{children}</div>
    </section>
  )
}

function Panel({ title, className, children }: { title?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('rounded-box border bg-surface p-5 sm:p-6', className)}>
      {title && <p className="mb-4 font-num text-[11px] uppercase tracking-[0.1em] text-quiet">{title}</p>}
      {children}
    </div>
  )
}

export function DesignShowcase() {
  const { theme, setPref } = useWsTheme()
  const [commandOpen, setCommandOpen] = useState(false)
  const [date, setDate] = useState<Date | undefined>(new Date(2026, 9, 9))
  const [confirmed, setConfirmed] = useState(false)
  const [stamps, setStamps] = useState(7)
  const [incoming, setIncoming] = useState([{ id: 0, ...SAMPLE_REQUESTS[0] }])
  const [chartKey, setChartKey] = useState(0)
  useCommandShortcut(setCommandOpen)

  const addRequest = () =>
    setIncoming((list) => {
      const id = (list[0]?.id ?? -1) + 1
      return [{ id, ...SAMPLE_REQUESTS[id % SAMPLE_REQUESTS.length] }, ...list].slice(0, 4)
    })

  const confirm = () => {
    setConfirmed(true)
    toast.success('Potvrzeno, zákaznice dostala e-mail.', { undo: () => setConfirmed(false) })
  }

  return (
    <TooltipProvider delayDuration={300}>
      <header className="sticky top-0 z-40 border-b bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-4 px-4 sm:px-6">
          <Logo animated wordmark />
          <span className="hidden font-num text-[11px] uppercase tracking-[0.12em] text-quiet sm:inline">
            Design systém · interní
          </span>
          <div className="ml-auto flex items-center gap-3">
            <Button variant="outline" className="hidden sm:inline-flex" onClick={() => setCommandOpen(true)}>
              <Search size={16} strokeWidth={1.5} />
              Hledat
              <kbd className="ml-1 font-num text-xs text-quiet">⌘K</kbd>
            </Button>
            <Label htmlFor="theme" className="text-sm text-quiet">
              Tmavý režim
            </Label>
            <Switch id="theme" checked={theme === 'dark'} onCheckedChange={(on) => setPref(on ? 'dark' : 'light')} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] px-4 pb-24 sm:px-6">
        <div className="pb-6 pt-14 sm:pt-20">
          <SectionLabel>ZakazIQ · S01</SectionLabel>
          <AccentHeading className="mt-4" accent="v kódu.">
            Dílky
          </AccentHeading>
          <p className="mt-4 max-w-xl text-[17px] text-quiet">
            Tokeny, písma, komponenty a pohyb na jednom místě. Stránka je jen pro vývoj, v produkci neexistuje.
          </p>
        </div>

        {/* 01 — Barvy */}
        <Section number="01" label="Barvy" title="Všechno vychází z loga">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {COLORS.map((c) => (
              <div key={c.name} className="overflow-hidden rounded-chip border bg-surface">
                <div className={cn('h-16', c.cls)} />
                <div className="px-3 py-2">
                  <p className="font-num text-xs font-medium">{c.name}</p>
                  <p className="font-num text-xs text-quiet">{c.hex}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {ROLES.map((r) => (
              <div key={r.name} className={cn('flex h-24 flex-col justify-end rounded-chip p-3', r.cls)}>
                <p className={cn('font-num text-xs font-medium', r.ink)}>{r.name}</p>
                <p className={cn('text-xs opacity-80', r.ink)}>{r.note}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* 02 — Písmo */}
        <Section number="02" label="Písmo" title="Instrument Sans, Serif a JetBrains Mono">
          <div className="space-y-8">
            <div className="relative overflow-hidden rounded-slab bg-navy-950 px-6 py-14 sm:px-12 sm:py-20">
              <TileField />
              <div className="relative">
                <SectionLabel number="01" onDark>
                  Co to umí
                </SectionLabel>
                <AccentHeading size="hero" onDark accent="na svém místě." className="mt-5 max-w-4xl">
                  Každá poptávka
                </AccentHeading>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Button variant="inverse" size="lg">
                    Vyzkoušet 14 dní zdarma
                  </Button>
                </div>
              </div>
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <Panel title="Landing · H2 56">
                <AccentHeading as="h3" size="section" accent="bez tabulek.">
                  Přehled
                </AccentHeading>
              </Panel>
              <Panel title="Aplikace · nadpis 40 / 28">
                <AccentHeading as="h3" accent="9. října">
                  Dnes
                </AccentHeading>
                <AccentHeading as="h3" size="title" className="mt-4">
                  Zákazníci
                </AccentHeading>
              </Panel>
              <Panel title="Tělo 17 / 15 · drobné 13">
                <p className="text-[17px] leading-relaxed">
                  Poptávka z webu se sama objeví v kalendáři. Potvrdíte ji jedním klepnutím a zákazník dostane e-mail.
                </p>
                <p className="mt-3 text-[15px] leading-relaxed text-quiet">
                  V aplikaci je text menší, ať se vejde víc na jednu obrazovku telefonu.
                </p>
                <p className="mt-3 text-[13px] text-quiet">Naposledy uloženo před chvílí</p>
              </Panel>
              <Panel title="Mono · částky, časy, štítky">
                <div className="space-y-2 text-[15px]">
                  <p>
                    <Money amount={1249} /> · <Money amount={249.5} /> · <Money amount={24900} minor /> ·{' '}
                    <Money amount={120} currency="EUR" />
                  </p>
                  <p>
                    <TimeRange start="2026-10-09T07:00:00Z" end="2026-10-09T08:30:00Z" /> ·{' '}
                    <TimeRange start="2026-10-09T12:15:00Z" />
                  </p>
                  <SectionLabel number="03">Ceník</SectionLabel>
                </div>
              </Panel>
            </div>
          </div>
        </Section>

        {/* 03 — Tvary */}
        <Section number="03" label="Tvary" title="Pilulky, dílky a karty">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {RADII.map((r) => (
              <div key={r.name} className="flex flex-col gap-2">
                <div className={cn('aspect-square border-2 border-navy-700 bg-navy-50 dark:bg-navy-900', r.cls)} />
                <p className="font-num text-xs">
                  {r.name} <span className="text-quiet">{r.px}</span>
                </p>
              </div>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-6">
            <span className="inline-flex items-center gap-2 text-sm">
              <TileGlyph /> Kadeřnictví
            </span>
            <span className="inline-flex items-center gap-2 text-sm">
              <TileGlyph /> Zámečnictví
            </span>
            <span className="inline-flex items-center gap-2 text-sm">
              <TileGlyph /> Studnařství
            </span>
            <Logo size={24} />
            <Logo size={32} />
            <Logo size={48} animated />
          </div>
        </Section>

        {/* 04 — Tlačítka */}
        <Section number="04" label="Tlačítka" title="Jedna hlavní akce na obrazovce">
          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Aplikace">
              <div className="flex flex-wrap items-center gap-3">
                <Button>
                  <Plus size={18} strokeWidth={1.5} />
                  Nová poptávka
                </Button>
                <Button variant="outline">Upravit</Button>
                <Button variant="ghost">Zrušit</Button>
                <Button variant="danger">
                  <Trash2 size={16} strokeWidth={1.5} />
                  Smazat
                </Button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="icon" aria-label="Kopírovat odkaz">
                      <Copy size={18} strokeWidth={1.5} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Kopírovat odkaz</TooltipContent>
                </Tooltip>
                <Button disabled>Uložit</Button>
              </div>
            </Panel>
            <div className="relative overflow-hidden rounded-box bg-navy-950 p-6">
              <p className="mb-4 font-num text-[11px] uppercase tracking-[0.1em] text-navy-400">Landing · tmavá plocha</p>
              <div className="flex flex-wrap gap-3">
                <Button variant="inverse" size="lg">
                  Začít zdarma
                </Button>
                <Button variant="ghost" size="lg" className="text-white hover:bg-navy-800">
                  Jak to funguje
                </Button>
              </div>
            </div>
          </div>
        </Section>

        {/* 05 — Formuláře */}
        <Section number="05" label="Formuláře" title="Pole, výběry a přepínače">
          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Nová poptávka" className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="f-name">Jméno zákazníka</Label>
                <Input id="f-name" placeholder="Např. Tereza Malá" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="f-phone">Telefon</Label>
                <Input id="f-phone" defaultValue="777 12" aria-invalid="true" aria-describedby="f-phone-err" />
                <p id="f-phone-err" className="text-sm text-danger dark:text-navy-50">
                  Telefon má 9 číslic. Doplňte ho prosím.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="f-service">Služba</Label>
                <Select defaultValue="strih">
                  <SelectTrigger id="f-service">
                    <SelectValue placeholder="Vyberte službu" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="strih">Střih a foukaná</SelectItem>
                    <SelectItem value="barveni">Barvení</SelectItem>
                    <SelectItem value="melir">Melír</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Den</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-between rounded-chip px-3.5 font-normal">
                      <span className="inline-flex items-center gap-2">
                        <CalendarDays size={18} strokeWidth={1.5} className="text-quiet" />
                        {date ? date.toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric' }) : 'Vyberte den'}
                      </span>
                      <ChevronDown size={18} strokeWidth={1.5} className="text-quiet" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-3" align="start">
                    <Calendar mode="single" selected={date} onSelect={setDate} defaultMonth={date} />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="flex items-center gap-3">
                <Checkbox id="f-mail" defaultChecked />
                <Label htmlFor="f-mail" className="font-normal">
                  Poslat zákazníkovi potvrzení e-mailem
                </Label>
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="f-loyal" className="font-normal">
                  Věrnostní karta
                </Label>
                <Switch id="f-loyal" defaultChecked />
              </div>
              <Button className="w-full sm:w-auto">Uložit poptávku</Button>
            </Panel>

            <div className="space-y-6">
              <Panel title="Přepínač · štítky">
                <Tabs defaultValue="den">
                  <TabsList>
                    <TabsTrigger value="den">Den</TabsTrigger>
                    <TabsTrigger value="tyden">Týden</TabsTrigger>
                    <TabsTrigger value="mesic">Měsíc</TabsTrigger>
                  </TabsList>
                  <TabsContent value="den" className="text-[15px] text-quiet">
                    Dnes máte 4 termíny.
                  </TabsContent>
                  <TabsContent value="tyden" className="text-[15px] text-quiet">
                    Tento týden 17 termínů.
                  </TabsContent>
                  <TabsContent value="mesic" className="text-[15px] text-quiet">
                    V říjnu zatím 52 termínů.
                  </TabsContent>
                </Tabs>
                <Separator className="my-5" />
                <div className="flex flex-wrap gap-2">
                  <Badge variant="signal">
                    <LiveDot /> Nová
                  </Badge>
                  <Badge variant="confirmed">Potvrzeno</Badge>
                  <Badge variant="strong">Hotovo</Badge>
                  <Badge>Čeká</Badge>
                  <Badge variant="outline">Stálí</Badge>
                  <Badge variant="danger">Po splatnosti</Badge>
                </div>
              </Panel>
              <Panel title="Načítání">
                <div className="flex items-center gap-4">
                  <Skeleton className="h-11 w-11 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-4 w-1/3" />
                  </div>
                </div>
              </Panel>
              <Panel title="Kalendář">
                <Calendar mode="single" selected={date} onSelect={setDate} defaultMonth={date} />
              </Panel>
            </div>
          </div>
        </Section>

        {/* 06 — Překryvy */}
        <Section number="06" label="Překryvy" title="Dialog, panel, menu a upozornění">
          <Panel>
            <div className="flex flex-wrap gap-3">
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline">Dialog</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Nová služba</DialogTitle>
                    <DialogDescription>Zákazníci ji uvidí na objednávací stránce.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-2">
                    <Label htmlFor="d-name">Název</Label>
                    <Input id="d-name" placeholder="Např. Dámský střih" />
                  </div>
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button variant="ghost">Zrušit</Button>
                    </DialogClose>
                    <DialogClose asChild>
                      <Button onClick={() => toast.success('Služba přidána')}>Přidat službu</Button>
                    </DialogClose>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline">Pravý panel</Button>
                </SheetTrigger>
                <SheetContent>
                  <SheetHeader>
                    <SheetTitle>Tereza Malá</SheetTitle>
                    <SheetDescription>Stálá zákaznice · 12 návštěv</SheetDescription>
                  </SheetHeader>
                  <LoyaltyCard customer="Tereza Malá" stamps={9} reward="Střih zdarma" />
                  <div className="space-y-2 text-[15px]">
                    <p className="flex justify-between">
                      <span className="text-quiet">Poslední návštěva</span>
                      <span className="font-num">2. 10.</span>
                    </p>
                    <p className="flex justify-between">
                      <span className="text-quiet">Utratila celkem</span>
                      <Money amount={8640} />
                    </p>
                  </div>
                  <SheetFooter>
                    <Button className="w-full">Přidat termín</Button>
                  </SheetFooter>
                </SheetContent>
              </Sheet>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline">Popover</Button>
                </PopoverTrigger>
                <PopoverContent>
                  <p className="text-sm font-semibold">Odkaz na objednání</p>
                  <p className="mt-1 text-sm text-quiet">Dejte ho na web nebo do Instagramu.</p>
                  <Button size="md" className="mt-3 w-full" onClick={() => toast.success('Odkaz zkopírován')}>
                    <Copy size={16} strokeWidth={1.5} />
                    Kopírovat odkaz
                  </Button>
                </PopoverContent>
              </Popover>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" aria-label="Další akce">
                    <MoreHorizontal size={18} strokeWidth={1.5} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuLabel>Termín</DropdownMenuLabel>
                  <DropdownMenuItem>
                    <CalendarDays size={16} strokeWidth={1.5} /> Přesunout
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Copy size={16} strokeWidth={1.5} /> Kopírovat odkaz
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    tone="danger"
                    onSelect={() => toast.message('Termín zrušen', { undo: () => toast.success('Termín vrácen') })}
                  >
                    <Trash2 size={16} strokeWidth={1.5} /> Zrušit termín
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Button
                variant="outline"
                onClick={() => toast.error('Tenhle čas už je obsazený.', { description: 'Vyberte prosím jiný.' })}
              >
                Chybová hláška
              </Button>
              <Button variant="outline" onClick={() => setCommandOpen(true)}>
                <Search size={16} strokeWidth={1.5} /> Hledat (⌘K)
              </Button>
            </div>
          </Panel>

          <CommandDialog open={commandOpen} onOpenChange={setCommandOpen}>
            <CommandInput placeholder="Hledat zákazníka, termín nebo obrazovku…" />
            <CommandList>
              <CommandEmpty>Nic jsme nenašli. Zkuste jméno nebo telefon.</CommandEmpty>
              <CommandGroup heading="Zákazníci">
                {SAMPLE_REQUESTS.map((r) => (
                  <CommandItem key={r.customer} onSelect={() => setCommandOpen(false)}>
                    <Users size={16} strokeWidth={1.5} /> {r.customer}
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup heading="Obrazovky">
                <CommandItem onSelect={() => setCommandOpen(false)}>
                  <Inbox size={16} strokeWidth={1.5} /> Poptávky
                  <CommandShortcut>G P</CommandShortcut>
                </CommandItem>
                <CommandItem onSelect={() => setCommandOpen(false)}>
                  <Settings size={16} strokeWidth={1.5} /> Nastavení
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </CommandDialog>
        </Section>

        {/* 07 — Dílky */}
        <Section number="07" label="Komponenty" title="Poptávka, termín a věrnostní karta">
          <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
            <Panel title="Kalendář · pá 9. 10.">
              <div className="grid grid-cols-[48px_1fr] gap-x-3 gap-y-3">
                <span className="pt-3 font-num text-xs text-quiet">9:00</span>
                <AnimatePresence mode="wait" initial={false}>
                  {confirmed ? (
                    <motion.div key="ok" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
                      <ConfirmedBlock {...SAMPLE_REQUESTS[0]} />
                    </motion.div>
                  ) : (
                    <motion.div key="new" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
                      <NewRequestBlock {...SAMPLE_REQUESTS[0]} appear>
                        <Button onClick={confirm}>Potvrdit termín</Button>
                      </NewRequestBlock>
                    </motion.div>
                  )}
                </AnimatePresence>
                <span className="pt-3 font-num text-xs text-quiet">11:30</span>
                <ConfirmedBlock {...SAMPLE_REQUESTS[1]} />
                <span className="pt-3 font-num text-xs text-quiet">13:00</span>
                <div className="rounded-chip bg-navy-50 px-3 py-3 text-sm text-quiet dark:bg-navy-900">Oběd · blokováno</div>
              </div>
            </Panel>

            <div className="space-y-6">
              <Panel title="Věrnostní karta">
                <LoyaltyCard customer="Tereza Malá" business="Salon Lucie" stamps={stamps} reward="Střih zdarma" />
                <div className="mt-5 flex flex-wrap gap-3">
                  <Button onClick={() => setStamps((s) => Math.min(s + 1, 10))} disabled={stamps >= 10}>
                    Přidat razítko
                  </Button>
                  <Button variant="ghost" onClick={() => setStamps(0)}>
                    <RotateCcw size={16} strokeWidth={1.5} /> Začít znovu
                  </Button>
                </div>
              </Panel>
              <Panel title="Právě dorazilo">
                <p className="inline-flex items-center gap-2.5 text-[15px]">
                  <LiveDot /> Nová poptávka od Jana Dvořáka
                </p>
              </Panel>
            </div>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <EmptyState
              title="Zatím žádná poptávka"
              description="Zkopírujte odkaz na objednání a dejte ho na web nebo do Instagramu."
              action={
                <Button onClick={() => toast.success('Odkaz zkopírován')}>
                  <Copy size={16} strokeWidth={1.5} /> Kopírovat odkaz
                </Button>
              }
            />
            <EmptyState
              size="large"
              title="Tady budou vaši zákazníci"
              description="Přidají se sami s první poptávkou. Nebo je nahrajte z tabulky."
              action={<Button variant="inverse">Nahrát zákazníky</Button>}
            />
          </div>
        </Section>

        {/* 08 — Pohyb */}
        <Section number="08" label="Pohyb" title="Animuje se jen změna stavu">
          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Nová poptávka v seznamu · 600 ms">
              <Button variant="outline" onClick={addRequest}>
                <Plus size={16} strokeWidth={1.5} /> Přidat poptávku
              </Button>
              <ul className="mt-5 space-y-2">
                <AnimatePresence initial={false}>
                  {incoming.map((r, i) => (
                    <motion.li key={r.id} layout {...zqIn}>
                      {i === 0 ? (
                        <NewRequestBlock start={r.start} end={r.end} customer={r.customer} service={r.service} />
                      ) : (
                        <ConfirmedBlock start={r.start} end={r.end} customer={r.customer} service={r.service} />
                      )}
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            </Panel>
            <Panel title="Graf · sloupce rostou zdola">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-quiet">Příjmy tento týden</p>
                  <Money amount={18450} className="text-2xl font-medium" />
                </div>
                <Button variant="ghost" size="icon" aria-label="Přehrát znovu" onClick={() => setChartKey((k) => k + 1)}>
                  <RotateCcw size={18} strokeWidth={1.5} />
                </Button>
              </div>
              <div key={chartKey} className="mt-6 flex h-40 items-end gap-3">
                {CHART.map((h, i) => (
                  <div key={i} className="flex h-full flex-1 flex-col items-center gap-2">
                    <div className="flex w-full flex-1 items-end">
                      <div
                        className={cn(
                          'w-full origin-bottom rounded-t-tiny animate-zq-grow',
                          i === 5 ? 'bg-navy-700 dark:bg-navy-400' : 'bg-navy-100 dark:bg-navy-800',
                        )}
                        style={{ height: `${h}%`, animationDelay: `${i * 120}ms` }}
                      />
                    </div>
                    <span className="font-num text-[11px] text-quiet">{DAYS[i]}</span>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </Section>

        <Section number="09" label="Obrazovky" title="Hlavička, přepínač a hlavní věc na Dnes">
          <div className="grid gap-6">
            <Panel title="PageHeader · jedna hlavní akce vpravo">
              <PageHeader
                title="Poptávky"
                accent="na jednom místě."
                subtitle="3 nové poptávky · 2 termíny dnes"
                action={
                  <Button>
                    <Plus aria-hidden size={18} strokeWidth={1.5} />
                    Nová rezervace
                  </Button>
                }
              />
            </Panel>
            <div className="grid gap-6 lg:grid-cols-2">
              <Panel title="PillNav · chips (stavy, skupiny)">
                <PillNav
                  label="Ukázka stavů"
                  items={[
                    { key: 'a', label: 'Nové', href: '#', active: true, count: 3 },
                    { key: 'b', label: 'Potvrzené', href: '#', active: false, count: 12 },
                    { key: 'c', label: 'Vyřízené', href: '#', active: false, count: 48 },
                  ]}
                />
              </Panel>
              <Panel title="PillNav · segmented (pohled)">
                <PillNav
                  variant="segmented"
                  label="Ukázka pohledu"
                  items={[
                    { key: 'a', label: 'Den', href: '#', active: false },
                    { key: 'b', label: 'Týden', href: '#', active: true },
                    { key: 'c', label: 'Měsíc', href: '#', active: false },
                  ]}
                />
              </Panel>
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              {FOCUS_CASES.map((c) => (
                <Panel key={c.title} title={c.title}>
                  <TodayFocus
                    focus={c.focus}
                    today={FOCUS_TODAY}
                    now={FOCUS_NOW}
                    actions={{ slug: 'ukazka', calendar: true, jobs: false }}
                    hrefs={{ request: () => '#', visit: () => '#', invoices: '#' }}
                  />
                </Panel>
              ))}
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <Panel title="EmptyState · výchozí">
                <EmptyState title="Zatím nic vyřízeného" description="Tady budou odmítnuté poptávky a ty, jejichž termín už proběhl." />
              </Panel>
              <Panel title="EmptyState · compact">
                <EmptyState size="compact" title="Žádná nová poptávka" description="Až přijde z webu, ukáže se tady a v kalendáři." />
              </Panel>
            </div>
          </div>
        </Section>
      </main>
    </TooltipProvider>
  )
}
