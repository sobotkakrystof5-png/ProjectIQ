'use client'

import { useEffect, useRef } from 'react'

interface Props {
  symbol?: string
  interval?: string
  height?: number
}

export function TradingViewChart({
  symbol = 'XETR:VWCE',
  interval = 'W',
  height = 420,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Clean up any previous widget
    container.innerHTML = ''

    const widgetDiv = document.createElement('div')
    widgetDiv.className = 'tradingview-widget-container__widget'
    widgetDiv.style.height = `${height - 32}px`
    widgetDiv.style.width = '100%'

    const script = document.createElement('script')
    script.type = 'text/javascript'
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js'
    script.async = true
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol,
      interval,
      timezone: 'Europe/Prague',
      theme: 'light',
      style: '1',
      locale: 'cs',
      allow_symbol_change: true,
      calendar: false,
      hide_side_toolbar: false,
      support_host: 'https://www.tradingview.com',
    })

    container.appendChild(widgetDiv)
    container.appendChild(script)

    return () => {
      if (container) container.innerHTML = ''
    }
  }, [symbol, interval, height])

  return (
    <div
      ref={containerRef}
      className="tradingview-widget-container w-full rounded-xl overflow-hidden border border-border"
      style={{ height }}
    />
  )
}

interface MiniChartProps {
  symbol?: string
  width?: number | string
  height?: number
}

export function TradingViewMiniChart({
  symbol = 'XETR:VWCE',
  height = 220,
}: MiniChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    container.innerHTML = ''

    const script = document.createElement('script')
    script.type = 'text/javascript'
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-mini-symbol-overview.js'
    script.async = true
    script.innerHTML = JSON.stringify({
      symbol,
      width: '100%',
      height,
      locale: 'cs',
      dateRange: '1Y',
      colorTheme: 'light',
      isTransparent: false,
      autosize: true,
      largeChartUrl: '',
    })

    container.appendChild(script)

    return () => {
      if (container) container.innerHTML = ''
    }
  }, [symbol, height])

  return (
    <div
      ref={containerRef}
      className="tradingview-widget-container w-full rounded-xl overflow-hidden border border-border"
      style={{ height }}
    />
  )
}
