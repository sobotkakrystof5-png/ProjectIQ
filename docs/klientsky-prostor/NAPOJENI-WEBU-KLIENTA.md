# Napojení webu klienta na počítání poptávek (KP17)

> Klient v klientském prostoru uvidí, kolik lidí mu napsalo nebo se objednalo přes web, který jste mu
> postavili, po měsících. Rozhodnutí D-K16 a D-K20 (jen počet), R-129. Kód: `app/api/public/web-udalost/`,
> `lib/client-web/`, migrace 126.

## Co se posílá a co ne

Web po úspěšném odeslání formuláře pošle ze **svého serveru** jednu událost:

```json
{ "druh": "poptavka" }
```

nebo `"objednavka"`. Nic víc. Jméno, e-mail, telefon ani text poptávky do ZakazIQ **nechodí**,
poptávka jde klientovi e-mailem jako dřív. ZakazIQ si ukládá jen zakázku, druh a čas.

**Nepoužívat** `lib/web-leads.ts` ani `/api/public/{alteno,prvotka}-leads`: to je Kryštofova schránka
Poptávky a zákazníci klienta by se v ní objevili jako Kryštofovy poptávky.

## Postup

1. **Admin → zakázka → Přehled → Poptávky z webu → Vytvořit klíč.** Klíč `zk_web_…` se ukáže jednou,
   zkopírujte ho hned. Ve stejné kartě je tlačítko **Zkopírovat návod pro web** (proměnné a kód níže).
2. **Do nastavení serveru webu klienta** (Vercel → Settings → Environment Variables, Production):
   ```
   ZAKAZIQ_URL=https://www.zakaziq.cz
   ZAKAZIQ_WEB_KEY=zk_web_…
   ```
   Nikdy s předponou `NEXT_PUBLIC_`, nikdy do repozitáře. Klíč smí být jen na serveru.
3. **Do webu přidat soubor `lib/zakaziq.ts`:**
   ```ts
   import 'server-only'

   export async function zakaziqUdalost(druh: 'poptavka' | 'objednavka'): Promise<void> {
     const key = process.env.ZAKAZIQ_WEB_KEY
     if (!key) return
     try {
       await fetch(`${process.env.ZAKAZIQ_URL ?? 'https://www.zakaziq.cz'}/api/public/web-udalost`, {
         method: 'POST',
         headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
         body: JSON.stringify({ druh }),
         cache: 'no-store',
         signal: AbortSignal.timeout(2000),
       })
     } catch {
       // Počítadlo nikdy nesmí zastavit odeslání formuláře.
     }
   }
   ```
4. **Ve serverové akci formuláře** (nebo v route handleru), až když se poptávka opravdu odeslala:
   ```ts
   import { after } from 'next/server'
   import { zakaziqUdalost } from '@/lib/zakaziq'

   // … e-mail klientovi odešel v pořádku …
   after(() => zakaziqUdalost('poptavka'))
   ```
   `after()` pošle událost až po odpovědi návštěvníkovi, takže formulář nečeká. Objednávka (rezervace,
   e-shop) posílá `'objednavka'`.
5. **Zkouška.** V kartě **Zkušební příkaz** zkopíruje:
   ```bash
   curl -sS -X POST https://www.zakaziq.cz/api/public/web-udalost \
     -H "authorization: Bearer $ZAKAZIQ_WEB_KEY" \
     -H "content-type: application/json" \
     -d '{"druh":"poptavka","test":true}'
   ```
   Odpověď `{"ok":true}`, v kartě se objeví „Zkušební událost dorazila …". Do čísel se nepočítá.

## Pravidla vstupu

| | |
|---|---|
| Adresa | `POST /api/public/web-udalost` |
| Klíč | `Authorization: Bearer zk_web_…` (jen hlavička, nikdy v adrese) |
| Tělo | JSON do 1 kB: `druh` = `poptavka` \| `objednavka`, volitelně `test: true`; jiná pole se odmítnou |
| Z prohlížeče | odmítnuto (požadavek s hlavičkou `Origin` = `403 SERVER_ONLY`), CORS není |
| Limity | 60 událostí za hodinu na klíč, 300 požadavků za hodinu z jedné adresy |
| Odpovědi | `202 {"ok":true}`; `400 INVALID_BODY`, `401 UNAUTHORIZED` (špatný, cizí i zneplatněný klíč stejně), `403 SERVER_ONLY`, `413 TOO_LARGE`, `429 RATE_LIMITED`, `503 NOT_CONFIGURED` |

## Klíč unikl

Admin → Poptávky z webu → **Otočit klíč** (starý přestane platit) a nový dát do env webu. Události,
které přes starý klíč přišly, mají v `project_web_events.key_id` jeho id, takže jdou smazat přesně.
