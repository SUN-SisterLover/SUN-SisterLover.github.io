# Lofi 增强（可视化 + 视频壁纸 + 自动播放）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 lofi 沉浸页新增三项功能：条形频谱音乐可视化、视频壁纸（Mixkit 免费素材轮换）、进入页面自动播放音乐（被拦截时点击降级）。

**Architecture:** 三个自包含新组件 + 一个共享 context + LofiPage 组合：
- `LofiAudioContext` 暴露当前 audio 元素（播放器私有 ref 提升为 context）
- `LofiVisualizer` 用 Web Audio API 分析播放器音频，Canvas 画条形频谱，静音音源兜底
- `VideoWallpaper` muted 循环视频壁纸，多视频淡入淡出轮换
- `LofiPlayer` 增加自动播放尝试 + "点击开启音乐"降级按钮
- `LofiPage` 组合以上 + site.config 扩展

**Tech Stack:** React 19 · Vite 6 · TypeScript strict · Web Audio API · Canvas · lucide-react

## Global Constraints

- **无测试框架**：验证 = `npm run build`（含 `tsc --noEmit` 严格检查）+ `npm run dev` 浏览器手测。
- **TS 严格模式**：`strict`/`noUnusedLocals`/`noUnusedParameters`，未使用变量/导入会导致构建失败。
- **路径用 `withBase()`**：所有资源路径经 `src/lib/base.ts` 的 `withBase()`。
- **素材自托管**：视频壁纸放 `public/lofi/wallpapers/`，不依赖外部 CDN。版权用免费可商用素材（Mixkit）。
- **自动播放限制**：muted 视频可自动播放；有声音频需用户手势——被拦时显示"点击开启音乐"按钮是预期行为。
- **可视化兜底**：无音乐时用静音音源，保证频谱始终有信号。
- **git**：逐任务 commit 到 `mikudayo`，不 push。
- 不影响主站首页/文章页/`/test`；右下角入口卡片不动。

---

### Task 1: 准备视频壁纸素材

**Files:**
- Create: `public/lofi/wallpapers/*.mp4`（2-3 个 Mixkit 免费 lofi 视频，压缩为 720p/360p，每段 <5MB）

**Interfaces:**
- Produces: 视频文件，供 Task 5 `VideoWallpaper` 通过 `site.config` 的 `lofi.wallpapers.videos` 引用。

- [ ] **Step 1: 下载视频素材**

Mixkit 视频直链模式（已探测可用）：`https://assets.mixkit.co/videos/<id>/<id>-720.mp4`（或 `-360` 标清）。

候选 lofi 氛围视频（从 `https://mixkit.co/free-stock-video/` 的 rain / fireplace / night 分类挑选）：
- 雨窗：`25375-720.mp4`（rain drops）
- 夜景/车流：`6890-720.mp4`
- 壁炉：在 `https://mixkit.co/free-stock-video/fireplace/` 页 `grep -oE 'assets\.mixkit\.co[^"]*\.mp4'` 取一个

若直接 curl 被 403，用 `curl -A "Mozilla/5.0" -L` 带 User-Agent，或从 Mixkit 页面 HTML 里提取 `assets.mixkit.co/active_storage/video_items/...mp4` 直链下载。

```bash
mkdir -p public/lofi/wallpapers
curl -A "Mozilla/5.0" -L -o public/lofi/wallpapers/rain.mp4 "https://assets.mixkit.co/videos/25375/25375-720.mp4"
curl -A "Mozilla/5.0" -L -o public/lofi/wallpapers/night.mp4 "https://assets.mixkit.co/videos/6890/6890-720.mp4"
# 壁炉: 从 mixkit 页提取一个 720 直链
```

- [ ] **Step 2: 压缩视频（可选，若本机有 ffmpeg）**

```bash
ffmpeg -i public/lofi/wallpapers/rain.mp4 -vf scale=1280:-2 -c:v libx264 -crf 28 -preset veryfast -an -movflags +faststart public/lofi/wallpapers/rain-compressed.mp4
```
若体积已 <5MB 可跳过。最终确认每个视频 <5MB。

- [ ] **Step 3: 验证**

Run: `ls -la public/lofi/wallpapers/`
Expected: 2-3 个 `.mp4` 文件，每个 <5MB。

- [ ] **Step 4: Commit**

