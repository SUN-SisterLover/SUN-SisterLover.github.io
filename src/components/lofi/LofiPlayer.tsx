import { useEffect, useRef, useState } from 'react'
import { ListMusic, Play, Pause, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react'
import { useLofiAudio } from './LofiAudioContext'
import { SITE_CONFIG } from '../../site.config'
import { useLang } from '../../i18n'
import LofiProgressBar from './LofiProgressBar'

export default function LofiPlayer() {
  const { pick } = useLang()
  const videos = SITE_CONFIG.lofi.wallpapers.videos
  const {
    mediaRef,
    index,
    setIndex,
    isPlaying,
    playlistOpen,
    setPlaylistOpen,
    wantPlayRef,
    requestPlay,
    audioVersion,
  } = useLofiAudio()
  const [volume, setVolume] = useState(0.6)
  const [muted, setMuted] = useState(false)
  const [needsGesture, setNeedsGesture] = useState(false)
  const hasMountedRef = useRef(false)

  const current = videos.length > 0 ? videos[index % videos.length] : null

  // clear the gesture prompt as soon as playback actually starts
  useEffect(() => {
    if (isPlaying) setNeedsGesture(false)
  }, [isPlaying])

  // playback control — runs once per video element swap. The element is owned by
  // VideoWallpaper; we attach listeners and drive play()/pause() on it here.
  useEffect(() => {
    // audioVersion 0 means VideoWallpaper hasn't attached an element yet
    if (audioVersion === 0) return
    const el = mediaRef.current
    if (!el) return

    el.volume = muted ? 0 : volume
    el.muted = muted

    if (!hasMountedRef.current) {
      // first mount: attempt autoplay exactly once (subject to browser gesture policy)
      hasMountedRef.current = true
      wantPlayRef.current = true
      if (SITE_CONFIG.lofi.autoplay) {
        const p = el.play()
        if (p && typeof p.catch === 'function') p.catch(() => setNeedsGesture(true))
      }
    } else if (wantPlayRef.current) {
      // index change while the user was playing: auto-continue (paused → stays paused)
      const p = el.play()
      if (p && typeof p.catch === 'function') p.catch(() => setNeedsGesture(true))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioVersion])

  // keep volume / mute in sync without re-attaching listeners
  useEffect(() => {
    const el = mediaRef.current
    if (!el) return
    el.volume = muted ? 0 : volume
    el.muted = muted
  }, [volume, muted, audioVersion])

  const toggle = () => {
    const el = mediaRef.current
    if (!el) return
    if (el.paused) {
      requestPlay()
    } else {
      wantPlayRef.current = false
      el.pause()
    }
  }

  const goTo = (delta: number) => {
    const len = videos.length
    if (len === 0) return
    setIndex((i) => (i + delta + len) % len)
  }

  if (!current) return null

  return (
    <div className="w-96 max-w-[calc(100vw-2rem)] rounded-2xl border border-white/10 bg-black/40 px-5 py-4 backdrop-blur-md">
      {needsGesture && !isPlaying && (
        <button
          onClick={() => {
            requestPlay()
            setNeedsGesture(false)
          }}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-amber-300 to-orange-500 px-4 py-2 text-sm font-semibold text-black shadow-lg shadow-orange-500/20 transition-transform active:scale-[0.98]"
        >
          <span aria-hidden>🔊</span>
          {pick({ zh: '点击开启音乐', en: 'Tap to play music' })}
        </button>
      )}
      <div className="flex items-center gap-4">
        {/* spinning record disc */}
        <div className="relative size-16 shrink-0">
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-zinc-700 via-zinc-900 to-black shadow-inner" />
          <div className="absolute inset-2 rounded-full bg-gradient-to-br from-amber-300 to-orange-500" />
          <div
            className={`absolute inset-0 rounded-full ${isPlaying ? 'animate-spin-slow' : ''}`}
            style={{
              background:
                'repeating-radial-gradient(circle at 50% 50%, rgba(255,255,255,0.06) 0 2px, transparent 2px 6px)',
            }}
          />
          <div className="absolute left-1/2 top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black" />
        </div>

        {/* video info + controls */}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-amber-100">{current.title}</p>
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={() => goTo(-1)}
              aria-label={pick({ zh: '上一首', en: 'Previous' })}
              className="text-white/60 transition-colors hover:text-amber-200"
            >
              <SkipBack className="size-4" />
            </button>
            <button
              onClick={toggle}
              aria-label={pick({ zh: isPlaying ? '暂停' : '播放', en: isPlaying ? 'Pause' : 'Play' })}
              className="grid size-9 place-items-center rounded-full bg-gradient-to-br from-amber-300 to-orange-500 text-black shadow-lg shadow-orange-500/20 transition-transform active:scale-95"
            >
              {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
            </button>
            <button
              onClick={() => goTo(1)}
              aria-label={pick({ zh: '下一首', en: 'Next' })}
              className="text-white/60 transition-colors hover:text-amber-200"
            >
              <SkipForward className="size-4" />
            </button>
            <button
              onClick={() => setMuted((m) => !m)}
              aria-label={pick({ zh: muted ? '取消静音' : '静音', en: muted ? 'Unmute' : 'Mute' })}
              className="text-white/60 transition-colors hover:text-amber-200"
            >
              {muted || volume === 0 ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              aria-label={pick({ zh: '音量', en: 'Volume' })}
              className="w-16"
            />
            <button
              onClick={() => setPlaylistOpen((o) => !o)}
              aria-label={pick({ zh: '歌曲列表', en: 'Playlist' })}
              aria-expanded={playlistOpen}
              className={`transition-colors hover:text-amber-200 ${playlistOpen ? 'text-amber-200' : 'text-white/60'}`}
            >
              <ListMusic className="size-4" />
            </button>
          </div>
        </div>
      </div>
      <div className="mt-3 border-t border-white/5 pt-3">
        <LofiProgressBar />
      </div>
    </div>
  )
}
