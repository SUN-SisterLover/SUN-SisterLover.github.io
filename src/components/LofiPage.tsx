import { useEffect, useState } from 'react'
import { ArrowLeft, CloudRain, Snowflake, Sparkles } from 'lucide-react'
import { useBgm } from './AudioProvider'
import { useLang } from '../i18n'
import { SITE_CONFIG } from '../site.config'
import { withBase } from '../lib/base'
import AmbientAnimation, { type AmbientMode } from './lofi/AmbientAnimation'
import Live2D from './lofi/Live2D'
import { LofiAudioProvider } from './lofi/LofiAudioContext'
import LofiPlayer from './lofi/LofiPlayer'
import LofiPlaylist from './lofi/LofiPlaylist'
import LofiVisualizer from './lofi/LofiVisualizer'
import Pomodoro from './lofi/Pomodoro'
import VideoWallpaper from './lofi/VideoWallpaper'

const AMBIENT_ITEMS: { id: AmbientMode; icon: typeof CloudRain; label: { zh: string; en: string } }[] = [
  { id: 'rain', icon: CloudRain, label: { zh: '雨', en: 'Rain' } },
  { id: 'snow', icon: Snowflake, label: { zh: '雪', en: 'Snow' } },
  { id: 'particles', icon: Sparkles, label: { zh: '星', en: 'Stars' } },
]

export default function LofiPage() {
  const { pick } = useLang()
  const { setActive } = useBgm()
  const [mode, setMode] = useState<AmbientMode>(SITE_CONFIG.lofi.ambient.default)

  // silence the main-site BGM while on the lofi page
  useEffect(() => {
    setActive(false)
  }, [setActive])

  const lofi = SITE_CONFIG.lofi
  if (!lofi.enabled) return null

  return (
    <div className="relative isolate min-h-[100dvh] overflow-hidden bg-[#1e1b2e] text-[#f5f5f0]">
      <AmbientAnimation mode={mode} />

      {/* warm vignette over the animation */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(0,0,0,0.55)_100%)]"
      />

      <LofiAudioProvider>
        {/* full-screen video wallpaper — owns the shared media element */}
        <VideoWallpaper />
        {/* top bar: back / title / ambient switcher */}
        <header className="fixed inset-x-0 top-0 z-30 flex items-center justify-between px-5 py-4 md:px-8">
          <a
            href={withBase('/')}
            className="flex items-center gap-2 text-sm text-white/60 transition-colors hover:text-amber-200 press-sm"
          >
            <ArrowLeft className="size-4" />
            {pick({ zh: '返回博客', en: 'Back to blog' })}
          </a>
          <div className="text-center">
            <p className="text-lg font-semibold tracking-[0.25em] text-amber-100">
              {pick({ zh: '深夜自习室', en: 'Lo-fi Study Room' })}
            </p>
            <p className="mt-0.5 text-xs text-white/40">
              {pick({ zh: '戴上耳机 沉下来', en: 'Put on headphones, sink in' })}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {AMBIENT_ITEMS.map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                onClick={() => setMode(id)}
                aria-label={pick(label)}
                title={pick(label)}
                className={`grid size-9 place-items-center rounded-full border transition-colors press-sm ${
                  mode === id
                    ? 'border-amber-300/60 bg-amber-300/15 text-amber-200'
                    : 'border-white/10 text-white/50 hover:text-white'
                }`}
              >
                <Icon className="size-4" />
              </button>
            ))}
          </div>
        </header>

        {/* mascot */}
        <Live2D />

        {/* bottom widgets: player (+ optional pomodoro) */}
        <main className="fixed inset-x-0 bottom-6 z-30 flex flex-col items-center gap-4 px-5">
          <div className="flex flex-wrap items-end justify-center gap-4">
            {!lofi.pomodoro.hidden && <Pomodoro />}
            <LofiPlayer />
          </div>
        </main>

        <LofiVisualizer />
        <LofiPlaylist />

        {/* subtle corner credit */}
        <p className="pointer-events-none fixed bottom-2 right-3 z-20 text-[10px] uppercase tracking-widest text-white/20">
          lofi · self-hosted
        </p>
      </LofiAudioProvider>
    </div>
  )
}
