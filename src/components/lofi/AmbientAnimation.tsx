import { useEffect, useRef } from 'react'

export type AmbientMode = 'rain' | 'snow' | 'particles'

const CAPS: Record<AmbientMode, number> = { rain: 60, snow: 40, particles: 50 }

type Particle = {
  x: number
  y: number
  len: number
  speed: number
  alpha: number
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

export default function AmbientAnimation({ mode }: { mode: AmbientMode }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!

    let raf = 0
    let w = 0
    let h = 0
    const cap = CAPS[mode]
    const items: Particle[] = []
    const reduced = prefersReducedMotion()

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = Math.max(1, canvas.clientWidth)
      h = Math.max(1, canvas.clientHeight)
      canvas.width = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (reduced) {
        frame()
        cancelAnimationFrame(raf)
      }
    }
    window.addEventListener('resize', resize)

    const spawn = (): Particle => {
      if (mode === 'rain') {
        return {
          x: Math.random() * w,
          y: -24,
          len: 12 + Math.random() * 16,
          speed: 7 + Math.random() * 9,
          alpha: 0.2 + Math.random() * 0.35,
        }
      }
      if (mode === 'snow') {
        return {
          x: Math.random() * w,
          y: -8,
          len: 1.5 + Math.random() * 2,
          speed: 0.5 + Math.random() * 1.2,
          alpha: 0.4 + Math.random() * 0.6,
        }
      }
      return {
        x: Math.random() * w,
        y: Math.random() * h,
        len: 1.2 + Math.random() * 1.8,
        speed: 0.08 + Math.random() * 0.4,
        alpha: 0.3 + Math.random() * 0.6,
      }
    }

    function frame() {
      ctx.clearRect(0, 0, w, h)
      for (let i = 0; i < items.length; i++) {
        const p = items[i]
        if (mode === 'particles') {
          p.y -= p.speed
          p.x += Math.sin(p.y * 0.015) * 0.3
          if (p.y < -4) {
            p.y = h + 4
            p.x = Math.random() * w
          }
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.len, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(255, 235, 210, ${Math.max(0, Math.min(1, p.alpha))})`
          ctx.fill()
        } else if (mode === 'rain') {
          p.y += p.speed
          if (p.y > h + 28) Object.assign(p, spawn())
          ctx.beginPath()
          ctx.moveTo(p.x, p.y)
          ctx.lineTo(p.x - p.len * 0.28, p.y - p.len)
          ctx.strokeStyle = `rgba(175, 195, 235, ${p.alpha})`
          ctx.lineWidth = 1
          ctx.stroke()
        } else {
          p.y += p.speed
          if (p.y > h + 8) Object.assign(p, spawn())
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.len, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(255, 255, 255, ${Math.max(0, Math.min(1, p.alpha))})`
          ctx.fill()
        }
      }
      raf = requestAnimationFrame(frame)
    }

    resize()
    for (let i = 0; i < cap; i++) items.push(spawn())

    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf)
        raf = 0
      } else if (!raf) {
        raf = requestAnimationFrame(frame)
      }
    }

    if (reduced) {
      // render a single static frame, no animation loop
      frame()
      cancelAnimationFrame(raf)
    } else {
      document.addEventListener('visibilitychange', onVisibility)
      raf = requestAnimationFrame(frame)
    }

    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('resize', resize)
    }
  }, [mode])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 h-full w-full"
    />
  )
}