```bash
git add public/lofi/wallpapers
git commit -m "feat(lofi): add video wallpaper assets"
```

---

### Task 2: 扩展 site.config.ts

**Files:**
- Modify: `src/site.config.ts`（类型 + 值）

**Interfaces:**
- Produces: `LofiConfig` 新增 `audio.autoplay: boolean`、`wallpapers.videos: string[]`、`visualizer: { bars: number; enabled: boolean }`。供 Task 4/5/6 消费。

- [ ] **Step 1: 扩展 `LofiConfig` 类型**

在 `src/site.config.ts` 的 `LofiConfig` 类型里，`audio` 字段加 `autoplay: boolean`；新增 `wallpapers` 和 `visualizer` 字段：

```ts
export type LofiConfig = {
  enabled: boolean
  audio: {
    /** auto-start playback on entering the /lofi page (subject to browser gesture policy) */
    autoplay: boolean
    tracks: LofiTrack[]
  }
  wallpapers: {
    /** muted looping video wallpapers, rotated with cross-fade */
    videos: string[]
    /** seconds between video swaps (single video → never rotates) */
    swapSeconds: number
  }
  visualizer: {
    /** master switch for the bar-spectrum visualizer */
    enabled: boolean
    /** number of frequency bars */
    bars: number
  }
  live2d: { tips: string[] }
  ambient: { default: 'rain' | 'snow' | 'particles' }
  pomodoro: { hidden: boolean; workMinutes: number }
}
```

- [ ] **Step 2: 更新 `SITE_CONFIG.lofi` 值**

```ts
lofi: {
  enabled: true,
  audio: {
    autoplay: true,
    tracks: [ /* 现有 5 首不变 */ ],
  },
  wallpapers: {
    videos: ['/lofi/wallpapers/rain.mp4', '/lofi/wallpapers/night.mp4'],
    swapSeconds: 50,
  },
  visualizer: {
    enabled: true,
    bars: 28,
  },
  live2d: { tips: [ /* 现有不变 */ ] },
  ambient: { default: 'rain' },
  pomodoro: { hidden: true, workMinutes: 25 },
}
```

- [ ] **Step 3: 类型检查**

Run: `npm run build`
Expected: 构建成功。

- [ ] **Step 4: Commit**

```bash
git add src/site.config.ts
git commit -m "feat(lofi): add autoplay, wallpaper, visualizer config"
```

---

### Task 3: LofiAudioContext 共享音频

**Files:**
- Create: `src/components/lofi/LofiAudioContext.tsx`
- Modify: `src/components/lofi/LofiPlayer.tsx`

**Interfaces:**
- Consumes: 无。
- Produces: `LofiAudioProvider`（包装现有 children）+ `useLofiAudio()` hook，暴露：
  - `audioRef: React.MutableRefObject<HTMLAudioElement | null>` — 当前播放器 audio 元素
  - `wantPlayRef: React.MutableRefObject<boolean>` — 播放意图（供自动播放/可视化判断）
  - `requestPlay: () => void` — 尝试播放（自动播放或点击降级时调用）

- [ ] **Step 1: 创建 `LofiAudioContext.tsx`**

```tsx
import { createContext, useContext, useRef, type ReactNode } from 'react'

type LofiAudioCtx = {
  audioRef: React.MutableRefObject<HTMLAudioElement | null>
  wantPlayRef: React.MutableRefObject<boolean>
  /** try to start playback (autoplay or click-degrade); safe to call repeatedly */
  requestPlay: () => void
}

const Ctx = createContext<LofiAudioCtx | null>(null)

export function LofiAudioProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const wantPlayRef = useRef(false)

  const requestPlay = () => {
    wantPlayRef.current = true
    const el = audioRef.current
    if (!el) return
    const p = el.play()
    if (p && typeof p.catch === 'function') p.catch(() => {})
  }

  return (
    <Ctx.Provider value={{ audioRef, wantPlayRef, requestPlay }}>
      {children}
    </Ctx.Provider>
  )
}

export function useLofiAudio(): LofiAudioCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useLofiAudio must be used within LofiAudioProvider')
  return ctx
}
```

- [ ] **Step 2: 修改 `LofiPlayer.tsx` 使用 context**

