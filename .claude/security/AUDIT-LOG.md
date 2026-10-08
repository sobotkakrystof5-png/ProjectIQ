# Audity a incidenty

> Jen historie. Audity, code review, incidenty, rotace klíčů.

Formát:

```
## YYYY-MM-DD — audit | review | incident
Spouštěč: deploy / měsíční / hlášení / alert
Rozsah: co se kontrolovalo
Výsledek: X OK / Y varování / Z chyb, nebo popis
Nálezy: skutečné nálezy
Opraveno: co se změnilo, commit
Zůstává: co zůstává a proč
```

---

## 2026-10-08 — audit (lokální, zavedení základu S02)
Spouštěč: zavedení bezpečnostního základu.
Rozsah: hlavičky přes `curl` na produkčním buildu (`next start`) pro `/login`, `/dashboard`, `/w/_design`, `/r/*`, `/p/[token]`, `/api/invoices/[id]/pdf`, `/embed/*`, `/api/public/v1/*`, `/.well-known/security.txt`; průchod 30 admin stránek v headless Chromu s CSP hlášeními; `gitleaks git` přes celou historii; kontrola trackovaných `.env*` souborů a `NEXT_PUBLIC_` proměnných; `npm audit --omit=dev`.
Výsledek: hlavičky odpovídají STATE.md na všech cestách; nonce na všech skriptech dynamických stránek; admin přihlášení beze změny (bez session 307 → `/api/auth/signin`, se session 200).
Nálezy:
- `/login` statický → skripty bez nonce (brání vynucení admin CSP).
- Sonda `unsafe-eval` ze Zod 4 na portálu (neškodná).
- `X-Frame-Options: DENY` platil i pro PDF faktury → náhled v `<object>` na detailu faktury v Chromu nejspíš nefungoval ani před S02 (neověřeno na produkci).
- gitleaks: 90 commitů, žádný únik. Trackované `.env.example` a `.env.local.example` obsahují jen prázdné hodnoty.
- `npm audit --omit=dev`: 11 zranitelností (1 critical `next` 14) — beze změny proti 2026-10-08 ráno.
- Bez `favicon.ico` (404 v konzoli) — kosmetické.
Opraveno: `X-Frame-Options: SAMEORIGIN` pro `/api/invoices/:id/pdf`; `poweredByHeader: false`; `.gitignore` na všechny `.env*` kromě vzorů, `*.key`, `*.p12`. Commit „security: základní hlavičky a paměť".
Zůstává: viz STATE.md → Otevřené položky (vynucení admin CSP, DNS, živý audit `security-check.sh` po nasazení).

## Incidenty

(zatím žádné)
