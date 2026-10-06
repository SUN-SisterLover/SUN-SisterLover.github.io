import { useEffect, useRef, useState } from 'react'
import { useLofiAudio } from './LofiAudioContext'
import { useLang } from '../../i18n'

/** format seconds as M:SS or H:MM:SS (e.g. 61 min -> 1:01:26) */
function formatTime(total: number): string {
  if (!Number.isFinite(total) || total < 0) return '0:00'
  const s = Math.floor(total % 60)
  const m = Math.floor((total / 60) % 60)
  const h = Math.floor(total / 3600)
  const ss = String(s).padStart(2, '0')
  const mm = String(m).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`
}

export default function LofiProgressBar() {
  const { pick } = useLang()
  const { mediaRef, audioVersion } = useLofiAudio()
  const [value, setValue] = useState(0)
  const [duration, setDuration] = useState(0)
  const valueRef = useRef(0)
  const scrubbingRef = useRef(false)

  // follow the shared <video> element; re-attach when VideoWallpaper swaps it
  useEffect(() => {
    const el = mediaRef.current
    if (!el) return
    const onTime = () => {
      if (!scrubbingRef.current) {
        valueRef.current = el.currentTime
        setValue(el.currentTime)
      }
    }
    const onMeta = () => setDuration(el.duration)
    el.addEventListener('timeupdate', onTime)
    el.addEventListener('loadedmetadata', onMeta)
    el.addEventListener('durationchange', onMeta)
    valueRef.current = el.currentTime
    setValue(el.currentTime)
    setDuration(el.duration)
    return () => {
      el.removeEventListener('timeupdate', onTime)
      el.removeEventListener('loadedmetadata', onMeta)
      el.removeEventListener('durationchange', onMeta)
    }
  }, [audioVersion])

  const ready = Number.isFinite(duration) && duration > 0
  const max = ready ? duration : 0

  // commit the drag/keyboard value as a real seek (not on every input tick)
  const commit = () => {
    scrubbingRef.current = false
    const el = mediaRef.current
    if (!el) return
    el.currentTime = valueRef.current
  }

  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 text-right text-xs tabular-nums text-white/40">
        {formatTime(value)}
      </span>
      <input
        type="range"
        min={0}
        max={max}
        step={0.1}
        value={Math.min(value, max)}
        disabled={!ready}
        aria-label={pick({ zh: '播放进度', en: 'Playback progress' })}
        onInput={(e) => {
          scrubbingRef.current = true
          valueRef.current = Number(e.currentTarget.value)
          setValue(valueRef.current)
        }}
        onPointerDown={() => {
          scrubbingRef.current = true
        }}
        onPointerUp={commit}
        onPointerCancel={commit}
        onKeyUp={(e) => {
          if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) {
            commit()
          }
        }}
        className="min-w-0 flex-1 accent-amber-400"
      />
      <span className="w-14 shrink-0 text-xs tabular-nums text-white/40">
        {formatTime(duration)}
      </span>
    </div>
  )
}