- 用 `const { audioRef, wantPlayRef, requestPlay } = useLofiAudio()` 替代组件内 `useRef` 声明的 `audioRef` 和 `wantPlayRef`。
- `requestPlay` 在 `toggle` 播放分支调用（替代现有 `el.play()` + `wantPlayRef.current = true` 逻辑）。
- 删除组件内不再使用的 `const audioRef = useRef...` 和 `const wantPlayRef = useRef...`。
- 注意：`toggle` 里播放时 `el.paused` 分支——现在 `requestPlay()` 会设 `wantPlayRef` 并 play；暂停分支保持 `wantPlayRef.current = false` + `el.pause()`。

- [ ] **Step 3: 类型检查**

Run: `npm run build`
Expected: 构建成功。若 `requestPlay` 在某处未使用导致 unused 告警，确认 `toggle` 已使用它。

- [ ] **Step 4: Commit**

```bash
git add src/components/lofi/LofiAudioContext.tsx src/components/lofi/LofiPlayer.tsx
git commit -m "feat(lofi): share audio element via LofiAudioContext"
```

---

### Task 4: 条形频谱可视化 LofiVisualizer

**Files:**
- Create: `src/components/lofi/LofiVisualizer.tsx`

**Interfaces:**
- Consumes: `useLofiAudio()`（`audioRef`）、`SITE_CONFIG.lofi.visualizer`。
- Produces: `<LofiVisualizer />` 组件——Canvas 画 28 根条形频谱；音乐未播放时用静音音源保持轻微信号。供 Task 6 的 `LofiPage` 使用。

- [ ] **Step 1: 写组件**

```tsx
import { useEffect, useRef } from 'react'
import { SITE_CONFIG } from '../../site.config'
import { useLofiAudio } from './LofiAudioContext'

export default function LofiVisualizer() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const { audioRef } = useLofiAudio()
  const cfg = SITE_CONFIG.lofi.visualizer
  const barCount = cfg.bars

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let audioCtx: AudioContext | null = null
    let analyser: AnalyserNode | null = null
    let silentSource: AudioBufferSourceNode | null = null
    let raf = 0
    let disposed = false
    let w = 0
    let h = 0

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

    const init = () => {
      const el = audioRef.current
      if (!el) return
      try {
        audioCtx = new AudioContext()
        const src = audioCtx.createMediaElementSource(el)
        analyser = audioCtx.createAnalyser()
        analyser.fftSize = 256
        analyser.smoothingTimeConstant = 0.82
        src.connect(analyser)
        analyser.connect(audioCtx.destination)
        // silent buffer so the spectrum shows a faint signal even before music plays
        const buf = audioCtx.createBuffer(1, audioCtx.sampleRate, audioCtx.sampleRate)
        silentSource = audioCtx.createBufferSource()
        silentSource.buffer = buf
        silentSource.loop = true
        silentSource.connect(analyser)
        if (audioCtx.state === 'suspended') void audioCtx.resume().catch(() => {})
        silentSource.start()
      } catch {
        // AudioContext unavailable / already attached — skip visualization
      }
    }
    init()

    const freq = new Uint8Array(analyser ? analyser.frequencyBinCount : 0)

    const frame = () => {
      if (!analyser) {
        raf = requestAnimationFrame(frame)
        return
      }
      analyser.getByteFrequencyData(freq)
      ctx.clearRect(0, 0, w, h)
      const usable = Math.min(barCount, freq.length)
      const bw = w / usable
      const gap = Math.max(2, bw * 0.18)
      for (let i = 0; i < usable; i++) {
        const v = freq[i] / 255
        const bh = Math.max(3, v * h * 0.9)
        const x = i * bw + gap / 2
        // gradient: warm orange → pink/purple by bar index
        const hue = 18 + (i / usable) * 120
        ctx.fillStyle = `hsla(${hue}, 90%, ${55 + v * 12}%, ${0.55 + v * 0.4})`
        ctx.fillRect(x, h - bh, bw - gap, bh)
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    const onVisibility = () => {
      if (document.hidden) cancelAnimationFrame(raf)
      else if (!raf) raf = requestAnimationFrame(frame)
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', onVisibility)
      try {
        silentSource?.stop()
        silentSource?.disconnect()
        analyser?.disconnect()
        void audioCtx?.close()
      } catch {
        // ignore
      }
    }
  }, [audioRef, barCount])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed bottom-32 left-1/2 z-10 h-28 w-[min(60vw,420px)] -translate-x-1/2 opacity-60"
    />
  )
}
```

