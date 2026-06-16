import type { Transporter } from 'nodemailer'

let _transporter: Transporter | null = null

async function getTransporter(): Promise<{ transporter: Transporter; from: string } | null> {
  const user = process.env.GMAIL_USER
  const pass = process.env.GMAIL_APP_PASSWORD
  if (!user || !pass) return null

  if (!_transporter) {
    const nodemailer = await import('nodemailer')
    _transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass: pass.replace(/\s/g, '') },
    })
  }
  return { transporter: _transporter, from: `ZakazIQ <${user}>` }
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export interface EmailField {
  label: string
  value: string
}

export interface EmailCta {
  label: string
  href: string
  primary?: boolean
}

function buildLayout(opts: {
  heading: string
  intro: string
  fields: EmailField[]
  ctas?: EmailCta[]
}): string {
  const fieldsHtml = opts.fields
    .map(
      (f) => `
      <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">${escapeHtml(f.label)}</p>
      <p style="margin:0 0 16px;font-size:16px;font-weight:600;color:#111827;">${escapeHtml(f.value)}</p>`
    )
    .join('')

  const ctasHtml = (opts.ctas ?? [])
    .map((cta) =>
      cta.primary !== false
        ? `<a href="${cta.href}" style="display:inline-block;background:linear-gradient(135deg,#1b3868,#23478b);color:#fff;text-decoration:none;padding:14px 28px;border-radius:10px;font-size:14px;font-weight:600;margin-right:12px;">${escapeHtml(cta.label)} →</a>`
        : `<a href="${cta.href}" style="display:inline-block;background:#fff;color:#1b3868;text-decoration:none;padding:14px 28px;border-radius:10px;font-size:14px;font-weight:600;border:1px solid #c7d2fe;">${escapeHtml(cta.label)} →</a>`
    )
    .join('')

  return `<!DOCTYPE html><html lang="cs"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);">
  <tr><td style="background:linear-gradient(135deg,#1b3868 0%,#23478b 100%);padding:32px 40px;">
    <p style="margin:0 0 6px;color:#93c5fd;font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;">ZakazIQ</p>
    <h1 style="margin:0;color:#fff;font-size:22px;font-weight:600;">${escapeHtml(opts.heading)}</h1>
  </td></tr>
  <tr><td style="padding:36px 40px;">
    <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.6;">${escapeHtml(opts.intro)}</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8faff;border:1px solid #e0e7ff;border-radius:12px;margin-bottom:24px;">
    <tr><td style="padding:24px;">${fieldsHtml}</td></tr></table>
    ${ctasHtml}
    <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;">Vygenerováno automaticky — ZakazIQ</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`
}

export async function sendBrandedEmail(opts: {
  to: string
  subject: string
  heading: string
  intro: string
  fields: EmailField[]
  ctas?: EmailCta[]
}): Promise<boolean> {
  const mailer = await getTransporter()
  if (!mailer) return false
  try {
    await mailer.transporter.sendMail({
      from: mailer.from,
      to: opts.to,
      subject: opts.subject,
      html: buildLayout(opts),
    })
    return true
  } catch (err) {
    console.error('[Email] Selhání odesílání:', err)
    return false
  }
}
