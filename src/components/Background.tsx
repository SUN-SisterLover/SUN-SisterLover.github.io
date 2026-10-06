import { useEffect, useState, type CSSProperties } from 'react'
import { SITE_CONFIG } from '../site.config'
import { withBase } from '../lib/base'

function imageStyle(url: string, fit: 'cover' | 'contain' | 'repeat') {
  const base: CSSProperties = { backgroundImage: `url(${url})`, backgroundPosition: 'center' }
  if (fit === 'repeat') {
    return { ...base, backgroundRepeat: 'repeat', backgroundSize: 'auto' }
  }
  if (fit === 'contain') {
    return { ...base, backgroundRepeat: 'no-repeat', backgroundSize: 'contain' }
  }
  return { ...base, backgroundRepeat: 'no-repeat', backgroundSize: 'cover' }
}

/**
 * Home background. With a single `url` it renders one static image (original
 * behavior). With an `images` list it cross-fades through them every
 * `swapSeconds`, each image slowly zooming/panning (Ken Burns) for a subtle
 * "dynamic wallpaper" feel while staying a static, high-res, license-clean asset.
 */
export default function Background() {
  const { background } = SITE_CONFIG
  const [idx, setIdx] = useState(0)
  const [fade, setFade] = useState(true)

  const images = (background.images ?? []).filter(Boolean)
  const useRotation = background.type === 'image' && images.length > 0
  const swapMs = (background.swapSeconds ?? 12) * 1000

  useEffect(() => {
    if (!useRotation || images.length <= 1) return
    const id = window.setInterval(() => {
      setFade(false)
      window.setTimeout(() => {
        setIdx((i) => (i + 1) % images.length)
        setFade(true)
      }, 800)
    }, swapMs)
    return () => window.clearInterval(id)
  }, [useRotation, images.length, swapMs])

  if (background.type !== 'image') return null

  // single-image / original behavior
  if (!useRotation || !background.url) {
    if (!background.url) return null
    return (
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        <div
          className="absolute inset-0"
          style={{
            ...imageStyle(withBase(background.url), background.fit),
            filter: background.blur > 0 ? `blur(${background.blur}px)` : undefined,
          }}
        />
        <div
          className="absolute inset-0 theme-transition"
          style={{ background: 'var(--color-ink)', opacity: background.overlay }}
        />
      </div>
    )
  }

  // rotating Ken Burns backgrounds
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
      {images.map((img, i) => (
        <div
          key={img}
          className={`absolute inset-0 transition-opacity duration-700 ${
            i === idx ? (fade ? 'opacity-100' : 'opacity-0') : 'opacity-0'
          }`}
          style={imageStyle(withBase(img), background.fit)}
        >
          <div
            className="ken-burns absolute inset-0"
            style={imageStyle(withBase(img), background.fit)}
          />
        </div>
      ))}
      <div
        className="absolute inset-0 theme-transition"
        style={{ background: 'var(--color-ink)', opacity: background.overlay }}
      />
    </div>
  )
}
