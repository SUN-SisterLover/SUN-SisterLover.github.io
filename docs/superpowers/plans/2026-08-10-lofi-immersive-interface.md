# Lofi 沉浸式界面 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `mikudayo-kirakiradokidoki-main`（React SPA 个人博客，部署于阿里云）新增一个独立的 `/lofi` 沉浸式界面——包含 Live2D 看板娘（Shizuku 模型，会动会聊）、自托管 lofi 音乐播放器、Canvas 氛围动画（雨/雪/粒子），并在导航栏加图标入口。lofi 是**与主站风格完全不同的独立界面**。

**Architecture:** `/lofi` 复用现有 `App.tsx` 的 pathname 路由模式（照抄 `/test` 分支），新增 `isLofiRoute()` 在 `Shell()` 内提前 return `<LofiPage />`（不含 TopBar/Footer，全屏沉浸）。LofiPage 由四个自包含组件组合：`AmbientAnimation`（Canvas 背景）、`Live2D`（动态加载 `live2d-widget` npm 包）、`LofiPlayer`（独立 `<audio>`，不碰主站 `AudioProvider`）、`Pomodoro`（默认隐藏）。所有素材自托管于 `public/lofi/`。

**Tech Stack:** React 19 · Vite 6 · Tailwind CSS 4 · TypeScript（strict）· lucide-react（图标）· live2d-widget（npm，MIT）· GSAP（已有，本项目用不到）

## Global Constraints

- **无测试框架**：项目没有 vitest/jest。每个任务的"测试"= `npm run build` 通过（该命令含 `tsc --noEmit` 严格类型检查 + vite build）+ `npm run dev` 浏览器手测。
- **TS 严格模式**：`tsc --noEmit` 开启 `strict`、`noUnusedLocals`、`noUnusedParameters`。禁止未使用的变量/参数/导入，否则构建失败。写代码前先 `npm run dev` 观察。
- **路径必须用 `withBase()`**：所有静态资源路径（`/lofi/...`）经 `src/lib/base.ts` 的 `withBase()` 包裹，兼容根路径与 GitHub Pages 子路径。
- **素材自托管，不依赖外部 CDN**：Live2D 模型与音乐放 `public/lofi/`，构建时随 `dist/` 复制，由阿里云 `server.js` 托管（`express.static('dist')`）。**禁止**在代码里硬编码 unpkg/jsdelivr 等外部 URL。
- **SPA 路由**：`/lofi` 是 React 端路由，不生成物理目录。阿里云 `server.js` 的 `app.get('*')` 回退已支持；本方案以阿里云部署为准。
- **音乐默认不自动播放**（浏览器策略 + 读者体验），首次点击播放按钮后才出声。
- **lofi 页必须抑制主站 BGM**：LofiPage 挂载时调 `useBgm().setActive(false)`，否则主站 main.mp3 会在 lofi 页播放。
- **Git 提交策略**：任务内 `git commit` 到当前分支（`mikudayo`），**不 push**，避免意外触发 GitHub Actions 部署（用户实际部署在阿里云，手动 build + 上传 dist）。不提交 `docs/` 计划文件。
- **版权**：音乐用 CC0/公共领域曲目，模型用 Live2D 官方免费模型（shizuku），均可免费商用。

---

### Task 1: 准备素材（Live2D Shizuku 模型 + CC0 lofi 音乐）

**Files:**
- Create: `public/lofi/live2d/shizuku.model.json` + 配套贴图/动作文件（来自 `live2d-widget-model-shizuku` npm 包）
- Create: `public/lofi/audio/track-01.mp3` … `track-05.mp3`（CC0 lofi 曲目，自命名）

**Interfaces:**
- Produces: 目录 `public/lofi/live2d/`（模型文件）与 `public/lofi/audio/`（音乐文件），供 Task 4 的 `LofiPlayer`（`/lofi/audio/track-0N.mp3`）与 Task 5 的 `Live2D`（`/lofi/live2d/shizuku.model.json`）引用。

- [ ] **Step 1: 创建目录**

在项目根目录执行（Windows Git Bash 环境）：

```bash
mkdir -p public/lofi/live2d public/lofi/audio
```

- [ ] **Step 2: 下载 Shizuku 模型到 `public/lofi/live2d/`**

用 npm 包解压（最可靠，包含 `.model.json`/贴图/motion/physics 全量）：

```bash
cd "$(mktemp -d)"
npm pack live2d-widget-model-shizuku@1.0.5
tar -xzf live2d-widget-model-shizuku-1.0.5.tgz
cp -r package/assets/. "D:/个人网站/mikudayo-kirakiradokidoki-main/public/lofi/live2d/"
```

