#!/usr/bin/env node
/**
 * Vypíše SQL pro Supabase Auth: hook „Before User Created", který pustí
 * jen e-mail admina (R-106). Nahrazuje placenou volbu „Allow new users to
 * sign up = off" — ta je v Supabase na Pro plánu, náš je Free.
 *
 *   node --env-file=.env.local scripts/supabase-auth-sql.mjs
 *
 * Výstup se vloží do SQL editoru projektu a pak se hook **zapne v dashboardu**
 * (Authentication → Hooks → Before User Created → Postgres function).
 * Bez toho zapnutí je funkce jen nepoužitý kus SQL.
 *
 * E-mail se bere z `ADMIN_EMAIL`, aby nemusel být natvrdo v repu.
 */

const email = (process.env.ADMIN_EMAIL ?? '').trim().toLowerCase()

if (!email) {
  console.error('Chybí ADMIN_EMAIL. Spusť to s `node --env-file=.env.local scripts/supabase-auth-sql.mjs`.')
  process.exit(1)
}
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error(`ADMIN_EMAIL nevypadá jako e-mail: ${email}`)
  process.exit(1)
}

// Apostrof v e-mailu je legální; zdvojením se z něj nestane konec literálu.
const sqlEmail = email.replace(/'/g, "''")

process.stdout.write(`-- ZakazIQ: do adminu smí jediný účet (R-001). Supabase na Free plánu neumí
-- vypnout veřejnou registraci, tak ji zavírá tenhle hook (R-106).
-- Pouštět v SQL editoru projektu; potom hook zapnout v Authentication → Hooks.

create or replace function public.before_user_created_jen_admin(event jsonb)
returns jsonb
language plpgsql
as $$
declare
  novy_email text := lower(trim(event->'user'->>'email'));
begin
  if novy_email = '${sqlEmail}' then
    return '{}'::jsonb;
  end if;

  -- Hook běží před vložením do auth.users, takže účet vůbec nevznikne.
  return jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'Registrace není povolená.'
    )
  );
end;
$$;

-- supabase_auth_admin do schématu public ve výchozím stavu nevidí.
grant usage on schema public to supabase_auth_admin;
grant execute on function public.before_user_created_jen_admin(jsonb) to supabase_auth_admin;

-- Nikdo jiný tu funkci spouštět nemá.
revoke execute on function public.before_user_created_jen_admin(jsonb) from public;
revoke execute on function public.before_user_created_jen_admin(jsonb) from anon, authenticated;
`)
