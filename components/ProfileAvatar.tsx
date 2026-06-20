'use client'

import { useState } from 'react'

export function ProfileAvatar({ initials }: { initials: string }) {
  const [imgFailed, setImgFailed] = useState(false)

  return (
    <div className="relative w-20 h-20 rounded-2xl overflow-hidden shadow-sm shrink-0">
      <div className="absolute inset-0 brand-gradient flex items-center justify-center">
        <span className="text-white font-bold text-xl tracking-tight">{initials}</span>
      </div>
      {!imgFailed && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="/profile.jpg"
          alt="Profilová fotka"
          className="absolute inset-0 w-full h-full object-cover"
          onError={() => setImgFailed(true)}
        />
      )}
    </div>
  )
}