若 `npm pack` 失败（网络），备用方案：浏览器打开 `https://unpkg.com/live2d-widget-model-shizuku@1.0.5/assets/` 逐个下载该目录下所有文件到 `public/lofi/live2d/`（包含 `shizuku.model.json`、`shizuku.1024.texture_00.png`、`shizuku.moc`、`shizuku.physics.json`、`shizuku.exp.json`、`motions/` 与 `sounds/` 子目录）。

- [ ] **Step 3: 下载 CC0 lofi 音乐到 `public/lofi/audio/`**

从免费版权曲库下载 **5 首 lofi/chill 曲目**（推荐来源，均 CC0/免版权）：
- `https://www.freepd.com/`（纯公共领域，无需署名）
- `https://www.chosic.com/free-music/lofi/`（筛选 "CC0" 或 "Public Domain"）
- `https://incompetech.com/`（Kevin MacLeod，CC-BY 需署名，优先选上面两个）

要求：
- 转码为 MP3（建议 128–160kbps），单曲约 3–5MB，总大小 20–30MB
- 重命名为 `track-01.mp3` … `track-05.mp3` 放到 `public/lofi/audio/`
- 若本机有 ffmpeg：`ffmpeg -i input.wav -codec:a libmp3lame -b:a 160k -ac 2 output.mp3`

> 若无法联网下载，请让用户提供任意 5 首 lofi mp3 文件放到该目录（文件名需为 `track-01.mp3`…`track-05.mp3`）。

- [ ] **Step 4: 验证素材就位**

Run: `ls public/lofi/live2d/shizuku.model.json && ls public/lofi/audio/track-01.mp3`
Expected: 两个文件都存在，且 `public/lofi/live2d/` 下还有其他 `.png`/`.moc`/`.json` 文件。

- [ ] **Step 5: Commit**

```bash
git add public/lofi
git commit -m "feat(lofi): add shizuku model and CC0 lofi audio assets"
```

---

### Task 2: 安装 live2d-widget + TypeScript 类型声明

**Files:**
- Create: `src/types/live2d-widget.d.ts`
- Modify: `package.json`（新增依赖，由 npm 自动写入）

**Interfaces:**
- Produces: `live2d-widget` 模块的默认导出 `L2Dwidget`（含 `init(options)` 与可选 `destroy()`），供 Task 5 的 `Live2D.tsx` 动态 `import('live2d-widget')` 使用。

- [ ] **Step 1: 安装依赖**

```bash
npm install live2d-widget
```

Expected: `package.json` 的 `dependencies` 出现 `"live2d-widget": "^3.x"`。

- [ ] **Step 2: 创建类型声明 `src/types/live2d-widget.d.ts`**

该 npm 包无内置类型，`tsc --noEmit`（strict）会因缺类型报错，必须声明：

```ts
declare module 'live2d-widget' {
  export interface Live2DWidgetOptions {
    model?: { jsonPath?: string; scale?: number }
    display?: {
      superSample?: number
      width?: number
      height?: number
      position?: string
      hOffset?: number
      vOffset?: number
    }
    mobile?: { show?: boolean; scale?: number }
    react?: { opacityDefault?: number; opacityOnHover?: number }
    dialog?: {
      enable?: boolean
      hitokoto?: boolean
      script?: { tips?: string[]; unloginList?: string[] }
    }
    idle?: { interval?: number }
  }
  export interface Live2DWidget {
    init: (options?: Live2DWidgetOptions) => void
    destroy?: () => void
  }
  const L2Dwidget: Live2DWidget
  export default L2Dwidget
}
```

> `tsconfig.json` 的 `include: ["src"]` 会覆盖 `src/types/`，无需额外配置。

- [ ] **Step 3: 运行类型检查验证**

Run: `npm run build`
Expected: 构建成功（`tsc --noEmit` 通过 + vite build 产出 `dist/`）。此时尚无组件引用 `live2d-widget`，仅验证依赖可被 TS 解析。

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/types/live2d-widget.d.ts
git commit -m "feat(lofi): add live2d-widget dependency and type declaration"
```

---

### Task 3: 扩展 `site.config.ts`（lofi 配置 + 双语文案 + 导航开关）

**Files:**
- Modify: `src/site.config.ts`（类型定义 + `SITE_CONFIG` 值 + `strings.zh/en`）
- Modify: `src/components/TopBar.tsx` 的 `nav` 类型引用会自动同步（`nav` 类型来自 `SiteConfig`）

**Interfaces:**
- Produces: 新增 `SiteConfig.lofi` 配置对象、`SiteConfig.nav.showLofi` 开关，以及 `strings.zh/en` 中的 lofi 文案 key。后续 Task 4/5/6/7/8 与 TopBar 均从此处读取。

- [ ] **Step 1: 在 `SiteConfig` 类型中新增 `LofiTrack` 与 `lofi` 字段**

在 `src/site.config.ts` 中，`export type SiteConfig = { ... }` 结构里，于 `hero` 字段之前加入：

```ts
export type LofiTrack = {
  url: string
  title: string
  artist: string
}

