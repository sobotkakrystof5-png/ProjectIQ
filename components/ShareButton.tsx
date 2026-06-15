'use client'

import { useState } from 'react'
import { Link2, Check } from 'lucide-react'
import { cn, getPublicUrl } from '@/lib/utils'

interface ShareButtonProps {
  token: string
  className?: string
  variant?: 'icon' | 'full'
}

export function ShareButton({ token, className, variant = 'full' }: ShareButtonProps) {
  const [copied, setCopied] = useState(false)

  async function handleCopy(e: React.MouseEvent) {
    e.stopPropagation()
    const url = getPublicUrl(token)
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (variant === 'icon') {
    return (
      <button
        onClick={handleCopy}
        className={cn(
          'p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors',
          className
        )}
        title="Kopírovat klientský odkaz"
      >
        {copied ? <Check size={16} strokeWidth={1.5} className="text-emerald-500" /> : <Link2 size={16} strokeWidth={1.5} />}
      </button>
    )
  }

  return (
    <button
      onClick={handleCopy}
      className={cn(
        'inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors',
        className
      )}
    >
      {copied ? (
        <>
          <Check size={14} strokeWidth={1.5} className="text-emerald-500" />
          <span className="text-emerald-600">Zkopírováno</span>
        </>
      ) : (
        <>
          <Link2 size={14} strokeWidth={1.5} />
          <span>Kopírovat odkaz</span>
        </>
      )}
    </button>
  )
}
