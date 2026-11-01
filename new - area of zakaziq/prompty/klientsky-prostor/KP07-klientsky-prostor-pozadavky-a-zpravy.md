# KP07 — Klientský prostor III: požadavky a zprávy pod přihlášením

## Cíl
Klient napíše nebo nadiktuje požadavek ve svém prostoru, vidí, co poslal a v jakém je to stavu, a může si s Kryštofem vyměňovat krátké zprávy. Kryštof dostane stejný inbox jako dnes a vloží zadání do Claude Code sám.

## Než začneš
Rituál začátku (`zakaziq-memory`). Přečti `docs/klientsky-prostor/PLAN.md` 3, 4.1, 4.4, 5, R-069, `.claude/security/DECISIONS.md` #018, výsledky KP05 a KP06 v paměti, a hotový první krok: `lib/{client-requests,client-request-ai,transcribe}.ts`, `components/{ClientRequestBlock,ClientRequestCard}.tsx`, `submitClientRequest` v `app/portal-actions.ts`, `app/api/public/portal/[token]/transcribe/route.ts`, `app/dashboard/pozadavky/`.
Skilly: `zakaziq-workspace-backend`, `zakaziq-design-dilky`, `zakaziq-ux-texty-cs`, `web-security-review`.
**Zadání výslovně povoluje změny v:** `app/dashboard/pozadavky/`, `components/ClientRequestCard.tsx`, detailu zakázky (záložky Požadavky a Zprávy), `lib/notifications.ts`. Stávající `/p` požadavky ponech funkční.

## Kroky
1. **Datový tok (migrace, první volné číslo, jen připravit).** `portal.requests` (klient zapisuje přes `portal_app`: text, zdroj, projekt své firmy, autor) a `portal.messages` (obousměrné krátké zprávy). Do `public.client_requests` se požadavek dostane **úzkou `SECURITY DEFINER` funkcí** s kontrolou členství, limitem a Zodem, takže admin inbox z prvního kroku funguje beze změny. Stav a odpověď Kryštofa se vrací do `portal` triggerem jen ve schváleném tvaru. Rozhodni a zapiš, zda zprávy žijí jen v `portal`, nebo i v `public` (výchozí: v `public` jen kopie pro admina přes funkci).
2. **Formulář v prostoru.** Přesuň `ClientRequestBlock` do `/klient/p/<id>` (stejné chování: text, nadiktování, přepis ke kontrole). Přepis hlasu volá endpoint s přihlášením místo tokenu (nový route handler, limity po členovi a po firmě, audio se neukládá). Historie „co jsem poslal“ se stavem (Přijato · Řeší se · Hotovo) a odpovědí.
3. **Zprávy.** Jednoduché vlákno u projektu, bez příloh. Odpověď Kryštofa z adminu (záložka Zprávy). E-mail jen jako upozornění „máte novou zprávu“ (bez textu zprávy), ať se citlivé věci neposílají e-mailem.
4. **Kryštofova strana.** Inbox z prvního kroku dostane zdroj „klientský prostor“, jméno člena a vlákno; „Odpovědět“ otevře zprávu. Zadání pro Claude Code se skládá jako dnes (`buildClaudeCodePrompt`), včetně citace jako nedůvěryhodného podkladu.
5. **Obrana vstupu.** Zod a délky, rate limit na člena i firmu, AI shrnutí s oddělenou citací a odstraněnými značkami, žádné automatické spuštění ničeho. Nahrávka nikdy do úložiště. Text zprávy nelogovat.
6. **Texty a UX.** Jedna hlavní akce, krátké věty, žádný žargon, chyby česky; mikrofon se ukáže jen při podpoře a nastaveném klíči.
7. **Testy:** klient píše jen do projektů své firmy; cizí `project_id` je odmítnut; požadavek se objeví v admin inboxu s kopií; stav se vrací ke klientovi bez interních polí; rate limity; přepis bez klíče vrací 503; hlas se neukládá.
8. **Paměť.** `web-security-review`, aktualizace `DECISIONS.md` #018 (nový způsob ověření), changelog, `docs/AGENTS-REFERENCE.md`, `docs/admin/AGENTS-ADMIN.md`, stav v plánu.

## Hotovo, když
- Člen firmy pošle požadavek (text i hlasem) ve svém prostoru, Kryštof ho vidí v inboxu s hotovým zadáním a může odpovědět.
- Klient vidí stav svého požadavku a odpověď; cizí firma ho nevidí (test).
- Původní `/p` tok funguje dál.
- `tsc`, `npm test`, `build:check` procházejí; migrace připravená (aplikace: Kryštof).

## Konec sezení
`zakaziq-memory` → Konec sezení (migrace: aplikována ne). Commit na požádání, např. `ws/klient: požadavky a zprávy pod přihlášením`.
