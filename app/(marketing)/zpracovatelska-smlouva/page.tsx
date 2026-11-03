import type { Metadata } from 'next'
import { ROUTES } from '@/components/marketing/content'
import { OPERATOR, OPERATOR_LINE, PROCESSORS, TRANSFER_BASIS } from '@/components/marketing/legal'
import { LegalLink, LegalList, LegalPage, LegalSection, ProcessorList } from '@/components/marketing/legal-page'

// Zpracovatelská smlouva podle GDPR čl. 28 odst. 3 (R-079). Výmaz zákazníka a
// faktury 10 let R-054, zrušení účtu R-074. Body a)–h) čl. 28 odst. 3 jsou
// v oddílech 4–10 (pokyny, mlčenlivost, zabezpečení, další zpracovatelé, pomoc,
// konec, kontrola); při úpravě žádný nevynechat.
export const metadata: Metadata = {
  title: 'Zpracovatelská smlouva',
  description: 'Smlouva o zpracování osobních údajů vašich zákazníků v ZakazIQ podle čl. 28 GDPR.',
  alternates: { canonical: '/zpracovatelska-smlouva' },
}

const SUBPROCESSORS = PROCESSORS.filter((p) => p.customerData)

export default function Page() {
  return (
    <LegalPage
      title="Zpracovatelská smlouva"
      intro={
        <>
          <p>
            Tahle smlouva upravuje, jak v ZakazIQ zpracováváme osobní údaje vašich zákazníků. Uzavírá se podle čl. 28
            obecného nařízení o ochraně osobních údajů (GDPR) spolu s{' '}
            <LegalLink href={ROUTES.terms}>obchodními podmínkami</LegalLink>, je jejich součástí a platí, dokud máte
            účet.
          </p>
          <p>
            <strong className="font-semibold">Správce:</strong> vy, firma nebo podnikatel s účtem v ZakazIQ.
            <br />
            <strong className="font-semibold">Zpracovatel:</strong> {OPERATOR_LINE}.
          </p>
        </>
      }
    >
      <LegalSection title="Co zpracováváme a proč">
        <p>
          Údaje ukládáme, zobrazujeme, třídíme a vyhledáváme, abyste mohli vést poptávky, termíny, zakázky, zákazníky,
          věrnost a faktury. Jménem vaší firmy odesíláme e-maily zákazníkům, přijímáme poptávky z vašeho webu a
          objednávací stránky, ukazujeme zákazníkům jejich termín nebo zakázku a připravujeme exporty. Nic jiného s
          údaji neděláme.
        </p>
      </LegalSection>

      <LegalSection title="Čí údaje a jaké">
        <LegalList
          items={[
            'Koho se týkají: vaši zákazníci a lidé, kteří vám poslali poptávku, odběratelé vašich faktur, účastníci lekcí a vaši pracovníci.',
            'Jaké údaje: jméno, telefon, e-mail, adresa a fakturační údaje odběratele, narozeniny (jen když je zadáte), poznámky, odpovědi z formuláře, historie návštěv, zakázek, plateb a věrnosti, hodnocení, zprávy z odkazu pro zákazníka, souhlas s nabídkami a údaje o doručení e-mailů.',
            'ZakazIQ citlivé údaje (například o zdraví) nevyžaduje. Pokud je zapíšete do poznámek, třeba alergii u kosmetiky, odpovídáte za to, že k tomu máte právní důvod.',
          ]}
        />
      </LegalSection>

      <LegalSection title="Vaše povinnosti jako správce">
        <LegalList
          items={[
            'Údaje zákazníků zpracováváte oprávněně a zákazníky o tom informujete.',
            'Nabídky a novinky posíláte jen zákazníkům, kteří s nimi souhlasili. Aplikace souhlas hlídá, ale zapisujete ho vy.',
            'Do aplikace vkládáte jen údaje, které ke své práci potřebujete, a chráníte přístup do účtu.',
          ]}
        />
      </LegalSection>

      <LegalSection title="Pokyny">
        <LegalList
          items={[
            'Údaje zpracováváme jen podle vašich pokynů. Pokynem je tahle smlouva, to, co v aplikaci uděláte nebo nastavíte, a pokyny, které nám pošlete e-mailem.',
            'Pokud by pokyn podle nás porušoval předpisy, upozorníme vás.',
            'Pokud nám zpracování uloží zákon, předem vám to oznámíme, ledaže by to zákon zakazoval.',
          ]}
        />
      </LegalSection>

      <LegalSection title="Mlčenlivost a zabezpečení">
        <LegalList
          items={[
            'Kdo má k údajům přístup, je zavázaný mlčenlivostí.',
            'Spojení je šifrované (HTTPS). Databáze sama hlídá, aby každý účet viděl jen svá data. Do účtu se přihlašuje ověřeným e-mailem nebo účtem Google a důležité změny se zaznamenávají.',
            'Konzole podpory ZakazIQ ukazuje jen souhrny o účtu, ne záznamy vašich zákazníků. Technický přístup k databázi máme a používáme ho jen k údržbě, k řešení chyby na vaši žádost nebo když to ukládá zákon.',
            'Režim soukromí v aplikaci rozmazává jména a částky jen na daném zařízení. Údaje tím nechrání před nikým, kdo má přístup do účtu.',
          ]}
        />
      </LegalSection>

      <LegalSection id="subzpracovatele" title="Další zpracovatelé">
        <p>
          Dáváte nám obecný souhlas zapojit tyto služby. Každá je smluvně vázaná stejnými povinnostmi jako my a dostane
          jen údaje, které ke své práci potřebuje.
        </p>
        <ProcessorList items={SUBPROCESSORS} />
        <LegalList
          items={[
            'Nového zpracovatele vám oznámíme e-mailem aspoň 14 dní předem. Pokud s ním nesouhlasíte, napište nám. Když se nedomluvíme, můžete smlouvu bez sankce ukončit zrušením účtu.',
            TRANSFER_BASIS,
            'Platby předplatného zpracovává Stripe, ale údaje vašich zákazníků nedostává.',
          ]}
        />
      </LegalSection>

      <LegalSection title="Pomoc s právy zákazníků a s povinnostmi správce">
        <LegalList
          items={[
            'Na žádost zákazníka ho smažete v jeho kartě. Kontakty, poznámky, věrnost a hodnocení zmizí hned, v historii zůstane „Smazaný zákazník“. Údaje zákazníka opravíte v kartě, všechna data stáhnete v Účtu.',
            'Vystavené faktury smazaného zákazníka zůstanou s povinnými údaji 10 let od konce roku vystavení, protože je ukládají daňové a účetní předpisy. Potom je anonymizujeme.',
            'Když žádost zákazníka přijde k nám, bez zbytečného odkladu vám ji předáme.',
            'Pomůžeme vám se zabezpečením, ohlášením porušení, posouzením vlivu nebo s dotazem úřadu, pokud se týkají ZakazIQ.',
            'Záznam o zpracování a historii výmazů a exportů najdete v aplikaci v Účtu.',
          ]}
        />
      </LegalSection>

      <LegalSection title="Porušení zabezpečení">
        <p>
          Pokud zjistíme únik nebo jiné porušení zabezpečení vašich údajů, oznámíme vám ho bez zbytečného odkladu,
          nejpozději do 48 hodin. Napíšeme, co se stalo, kterých údajů a kolika lidí se to týká, jaké to může mít
          následky a co jsme udělali. Co ještě nevíme, doplníme, jakmile to zjistíme.
        </p>
      </LegalSection>

      <LegalSection title="Kontrola">
        <p>
          Dáme vám informace, které potřebujete k doložení, že smlouvu dodržujeme. Kontrolu nebo audit můžete provést
          sami nebo přes pověřeného auditora po předchozí domluvě, na vlastní náklady a nejvýše jednou za rok, pokud
          nedošlo k porušení zabezpečení.
        </p>
      </LegalSection>

      <LegalSection title="Konec smlouvy">
        <LegalList
          items={[
            'Před koncem smlouvy si můžete všechna data stáhnout v Účtu (tabulky CSV a faktury v PDF).',
            'Po zrušení účtu a konci zaplaceného období údaje držíme ještě 30 dní, během nich jde účet obnovit. Potom je nevratně smažeme a ze záloh databáze zmizí nejpozději do dalších 30 dní, pokud nám jejich uchování neukládá zákon.',
          ]}
        />
      </LegalSection>

      <LegalSection title="Ostatní">
        <p>
          Odpovědnost se řídí GDPR a obchodními podmínkami. Smlouvu můžeme měnit stejně jako obchodní podmínky, tedy s
          oznámením e-mailem aspoň 30 dní předem. Otázky posílejte na{' '}
          <LegalLink href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</LegalLink>.
        </p>
      </LegalSection>
    </LegalPage>
  )
}