export type LofiConfig = {
  /** master switch for the /lofi immersive page */
  enabled: boolean
  audio: {
    tracks: LofiTrack[]
  }
  live2d: {
    /** speech bubble lines, picked at random (used by Live2D.tsx dialog tips) */
    tips: string[]
  }
  ambient: {
    /** default effect on first visit: 'rain' | 'snow' | 'particles' */
    default: 'rain' | 'snow' | 'particles'
  }
  pomodoro: {
    /** hide the pomodoro widget on the lofi page by default */
    hidden: boolean
    /** work duration in minutes */
    workMinutes: number
  }
}
```

同时在 `SiteConfig` 类型中加入 `lofi: LofiConfig`，并在 `nav` 类型中加入 `showLofi: boolean`。

- [ ] **Step 2: 在 `SITE_CONFIG` 值中加入 lofi 配置与 nav 开关**

在 `SITE_CONFIG` 对象中，`nav: { ... }` 加入 `showLofi: true`；在 `hero` 配置之后加入：

```ts
lofi: {
  enabled: true,
  audio: {
    tracks: [
      { url: '/lofi/audio/track-01.mp3', title: 'Midnight Rain', artist: 'CC0 Lo-fi Vol.1' },
      { url: '/lofi/audio/track-02.mp3', title: 'Study in C', artist: 'CC0 Lo-fi Vol.1' },
      { url: '/lofi/audio/track-03.mp3', title: 'Paper Planes', artist: 'CC0 Lo-fi Vol.1' },
      { url: '/lofi/audio/track-04.mp3', title: 'Quiet Window', artist: 'CC0 Lo-fi Vol.1' },
      { url: '/lofi/audio/track-05.mp3', title: 'Last Page', artist: 'CC0 Lo-fi Vol.1' },
    ],
  },
  live2d: {
    tips: [
      '今天也要加油哦。',
      '戴上耳机，沉下来。',
      '休息一下，喝口水吧。',
      '慢慢来，比较快。',
      '窗外在下雨，很适合读书。',
      '专注的每一分钟都算数。',
      '想聊天的话，点我一下。',
    ],
  },
  ambient: {
    default: 'rain',
  },
  pomodoro: {
    hidden: true,
    workMinutes: 25,
  },
},
```

- [ ] **Step 3: 在 `strings.zh` / `strings.en` 中加入 lofi 文案**

在 `strings.zh` 中追加：

```ts
'lofi.title': '深夜自习室',
'lofi.subtitle': '戴上耳机 沉下来',
'lofi.back': '返回博客',
'lofi.ambient.rain': '雨',
'lofi.ambient.snow': '雪',
'lofi.ambient.particles': '星',
'lofi.play': '播放',
'lofi.pause': '暂停',
'lofi.next': '下一首',
'lofi.prev': '上一首',
'lofi.mute': '静音',
'lofi.unmute': '取消静音',
'lofi.pomodoro': '番茄钟',
'lofi.pomodoro.start': '开始',
'lofi.pomodoro.pause': '暂停',
'lofi.pomodoro.reset': '重置',
```

在 `strings.en` 中追加：

```ts
'lofi.title': 'Lo-fi Study Room',
'lofi.subtitle': 'Put on headphones, sink in',
'lofi.back': 'Back to blog',
'lofi.ambient.rain': 'Rain',
'lofi.ambient.snow': 'Snow',
'lofi.ambient.particles': 'Stars',
'lofi.play': 'Play',
'lofi.pause': 'Pause',
'lofi.next': 'Next',
'lofi.prev': 'Previous',
'lofi.mute': 'Mute',
'lofi.unmute': 'Unmute',
'lofi.pomodoro': 'Pomodoro',
'lofi.pomodoro.start': 'Start',
'lofi.pomodoro.pause': 'Pause',
'lofi.pomodoro.reset': 'Reset',
```

> 注意：`strings` 类型是 `Record<string, string>`（`zh`/`en` 各自为 `Record<string,string>`），新增 key 不会破坏类型；`t()` 的 key 类型 `StringKey` 是 `keyof zh`，会在新增后自动扩大。

- [ ] **Step 4: 类型检查**

Run: `npm run build`
Expected: 构建成功。若 TS 报 `strings` 中某 key 缺失于另一个语言（若类型从字面量推导），将缺失的 key 补上。

- [ ] **Step 5: Commit**

```bash
git add src/site.config.ts
git commit -m "feat(lofi): add lofi config, bilingual strings, and nav switch"
```

---

### Task 4: 氛围动画组件 `AmbientAnimation`

**Files:**
- Create: `src/components/lofi/AmbientAnimation.tsx`

**Interfaces:**
- Consumes: 无外部依赖；导出 `AmbientMode` 类型。
- Produces: `AmbientAnimation({ mode }: { mode: AmbientMode })` 全屏 Canvas 组件；`AmbientMode = 'rain' | 'snow' | 'particles'`。供 Task 7 的 `LofiPage` 使用（默认 `SITE_CONFIG.lofi.ambient.default`）。

- [ ] **Step 1: 写组件（含粒子限流、rAF、可见性暂停、reduced-motion 处理）**

```tsx
import { useEffect, useRef } from 'react'

