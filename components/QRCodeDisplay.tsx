'use client'

import { QRCodeSVG } from 'qrcode.react'

interface QRCodeDisplayProps {
  url: string
}

export function QRCodeDisplay({ url }: QRCodeDisplayProps) {
  return (
    <div className="inline-flex flex-col items-center gap-3">
      <div className="p-3 bg-white border border-gray-100 rounded-xl">
        <QRCodeSVG
          value={url}
          size={140}
          bgColor="#ffffff"
          fgColor="#111827"
          level="M"
        />
      </div>
      <p className="text-xs text-gray-400 max-w-[160px] text-center break-all">{url}</p>
    </div>
  )
}
