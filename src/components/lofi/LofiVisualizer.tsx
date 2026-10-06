import { useEffect, useRef } from 'react'
import { SITE_CONFIG } from '../../site.config'
import { useLofiAudio } from './LofiAudioContext'

export default function LofiVisualizer() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const { mediaRef, resumeRef, audioVersion } = useLofiAudio()
  const cfg = SITE_CONFIG.lofi.visualizer
  const barCount = cfg.bars

  useEffect(() => {
    // On the first commit VideoWallpaper hasn't attached the element yet (audioVersion
    // starts at 0); VideoWallpaper bumps it after assigning mediaRef.current, so skip
    // the initial run to avoid attaching createMediaElementSource twice to the
    // same element (which throws InvalidStateError).
    if (audioVersion === 0) return

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let audioCtx: AudioContext | null = null
    let analyser: AnalyserNode | null = null as AnalyserNode | null
    let silentSource: AudioBufferSourceNode | null = null
    let raf = 0
    let w = 0
    let h = 0

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = Math.max(1, canvas.clientWidth)
      h = Math.max(1, canvas.clientHeight)
      canvas.width = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const init = () => {
      const el = mediaRef.current
      if (!el) return
      try {
        audioCtx = new AudioContext()
        const src = audioCtx.createMediaElementSource(el)
        analyser = audioCtx.createAnalyser()
        analyser.fftSize = 256
        analyser.smoothingTimeConstant = 0.82
        src.connect(analyser)
        analyser.connect(audioCtx.destination)
        // silent buffer so the spectrum shows a faint signal even before music plays
        const buf = audioCtx.createBuffer(1, audioCtx.sampleRate, audioCtx.sampleRate)
        silentSource = audioCtx.createBufferSource()
        silentSource.buffer = buf
        silentSource.loop = true
        silentSource.connect(analyser)
        if (audioCtx.state === 'suspended') void audioCtx.resume().catch(() => {})
        silentSource.start()
        // expose a gesture-time resume so the click-degrade button / play toggle
        // can un-suspend the context on a fresh deep-link where autoplay is blocked
        resumeRef.current = () => {
          if (audioCtx?.state === 'suspended') void audioCtx.resume().catch(() => {})
        }
      } catch {
        // AudioContext unavailable / already attached — skip visualization
      }
    }
    init()

    const freq = new Uint8Array(analyser?.frequencyBinCount ?? 0)

    const frame = () => {
      if (!analyser) {
        raf = requestAnimationFrame(frame)
        return
      }
      analyser.getByteFrequencyData(freq)
      ctx.clearRect(0, 0, w, h)
      const usable = Math.min(barCount, freq.length)
      const bw = w / usable
      const gap = Math.max(2, bw * 0.18)
      for (let i = 0; i < usable; i++) {
        const v = freq[i] / 255
        const bh = Math.max(3, v * h * 0.9)
        const x = i * bw + gap / 2
        // gradient: warm orange → pink/purple by bar index
        const hue = 18 + (i / usable) * 120
        ctx.fillStyle = `hsla(${hue}, 90%, ${55 + v * 12}%, ${0.55 + v * 0.4})`
        ctx.fillRect(x, h - bh, bw - gap, bh)
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf)
        raf = 0
      } else if (!raf) {
        raf = requestAnimationFrame(frame)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', onVisibility)
      resumeRef.current = null
      try {
        silentSource?.stop()
        silentSource?.disconnect()
        analyser?.disconnect()
        void audioCtx?.close()
      } catch {
        // ignore
      }
    }
  }, [mediaRef, barCount, audioVersion, resumeRef])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed bottom-32 left-1/2 z-10 h-28 w-[min(60vw,420px)] -translate-x-1/2 opacity-60"
    />
  )
}
