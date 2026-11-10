#!/usr/bin/env bash
# Jednorázový přenos DAT z Neonu do Supabase (R-080, docs/supabase/SETUP.md).
#
# Schéma v Supabase už stojí: migrace 000–104 jsou nahrané (2026-11-07).
# Skript proto přenáší jen řádky — do schématu, které vzniklo z migrací, ne
# z kopie Neonu. Sloupce navíc v Supabase (z migrací 097–104) dostanou výchozí
# hodnotu; když Neon má sloupec, který Supabase nezná, skript to vypíše a nic
# nenahraje.
#
#   NEON_DATABASE_URL=… SUPABASE_DB_URL=… bash scripts/neon-to-supabase.sh          jen kontroly + dump
#   NEON_DATABASE_URL=… SUPABASE_DB_URL=… bash scripts/neon-to-supabase.sh --ano    + nahrání + porovnání
#
# NEON_DATABASE_URL  vlastník tabulek v Neonu (neondb_owner), stačí čtení
# SUPABASE_DB_URL    role postgres v Supabase přes přímé spojení nebo Session
#                    pooler (port 5432) — NE Transaction pooler (6543), ten
#                    neunese jednu dlouhou transakci
#
# Přenáší řádky schémat public (admin), ws (Workspace) a portal (klientský
# prostor). Cíl musí mít všechny tabulky prázdné — skript nic nepřepisuje ani
# nemaže. Nahrává v jedné transakci s vypnutými triggery a cizími klíči
# (session_replication_role = replica), takže nezáleží na pořadí tabulek
# a synchronizační triggery portálu nic nezdvojí. Hesla nevypisuje.
#
# Potřebuje pg_dump a psql verze 18+ — pg_dump nesmí být starší než server Neonu (18).
# macOS: brew install libpq && brew link --force libpq.

set -euo pipefail

: "${NEON_DATABASE_URL:?Chybí NEON_DATABASE_URL (connection string Neonu)}"
: "${SUPABASE_DB_URL:?Chybí SUPABASE_DB_URL (Supabase, přímé spojení nebo Session pooler 5432)}"

for bin in pg_dump psql; do
  command -v "$bin" >/dev/null || { echo "✗ Chybí $bin (brew install libpq && brew link --force libpq)"; exit 1; }
done
major=$(pg_dump --version | grep -oE '[0-9]+' | head -1)
if [ "$major" -lt 18 ]; then echo "✗ pg_dump je verze $major, potřeba 18+ (Neon běží na Postgresu 18)"; exit 1; fi

