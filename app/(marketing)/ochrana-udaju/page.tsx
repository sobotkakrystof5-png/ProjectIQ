import type { Metadata } from 'next'
import { ROUTES } from '@/components/marketing/content'
import { DATA_LOCATION, OPERATOR, PROCESSORS, TRANSFER_BASIS } from '@/components/marketing/legal'
import { LegalLink, LegalList, LegalPage, LegalSection, ProcessorList } from '@/components/marketing/legal-page'

// Ochrana osobních údajů (GDPR čl. 13, R-079). Lhůty podle kódu: výmaz účtu R-054
// a R-074, kontaktní formulář R-065 (IP v api_requests 1 den), klientský prostor
// R-069 a R-076. Nový zpracovatel nebo nové údaje = upravit i tenhle text.
export const metadata: Metadata = {
  title: 'Ochrana údajů',
  description: 'Jaké osobní údaje ZakazIQ zpracovává, proč, jak dlouho, komu je předává a jaká máte práva.',
  alternates: { canonical: '/ochrana-udaju' },
}

/** Zpracovatelé mimo aplikaci: e-maily a AI v klientském prostoru VIZEON a ALTENO. */
const CLIENT_PROCESSORS = [
  { name: 'Google', role: 'odesílání e-mailů klientům VIZEON a ALTENO', where: 'USA' },
  { name: 'OpenAI', role: 'přepis nahrávky hlasu na text v klientském prostoru', where: 'USA' },
  { name: 'Anthropic', role: 'shrnutí požadavků klientů v klientském prostoru', where: 'USA' },
]

