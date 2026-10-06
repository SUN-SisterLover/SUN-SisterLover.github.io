import { useEffect } from 'react'
import { withBase } from '../../lib/base'
import { SITE_CONFIG } from '../../site.config'

type WidgetApi = {
  init: (o?: unknown) => void
  destroy?: () => void
}

/**
 * Resolve the widget API from the live2d-widget module.
 * The installed package (xiazeyu/live2d-widget.js@3.1.4, a 2019 webpack build)
 * exports the API as a *named* `L2Dwidget` object (and nests it under
 * `default.L2Dwidget` too) — there is no `default.init`. We accept both shapes
 * so we survive the CommonJS interop either way.
 */
function resolveWidget(mod: unknown): WidgetApi | null {
  const anyMod = mod as Record<string, unknown> & { default?: Record<string, unknown> }
  const api = (anyMod.L2Dwidget ?? anyMod.default?.L2Dwidget ?? null) as
    | WidgetApi
    | null
    | undefined
  if (api && typeof api.init === 'function') return api
  return null
}

export default function Live2D() {
  useEffect(() => {
    let cancelled = false
    let widget: WidgetApi | null = null

    // the installed live2d-widget builds its container as <div id="live2d-widget">
    const removeOldWidget = () => {
      document.getElementById('live2d-widget')?.remove()
    }

    // clear any previous instance before (re)mount (React StrictMode double-invoke safe)
    removeOldWidget()

    import('live2d-widget')
      .then((mod) => {
        if (cancelled) return
        const api = resolveWidget(mod)
        if (!api) {
          // wrong export shape or broken build — leave the page usable
          return
        }
        widget = api
        api.init({
          model: {
            jsonPath: withBase('/lofi/live2d/shizuku.model.json'),
            scale: 1,
          },
          display: {
            superSample: 2,
            width: 220,
            height: 220,
            position: 'left',
            hOffset: 12,
            vOffset: 0,
          },
          mobile: { show: true, scale: 0.55 },
          react: { opacityDefault: 0.9, opacityOnHover: 0.5 },
          dialog: {
            enable: true,
            hitokoto: false,
            script: { tips: SITE_CONFIG.lofi.live2d.tips, unloginList: [] },
          },
        })
      })
      .catch(() => {
        // widget failed to load (offline / network / build issue); leave the page usable
      })

    return () => {
      cancelled = true
      if (widget && typeof widget.destroy === 'function') {
        try {
          widget.destroy()
        } catch {
          // ignore
        }
      }
      removeOldWidget()
    }
  }, [])

  return <div aria-hidden className="pointer-events-none fixed bottom-0 left-0 z-20" />
}