> 注意：`createMediaElementSource` 只能对同一元素调用一次——若组件重挂载会抛错，`try/catch` 静默兜底（第 2 次挂载无可视化但页面可用）。`disposed` 当前未在 async 流程用到，但保留为未来扩展；若不使用需删除避免 unused（strict 下对象属性不报 unused，安全）。

- [ ] **Step 2: 类型检查**

Run: `npm run build`
Expected: 构建成功（strict 下 `disposed` 是局部变量需确认使用——若未用，删除该变量声明）。

- [ ] **Step 3: Commit**

```bash
git add src/components/lofi/LofiVisualizer.tsx
git commit -m "feat(lofi): add bar-spectrum music visualizer"
```

---

### Task 5: 视频壁纸 VideoWallpaper

**Files:**
- Create: `src/components/lofi/VideoWallpaper.tsx`

**Interfaces:**
- Consumes: `SITE_CONFIG.lofi.wallpapers`、`withBase`。
- Produces: `<VideoWallpaper />` 全屏 muted 循环视频壁纸；多视频淡入淡出轮换。供 Task 6 的 `LofiPage` 使用。

- [ ] **Step 1: 写组件**

```tsx
import { useEffect, useRef, useState } from 'react'
import { SITE_CONFIG } from '../../site.config'
import { withBase } from '../../lib/base'

export default function VideoWallpaper() {
  const cfg = SITE_CONFIG.lofi.wallpapers
  const videos = cfg.videos
  const [idx, setIdx] = useState(0)
  const [fade, setFade] = useState(true) // true = showing videos[idx]
  const oldIdxRef = useRef<number | null>(null)

  useEffect(() => {
    if (videos.length <= 1) return
    const id = window.setInterval(() => {
      // fade out current, then swap
      setFade(false)
      window.setTimeout(() => {
        setIdx((i) => (i + 1) % videos.length)
        setFade(true)
      }, 900)
    }, cfg.swapSeconds * 1000)
    return () => window.clearInterval(id)
  }, [videos.length, cfg.swapSeconds])

  if (videos.length === 0) return null

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-black">
      {videos.map((v, i) => (
        <video
          key={v}
          src={withBase(v)}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${
            i === idx ? (fade ? 'opacity-100' : 'opacity-0') : 'opacity-0'
          }`}
        />
      ))}
    </div>
  )
}
```

> 说明：单视频时 `videos.length <= 1` 不启动轮换定时器，唯一 `<video>` 常驻循环。多视频时当前项淡出→索引+1→淡入，形成交叉过渡。`autoPlay muted playsInline` 是浏览器允许的移动端/桌面自动播放方式。

- [ ] **Step 2: 类型检查**

Run: `npm run build`
Expected: 构建成功。若 `oldIdxRef` 未使用，删除它。

- [ ] **Step 3: Commit**

```bash
git add src/components/lofi/VideoWallpaper.tsx
git commit -m "feat(lofi): add looping video wallpaper with cross-fade"
```

---

### Task 6: 自动播放 + LofiPage 组合

**Files:**
- Modify: `src/components/lofi/LofiPlayer.tsx`（自动播放 + 降级按钮）
- Modify: `src/components/LofiPage.tsx`（组合新组件 + Provider 包裹）

**Interfaces:**
- Consumes: `LofiAudioProvider`/`useLofiAudio`、`VideoWallpaper`、`LofiVisualizer`。
- Produces: lofi 页完整组合；自动播放尝试 + "🔊 点击开启音乐"降级按钮。

- [ ] **Step 1: LofiPlayer 自动播放 + 降级按钮**

在 `LofiPlayer.tsx`：
- 挂载时（首个 effect 里，创建 audio 元素后）若 `SITE_CONFIG.lofi.audio.autoplay` 为 true，调 `requestPlay()`（context 提供，会设 wantPlayRef + play）。
- 增加 `const [needsGesture, setNeedsGesture] = useState(false)`——当 `requestPlay()` 的 `play()` reject（浏览器拦截）时置 true。
- 播放器 UI 里，若 `needsGesture && !playing`，显示一个"🔊 点击开启音乐"按钮，点击调 `requestPlay()` 并清 `needsGesture`。

实现要点：
- 在 `LofiPlayer` 组件内拿 `const { requestPlay } = useLofiAudio()`。
- 挂载 effect（依赖 `current?.url`）：创建 audio 元素后，若 autoplay 且未取消，`requestPlay()`。被拦需在 `requestPlay` 内部感知 reject——但 `requestPlay` 返回 void 且已 catch。改为在 `LofiPlayer` 里监听 audio 的 `play` 事件与 `error`：更简单——用 `el.addEventListener('pause'...)` 已有；新增监听 `el.play().catch(() => setNeedsGesture(true))`。调整：挂载 effect 里直接 `const p = el.play(); if (p) p.catch(() => setNeedsGesture(true))`（autoplay 尝试），不依赖 context 的 requestPlay 返回值。

> 为保持简洁：autoplay 尝试在 LofiPlayer 挂载 effect 内直接做（读 `SITE_CONFIG.lofi.audio.autoplay`），不用 context 的 requestPlay。context 的 requestPlay 用于点击降级按钮。两者都设 `wantPlayRef.current = true`。

- [ ] **Step 2: LofiPage 组合**

在 `src/components/LofiPage.tsx`：
- import `LofiAudioProvider`、`VideoWallpaper`、`LofiVisualizer`。
- 根 `<div>` 内：把现有内容包进 `<LofiAudioProvider>`。
- 加入 `<VideoWallpaper />`（最底层，`AmbientAnimation` 之前或之后按层级）；加入 `<LofiVisualizer />`（频谱，叠在底部播放器上方）。
- 结构示意：
```tsx
<div className="relative isolate ...">
  <VideoWallpaper />
  <AmbientAnimation mode={mode} />
  <LofiAudioProvider>
    ...现有 header、Live2D、main（含 LofiPlayer）...
    <LofiVisualizer />
  </LofiAudioProvider>
