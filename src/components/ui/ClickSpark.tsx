// Adapted from ReactBits "Click Spark" (https://reactbits.dev/animations/click-spark), TS + Tailwind variant.
// Changes: canvas drawn above children (sparks were hidden under opaque cards), devicePixelRatio
// scaling for crisp lines on phones, rAF loop only runs while sparks are alive, pointer events
// (touch + mouse), and honors prefers-reduced-motion.
import React, { useCallback, useEffect, useRef } from 'react'

interface ClickSparkProps {
  sparkColor?: string
  sparkSize?: number
  sparkRadius?: number
  sparkCount?: number
  duration?: number
  extraScale?: number
  className?: string
  style?: React.CSSProperties
  children?: React.ReactNode
}

interface Spark {
  x: number
  y: number
  angle: number
  startTime: number
}

const easeOut = (t: number) => t * (2 - t)

export default function ClickSpark({
  sparkColor = '#E98C6B',
  sparkSize = 10,
  sparkRadius = 18,
  sparkCount = 8,
  duration = 400,
  extraScale = 1.0,
  className,
  style,
  children,
}: ClickSparkProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sparksRef = useRef<Spark[]>([])
  const frameRef = useRef<number | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const parent = canvas?.parentElement
    if (!canvas || !parent) return
    const resize = () => {
      const { width, height } = parent.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
    }
    const ro = new ResizeObserver(resize)
    ro.observe(parent)
    resize()
    return () => ro.disconnect()
  }, [])

  const draw = useCallback(
    (timestamp: number) => {
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (!canvas || !ctx) return
      const dpr = window.devicePixelRatio || 1
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      sparksRef.current = sparksRef.current.filter((spark) => {
        const elapsed = timestamp - spark.startTime
        if (elapsed >= duration) return false
        const eased = easeOut(Math.max(0, elapsed) / duration)
        const distance = eased * sparkRadius * extraScale
        const lineLength = sparkSize * (1 - eased)
        ctx.strokeStyle = sparkColor
        ctx.lineWidth = 2
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(spark.x + distance * Math.cos(spark.angle), spark.y + distance * Math.sin(spark.angle))
        ctx.lineTo(
          spark.x + (distance + lineLength) * Math.cos(spark.angle),
          spark.y + (distance + lineLength) * Math.sin(spark.angle),
        )
        ctx.stroke()
        return true
      })

      frameRef.current = sparksRef.current.length ? requestAnimationFrame(draw) : null
    },
    [duration, extraScale, sparkColor, sparkRadius, sparkSize],
  )

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    },
    [],
  )

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const now = performance.now()
    sparksRef.current.push(
      ...Array.from({ length: sparkCount }, (_, i) => ({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        angle: (2 * Math.PI * i) / sparkCount,
        startTime: now,
      })),
    )
    if (frameRef.current === null) frameRef.current = requestAnimationFrame(draw)
  }

  return (
    <div className={`relative ${className ?? ''}`} style={style} onPointerDown={handlePointerDown}>
      {children}
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 z-10 h-full w-full" />
    </div>
  )
}
