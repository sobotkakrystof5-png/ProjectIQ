import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { ImageResponse } from 'next/og'

// OG obrázek landing page (brief § 6, S05): tmavá plocha s polem dílků, logo, H1
// a výřez kalendáře s čárkovanou novou poptávkou. Generuje se při buildu.
// Písma Dílků jako TTF v _og/ (next/og neumí woff2), licence OFL tamtéž.

export const alt = 'ZakazIQ · Zákazníci se objednají sami.'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const dynamic = 'force-static'

// next/og nezná CSS proměnné — hodnoty z app/ws-tokens.css.
const C = {
  navy950: '#0c1a36',
  navy900: '#132850',
  navy800: '#1b3868',
  navy600: '#2b57a8',
  navy300: '#8aaee3',
  navy200: '#b8ceef',
  navy100: '#dce7f7',
  navy50: '#eef2fb',
  signalBg: '#fff7e8',
  signalLine: '#e19a2c',
  signalInk: '#6b4300',
  signal: '#ffb547',
}

const font = (file: string) => readFile(path.join(process.cwd(), 'app/(marketing)/_og', file))

/** Pole dílků v pozadí: mřížka čtverců, několik o něco světlejších. */
function TileField() {
  const cols = 26
  const rows = 14
  const lit = new Set([31, 58, 84, 113, 137, 166, 190, 219, 247, 268, 301, 327])
  return (
    <div style={{ position: 'absolute', top: -14, left: -14, display: 'flex', flexWrap: 'wrap', width: cols * 48 }}>
      {Array.from({ length: cols * rows }, (_, i) => (
        <div
          key={i}
          style={{
            width: 36,
            height: 36,
            margin: 6,
            borderRadius: 10,
            background: lit.has(i) ? 'rgba(138,174,227,0.16)' : 'rgba(138,174,227,0.05)',
          }}
        />
      ))}
    </div>
  )
}

function Logo() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: 15,
          background: `linear-gradient(135deg, ${C.navy600}, ${C.navy800})`,
          display: 'flex',
          flexWrap: 'wrap',
          alignContent: 'center',
          justifyContent: 'center',
          gap: 6,
          padding: '0 10px',
        }}
      >
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ width: 13, height: 13, borderRadius: 4, background: '#fff' }} />
        ))}
      </div>
      <div style={{ fontSize: 34, color: '#fff', letterSpacing: '-0.03em' }}>ZakazIQ</div>
    </div>
  )
}

/** Výřez týdne: potvrzené termíny plné, nová poptávka čárkovaně. */
function CalendarCut() {
  const days = ['ST 7', 'ČT 8', 'PÁ 9']
  const cell = (filled: boolean, key: number) => (
    <div
      key={key}
      style={{
        height: 56,
        borderRadius: 12,
        background: filled ? C.navy50 : 'transparent',
        border: filled ? `2px solid ${C.navy50}` : `2px dashed ${C.navy100}`,
      }}
    />
  )
  return (
    <div
      style={{
        width: 410,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        padding: 26,
        borderRadius: 28,
        background: '#fff',
        boxShadow: '0 30px 60px rgba(4,10,24,0.45)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 24, color: C.navy950, letterSpacing: '-0.02em' }}>Týden 5.–9. října</div>
        <div style={{ fontFamily: 'Mono', fontSize: 15, color: C.navy600 }}>KALENDÁŘ</div>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        {days.map((d, col) => (
          <div key={d} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontFamily: 'Mono', fontSize: 15, color: C.navy600 }}>{d}</div>
            {col === 2 ? (
              <div
                style={{
                  height: 122,
                  borderRadius: 12,
                  border: `2px dashed ${C.signalLine}`,
                  background: C.signalBg,
                  display: 'flex',
                  flexDirection: 'column',
                  padding: '10px 10px',
                  gap: 4,
                  color: C.signalInk,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'Mono', fontSize: 13 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 4, background: C.signal }} />
                  NOVÁ
                </div>
                <div style={{ fontSize: 17 }}>Tereza M.</div>
                <div style={{ fontFamily: 'Mono', fontSize: 13 }}>9:00</div>
              </div>
            ) : (
              [0, 1].map((r) => cell((col + r) % 2 === 0, r))
            )}
            {cell(col !== 1, 2)}
          </div>
        ))}
      </div>
    </div>
  )
}

export default async function OpengraphImage() {
  const [sans, mono] = await Promise.all([
    font('InstrumentSans-SemiBold.ttf'),
    font('JetBrainsMono-Medium.ttf'),
  ])

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
          overflow: 'hidden',
          background: C.navy950,
          fontFamily: 'Sans',
        }}
      >
        <TileField />
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: 1200,
            height: 630,
            background: 'radial-gradient(circle at 40% 50%, rgba(58,110,196,0.32) 0%, rgba(58,110,196,0) 55%)',
          }}
        />
        <div
          style={{
            position: 'relative',
            display: 'flex',
            width: '100%',
            padding: '64px 72px',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
            <Logo />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 86, color: '#fff', letterSpacing: '-0.035em', lineHeight: 1.02 }}>
                Zákazníci se
              </div>
              <div style={{ fontSize: 86, color: '#fff', letterSpacing: '-0.035em', lineHeight: 1.02 }}>
                objednají sami.
              </div>
            </div>
            <div style={{ fontFamily: 'Mono', fontSize: 21, color: C.navy200 }}>
              poptávky · kalendář · zákazníci · faktury
            </div>
          </div>
          <CalendarCut />
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: 'Sans', data: sans, weight: 600, style: 'normal' },
        { name: 'Mono', data: mono, weight: 500, style: 'normal' },
      ],
    },
  )
}
