import type { Metadata } from 'next'
import { ROUTES, SUPPORT_FORM_HREF } from '@/components/marketing/content'
import { OPERATOR } from '@/components/marketing/legal'
import { LegalLink, LegalList, LegalPage, LegalSection } from '@/components/marketing/legal-page'

// Obchodní podmínky (R-079). Lhůty a chování podle kódu: zkušební doba a platby
// R-038, lhůta po nezaplacení GRACE_DAYS v lib/ws/billing.ts, zrušení R-074,
// výmaz R-054. Při změně chování aplikace upravit i text.
export const metadata: Metadata = {
  title: 'Obchodní podmínky',
  description: 'Podmínky používání ZakazIQ: cena, zkušební doba, platby, zrušení účtu a co se stane s daty.',
  alternates: { canonical: '/podminky' },
}

export default function Page() {
  return (
    <LegalPage
      title="Obchodní podmínky"
      intro={
        <p>
          Tyto podmínky platí pro používání aplikace ZakazIQ. Píšeme je co nejjednodušeji. „My“ jsme provozovatel
          ZakazIQ, „vy“ jste firma nebo podnikatel, který si založí účet.
        </p>
      }
    >
      <LegalSection title="Kdo ZakazIQ provozuje">
        <p>
          {OPERATOR.name}, fyzická osoba podnikající, místo podnikání {OPERATOR.address}, IČO {OPERATOR.companyId},{' '}
          {OPERATOR.register}. Nejsem plátce DPH.
        </p>
        <p>
          Napsat nám můžete na <LegalLink href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</LegalLink> nebo přes{' '}
          <LegalLink href={SUPPORT_FORM_HREF}>kontaktní formulář</LegalLink>.
        </p>
      </LegalSection>

      <LegalSection title="Pro koho ZakazIQ je">
        <LegalList
          items={[
            'ZakazIQ je určený pro podnikatele a firmy. Registrací potvrzujete, že účet zakládáte v rámci svého podnikání, ne jako spotřebitel. Ustanovení na ochranu spotřebitele se proto na smlouvu nepoužijí.',
            'Kdo účet zakládá za firmu, potvrzuje, že za ni smí jednat.',
          ]}
        />
      </LegalSection>

      <LegalSection title="Co služba obsahuje">
        <LegalList
          items={[
            'ZakazIQ je webová aplikace pro poptávky, kalendář, zákazníky a věrnost, zakázky, faktury, příjmy a odhad daní. Patří k ní objednávací stránka, napojení vašeho webu a odkazy, přes které zákazníci vidí svůj termín nebo zakázku.',
            'Co je v ceně, uvádí ceník na úvodní stránce. V jednom předplatném je jeden byznys.',
            'Aplikaci průběžně vylepšujeme. Funkci, kterou používáte a která je v ceně, neodebereme bez oznámení e-mailem aspoň 30 dní předem.',
          ]}
        />
      </LegalSection>

      <LegalSection title="Registrace a účet">
        <LegalList
          items={[
            'Účet založíte na zakaziq.cz přes e-mail nebo účet Google. Uvádějte pravdivé údaje a aktuální e-mail, posíláme na něj důležité zprávy o účtu.',
            'Přihlášení chraňte. Za to, co v účtu udělají lidé, které do něj pozvete, odpovídáte vy.',
            'Smlouva vzniká dokončením registrace, tedy zadáním platební karty v kroku 2. Tlačítkem „Pokračovat k platbě“ souhlasíte s těmito podmínkami a se zpracovatelskou smlouvou.',
            'Smlouva se uzavírá v češtině. Podmínky si můžete kdykoli otevřít na této stránce, uložit nebo vytisknout.',
          ]}
        />
      </LegalSection>

      <LegalSection title="Cena a platby">
        <LegalList
          items={[
            'Předplatné stojí 249 Kč měsíčně. Je to konečná cena, nejsem plátce DPH a nic se nepřipočítává.',
            'Prvních 14 dní je zdarma. Kartu zadáte při registraci, první platba proběhne po skončení zkušební doby a potom vždy na začátku dalšího měsíce. Zkušební dobu má každý účet jen jednou. Týden před jejím koncem vám přijde připomínka e-mailem.',
            'Platby zpracovává Stripe. Údaje o kartě vidí jen Stripe, my ne. Za každou platbu dostanete e-mailem doklad.',
            'Když se platba nepovede, máte 7 dní, kdy aplikace funguje dál a v Účtu můžete vyměnit kartu. Potom je účet jen pro čtení: data vidíte a můžete je stáhnout, ale nejde nic měnit. Poptávky z vašeho webu a objednávací stránky se ukládají dál. Kvůli nezaplacení žádná data nemažeme.',
            'Změnu ceny oznámíme e-mailem aspoň 30 dní předem. Nová cena platí od prvního období po uplynutí této lhůty. Pokud s ní nesouhlasíte, můžete předplatné do té doby zrušit.',
            'Jinou cenu nebo delší zkušební dobu s vámi můžeme dohodnout individuálně e-mailem.',
          ]}
        />
      </LegalSection>

      <LegalSection id="zruseni" title="Zrušení předplatného a účtu">
        <p>Máte dvě možnosti, obě najdete v Účtu.</p>
        <LegalList
          items={[
            <>
              <strong className="font-semibold">Zrušit předplatné.</strong> Předplatné doběhne do konce zaplaceného
              období nebo zkušební doby a nic dalšího nezaplatíte. Potom je účet jen pro čtení. Data zůstanou, můžete
              je prohlížet, stáhnout a předplatné kdykoli obnovit.
            </>,
            <>
              <strong className="font-semibold">Zrušit účet.</strong> Předplatné doběhne do konce zaplaceného období a
              do té doby můžete zrušení vzít zpět. Potom účet zavřeme: přestane fungovat objednávací stránka, napojení
              webu i odkazy pro zákazníky. Data necháme ještě 30 dní a během nich jde účet obnovit. Potom je nevratně
              smažeme. Ze záloh databáze zmizí nejpozději do dalších 30 dní. Pokud předplatné v době zrušení není
              zaplacené, účet zavřeme hned.
            </>,
          ]}
        />
        <p>
          Za nevyčerpanou část zaplaceného období peníze nevracíme. Všechna data si můžete kdykoli stáhnout v Účtu
          (tabulky CSV a faktury v PDF).
        </p>
      </LegalSection>

      <LegalSection title="Ukončení z naší strany">
        <LegalList
          items={[
            'Když podmínky závažně porušíte (například rozesíláte nevyžádané nabídky, ukládáte nezákonný obsah nebo útočíte na službu), můžeme účet omezit nebo smlouvu ukončit s okamžitou platností. Pokud to jde, nejdřív vás vyzveme k nápravě.',
            'ZakazIQ jako celek můžeme přestat poskytovat s výpovědní dobou 3 měsíce, oznámenou e-mailem. Zaplacenou část předplatného po konci služby vrátíme a data si do té doby můžete stáhnout.',
          ]}
        />
      </LegalSection>

      <LegalSection title="Pravidla používání">
        <p>ZakazIQ používejte v souladu se zákony. Zejména nesmíte:</p>
        <LegalList
          items={[
            'posílat nabídky a novinky lidem, kteří s nimi nesouhlasili (aplikace je nabízí jen zákazníkům se souhlasem),',
            'ukládat obsah, který porušuje práva jiných nebo zákon,',
            'zkoušet obejít zabezpečení, dostat se do cizích účtů nebo službu úmyslně přetěžovat,',
            'přeprodávat ZakazIQ dalším lidem bez naší dohody.',
          ]}
        />
        <p>Klíč pro napojení webu držte v tajnosti. Když unikne, vyměňte ho v Nastavení.</p>
      </LegalSection>

      <LegalSection title="Vaše data a údaje vašich zákazníků">
        <LegalList
          items={[
            'Data, která do ZakazIQ vložíte, patří vám. Používáme je jen k tomu, abychom vám službu poskytli. Neprodáváme je a nepoužíváme k reklamě.',
            <>
              U osobních údajů vašich zákazníků jste správce vy a my zpracovatel. Pravidla stanoví{' '}
              <LegalLink href={ROUTES.dpa}>zpracovatelská smlouva</LegalLink>, která je součástí těchto podmínek.
            </>,
            'Odpovídáte za to, že údaje zákazníků zpracováváte oprávněně, že je o tom informujete a že nabídky posíláte jen se souhlasem.',
            'E-maily vašim zákazníkům odcházejí z adresy rezervace@zakaziq.cz se jménem vaší firmy jako odesílatele.',
            'Data zálohujeme v rámci databáze. Export v Účtu je vaše vlastní záloha, doporučujeme si ho občas stáhnout.',
          ]}
        />
      </LegalSection>

      <LegalSection title="Odhad daní, faktury a výpočty">
        <LegalList
          items={[
            'Odhad daní, přehledy příjmů a hlídání hranice obratu pro DPH jsou orientační pomůcka. Nenahrazují daňového poradce ani účetní a nezahrnují všechny situace, například výjimky nebo příjmy ze zaměstnání. Za daňové přiznání a jeho správnost odpovídáte vy.',
            'Faktury vystavujete vy jménem své firmy a za správnost údajů na nich odpovídáte vy.',
            'Přepis přijaté faktury pomocí umělé inteligence před uložením zkontrolujte.',
          ]}
        />
      </LegalSection>

      <LegalSection title="Dostupnost a podpora">
        <LegalList
          items={[
            'Snažíme se, aby ZakazIQ běžel bez přerušení, ale nepřetržitou dostupnost nezaručujeme. Plánovanou odstávku oznámíme předem, když to jde.',
            'E-maily a upozornění odesíláme přes externí služby. Doručení do schránky příjemce zaručit nemůžeme.',
            <>
              S čímkoli vám pomůžeme na <LegalLink href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</LegalLink>.
              Snažíme se odpovědět do 24 hodin.
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection title="Odpovědnost">
        <LegalList
          items={[
            'Odpovídáme za škodu, kterou způsobíme porušením svých povinností. Náhrada za všechny škody dohromady je omezená částkou, kterou jste za ZakazIQ zaplatili za posledních 12 měsíců před vznikem škody.',
            'Omezení neplatí pro škodu způsobenou úmyslně nebo z hrubé nedbalosti a pro újmu na přirozených právech člověka.',
            'Neodpovídáme za ušlý zisk, za škodu z nesprávně zadaných údajů ani za výpadky, které nemůžeme ovlivnit (například výpadek internetu nebo služeb třetích stran mimo naši kontrolu).',
          ]}
        />
      </LegalSection>

      <LegalSection title="Práva k aplikaci">
        <LegalList
          items={[
            'Aplikace, její vzhled a kód patří provozovateli. Po dobu smlouvy ji smíte používat pro svou firmu.',
            'Logo, texty a další obsah, které nahrajete, zůstávají vaše. Zobrazujeme je jen tam, kde je služba potřebuje (například objednávací stránka a e-maily zákazníkům).',
          ]}
        />
      </LegalSection>

      <LegalSection title="Změny podmínek">
        <p>
          Podmínky můžeme měnit, například kvůli novým funkcím, ceně nebo zákonům. Změnu oznámíme e-mailem aspoň 30 dní
          předem. Pokud se změnou nesouhlasíte, můžete do jejího začátku zrušit účet bez jakékoli sankce. Když budete
          ZakazIQ používat dál, platí nové znění.
        </p>
      </LegalSection>

      <LegalSection title="Závěrem">
        <LegalList
          items={[
            'Smlouva se řídí českým právem, hlavně občanským zákoníkem. Spory řeší české soudy.',
            'Pokud by některé ustanovení bylo neplatné, ostatní platí dál.',
            'Komunikujeme elektronicky, na e-mail uvedený v účtu.',
            <>
              Jak nakládáme s osobními údaji, popisuje <LegalLink href={ROUTES.privacy}>Ochrana údajů</LegalLink>.
            </>,
          ]}
        />
      </LegalSection>
    </LegalPage>
  )
}
