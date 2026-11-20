-- Migrace 129: šablona e-mailu s fakturou (R-139)
--
-- E-mail klientovi k faktuře měl text natvrdo v kódu. Teď si ho Kryštof upraví
-- v Údajích dodavatele (předmět + text s proměnnými {cislo}, {castka},
-- {splatnost}, {odberatel}, {dodavatel}) a použije se při „Poslat e-mailem"
-- i při „Schválit a poslat".
--
-- Jeden sloupec v jediném řádku `admin_settings` (viz 107). NULL = výchozí
-- text, takže se **nic nemění**, dokud šablonu někdo neuloží.
--
-- Aditivní a idempotentní, smí jít před nasazením i po něm: starý build sloupec
-- nezná a nepoužívá; nový build bez migrace čte výchozí text a uložení šablony
-- odmítne srozumitelnou hláškou.

ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS invoice_email_template jsonb;
