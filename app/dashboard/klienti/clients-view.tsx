import Link from "next/link";
import { ChevronRight, Globe, Building2 } from "lucide-react";
import type { ClientRow } from "@/lib/ws/admin/clients";
import { cn } from "@/lib/utils";
import { InviteClientForm } from "./invite-form";
import { ACCESS_CLASS, ACCESS_LABEL, ago, plural } from "./labels";

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
  failed,
  industries,
}: {
  clients: ClientRow[];
  failed: boolean;
  industries: { key: string; label: string }[];
}) {
  const count = (access: string) =>
    clients.filter((c) => c.access === access).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">
            Klienti
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Účty ZakazIQ Workspace — stav předplatného, aktivita a napojený web.
          </p>
        </div>
        <InviteClientForm industries={industries} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Účtů" value={clients.length} />
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
                  <span
                    className={cn(
                      "inline-flex text-[11px] font-medium px-2 py-0.5 rounded-full ring-1",
                      ACCESS_CLASS[c.access],
                    )}
                  >
                    {ACCESS_LABEL[c.access]}
                  </span>
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
    </div>
  );
}
