// Hlášky k chybám Supabase Auth pro přihlašovací formuláře (R-080). Česky,
// bez technických slov, vždy s tím, co dělat dál (skill zakaziq-ux-texty-cs).

// Pravidla hesla (R-081). Stejná musí být v Supabase → Authentication →
// Providers → Email (Minimum password length 10, Password requirements
// „Lowercase, uppercase letters and digits“), jinak by Supabase pustil slabší.
export const MIN_PASSWORD_LENGTH = 10
export const MAX_PASSWORD_LENGTH = 72

/** Splňuje heslo pravidla? Vrací hlášku, nebo null. */
export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Heslo je moc krátké. Použijte aspoň ${MIN_PASSWORD_LENGTH} znaků.`
  if (password.length > MAX_PASSWORD_LENGTH) return `Heslo je moc dlouhé. Stačí do ${MAX_PASSWORD_LENGTH} znaků.`
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Do hesla dejte malé i velké písmeno a aspoň jednu číslici.'
  }
  return null
}

/** Nápověda pod polem pro nové heslo. */
export const PASSWORD_HINT = `Aspoň ${MIN_PASSWORD_LENGTH} znaků, malé i velké písmeno a číslice.`

export function authErrorMessage(error: { code?: string; status?: number }): string {
  switch (error.code) {
    case 'invalid_credentials':
      return 'E-mail nebo heslo nesedí. Zkuste to znovu, nebo si nastavte nové heslo.'
    case 'email_not_confirmed':
      return 'E-mail ještě není potvrzený. Otevřete odkaz, který jsme vám poslali.'
    case 'user_already_exists':
    case 'email_exists':
      return 'Účet s tímhle e-mailem už máte. Přihlaste se.'
    case 'weak_password':
      return `Heslo je moc slabé nebo se objevilo v únicích hesel. Zvolte jiné: ${PASSWORD_HINT.toLowerCase()}`
    case 'captcha_failed':
      return 'Nepodařilo se ověřit, že nejste robot. Načtěte prosím stránku znovu a zkuste to ještě jednou.'
    case 'reauthentication_needed':
    case 'reauthentication_not_valid':
      return 'Kód z e-mailu nesedí nebo už vypršel. Nechte si poslat nový.'
    case 'mfa_verification_failed':
    case 'mfa_challenge_expired':
      return 'Kód nesedí. Opište prosím aktuální kód z aplikace, mění se každých 30 vteřin.'
    case 'mfa_factor_name_conflict':
      return 'Zařízení s tímhle názvem už máte. Zkuste to prosím znovu.'
    case 'insufficient_aal':
      return 'Nejdřív prosím potvrďte přihlášení kódem z aplikace.'
    case 'email_change_confirm_limit':
      return 'Změnu e-mailu jste už zadali. Potvrďte ji odkazy v e-mailech.'
    case 'same_password':
      return 'Nové heslo musí být jiné než to dosavadní.'
    case 'email_address_invalid':
    case 'validation_failed':
      return 'Zkontrolujte prosím e-mail, něco v něm nesedí.'
    case 'signup_disabled':
      return 'Registrace je teď vypnutá. Napište nám prosím.'
    case 'session_not_found':
    case 'session_expired':
    case 'refresh_token_not_found':
      return 'Odkaz už neplatí. Nechte si prosím poslat nový.'
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return 'Moc pokusů za sebou. Zkuste to prosím za pár minut.'
    case 'provider_disabled':
      return 'Přihlášení přes Google teď nejde. Použijte prosím e-mail a heslo.'
  }
  if (error.status === 429) return 'Moc pokusů za sebou. Zkuste to prosím za pár minut.'
  return 'Nepodařilo se to. Zkontrolujte připojení a zkuste to prosím znovu.'
}

/** Hláška podle `?chyba=` v adrese (návrat z /auth/callback). */
export function authNoticeFromQuery(value: string | string[] | undefined): string | null {
  if (value === 'odkaz') return 'Odkaz z e-mailu už neplatí nebo byl použitý. Přihlaste se, nebo si nechte poslat nový.'
  if (value === 'odhlaseno') return 'Byli jste odhlášeni, protože někdo zvolil Odhlásit všude. Přihlaste se prosím znovu.'
  return null
}