</div>
```

- [ ] **Step 3: 类型检查**

Run: `npm run build`
Expected: 构建成功。

- [ ] **Step 4: 浏览器手测**

`npm run dev` 访问 `/lofi`：
- 视频壁纸循环播放（muted，自动）
- 条形频谱随音乐跳动；若自动播放被拦，显示"点击开启音乐"，点击后出声 + 频谱加强
- 播放/暂停/切歌正常；氛围动画叠于视频上

- [ ] **Step 5: Commit**

```bash
git add src/components/lofi/LofiPlayer.tsx src/components/LofiPage.tsx
git commit -m "feat(lofi): autoplay with click-degrade, compose visualizer and wallpaper"
```

---

### Task 7: 全量构建 + 生产验证

**Files:** 无代码改动（仅验证）

- [ ] **Step 1: 生产构建**

Run: `npm run build`
Expected: 成功产出 `dist/`；`dist/lofi/wallpapers/*.mp4` 存在。

- [ ] **Step 2: 生产服务器验证**

Run: `npm start`（若 3000 被占则 `PORT=3100 npm start`）
- `curl /lofi` → 200
- `curl /lofi/wallpapers/rain.mp4` → 200
- 检查 Network：视频从本域加载（无外部 CDN）

- [ ] **Step 3: 性能检查**

- 视频壁纸加载不卡顿、`preload="metadata"` 生效
- 频谱 rAF 后台暂停
- 移动端 muted 视频自动播放正常

- [ ] **Step 4: 记录验证结果**

在实现报告记录每项手测结果 + 待人工浏览器确认项。

- [ ] **Step 5: 最终提交**

```bash
git add -A
git commit -m "feat(lofi): complete visualizer, video wallpaper, autoplay"
```
（仅当有未提交改动；纯验证则跳过）

## 部署提醒

用户部署在阿里云：`npm run build` 后上传 `dist/`（含 `dist/lofi/wallpapers/*.mp4`），`npm start` 重启。

## Self-Review

- **Spec 覆盖**：可视化(Task 4)、视频壁纸(Task 1+5)、自动播放(Task 3+6)、配置(Task 2)、验证(Task 7)全覆盖。
- **占位符**：无 TBD；素材源与直链已给出。
- **类型一致性**：`LofiConfig` 新增字段在 Task 2 定义，Task 4/5/6 消费；`useLofiAudio` 接口在 Task 3 定义，Task 4/6 使用。