export default function Page() {
  return (
    <LegalPage
      title="Ochrana osobních údajů"
      intro={
        <p>
          Tady popisujeme, jaké osobní údaje zpracováváme, proč, jak dlouho a jaká máte práva. Pokud něčemu nebudete
          rozumět, napište nám.
        </p>
      }
    >
      <LegalSection title="Kdo údaje zpracovává">
        <p>
          Správcem je {OPERATOR.name}, místo podnikání {OPERATOR.address}, IČO {OPERATOR.companyId}. S čímkoli
          ohledně osobních údajů pište na <LegalLink href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</LegalLink>.
          Pověřence pro ochranu osobních údajů jmenovaného nemáme, zákon nám to neukládá.
        </p>
      </LegalSection>

      <LegalSection title="Kdy jsme správce a kdy zpracovatel">
        <LegalList
          items={[
            'Správce jsme pro údaje lidí, kteří ZakazIQ používají (majitelé a pracovníci účtů), pro návštěvníky webu a ty, kdo nám napíšou, a pro klienty, kterým stavíme weby pod značkami VIZEON a ALTENO.',
            'Zpracovatel jsme pro údaje zákazníků firem, které ZakazIQ používají. Když například pošlete poptávku kadeřnictví přes jeho objednávací stránku, správcem vašich údajů je to kadeřnictví a my je ukládáme jen jeho jménem. Se žádostí se proto obraťte na firmu. Když ji pošlete nám, předáme ji firmě.',
          ]}
        />
      </LegalSection>

      <LegalSection title="Lidé, kteří ZakazIQ používají">
        <LegalList
          items={[
            <>
              <strong className="font-semibold">Účet a přihlášení:</strong> jméno, e-mail, případně profil Google,
              role v účtu. Důvodem je plnění smlouvy.
            </>,
            <>
              <strong className="font-semibold">Firma a fakturace:</strong> název, adresa, IČO, DIČ, bankovní účet,
              logo a další údaje, které vyplníte. Důvodem je plnění smlouvy.
            </>,
            <>
              <strong className="font-semibold">Předplatné:</strong> stav předplatného a historie plateb. Údaje o kartě
              vidí jen Stripe. Důvodem je plnění smlouvy a povinnost vést daňové doklady.
            </>,
            <>
              <strong className="font-semibold">Bezpečnost:</strong> záznam důležitých změn v účtu (kdo a kdy) a
              technické záznamy hostingu (IP adresa, čas, prohlížeč). Důvodem je oprávněný zájem na ochraně účtu a
              služby.
            </>,
            <>
              <strong className="font-semibold">E-maily:</strong> zprávy o účtu a platbách posíláme, protože k
              poskytování služby patří. Novinky o ZakazIQ jen tehdy, když je máte zapnuté v Nastavení › Komunikace.
              Vypnout je můžete kdykoli.
            </>,
            <>
              <strong className="font-semibold">Přepis přijaté faktury:</strong> když ho použijete, pošleme PDF
              faktury službě Anthropic, která z něj vypíše údaje.
            </>,
          ]}
        />
        <p>
          Údaje držíme po dobu účtu. Po zrušení účtu ještě 30 dní, kdy jde účet obnovit, potom je smažeme a ze záloh
          databáze zmizí nejpozději do dalších 30 dní. Doklady o platbách uchováváme po dobu, kterou ukládají daňové
          předpisy, nejdéle 10 let.
        </p>
      </LegalSection>

      <LegalSection title="Návštěvníci webu a kontaktní formulář">
        <LegalList
          items={[
            'Na webu nepoužíváme analytické ani reklamní cookies a nesledujeme vás. Ukládáme jen cookies, bez kterých web nefunguje: přihlášení do aplikace, naposledy otevřený byznys, zvolený vzhled a režim soukromí.',
            'Když nám napíšete přes kontaktní formulář, uložíme jméno, e-mail a zprávu, abychom vám mohli odpovědět. Důvodem je oprávněný zájem odpovědět na dotaz, případně jednání o smlouvě. Zprávu držíme po dobu vyřízení a potom nejdéle 3 roky od poslední komunikace.',
            'U formuláře si krátce uložíme i IP adresu, abychom zastavili zneužití. Mažeme ji zhruba po jednom dni.',
            'Hosting Vercel zapisuje technické záznamy o návštěvě (IP adresa, čas, adresa stránky) a krátce je drží kvůli provozu a bezpečnosti.',
          ]}
        />
      </LegalSection>

      <LegalSection title="Zákazníci firem, které ZakazIQ používají">
        <p>
          Když pošlete poptávku nebo se objednáte u firmy, která používá ZakazIQ, uloží se údaje, které vyplníte (jméno,
          telefon, e-mail, služba, čas, poznámka). Firma je použije k vyřízení poptávky a může vám poslat e-mail s
          termínem nebo připomínkou. Nabídky a novinky vám smí poslat jen se souhlasem a v každé takové zprávě je
          odkaz na odhlášení. Jak dlouho údaje drží, rozhoduje firma. Kvůli ochraně proti zneužití počítáme odeslání
          podle IP adresy, kterou ukládáme jen jako otisk, ne samotnou adresu.
        </p>
      </LegalSection>

      <LegalSection title="Klienti VIZEON a ALTENO">
        <LegalList
          items={[
            'Pro klienty, kterým stavíme weby, vedeme zakázku a klientský portál nebo klientský prostor. Zpracováváme jméno, e-mail, telefon, firmu, údaje o zakázce, zprávy, požadavky, hodnocení a údaje k přihlášení. Důvodem je plnění smlouvy o zakázce.',
            'Požadavek můžete nadiktovat. Nahrávku přepíše na text OpenAI, nahrávku samotnou neukládáme. Shrnutí požadavku a návrh zadání pro práci připraví Anthropic. Výsledek vždy kontroluje člověk.',
            'Když se na dokončené zakázce 3 roky nic nestane, smažeme zprávy, požadavky, záznamy o práci a slovní hodnocení. Zakázka, cena a platby zůstanou kvůli účetním a daňovým povinnostem. Pozvánky do klientského prostoru mažeme 90 dní po použití nebo vypršení.',
          ]}
        />
      </LegalSection>

      <LegalSection id="zpracovatele" title="Komu údaje předáváme">
        <p>Pomáhají nám tyto služby. Každá dostane jen údaje, které ke své práci potřebuje.</p>
        <ProcessorList items={[...PROCESSORS, ...CLIENT_PROCESSORS]} />
        <LegalList
          items={[
            `${DATA_LOCATION} ${TRANSFER_BASIS}`,
            'Anthropic a OpenAI podle svých smluvních podmínek nepoužívají údaje z těchto služeb k trénování svých modelů.',
            'Přihlášení přes Google je vaše volba. Google přitom zpracovává údaje jako samostatný správce podle svých pravidel.',
            'Úřadům předáme údaje jen tehdy, když to ukládá zákon. Údaje neprodáváme, nepoužíváme k reklamě a nerozhodujeme o vás automaticky.',
          ]}
        />
      </LegalSection>

      <LegalSection title="Jak údaje chráníme">
        <LegalList
          items={[
            'Spojení je šifrované (HTTPS) a do účtu se přihlašujete ověřeným e-mailem nebo účtem Google.',
            'Databáze sama hlídá, aby každý účet viděl jen svá data. Důležité změny v účtu se zaznamenávají.',
            'Konzole podpory ZakazIQ ukazuje jen souhrny o účtech, ne záznamy zákazníků. Provozovatel má jako správce databáze technický přístup a používá ho jen k údržbě, k řešení chyby na vaši žádost nebo když to ukládá zákon.',
          ]}
        />
      </LegalSection>

      <LegalSection title="Vaše práva">
        <p>Máte právo:</p>
        <LegalList
          items={[
            'zjistit, jaké údaje o vás máme, a dostat jejich kopii,',
            'nechat nesprávné údaje opravit,',
            'požádat o výmaz nebo omezení zpracování,',
            'dostat údaje ve strojově čitelné podobě a předat je jinam,',
            'vznést námitku proti zpracování z oprávněného zájmu,',
            'kdykoli odvolat souhlas, pokud jste ho dali,',
            <>
              podat stížnost u Úřadu pro ochranu osobních údajů, Pplk. Sochora 27, 170 00 Praha 7,{' '}
              <LegalLink href="https://uoou.gov.cz">uoou.gov.cz</LegalLink>.
            </>,
          ]}
        />
        <p>
          Na žádost odpovíme do jednoho měsíce. Pokud ZakazIQ používáte, většinu zvládnete sami: data stáhnete v Účtu,
          údaje opravíte v Nastavení a účet tam i zrušíte.
        </p>
      </LegalSection>

      <LegalSection title="Změny">
        <p>
          Když se změní, jak s údaji zacházíme, upravíme tuhle stránku. O podstatné změně dáme uživatelům ZakazIQ vědět
          e-mailem. Podmínky používání najdete v <LegalLink href={ROUTES.terms}>Obchodních podmínkách</LegalLink> a
          pravidla pro údaje vašich zákazníků ve <LegalLink href={ROUTES.dpa}>Zpracovatelské smlouvě</LegalLink>.
        </p>
      </LegalSection>
    </LegalPage>
  )
}
