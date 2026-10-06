import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
  seek: (t: number) => void
  volume: number
  setVolume: (v: number) => void
  muted: boolean
  toggleMute: () => void
  meta: TrackMeta
  /** true when the local-BGM fallback is available (NetEase off) */
  showLocalBgm: boolean
}

/** playback progress — updates once per second while playing; kept in a
 *  separate context so the whole page doesn't re-render with every tick */
type AudioProgress = {
  currentTime: number
  duration: number
}

function clamp01(v: number) {
  return Math.min(1, Math.max(0, v))
}

const EMPTY_META: TrackMeta = { title: 'Untitled', artist: '', cover: '', url: '' }

const Ctx = createContext<AudioCtx | null>(null)
const ProgressCtx = createContext<AudioProgress | null>(null)

/** session-persisted playback state so a page reload resumes instead of restarting */
const BGM_STATE_KEY = 'bgm-state'

function readSavedState(): { url: string; t: number; userPaused: boolean } | null {
  try {
    const raw = sessionStorage.getItem(BGM_STATE_KEY)
    if (!raw) return null
    const s = JSON.parse(raw)
    if (typeof s?.url !== 'string') return null
    return { url: s.url, t: typeof s.t === 'number' ? s.t : 0, userPaused: s.userPaused === true }
  } catch {
    return null
  }
}

function writeSavedState(url: string, t: number, userPaused: boolean) {
  try {
    sessionStorage.setItem(BGM_STATE_KEY, JSON.stringify({ url, t, userPaused }))
  } catch {}
}

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
  // explicit user pause sticks across navigation and reloads — playback
  // policy must never resurrect music the user turned off
  const [userPaused, setUserPaused] = useState(() => readSavedState()?.userPaused ?? false)

  // keep latest volume/mute readable inside the element-creation effect
  const volumeRef = useRef(volume)
  volumeRef.current = volume
  const mutedRef = useRef(muted)
  mutedRef.current = muted
  const userPausedRef = useRef(userPaused)
  userPausedRef.current = userPaused

  // single-flight autoplay-retry listener: previously every blocked play()
  // stacked another pointerdown/keydown pair, and `{ once: true }` only
  // covered one of the two — the survivor restarted music after the user
  // had explicitly paused
  const retryRef = useRef<(() => void) | null>(null)
  const clearRetry = () => {
    if (retryRef.current) {
      window.removeEventListener('pointerdown', retryRef.current)
      window.removeEventListener('keydown', retryRef.current)
      retryRef.current = null
    }
  }

  // homepage playlist (played in order, looped)
  const homeTracks: TrackMeta[] = useMemo(
    () =>
      cfg.enabled
        ? cfg.tracks
            .filter((t) => t.url)
            .map((t) => ({
              title: t.title || 'Untitled',
              artist: t.artist || '',
              cover: t.cover || '',
              url: t.url,
            }))
        : [],
    [cfg],
  )
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
    // progress state updates at 1s granularity — sub-second ticks only
    // churned the context without any visible UI difference
    el.addEventListener('timeupdate', () => {
      const t = Math.floor(el.currentTime)
      setCurrentTime((prev) => (prev === t ? prev : t))
      writeSavedState(currentUrl, el.currentTime, userPausedRef.current)
    })
    el.addEventListener('loadedmetadata', () => setDuration(el.duration || 0))
    el.addEventListener('ended', () => {
      if (!isOverride && homeCount > 1) {
        setHomeIndex((i) => (i + 1) % homeCount)
      }
    })
    // resume where the previous page left off (reload / navigation)
    const saved = readSavedState()
    if (saved && saved.url === currentUrl && saved.t > 0) {
      el.currentTime = saved.t
      setCurrentTime(Math.floor(saved.t))
    } else {
      setCurrentTime(0)
    }
    setDuration(0)
    audioRef.current = el
    return () => {
      el.pause()
      el.removeAttribute('src')
      el.load()
      audioRef.current = null
      setPlaying(false)
    }
  }, [currentUrl, isOverride, homeCount])

  // playback policy: override track plays when set; home BGM plays unless the
  // user explicitly paused it
  useEffect(() => {
    const el = audioRef.current
    if (!el) return

    const shouldPlay = (isOverride || active) && !userPaused
    if (shouldPlay) {
      const p = el.play()
      if (p && typeof p.catch === 'function') {
        // browsers block unmuted autoplay until a user gesture
        p.catch(() => {
          clearRetry()
          const start = () => {
            if (!userPausedRef.current) el.play().catch(() => {})
            clearRetry()
          }
          retryRef.current = start
          window.addEventListener('pointerdown', start)
          window.addEventListener('keydown', start)
        })
      }
    } else {
      el.pause()
    }
    return clearRetry
  }, [active, isOverride, currentUrl, userPaused])

  const toggle = () => {
    const el = audioRef.current
    if (!el) return
    if (el.paused) {
      setUserPaused(false)
      userPausedRef.current = false
      clearRetry()
      el.play().catch(() => {})
    } else {
      // an explicit pause must cancel any pending autoplay retry
      clearRetry()
      setUserPaused(true)
      userPausedRef.current = true
      el.pause()
      writeSavedState(currentUrl, el.currentTime, true)
    }
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

  const meta = current ?? EMPTY_META
  // explicit song pick (floating player) overrides the user's pause state
  const selectTrack = useCallback((t: TrackMeta | null) => {
    if (t) {
      setUserPaused(false)
      userPausedRef.current = false
      clearRetry()
    }
    setTrack(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const value = useMemo<AudioCtx>(
    () => ({
      available,
      playing,
      active,
      setActive,
      setTrack: selectTrack,
      toggle,
      seek,
      volume,
      setVolume,
      muted,
      toggleMute,
      meta,
      showLocalBgm: Boolean(!SITE_CONFIG.netease.enabled && available),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [available, playing, active, volume, muted, meta, selectTrack],
  )
  const progress = useMemo<AudioProgress>(
    () => ({ currentTime, duration }),
    [currentTime, duration],
  )

  return (
    <Ctx.Provider value={value}>
      <ProgressCtx.Provider value={progress}>{children}</ProgressCtx.Provider>
    </Ctx.Provider>
  )
}

export function useBgm() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useBgm must be used within AudioProvider')
  return ctx
}

export function useBgmProgress() {
  const ctx = useContext(ProgressCtx)
  if (!ctx) throw new Error('useBgmProgress must be used within AudioProvider')
  return ctx
}
