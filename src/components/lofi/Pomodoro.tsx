import { useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { SITE_CONFIG } from '../../site.config'
import { useLang } from '../../i18n'

const fmt = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

export default function Pomodoro() {
  const { pick } = useLang()
  const workSeconds = Math.max(1, (SITE_CONFIG.lofi.pomodoro.workMinutes || 25) * 60)
  const [remaining, setRemaining] = useState(workSeconds)
  const [running, setRunning] = useState(false)
  const endRef = useRef<number>(0)

  useEffect(() => {
    if (!running) return
    endRef.current = Date.now() + remaining * 1000
    const id = window.setInterval(() => {
      const left = Math.max(0, Math.round((endRef.current - Date.now()) / 1000))
      setRemaining(left)
      if (left <= 0) setRunning(false)
    }, 500)
    return () => window.clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running])

  const progress = running || remaining < workSeconds ? remaining / workSeconds : 1

  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-black/40 px-6 py-4 backdrop-blur-md">
      <p className="text-xs uppercase tracking-[0.2em] text-white/50">
        {pick({ zh: '番茄钟', en: 'Pomodoro' })}
      </p>
      <div className="relative grid size-24 place-items-center">
        <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
          <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="6" />
          <circle
            cx="50"
            cy="50"
            r="44"
            fill="none"
            stroke="#fbbf24"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${progress * 276} 276`}
            className="transition-[stroke-dasharray] duration-500 ease-out"
          />
        </svg>
        <span className="font-mono text-xl font-semibold text-amber-100">{fmt(remaining)}</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setRunning((r) => !r)}
          className="grid size-8 place-items-center rounded-full bg-gradient-to-br from-amber-300 to-orange-500 text-black transition-transform active:scale-95"
          aria-label={pick({ zh: running ? '暂停' : '开始', en: running ? 'Pause' : 'Start' })}
        >
          {running ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
        </button>
        <button
          onClick={() => {
            setRunning(false)
            setRemaining(workSeconds)
          }}
          className="grid size-8 place-items-center rounded-full border border-white/15 text-white/70 transition-colors hover:text-amber-200"
          aria-label={pick({ zh: '重置', en: 'Reset' })}
        >
          <RotateCcw className="size-3.5" />
        </button>
      </div>
    </div>
  )
}
