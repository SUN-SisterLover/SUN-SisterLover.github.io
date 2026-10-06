import { useEffect, useRef, useState } from 'react'
import { SITE_CONFIG } from '../../site.config'
import { withBase } from '../../lib/base'
import { useLofiAudio } from './LofiAudioContext'

export default function VideoWallpaper() {
  const videos = SITE_CONFIG.lofi.wallpapers.videos
  const { index, mediaRef, bump } = useLofiAudio()
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [error, setError] = useState<string | null>(null)

  // single <video> for the currently selected wallpaper; no timed rotation — the
  // player drives the index and playback state (play/pause/volume/mute)
  const current = videos.length > 0 ? videos[index % videos.length] : null

  // publish the element into the shared context so LofiPlayer / LofiVisualizer
  // can control it; bump() tells them a (new) element is attached
  useEffect(() => {
    mediaRef.current = videoRef.current
    setError(null) // reset on every source change
    bump()
    return () => {
      mediaRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.url])

  if (!current || videos.length === 0) return null

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-black">
      <video
        key={current.url}
        ref={videoRef}
        src={withBase(current.url)}
        loop
        playsInline
        preload="auto"
        onError={() => {
          const src = withBase(current.url)
          console.error(`[lofi] video failed to load: ${src}`)
          setError(`视频加载失败：${current.title}`)
        }}
        className="h-full w-full object-cover"
      />
      {error && (
        <div className="flex h-full w-full items-center justify-center px-6 text-center text-sm text-white/60">
          {error}
        </div>
      )}
    </div>
  )
}
