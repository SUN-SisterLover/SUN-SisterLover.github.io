import { X } from 'lucide-react'
import { useLofiAudio } from './LofiAudioContext'
import { SITE_CONFIG } from '../../site.config'
import { useLang } from '../../i18n'

export default function LofiPlaylist() {
  const { pick } = useLang()
  const videos = SITE_CONFIG.lofi.wallpapers.videos
  const { index, setIndex, isPlaying, playlistOpen, setPlaylistOpen } = useLofiAudio()

  if (!playlistOpen || videos.length === 0) return null

  return (
    <aside className="fixed right-0 top-1/2 z-40 w-72 max-w-[80vw] -translate-y-1/2 rounded-l-2xl border border-white/10 bg-black/40 p-4 backdrop-blur-md">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-amber-100">{pick({ zh: '歌曲列表', en: 'Playlist' })}</h2>
        <button
          onClick={() => setPlaylistOpen(false)}
          aria-label={pick({ zh: '关闭列表', en: 'Close playlist' })}
          className="text-white/50 transition-colors hover:text-amber-200"
        >
          <X className="size-4" />
        </button>
      </div>

      <ul role="list" className="max-h-[60vh] space-y-1 overflow-y-auto">
        {videos.map((v, i) => {
          const isCurrent = i === index
          return (
            <li key={v.url}>
              <button
                onClick={() => setIndex(i)}
                aria-current={isCurrent}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  isCurrent
                    ? 'bg-amber-300/15 text-amber-200'
                    : 'text-white/70 hover:bg-white/5 hover:text-white'
                }`}
              >
                {/* now-playing indicator (staggered equalizer bars while playing) */}
                <span className="grid w-4 shrink-0 place-items-center">
                  {isCurrent && isPlaying ? (
                    <span className="flex h-3.5 items-end gap-[2px]" aria-hidden>
                      {[0, 1, 2].map((bar) => (
                        <span
                          key={bar}
                          className="eq-bar w-[3px] bg-amber-300"
                          style={{ height: '100%', animationDelay: `${bar * 0.18}s` }}
                        />
                      ))}
                    </span>
                  ) : (
                    <span className="size-1 rounded-full bg-white/20" aria-hidden />
                  )}
                </span>
                <span className="min-w-0 truncate">{v.title}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </aside>
  )
}
