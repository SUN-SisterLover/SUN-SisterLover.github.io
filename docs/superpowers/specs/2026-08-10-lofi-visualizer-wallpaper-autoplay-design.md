# Lofi 页面增强：音乐可视化 + 视频壁纸 + 自动播放

## Context

lofi 沉浸页（`/lofi`）已有：Live2D Shizuku 看板娘、lofi 播放器（5 首 CC0 曲目）、氛围动画（雨/雪/星）、番茄钟（隐藏）、右下角入口卡片。现用户希望增强三项：

1. **音乐可视化**——条形频谱（经典均衡器），随播放中的音频实时跳动
2. **视频壁纸**——循环播放 lofi 氛围视频（雨窗/壁炉/夜景等），像 lofi 直播间那种流动感
3. **自动播放**——进入 lofi 页面自动尝试播放音乐；被浏览器拦截时显示"🔊 点击开启音乐"按钮；可视化用静音音源保证频谱始终有信号

## 设计决策（已与用户确认）

| 项 | 决策 |
|----|------|
| 可视化样式 | 条形频谱（28 根彩色渐变竖条） |
| 壁纸类型 | **视频壁纸**（用户选择动态壁纸→确认视频；素材免费可商用） |
| 自动播放策略 | 挂载尝试播放；被拦显示点击按钮；可视化用静音音源保信号 |
| 实现结构 | 独立 `LofiVisualizer` 组件；新增 `LofiAudioContext` 共享音频元素 |

## 技术方案

### 1. `LofiAudioContext`（共享音频元素）

当前 `LofiPlayer.tsx` 用私有 `useRef<HTMLAudioElement | null>` 持有 audio 元素，外部无法访问。新增一个 React context，让可视化组件和自动播放逻辑能读到当前 audio 元素。

- 新建 `src/components/lofi/LofiAudioContext.tsx`
- Context 暴露：`audioRef`（`React.MutableRefObject<HTMLAudioElement | null>`）、`wantPlayRef`（播放意图）、以及 `requestPlay` 辅助（尝试播放）
- `LofiPlayer` 内部改为通过 context 提供 audioRef

### 2. `LofiVisualizer`（条形频谱）

- 新建 `src/components/lofi/LofiVisualizer.tsx`
- 用 Web Audio API：`AudioContext` + `MediaElementAudioSourceNode` + `AnalyserNode`
- 从 `LofiAudioContext` 读取 audio 元素，`createMediaElementSource(audio)` 接分析器
- Canvas 绘制 28 根竖条，颜色从暖橙到粉紫渐变，随 `analyser.getByteFrequencyData()` 跳动
- **静音音源兜底**：当音乐未播放（自动播放被拦截）时，AudioContext 循环一个 silent buffer，保证频谱仍有轻微信号（视觉上"有生命"）
- 性能：`requestAnimationFrame` 驱动，页面不可见时暂停；条形数量/大小限流
- 仅当有 audio 元素且 `lofi.enabled` 时渲染

### 3. `VideoWallpaper`（视频壁纸）

- 新建 `src/components/lofi/VideoWallpaper.tsx`
- `<video autoplay muted loop playsInline>` 循环播放壁纸视频（`public/lofi/wallpapers/*.mp4`）
- **多视频轮换**：壁纸列表 2-3 个视频，每 45-60 秒切换（淡出旧、淡入新）；单视频则常驻循环
- 视频用 `muted` + `loop` + `playsInline`（移动端无交互自动播放视频是浏览器允许的，因为 muted）
- 位于 lofi 页最底层，氛围动画（雨/雪/星 canvas）叠于其上，形成"视频背景 + 动态粒子"叠加
- 壁纸列表在 `site.config.ts` 的 `lofi.wallpapers.videos` 配置（url 数组）
- **性能**：视频设置 `preload="metadata"` + `poster` 首帧占位，避免加载卡顿；切歌不重载视频

### 4. 自动播放 + 点击降级

- `LofiPlayer` 挂载时设 `wantPlayRef.current = true` 并尝试 `play()`
- `play()` reject（浏览器拦截）→ 播放器 UI 顶部显示"🔊 点击开启音乐"按钮；点击后 `play()`
- `LofiPage` 组合 `VideoWallpaper`、`LofiVisualizer`、`LofiPlayer`，可视化与播放器并排/叠放
- 保留"默认不自动播"的旧行为为 fallback（若 `lofi.audio.autoplay` 配置为 false）

### 5. `site.config.ts` 扩展

- `lofi.audio.autoplay: boolean`（默认 true）
- `lofi.wallpapers.videos: string[]`（视频壁纸 url 列表）
- `lofi.visualizer: { bars: number; enabled: boolean }`（可视化配置）

## 素材准备

- 下载 2-3 个免费 lofi 氛围视频（雨窗 / 壁炉 / 车窗外夜景霓虹等）→ `public/lofi/wallpapers/`，压缩为 `-720` 或 `-360` 标清（控制体积）
- 来源：**Mixkit**（`mixkit.co/free-stock-video/`，免费商用免署名，已确认可达，直链模式如 `assets.mixkit.co/videos/<id>/<id>-720.mp4`）；备选 Coverr、Pexels
- 转码/压缩：用 ffmpeg（若本机有）压到 ~720p、H.264、每段 <5MB

## 验证方式

1. `/lofi` 打开：视频壁纸循环播放（雨窗/壁炉流动感）、氛围动画叠于其上、条形频谱随音乐跳动
2. 自动播放：进入页面音乐自动开始（若浏览器允许）；被拦时显示"点击开启音乐"按钮，点击后出声且频谱加强
3. 频谱：播放/暂停/切歌时条形跟随；无音频时静音音源让频谱有轻微信号
4. 多视频：轮换切换流畅（淡入淡出），单视频则常驻
5. 性能：视频加载不卡顿、后台暂停、移动端 muted 自动播正常
6. 主站回归：首页、文章页、`/test` 正常；右下角入口卡片正常

## 注意事项

- 壁纸视频与音频用免费可商用素材（Mixkit 免署名；如换源需核对授权）
- 自动播放受浏览器策略限制——**muted 视频可自动播放**，**有声音频需手势**，降级为"点击开启"是预期行为
- 视频壁纸有体积/带宽成本——用 720p/360p 标清压缩，控制每个 <5MB
- `AudioContext` 需要用户手势才能 resume——挂载时尝试，被拦则按钮触发
- 可视化/壁纸改动集中在 `src/components/lofi/` 新文件 + `LofiPage` 组合 + `site.config`，可回滚