case "$SUPABASE_DB_URL" in
  *:6543/*) echo "✗ SUPABASE_DB_URL míří na Transaction pooler (6543). Použijte přímé spojení nebo Session pooler (5432)."; exit 1 ;;
esac

# Která schémata přenést. Výchozí public (admin) a portal (klientský prostor).
# ws (Workspace) jen na vyžádání: od migrace 100 má ws.members sloupec user_id
# místo clerk_user_id a účty z doby Clerku se stejně nikdo nepřihlásí (R-080).
#   PRENOS_SCHEMATA="public ws portal" … jen do schématu před migrací 100
PRENOS_SCHEMATA="${PRENOS_SCHEMATA:-public portal}"
SCHEMAS=()
IN_LIST=""
for s in $PRENOS_SCHEMATA; do
  case "$s" in public|ws|portal) ;; *) echo "✗ Neznámé schéma: $s (jen public, ws, portal)"; exit 1 ;; esac
  SCHEMAS+=("--schema=$s")
  IN_LIST="${IN_LIST:+$IN_LIST, }'$s'"
done
[ -n "$IN_LIST" ] || { echo "✗ PRENOS_SCHEMATA je prázdné"; exit 1; }
echo "Schémata: $PRENOS_SCHEMATA"
out_dir=$(mktemp -d)
dump="$out_dir/zakaziq-data.sql"

# Sloupce (schéma.tabulka.sloupec) obou databází — bez generovaných, ty se nepřenáší.
COLUMNS_SQL="SELECT table_schema || '.' || table_name || '.' || column_name
  FROM information_schema.columns
  WHERE table_schema IN ($IN_LIST) AND is_generated = 'NEVER'
    AND (table_schema, table_name) IN (
      SELECT schemaname, tablename FROM pg_tables WHERE schemaname IN ($IN_LIST))
  ORDER BY 1"

echo "▶ Spojení"
psql "$NEON_DATABASE_URL" -X -Atc "SELECT 1" >/dev/null || { echo "✗ K Neonu se nejde připojit"; exit 1; }
psql "$SUPABASE_DB_URL" -X -Atc "SELECT 1" >/dev/null || { echo "✗ K Supabase se nejde připojit"; exit 1; }
echo "  ✓ Neon i Supabase odpovídají"

echo "▶ Schéma v Supabase (migrace 000–104)"
ready=$(psql "$SUPABASE_DB_URL" -X -Atc "SELECT to_regclass('public.projects') IS NOT NULL AND to_regclass('portal.feedback') IS NOT NULL")
if [ "$ready" != "t" ]; then
  echo "✗ V Supabase chybí schéma. Nejdřív migrace 000–104 (docs/supabase/SETUP.md)."
  exit 1
fi
echo "  ✓ schéma stojí"

echo "▶ Porovnání sloupců"
# Řazení přes sort (LC_ALL=C), ne přes ORDER BY — Neon a Supabase můžou mít jinou collation a comm by pak lhal.
psql "$NEON_DATABASE_URL" -X -Atc "$COLUMNS_SQL" | LC_ALL=C sort > "$out_dir/neon.cols"
psql "$SUPABASE_DB_URL" -X -Atc "$COLUMNS_SQL" | LC_ALL=C sort > "$out_dir/supabase.cols"
missing=$(LC_ALL=C comm -23 "$out_dir/neon.cols" "$out_dir/supabase.cols" || true)
extra=$(LC_ALL=C comm -13 "$out_dir/neon.cols" "$out_dir/supabase.cols" || true)
if [ -n "$missing" ]; then
  echo "✗ Tyhle sloupce má Neon, ale Supabase ne — data by se do nich nevešla:"
  echo "$missing" | sed 's/^/    /'
  echo "  Nic se nenahrálo. Nejspíš chybí migrace, která na Neonu proběhla ručně."
  exit 1
fi
if [ -n "$extra" ]; then
  echo "  i Sloupce navíc v Supabase (dostanou výchozí hodnotu):"
  echo "$extra" | sed 's/^/    /'
fi
echo "  ✓ všech $(wc -l < "$out_dir/neon.cols" | tr -d ' ') sloupců z Neonu má v Supabase své místo"

echo "▶ Cíl musí být prázdný"
psql "$SUPABASE_DB_URL" -X -q -v ON_ERROR_STOP=1 -c "
DO \$\$
DECLARE r record; n bigint;
BEGIN
  FOR r IN SELECT schemaname, tablename FROM pg_tables WHERE schemaname IN ($IN_LIST) LOOP
    EXECUTE format('SELECT count(*) FROM %I.%I', r.schemaname, r.tablename) INTO n;
    IF n > 0 THEN
      RAISE EXCEPTION 'Tabulka %.% v Supabase už má % řádků. Přenos jde jen do prázdných tabulek.', r.schemaname, r.tablename, n;
    END IF;
  END LOOP;
END
\$\$;" || exit 1
echo "  ✓ všechny tabulky prázdné"

echo "▶ Dump dat z Neonu (public, ws, portal)"
pg_dump "$NEON_DATABASE_URL" "${SCHEMAS[@]}" --data-only --no-owner --no-privileges \
  --no-publications --no-subscriptions --format=plain --file="$dump"
# Neon běží na Postgresu 18, Supabase na 17: nastavení, které 17 nezná, pryč.
sed -i.bak -e '/^SET transaction_timeout = /d' "$dump" && rm -f "$dump.bak"
echo "  ✓ $(wc -l < "$dump" | tr -d ' ') řádků v $dump"

if [ "${1:-}" != "--ano" ]; then
  echo
  echo "Nic se nenahrálo. Pro nahrání do Supabase spusťte znovu s --ano."
  exit 0
fi

echo "▶ Nahrání do Supabase (jedna transakce — při chybě se nic nezapíše)"
psql "$SUPABASE_DB_URL" -X -q -v ON_ERROR_STOP=1 --single-transaction \
  -c "SET session_replication_role = replica" -f "$dump"

echo "▶ Porovnání počtu řádků"
count_sql=$(psql "$NEON_DATABASE_URL" -X -Atc "
  SELECT format('SELECT %L || '' '' || count(*) FROM %I.%I;', schemaname || '.' || tablename, schemaname, tablename)
  FROM pg_tables WHERE schemaname IN ($IN_LIST) ORDER BY 1")
echo "$count_sql" | psql "$NEON_DATABASE_URL" -X -At | LC_ALL=C sort > "$out_dir/neon.counts"
echo "$count_sql" | psql "$SUPABASE_DB_URL" -X -At | LC_ALL=C sort > "$out_dir/supabase.counts"
if ! diff -u "$out_dir/neon.counts" "$out_dir/supabase.counts" > "$out_dir/counts.diff"; then
  echo "✗ Počty řádků nesedí:"
  grep -E '^[-+][a-z]' "$out_dir/counts.diff" | sed 's/^/    /'
  exit 1
fi
rows=$(awk '{s += $2} END {print s}' "$out_dir/neon.counts")
echo "  ✓ všech $(wc -l < "$out_dir/neon.counts" | tr -d ' ') tabulek sedí ($rows řádků)"
echo
echo "Hotovo. Další kroky (docs/supabase/SETUP.md): admin v Supabase Auth, proměnné ve Vercelu, ověření."
