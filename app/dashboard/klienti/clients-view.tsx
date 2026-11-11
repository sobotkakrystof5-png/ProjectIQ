import Link from "next/link";
import { ChevronRight, Globe, Building2 } from "lucide-react";
import type { ClientRow, ClientList } from "@/lib/ws/admin/clients";
import { cn } from "@/lib/utils";
import { InviteClientForm } from "./invite-form";
import { Badge } from "@/components/ui/badge";
import { PageHeader, PageShell } from "@/components/ws/app/page-header";
import { BILLING_ACCESS_TONE, toneVariant } from "@/lib/admin-status";
import { ACCESS_LABEL, ago, plural } from "./labels";

// Vykreslení /dashboard/klienti (S17) — bez načítání dat, aby šlo ukázat i s ukázkovými daty.

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white border border-border rounded-xl px-4 py-3">
      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </p>
      <p className="text-xl font-semibold text-foreground tabular-nums mt-0.5">
        {value}
      </p>
    </div>
  );
}

export function ClientsView({
  clients,
  total,
  byAccess,
  page,
  pageSize,
  failed,
  industries,
}: {
  clients: ClientRow[];
  total: number;
  byAccess: ClientList["byAccess"];
  page: number;
  pageSize: number;
  failed: boolean;
  industries: { key: string; label: string }[];
}) {
  // Čísla v hlavičce jsou přes všechny účty, ne jen přes otevřenou stránku.
  const count = (access: keyof ClientList["byAccess"]) => byAccess[access] ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <PageShell width="wide">
      <PageHeader
        title="Klienti"
        subtitle="Účty ZakazIQ Workspace: stav předplatného, aktivita a napojený web."
        subtitleFont="sans"
        action={<InviteClientForm industries={industries} />}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Účtů" value={total} />
        <Stat label="Platí" value={count("active")} />
        <Stat label="Zkušební doba" value={count("trialing")} />
        <Stat
          label="Neplatí"
          value={count("none") + count("read_only") + count("grace")}
        />
      </div>

      {failed ? (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
          Data Workspace se nepodařilo načíst. Je aplikovaná migrace 083 a
          nastavená DATABASE_URL?
        </div>
      ) : clients.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center bg-white border border-border rounded-2xl">
          <div className="w-14 h-14 bg-navy-50 rounded-2xl flex items-center justify-center mb-4">
            <Building2 size={24} strokeWidth={1.5} className="text-navy-500" />
          </div>
          <p className="font-medium text-foreground mb-1">Zatím žádný klient</p>
          <p className="text-sm text-muted-foreground max-w-xs">
            Pozvi prvního klienta tlačítkem nahoře, nebo počkej na registraci z
            landing page.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-border rounded-2xl">
          <div className="hidden md:grid border-b border-border grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_8rem_7rem_6rem_5rem_1rem] gap-3 px-4 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
            <span>Účet</span>
            <span>Obor</span>
            <span>Předplatné</span>
            <span>Aktivita</span>
            <span className="text-right">Poptávky 30 d</span>
            <span>Web</span>
            <span />
          </div>
          <div className="divide-y divide-border">
            {clients.map((c) => (
              <Link
                key={c.id}
                href={`/dashboard/klienti/${c.id}`}
                className="grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_8rem_7rem_6rem_5rem_1rem] items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-muted/40 transition-colors group"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-foreground truncate">
                    {c.name}
                  </span>
                  <span className="block text-[12px] text-muted-foreground">
                    {plural(c.businesses, "byznys", "byznysy", "byznysů")} ·{" "}
                    {c.members === 0
                      ? "pozvánka čeká"
                      : plural(c.members, "člen", "členové", "členů")}
                  </span>
                </span>
                <span className="hidden md:block text-sm text-muted-foreground truncate">
                  {c.industries.join(", ") || "—"}
                </span>
                <span>
                  <Badge variant={toneVariant(BILLING_ACCESS_TONE[c.access])}>
                    {ACCESS_LABEL[c.access]}
                  </Badge>
                </span>
                <span className="text-[12px] md:text-sm text-muted-foreground">
                  {ago(c.lastActivity)}
                </span>
                <span className="text-[12px] md:text-sm md:text-right tabular-nums text-foreground">
                  <span className="md:hidden text-muted-foreground">
                    Poptávky 30 d:{" "}
                  </span>
                  {c.requests30d}
                </span>
                <span className="text-[12px] md:text-sm">
                  <span className="md:hidden text-muted-foreground">Web: </span>
                  {c.web === "used" ? (
                    <span className="inline-flex items-center gap-1 text-emerald-700">
                      <Globe size={13} strokeWidth={1.5} />
                      ano
                    </span>
                  ) : c.web === "ready" ? (
                    <span className="text-amber-700">založeno</span>
                  ) : (
                    <span className="text-muted-foreground">ne</span>
                  )}
                </span>
                <ChevronRight
                  size={16}
                  strokeWidth={1.5}
                  className="hidden md:block text-muted-foreground/40 group-hover:text-foreground"
                />
              </Link>
            ))}
          </div>
        </div>
      )}

      {pages > 1 && (
        <nav className="flex items-center justify-between gap-3" aria-label="Stránky klientů">
          <PageLink href={`/dashboard/klienti?strana=${page - 1}`} disabled={page <= 1}>
            Předchozí
          </PageLink>
          <p className="text-sm text-muted-foreground">
            Strana {page} z {pages}
          </p>
          <PageLink href={`/dashboard/klienti?strana=${page + 1}`} disabled={page >= pages}>
            Další
          </PageLink>
        </nav>
      )}
    </PageShell>
  );
}

/** Odkaz na stránku seznamu; vypnutý se nevykreslí jako odkaz. */
function PageLink({ href, disabled, children }: { href: string; disabled: boolean; children: React.ReactNode }) {
  const className =
    "inline-flex min-h-11 items-center rounded-chip border border-border px-4 text-sm font-medium";
  if (disabled) {
    return <span className={cn(className, "text-muted-foreground/50")}>{children}</span>;
  }
  return (
    <Link href={href} className={cn(className, "text-foreground hover:border-navy-300")}>
      {children}
    </Link>
  );
}