export type AmbientMode = 'rain' | 'snow' | 'particles'

const CAPS: Record<AmbientMode, number> = { rain: 60, snow: 40, particles: 50 }

type Particle = {
  x: number
  y: number
  len: number
  speed: number
  alpha: number
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

export default function AmbientAnimation({ mode }: { mode: AmbientMode }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    let w = 0
    let h = 0
    const cap = CAPS[mode]
    const items: Particle[] = []
    const reduced = prefersReducedMotion()

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = Math.max(1, canvas.clientWidth)
      h = Math.max(1, canvas.clientHeight)
      canvas.width = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const spawn = (): Particle => {
      if (mode === 'rain') {
        return {
          x: Math.random() * w,
          y: -24,
          len: 12 + Math.random() * 16,
          speed: 7 + Math.random() * 9,
          alpha: 0.2 + Math.random() * 0.35,
        }
      }
      if (mode === 'snow') {
        return {
          x: Math.random() * w,
          y: -8,
          len: 1.5 + Math.random() * 2,
          speed: 0.5 + Math.random() * 1.2,
          alpha: 0.4 + Math.random() * 0.6,
        }
      }
      return {
        x: Math.random() * w,
        y: Math.random() * h,
        len: 1.2 + Math.random() * 1.8,
        speed: 0.08 + Math.random() * 0.4,
        alpha: 0.3 + Math.random() * 0.6,
      }
    }

    const frame = () => {
      ctx.clearRect(0, 0, w, h)
      for (let i = 0; i < items.length; i++) {
        const p = items[i]
        if (mode === 'particles') {
          p.y -= p.speed
          p.x += Math.sin(p.y * 0.015) * 0.3
          if (p.y < -4) {
            p.y = h + 4
            p.x = Math.random() * w
          }
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.len, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(255, 235, 210, ${Math.max(0, Math.min(1, p.alpha))})`
          ctx.fill()
        } else if (mode === 'rain') {
          p.y += p.speed
          if (p.y > h + 28) Object.assign(p, spawn())
          ctx.beginPath()
          ctx.moveTo(p.x, p.y)
          ctx.lineTo(p.x - p.len * 0.28, p.y - p.len)
          ctx.strokeStyle = `rgba(175, 195, 235, ${p.alpha})`
          ctx.lineWidth = 1
          ctx.stroke()
        } else {
          p.y += p.speed
          if (p.y > h + 8) Object.assign(p, spawn())
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.len, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(255, 255, 255, ${Math.max(0, Math.min(1, p.alpha))})`
          ctx.fill()
        }
      }
      raf = requestAnimationFrame(frame)
    }

    for (let i = 0; i < cap; i++) items.push(spawn())

    if (reduced) {
      // render a single static frame, no animation loop
      frame()
      cancelAnimationFrame(raf)
    } else {
      const onVisibility = () => {
        if (document.hidden) cancelAnimationFrame(raf)
        else if (!raf) raf = requestAnimationFrame(frame)
      }
      document.addEventListener('visibilitychange', onVisibility)
      raf = requestAnimationFrame(frame)
    }

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [mode])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 h-full w-full"
    />
  )
}
```

- [ ] **Step 2: 类型检查**

Run: `npm run build`
Expected: 构建成功（无未使用变量；`Object.assign(p, spawn())` 返回类型在严格模式下是 `Particle & Particle`，赋值给数组元素合法）。

- [ ] **Step 3: 浏览器手测**

Run: `npm run dev`，临时在某处渲染 `<AmbientAnimation mode="rain" />`（可用下面 Task 7 完成后统一验证，或在 dev 下自行改个临时引用），确认雨/雪/星三态都流畅、切后台动画暂停。
> 注：Task 4 之后 LofiPage 尚未存在，可先跳过手测，随 Task 7 一起验证。

- [ ] **Step 4: Commit**

```bash
git add src/components/lofi/AmbientAnimation.tsx
git commit -m "feat(lofi): add canvas ambient animation (rain/snow/particles)"
```

---

### Task 5: Live2D 看板娘组件 `Live2D`

**Files:**
- Create: `src/components/lofi/Live2D.tsx`

**Interfaces:**
- Consumes: `withBase`（`../lib/base`）、`SITE_CONFIG`（`../site.config`）、`live2d-widget`（动态 import）。
- Produces: `<Live2D />` 自包含组件，调用 `L2Dwidget.init()` 在左上角渲染 Shizuku 模型（呼吸/鼠标跟随/点击互动/随机气泡）。供 Task 7 的 `LofiPage` 使用。

- [ ] **Step 1: 写组件**

```tsx
import { useEffect } from 'react'
import { withBase } from '../../lib/base'
import { SITE_CONFIG } from '../../site.config'

