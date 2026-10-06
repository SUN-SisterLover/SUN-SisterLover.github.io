import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { SITE_CONFIG } from '../site.config'
import { withBase } from '../lib/base'

export type TrackMeta = {
  title: string
  artist: string
  cover: string
  url: string
}

type AudioCtx = {
  available: boolean
  playing: boolean
  active: boolean
  setActive: (v: boolean) => void
  /** override the home BGM with another track (e.g. article audio); null restores the BGM */
  setTrack: (t: TrackMeta | null) => void
  toggle: () => void
  currentTime: number
  duration: number
  seek: (t: number) => void
  volume: number
  setVolume: (v: number) => void
  muted: boolean
  toggleMute: () => void
  meta: TrackMeta
  /** true when the local-BGM fallback is available (NetEase off) */
  showLocalBgm: boolean
}

function clamp01(v: number) {
  return Math.min(1, Math.max(0, v))
}

const EMPTY_META: TrackMeta = { title: 'Untitled', artist: '', cover: '', url: '' }

const Ctx = createContext<AudioCtx | null>(null)

export function AudioProvider({ children }: { children: ReactNode }) {
  const cfg = SITE_CONFIG.audio.home
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [active, setActive] = useState(false)
  const [track, setTrack] = useState<TrackMeta | null>(null)
  const [homeIndex, setHomeIndex] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolumeState] = useState(() => clamp01(cfg.volume ?? 0.2))
  const [muted, setMuted] = useState(false)

  // keep latest volume/mute readable inside the element-creation effect
  const volumeRef = useRef(volume)
  volumeRef.current = volume
  const mutedRef = useRef(muted)
  mutedRef.current = muted

  // homepage playlist (played in order, looped)
  const homeTracks: TrackMeta[] = cfg.enabled
    ? cfg.tracks
        .filter((t) => t.url)
        .map((t) => ({
          title: t.title || 'Untitled',
          artist: t.artist || '',
          cover: t.cover || '',
          url: t.url,
        }))
    : []
  const homeTrack = homeTracks.length ? homeTracks[homeIndex % homeTracks.length] : null

  const isOverride = track !== null
  const current = track ?? homeTrack
  const available = !!current
  const currentUrl = current?.url ?? ''
  const homeCount = homeTracks.length

  // create / destroy the shared audio element whenever the track changes
  useEffect(() => {
    if (!currentUrl) return
    const el = new Audio(withBase(currentUrl))
    // single home track loops itself; multi-track playlist advances on "ended"
    el.loop = !isOverride && homeCount <= 1
    el.preload = 'auto'
    el.crossOrigin = 'anonymous'  // 允许播放跨域音频 URL（网易云 CDN）
    el.volume = volumeRef.current
    el.muted = mutedRef.current
    el.addEventListener('play', () => setPlaying(true))
    el.addEventListener('pause', () => setPlaying(false))
    el.addEventListener('timeupdate', () => setCurrentTime(el.currentTime))
    el.addEventListener('loadedmetadata', () => setDuration(el.duration || 0))
    el.addEventListener('ended', () => {
      if (!isOverride && homeCount > 1) {
        setHomeIndex((i) => (i + 1) % homeCount)
      }
    })
    audioRef.current = el
    setCurrentTime(0)
    setDuration(0)
    return () => {
      el.pause()
      el.removeAttribute('src')
      el.load()
      audioRef.current = null
      setPlaying(false)
    }
  }, [currentUrl, isOverride, homeCount])

  // playback policy: article track plays when set; home BGM plays on the homepage
  useEffect(() => {
    const el = audioRef.current
    if (!el) return

    const shouldPlay = isOverride || active
    if (shouldPlay) {
      const p = el.play()
      if (p && typeof p.catch === 'function') {
        // browsers block unmuted autoplay until a user gesture
        p.catch(() => {
          const start = () => {
            el.play().catch(() => {})
            window.removeEventListener('pointerdown', start)
            window.removeEventListener('keydown', start)
          }
          window.addEventListener('pointerdown', start, { once: true })
          window.addEventListener('keydown', start, { once: true })
        })
      }
    } else {
      el.pause()
    }
  }, [active, isOverride, currentUrl])

  const toggle = () => {
    const el = audioRef.current
    if (!el) return
    if (el.paused) el.play().catch(() => {})
    else el.pause()
  }

  const seek = (t: number) => {
    const el = audioRef.current
    if (!el) return
    el.currentTime = t
    setCurrentTime(t)
  }

  const setVolume = (v: number) => {
    const vol = clamp01(v)
    setVolumeState(vol)
    const el = audioRef.current
    if (el) el.volume = vol
    // adjusting volume implicitly unmutes
    if (muted && vol > 0) {
      setMuted(false)
      if (el) el.muted = false
    }
  }

  const toggleMute = () => {
    const next = !muted
    setMuted(next)
    const el = audioRef.current
    if (el) el.muted = next
  }

  return (
    <Ctx.Provider
      value={{
        available,
        playing,
        active,
        setActive,
        setTrack,
        toggle,
        currentTime,
        duration,
        seek,
        volume,
        setVolume,
        muted,
        toggleMute,
        meta: current ?? EMPTY_META,
        showLocalBgm: Boolean(!SITE_CONFIG.netease.enabled && available),
      }}
    >
      {children}
    </Ctx.Provider>
  )
}

export function useBgm() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useBgm must be used within AudioProvider')
  return ctx
}
