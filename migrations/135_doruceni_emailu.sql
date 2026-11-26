-- Migrace 135: doručení e-mailů z adminu podle webhooku Resendu (R-146)
--
-- E-maily z adminu (pozvánky na schůzky, připomínky, faktury…) odcházejí
-- z krystof@vizeon.cz přes Resend. Dosud jsme věděli jen, že je Resend převzal
-- („Pozvánka odešla"). Webhook `/api/resend/vizeon` teď zapíše, co se s e-mailem
-- stalo dál: dorazil, zdržuje se, vrátil se, skončil ve spamu, neodešel.
--
-- Klíčem je id e-mailu od Resendu (`calendar_events.invite_provider_id`,
-- `meeting_reminders.provider_id`). Tabulka nemá cizí klíč, protože událost
-- z webhooku může přijít dřív, než se id u pozvánky uloží — řádek pak čeká
-- a kalendář si ho najde sám.
--
-- Ukládá se jen stav a čas. Adresa, předmět ani text odpovědi poštovního
-- serveru (může obsahovat adresu) se neukládají (DECISIONS #054).
--
-- Kalendář čte tabulku samostatným dotazem, takže bez téhle migrace funguje
-- jako dřív (jen bez „doručeno"). Idempotentní: druhý běh nic nezmění.

CREATE TABLE IF NOT EXISTS email_deliveries (
  provider_id text        PRIMARY KEY CHECK (provider_id ~ '^[A-Za-z0-9-]{1,100}$'),
  status      text        NOT NULL
                          CHECK (status IN ('delayed', 'delivered', 'complained', 'bounced', 'failed', 'suppressed')),
  -- Čas události podle Resendu, ne čas příchodu webhooku (pořadí se může prohodit).
  event_at    timestamptz NOT NULL,
  -- Jen u vrácení: Permanent (adresa neexistuje) nebo Transient (plná schránka…).
  bounce_type text        CHECK (bounce_type IS NULL OR bounce_type ~ '^[A-Za-z]{1,40}$'),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE email_deliveries IS
  'Doručení e-mailů z adminu podle webhooku Resendu (R-146). Bez adres a textů, jen stav.';
