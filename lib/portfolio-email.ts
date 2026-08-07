import { formatPragueDayDatePhrase } from './prague-time'

export const PORTFOLIO_EMAIL_SUBJECT = 'Tvorba webových stránek - Kryštof Sobotka'

const SIGNATURE = 'S přáním pěkného dne\nKryštof Sobotka\nTel. +420 604 837 333'

export function buildPortfolioEmailBody(params: {
  todayISO: string
  nextCallDateISO: string | Date | null
}): string {
  const todayPhrase = formatPragueDayDatePhrase(params.todayISO)
  const todayCapitalized = todayPhrase.charAt(0).toUpperCase() + todayPhrase.slice(1)

  const nextCallClause = params.nextCallDateISO
    ? `a domluvili jsme se na dalším telefonickém hovoru ${formatPragueDayDatePhrase(params.nextCallDateISO)}, se kterým počítám.`
    : `a domluvili jsme se na dalším telefonickém hovoru, se kterým počítám.`

  return [
    'Dobrý den,',
    `${todayCapitalized} jsme spolu telefonicky mluvili ohledně tvorby webových stránek ${nextCallClause} Zde vám zasílám mé slíbené portfolio: https://www.vizeon.cz/`,
    'Ještě dodatečně posílám odkaz na webovou stránku mé poslední práce: https://www.u-cerhu.cz/',
    SIGNATURE,
  ].join('\n\n')
}