export default function Live2D() {
  useEffect(() => {
    let cancelled = false
    let L2Dwidget: { init: (o?: unknown) => void; destroy?: () => void } | null = null

    const removeOldWidget = () => {
      document.getElementById('live2d')?.remove()
    }

    const cleanup = () => {
      if (L2Dwidget && typeof L2Dwidget.destroy === 'function') {
        try {
          L2Dwidget.destroy()
        } catch {
          // ignore
        }
      }
      removeOldWidget()
    }

    // clear any previous instance before (re)mount (React StrictMode double-invoke safe)
    removeOldWidget()

    import('live2d-widget')
      .then((mod) => {
        if (cancelled) return
        const w = mod.default as { init: (o?: unknown) => void; destroy?: () => void }
        L2Dwidget = w
        w.init({
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
        // widget failed to load (offline / network); leave the page usable
      })

    return () => {
      cancelled = true
      cleanup()
    }
  }, [])

  return <div aria-hidden className="pointer-events-none fixed bottom-0 left-0 z-20" />
}
```

> 说明：`live2d-widget` 会自行创建 `#live2d` 的 fixed 容器到 `document.body`；此处外层 div 仅作占位，不负责定位。

- [ ] **Step 2: 类型检查**

Run: `npm run build`
Expected: 构建成功。若 TS 报 `mod.default` 类型问题，确认 `src/types/live2d-widget.d.ts` 已存在（Task 2 已建）。

- [ ] **Step 3: 手测（随 Task 7）**

`npm run dev` 打开 `/lofi`：Shizuku 出现、有呼吸动画、鼠标移动视线跟随、点击有互动、随机弹中文气泡。

- [ ] **Step 4: Commit**

```bash
git add src/components/lofi/Live2D.tsx
git commit -m "feat(lofi): add live2d shizuku mascot with dialog tips"
```

---

### Task 6: lofi 音乐播放器 `LofiPlayer`

**Files:**
- Create: `src/components/lofi/LofiPlayer.tsx`

**Interfaces:**
- Consumes: `SITE_CONFIG`（`lofi.audio.tracks`）、`withBase`、`useLang`（`pick`）、`lucide-react` 图标。
- Produces: `<LofiPlayer />` 自包含组件：独立 `<audio>` 播放 `public/lofi/audio/track-0N.mp3`，复古唱片风格 UI（播放/暂停、上一首/下一首、音量滑块、静音），默认不自动播放。供 Task 7 的 `LofiPage` 使用。

- [ ] **Step 1: 写组件**

```tsx
import { useEffect, useRef, useState } from 'react'
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react'
import { SITE_CONFIG } from '../../site.config'
import { withBase } from '../../lib/base'
import { useLang } from '../../i18n'

export default function LofiPlayer() {
  const { pick } = useLang()
  const tracks = SITE_CONFIG.lofi.audio.tracks
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [volume, setVolume] = useState(0.6)
  const [muted, setMuted] = useState(false)

  const current = tracks.length > 0 ? tracks[index % tracks.length] : null

  // create / swap the audio element when the track changes
  useEffect(() => {
    if (!current) return
    const el = new Audio(withBase(current.url))
    el.loop = false
    el.preload = 'metadata'
    el.volume = muted ? 0 : volume
    el.muted = muted
    el.addEventListener('play', () => setPlaying(true))
    el.addEventListener('pause', () => setPlaying(false))
    el.addEventListener('ended', () => setIndex((i) => (i + 1) % tracks.length))
    audioRef.current = el
    return () => {
      el.pause()
      el.removeAttribute('src')
      el.load()
      audioRef.current = null
      setPlaying(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.url])

  // keep volume / mute in sync without recreating the element
  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    el.volume = muted ? 0 : volume
    el.muted = muted
  }, [volume, muted])

  const toggle = () => {
    const el = audioRef.current
    if (!el) return
    if (el.paused) {
      const p = el.play()
      if (p && typeof p.catch === 'function') p.catch(() => setPlaying(false))
    } else {
      el.pause()
    }
  }

  const goTo = (next: number) => {
    setIndex((next + tracks.length) % tracks.length)
  }

  if (!current) return null

  return (
    <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-black/40 px-5 py-4 backdrop-blur-md">
      {/* spinning record disc */}
      <div className="relative size-16 shrink-0">
        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-zinc-700 via-zinc-900 to-black shadow-inner" />
        <div className="absolute inset-2 rounded-full bg-gradient-to-br from-amber-300 to-orange-500" />
        <div
          className={`absolute inset-0 rounded-full ${playing ? 'animate-spin-slow' : ''}`}
          style={{
            background:
              'repeating-radial-gradient(circle at 50% 50%, rgba(255,255,255,0.06) 0 2px, transparent 2px 6px)',
          }}
        />
        <div className="absolute left-1/2 top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black" />
      </div>

      {/* track info + controls */}
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-amber-100">{current.title}</p>
        <p className="truncate text-xs text-white/50">{current.artist}</p>
        <div className="mt-2 flex items-center gap-3">
          <button
            onClick={() => goTo(index - 1)}
            aria-label={pick({ zh: '上一首', en: 'Previous' })}
            className="text-white/60 transition-colors hover:text-amber-200"
          >
            <SkipBack className="size-4" />
          </button>
          <button
            onClick={toggle}
            aria-label={pick({ zh: playing ? '暂停' : '播放', en: playing ? 'Pause' : 'Play' })}
            className="grid size-9 place-items-center rounded-full bg-gradient-to-br from-amber-300 to-orange-500 text-black shadow-lg shadow-orange-500/20 transition-transform active:scale-95"
          >
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          </button>
          <button
            onClick={() => goTo(index + 1)}
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
            className="w-20"
          />
        </div>
      </div>
    </div>
  )
}
```

> 注意：项目无 ESLint 运行时，`// eslint-disable-next-line` 注释可保留也可省略（不影响构建）。`react-hooks` 的依赖告警不影响 `tsc`。

- [ ] **Step 2: 类型检查**

Run: `npm run build`
Expected: 构建成功（严格模式：`volume` 用于 `setVolume` 与 `el.volume`，无未使用；`current` 的 null 判断到位）。

- [ ] **Step 3: 手测（随 Task 7）**

`/lofi` 页点播放按钮：`track-01.mp3` 出声、切歌跳 `track-02.mp3`、音量滑块生效、唱片旋转、默认不自动播放。

- [ ] **Step 4: Commit**

```bash
git add src/components/lofi/LofiPlayer.tsx
git commit -m "feat(lofi): add self-contained lofi player with record UI"
```

---

### Task 7: 番茄钟组件 `Pomodoro`（默认隐藏）

**Files:**
- Create: `src/components/lofi/Pomodoro.tsx`

**Interfaces:**
- Consumes: `SITE_CONFIG`（`lofi.pomodoro.workMinutes`）、`useLang`、`lucide-react`。
- Produces: `<Pomodoro />` 自包含组件：25 分钟倒计时（开始/暂停/重置，圆环或数字显示）。由 Task 7 的 `LofiPage` 条件渲染（`hidden` 为 true 时不显示）。

- [ ] **Step 1: 写组件**

```tsx
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
```

> 说明：番茄钟现在对用户**默认隐藏**——由 Task 8 的 `LofiPage` 依据 `SITE_CONFIG.lofi.pomodoro.hidden` 条件渲染。把 `hidden` 改为 `false` 即显示。

- [ ] **Step 2: 类型检查**

Run: `npm run build`
Expected: 构建成功。

- [ ] **Step 3: Commit**

```bash
git add src/components/lofi/Pomodoro.tsx
git commit -m "feat(lofi): add pomodoro timer widget (hidden by default)"
```

---

### Task 8: 独立沉浸页 `LofiPage`

**Files:**
- Create: `src/components/LofiPage.tsx`

**Interfaces:**
- Consumes: `useBgm`（`../components/AudioProvider`）、`useLang`、`SITE_CONFIG`、`withBase`、以及 `./lofi/AmbientAnimation`、`./lofi/Live2D`、`./lofi/LofiPlayer`、`./lofi/Pomodoro`、`lucide-react`（`ArrowLeft`、雨/雪/星图标 `CloudRain`、`Snowflake`、`Sparkles`）。
- Produces: `<LofiPage />` 全屏独立界面。供 Task 9 的 `App.tsx` 路由分支渲染。

- [ ] **Step 1: 写组件**

```tsx
import { useEffect, useState } from 'react'
import { ArrowLeft, CloudRain, Snowflake, Sparkles } from 'lucide-react'
import { useBgm } from './AudioProvider'
import { useLang } from '../i18n'
import { SITE_CONFIG } from '../site.config'
import { withBase } from '../lib/base'
import AmbientAnimation, { type AmbientMode } from './lofi/AmbientAnimation'
import LofiPlayer from './lofi/LofiPlayer'
import Live2D from './lofi/Live2D'
import Pomodoro from './lofi/Pomodoro'

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
    <div className="relative min-h-[100dvh] overflow-hidden bg-[#1e1b2e] text-[#f5f5f0]">
      <AmbientAnimation mode={mode} />

      {/* warm vignette over the animation */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(0,0,0,0.55)_100%)]"
      />

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

      {/* subtle corner credit */}
      <p className="pointer-events-none fixed bottom-2 right-3 z-20 text-[10px] uppercase tracking-widest text-white/20">
        lofi · self-hosted
      </p>
    </div>
  )
}
```

- [ ] **Step 2: 类型检查**

Run: `npm run build`
Expected: 构建成功。确认 `AMBIENT_ITEMS` 的 `icon` 类型 `typeof CloudRain` 与 `Snowflake`/`Sparkles` 兼容（同为 lucide `ForwardRefExoticComponent`，类型一致）。

- [ ] **Step 3: 浏览器手测（与 Task 4/5/6 一起）**

`npm run dev`，手动在浏览器地址栏输入 `http://localhost:5173/lofi`（Vite dev 无 SPA 回退时可能需要 dev 中间件；`App.tsx` 路由尚未接上，所以先手动验证单组件可结合）。确认布局：背景雨滴、左上角 Shizuku、底部唱片播放器、顶部切换按钮可换雪/星。

> 完整端到端验证在 Task 9 接好路由后进行。

- [ ] **Step 4: Commit**

```bash
git add src/components/LofiPage.tsx
git commit -m "feat(lofi): compose lofi immersive page"
```

---

### Task 9: `App.tsx` 增加 `/lofi` 路由分支

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `LofiPage`（Task 8）。
- Produces: `isLofiRoute()` 判断函数；`Shell()` 内于 testRoute 分支之前新增 `lofiRoute` 提前 return，渲染 `<LofiPage />`。

- [ ] **Step 1: 加导入与路由判断**

在 `src/App.tsx` 顶部，`import TestPage from './components/TestPage'` 之后加：

```ts
import LofiPage from './components/LofiPage'
```

在 `isTestRoute` 函数之后加：

```ts
function isLofiRoute(): boolean {
  if (typeof window === 'undefined') return false
  return window.location.pathname.replace(/\/+$/, '') === '/lofi'
}
```

- [ ] **Step 2: 在 `Shell()` 加 lofiRoute 状态与提前 return**

在 `const [testRoute] = useState<boolean>(isTestRoute)` 之后加：

```ts
const [lofiRoute] = useState<boolean>(isLofiRoute)
```

在 `if (testRoute) { ... }` 分支**之前**（即所有 hooks 之后、第一个 return 之前）插入：

```ts
if (lofiRoute) {
  return <LofiPage />
}
```

> 必须放在所有 `useEffect`/`useState` 之后、`testRoute` return 之前，保证 hooks 顺序稳定。LofiPage 全屏自包含，不需要 Background/FloatingLayer/GridSpotlight 等主站叠加层。

- [ ] **Step 3: 类型检查**

Run: `npm run build`
Expected: 构建成功。若报 `lofiRoute` 未使用，确认已加入 return 判断。

- [ ] **Step 4: 端到端手测**

Run: `npm run dev`
- 访问 `http://localhost:5173/lofi`：完整沉浸页出现（雨滴、Shizuku、播放器、切换按钮），番茄钟**不显示**（默认 hidden）
- 点播放按钮出声、切歌、换氛围动画
- 点"返回博客"回到首页 `/`，确认主站正常、lofi 页不再有主站 BGM 干扰
- 访问 `/test` 确认原测试页正常

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat(lofi): route /lofi to the immersive page"
```

---

### Task 10: 导航栏加入 lofi 入口

**Files:**
- Modify: `src/components/TopBar.tsx`

**Interfaces:**
- Consumes: `SITE_CONFIG.nav.showLofi`（Task 3）、`withBase`、`useLang.pick`、`lucide-react` 的 `Disc3` 图标。
- Produces: 导航栏右侧图标按钮，点击跳转 `withBase('/lofi')`。

- [ ] **Step 1: 加导入**

在 `TopBar.tsx` 顶部 import 中加：

```ts
import { Disc3 } from 'lucide-react'
import { withBase } from '../lib/base'
```

- [ ] **Step 2: 在右侧按钮区加 lofi 入口**

在 `{nav.showGithub && (...)}` 块**之前**插入：

```tsx
{nav.showLofi && (
  <a
    href={withBase('/lofi')}
    aria-label={pick({ zh: '自习室', en: 'Lo-fi' })}
    title={pick({ zh: '自习室', en: 'Lo-fi' })}
    className="text-dim hover:text-paper grid size-8 place-items-center rounded-md border border-transparent transition-colors hover:border-ink-2/20 hover:bg-ink-2/10 press-sm"
  >
    <Disc3 className="size-4" />
  </a>
)}
```

> `TopBar` 组件体已解构 `const { nav, brand, githubUrl } = SITE_CONFIG`。若 `pick` 不在 TopBar 函数体内可用，从 `useLang()` 解构（TopBar 已调用 `useLang()` 得到 `lang, setLang`，再加 `pick`）：`const { lang, setLang, pick } = useLang()`。

- [ ] **Step 3: 类型检查**

Run: `npm run build`
Expected: 构建成功。

- [ ] **Step 4: 手测**

`npm run dev` 打开首页 `/`：导航栏右侧出现唱片图标，点击跳转到 `/lofi` 沉浸页。

- [ ] **Step 5: Commit**

```bash
git add src/components/TopBar.tsx
git commit -m "feat(lofi): add lofi nav entry to top bar"
```

---

### Task 11: 全量构建 + 生产验证

**Files:**
- 无代码改动（仅验证）

- [ ] **Step 1: 生产构建**

Run: `npm run build`
Expected: 成功产出 `dist/`，且 `dist/lofi` 不产生物理目录（SPA 路由由 server.js 回退处理）。

- [ ] **Step 2: 本地生产模拟**

Run: `npm start`（Express 托管 `dist/` + API 代理）
- 访问 `http://localhost:3000/lofi`：沉浸页正常
- 访问 `http://localhost:3000/`：主站正常，导航栏唱片图标可跳转
- 检查 Network 面板：模型 `shizuku.model.json`、贴图、`track-01.mp3` 均从本域加载（无外部 CDN 请求）

- [ ] **Step 3: 性能与体验检查**

- DevTools Performance：lofi 页动画流畅、切后台暂停
- 番茄钟默认不可见；将 `site.config.ts` 的 `lofi.pomodoro.hidden` 临时改为 `false` 重建可验证显示（验证完改回 `true` 并重新构建）
- 移动端视口（DevTools 设备模拟）：布局不遮挡、可返回首页

- [ ] **Step 4: 回滚验证（确保可逆）**

- `git stash` 或 `git checkout mikudayo` 回退后，删除 `src/App.tsx` 的 lofi 分支 + `TopBar.tsx` 的入口 + 相关组件文件，主站完全复原。
- 确认主站不依赖任何 lofi 文件（lofi 全部隔离在 `src/components/lofi/`、`src/components/LofiPage.tsx`、`public/lofi/`）。

- [ ] **Step 5: 最终提交**

```bash
git add -A
git commit -m "feat(lofi): complete immersive lo-fi page"
```

> **部署提醒**：用户部署在阿里云，需手动将 `dist/` 上传到服务器（`npm run build` 后替换服务器上的 `dist`），无需 push GitHub。计划文件 `docs/superpowers/plans/` 不提交。

## 部署到阿里云（供用户参考）

1. 在本地执行 `npm run build`
2. 将 `dist/` 内容上传到阿里云服务器（覆盖原 `dist`），路径与 `server.js` 的 `express.static` 一致
3. `npm start`（或 pm2 等）重启进程
4. 访问 `https://你的域名/lofi` 验证

## Self-Review 结论

- **Spec 覆盖**：全部 9 个实施步骤（原设计文档）均有对应任务——素材(1)、路由(9)、Live2D(5)、音乐(6)、氛围动画(4)、导航入口(10)、番茄钟(7)、部署验证(11)。
- **占位符**：无 TBD；音乐/模型有明确来源与命名约定。
- **类型一致性**：`AmbientMode`、`SITE_CONFIG.lofi.*`、`Live2DWidgetOptions`、`LofiPage` 组合关系在各任务间一致；`setActive(false)` 抑制 BGM 逻辑在 Task 8 实现、Task 11 验证。
