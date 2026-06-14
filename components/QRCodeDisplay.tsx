'use client'

import { useRef } from 'react'
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react'
import { Download } from 'lucide-react'

interface QRCodeDisplayProps {
  url: string
}

export function QRCodeDisplay({ url }: QRCodeDisplayProps) {
  const hiddenRef = useRef<HTMLDivElement>(null)

  function handleDownload() {
    const canvas = hiddenRef.current?.querySelector('canvas')
    if (!canvas) return
    const a = document.createElement('a')
    a.href = canvas.toDataURL('image/png')
    a.download = 'klientsky-portal-qr.png'
    a.click()
  }

  return (
    <div className="inline-flex flex-col items-center gap-2">
      <div className="p-3 bg-white border border-gray-100 rounded-xl">
        <QRCodeSVG
          value={url}
          size={140}
          bgColor="#ffffff"
          fgColor="#111827"
          level="M"
        />
      </div>
      <div ref={hiddenRef} className="hidden">
        <QRCodeCanvas value={url} size={400} />
      </div>
      <button
        onClick={handleDownload}
        className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
      >
        <Download size={13} strokeWidth={1.5} />
        Stáhnout QR
      </button>
    </div>
  )
}
