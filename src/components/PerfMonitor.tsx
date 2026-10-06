import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Activity,
  Cpu,
  Gauge,
  HardDrive,
  Layers,
  Pause,
  Play,
  RotateCcw,
  Timer,
  Zap,
} from 'lucide-react'
import { useLang } from '../i18n'
import {
  blockMainThread,
  fmtBytes,
  fmtMs,
  rateVital,
  useDeviceInfo,
  useFrameStats,
  useMemoryStats,
  useNavigationTiming,
  useResourceStats,
  useWebVitals,
  type VitalRating,
} from '../lib/perf'

/* ---------- shared bits ---------- */
function Card({
  title,
  icon,
  action,
  children,
  className = '',
}: {
  title: string
  icon: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`rounded-xl border border-ink-2/20 bg-ink-2/[0.06] ${className}`}>
      <div className="flex items-center gap-2 border-b border-ink-2/20 px-4 py-2.5">
        <span className="text-accent">{icon}</span>
        <span className="text-xs font-medium uppercase tracking-wider text-dim">{title}</span>
        {action && <span className="ml-auto">{action}</span>}
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

function Stat({
  label,
  value,
  tone = 'text-paper',
  sub,
}: {
  label: string
  value: string
  tone?: string
  sub?: string
}) {
  return (
    <div>
      <div className={`font-mono text-lg font-semibold tabular-nums ${tone}`}>{value}</div>
      <div className="mt-0.5 text-[10px] uppercase tracking-wider text-dim">{label}</div>
      {sub && <div className="mt-0.5 font-mono text-[10px] text-dim/70">{sub}</div>}
    </div>
  )
}

const RATING_TONE: Record<VitalRating, string> = {
  good: 'text-green-400',
  ni: 'text-amber-400',
  poor: 'text-red-400',
  na: 'text-dim',
}

const RATING_LABEL: Record<VitalRating, { zh: string; en: string }> = {
  good: { zh: '良好', en: 'good' },
  ni: { zh: '待优化', en: 'needs work' },
  poor: { zh: '较差', en: 'poor' },
  na: { zh: '不支持', en: 'n/a' },
}

function fpsTone(fps: number): string {
  if (fps >= 55) return 'text-green-400'
  if (fps >= 30) return 'text-amber-400'
  return 'text-red-400'
}

/* ---------- fps sparkline ---------- */
function Sparkline({ data, max }: { data: number[]; max: number }) {
  if (data.length < 2) {
    return (
      <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-ink-2/20 font-mono text-xs text-dim">
        sampling…
      </div>
    )
  }
  const n = data.length
  const pts = data.map((v, i) => {
    const x = (i / (n - 1)) * 100
    const y = 100 - Math.min(1, Math.max(0, v / max)) * 100
    return `${x.toFixed(2)},${y.toFixed(2)}`
  })
  const line = pts.join(' ')
  const area = `0,100 ${line} 100,100`
  const y60 = 100 - Math.min(1, 60 / max) * 100
  const y30 = 100 - Math.min(1, 30 / max) * 100

  return (
    <div className="relative h-24 overflow-hidden rounded-lg border border-ink-2/20 bg-ink-2/[0.06]">
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 size-full"
        aria-hidden
      >
        <defs>
          <linearGradient id="fps-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.32" />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line
          x1="0"
          x2="100"
          y1={y60}
          y2={y60}
          stroke="var(--color-accent-2)"
          strokeOpacity="0.35"
          strokeDasharray="3 3"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1="0"
          x2="100"
          y1={y30}
          y2={y30}
          stroke="currentColor"
          className="text-red-400"
          strokeOpacity="0.3"
          strokeDasharray="3 3"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
        <polygon points={area} fill="url(#fps-fill)" />
        <polyline
          points={line}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span className="absolute right-2 top-1.5 font-mono text-[10px] text-dim">{max} fps</span>
      <span className="absolute bottom-1 left-2 font-mono text-[10px] text-dim">
        {(data.length * 0.25).toFixed(1)}s
      </span>
    </div>
  )
}

/* ---------- stress field ---------- */
function StressField({ count, thrash }: { count: number; thrash: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host || count === 0) return
    const nodes = Array.from(host.children) as HTMLElement[]
    let raf = 0
    const start = performance.now()
    const loop = (now: number) => {
      const t = (now - start) / 1000
      for (let i = 0; i < nodes.length; i++) {
        const a = t * 1.4 + i * 0.28
        nodes[i].style.transform =
          `translate3d(${(Math.cos(a) * 10).toFixed(2)}px, ${(Math.sin(a * 1.3) * 8).toFixed(2)}px, 0) rotate(${(a * 40).toFixed(1)}deg)`
        // Reading a layout property inside the write loop forces a sync
        // reflow per node — the classic layout-thrash worst case.
        if (thrash) void nodes[i].offsetHeight
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [count, thrash])

  if (count === 0) {
    return (
      <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-ink-2/20 font-mono text-xs text-dim">
        idle
      </div>
    )
  }

  return (
    <div
      ref={hostRef}
      className="flex h-24 flex-wrap content-start gap-1 overflow-hidden rounded-lg border border-ink-2/20 bg-ink-2/[0.06] p-2"
    >
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className="size-2 shrink-0 rounded-[2px] bg-gradient-accent" />
      ))}
    </div>
  )
}

/* ============================================================ */
export default function PerfMonitor() {
  const { pick } = useLang()

  const [running, setRunning] = useState(true)
  const [stressCount, setStressCount] = useState(0)
  const [thrash, setThrash] = useState(false)
  const [blockMs, setBlockMs] = useState(200)

  const { stats, reset } = useFrameStats(running)
  const { memory, supported: memSupported } = useMemoryStats(running)
  const nav = useNavigationTiming()
  const vitals = useWebVitals()
  const { groups, total, refresh } = useResourceStats()
  const device = useDeviceInfo()

  const peak = Math.max(60, ...stats.history)
  const chartMax = Math.ceil(peak / 30) * 30

  const vitalRows: { key: string; name: string; value: number | null; digits: number }[] = [
    { key: 'fcp', name: 'FCP', value: vitals.fcp, digits: 0 },
    { key: 'lcp', name: 'LCP', value: vitals.lcp, digits: 0 },
    { key: 'ttfb', name: 'TTFB', value: vitals.ttfb, digits: 0 },
    { key: 'inp', name: 'INP', value: vitals.inp, digits: 0 },
    { key: 'cls', name: 'CLS', value: vitals.cls, digits: 3 },
  ]

  const maxPhase = nav ? Math.max(1, ...nav.phases.map((p) => p.ms)) : 1

  return (
    <div className="space-y-5">
      {/* ---- control bar ---- */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-ink-2/20 bg-ink-2/[0.06] px-4 py-3">
        <span className="flex items-center gap-2 text-sm font-medium text-paper">
          <span
            className={`size-2 rounded-full ${running ? 'bg-green-400 dot-breathe' : 'bg-ink-2/50'}`}
          />
          {running
            ? pick({ zh: '监测中', en: 'Monitoring' })
            : pick({ zh: '已暂停', en: 'Paused' })}
        </span>
        <span className="font-mono text-xs text-dim">
          {stats.totalFrames} frames · {stats.history.length} samples
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setRunning((v) => !v)}
            className="flex items-center gap-1.5 rounded-md border border-ink-2/30 px-3 py-1.5 text-xs text-paper transition-colors hover:bg-ink-2/10 press-sm"
          >
            {running ? <Pause size={14} /> : <Play size={14} />}
            {running ? pick({ zh: '暂停', en: 'Pause' }) : pick({ zh: '开始', en: 'Start' })}
          </button>
          <button
            onClick={reset}
            className="flex items-center gap-1.5 rounded-md border border-ink-2/30 px-3 py-1.5 text-xs text-paper transition-colors hover:bg-ink-2/10 press-sm"
          >
            <RotateCcw size={14} /> {pick({ zh: '重置', en: 'Reset' })}
          </button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ---- fps ---- */}
        <Card
          title={pick({ zh: '实时帧率', en: 'Frame Rate' })}
          icon={<Gauge size={15} />}
          action={
            <span className={`font-mono text-xl font-bold tabular-nums ${fpsTone(stats.fps)}`}>
              {stats.fps}
              <span className="ml-1 text-[10px] font-normal text-dim">FPS</span>
            </span>
          }
        >
          <Sparkline data={stats.history} max={chartMax} />
          <div className="mt-4 grid grid-cols-4 gap-3">
            <Stat label={pick({ zh: '平均', en: 'avg' })} value={`${stats.avgFps}`} />
            <Stat
              label={pick({ zh: '最低', en: 'min' })}
              value={`${stats.minFps}`}
              tone={fpsTone(stats.minFps)}
            />
            <Stat
              label={pick({ zh: '最长帧', en: 'max frame' })}
              value={stats.maxFrameMs.toFixed(1)}
              sub="ms"
            />
            <Stat
              label={pick({ zh: '卡顿帧', en: 'jank' })}
              value={`${stats.jankFrames}`}
              tone={stats.jankFrames > 0 ? 'text-amber-400' : 'text-paper'}
              sub=">50ms"
            />
          </div>
        </Card>

        {/* ---- memory ---- */}
        <Card title={pick({ zh: 'JS 堆内存', en: 'JS Heap' })} icon={<HardDrive size={15} />}>
          {memSupported && memory ? (
            <>
              <div className="flex items-end justify-between">
                <span className="font-mono text-2xl font-bold tabular-nums text-paper">
                  {fmtBytes(memory.used)}
                </span>
                <span className="font-mono text-xs text-dim">
                  / {fmtBytes(memory.limit)} limit
                </span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-ink-2/20">
                <div
                  className="h-full rounded-full bg-gradient-accent transition-[width] duration-300 ease-[var(--ease-out)]"
                  style={{ width: `${Math.min(100, (memory.used / memory.limit) * 100)}%` }}
                />
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3">
                <Stat label="used" value={fmtBytes(memory.used)} />
                <Stat label="allocated" value={fmtBytes(memory.total)} />
                <Stat
                  label={pick({ zh: '占用率', en: 'usage' })}
                  value={`${((memory.used / memory.limit) * 100).toFixed(1)}%`}
                />
              </div>
            </>
          ) : (
            <p className="text-sm leading-relaxed text-dim">
              {pick({
                zh: '当前浏览器不支持 performance.memory（仅 Chromium 内核可用）。',
                en: '`performance.memory` is unavailable in this browser (Chromium only).',
              })}
            </p>
          )}
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-ink-2/20 pt-3 font-mono text-[11px] text-dim sm:grid-cols-4">
            <span>{device.cores ?? '—'} cores</span>
            <span>{device.deviceMemoryGb ? `${device.deviceMemoryGb} GB` : '— GB'}</span>
            <span>DPR {device.dpr}</span>
            <span>{device.viewport}</span>
          </div>
        </Card>

        {/* ---- web vitals ---- */}
        <Card title="Core Web Vitals" icon={<Activity size={15} />}>
          <div className="divide-y divide-ink-2/[0.15]">
            {vitalRows.map((row) => {
              const rating = rateVital(row.key, row.value)
              return (
                <div key={row.key} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                  <span className="w-12 font-mono text-xs font-semibold text-paper">{row.name}</span>
                  <span className={`font-mono text-sm tabular-nums ${RATING_TONE[rating]}`}>
                    {row.value == null
                      ? '—'
                      : row.key === 'cls'
                        ? row.value.toFixed(row.digits)
                        : fmtMs(row.value, row.digits)}
                  </span>
                  <span
                    className={`ml-auto rounded-full px-2 py-0.5 text-[10px] ${RATING_TONE[rating]} bg-ink-2/15`}
                  >
                    {pick(RATING_LABEL[rating])}
                  </span>
                </div>
              )
            })}
          </div>
          <div className="mt-3 flex items-center gap-4 border-t border-ink-2/20 pt-3 font-mono text-[11px] text-dim">
            <span>
              long tasks: <span className="text-paper">{vitals.longTasks}</span>
            </span>
            <span>
              blocking: <span className="text-paper">{fmtMs(vitals.blockingMs)}</span>
            </span>
          </div>
        </Card>

        {/* ---- navigation waterfall ---- */}
        <Card title={pick({ zh: '加载阶段', en: 'Load Phases' })} icon={<Timer size={15} />}>
          {nav ? (
            <>
              <div className="space-y-1.5">
                {nav.phases.map((p) => (
                  <div key={p.key} className="flex items-center gap-3">
                    <span className="w-32 shrink-0 truncate text-[11px] text-dim">
                      {pick(p.label)}
                    </span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-2/[0.12]">
                      <div
                        className="h-full rounded-full bg-gradient-accent"
                        style={{ width: `${Math.max(1.5, (p.ms / maxPhase) * 100)}%` }}
                      />
                    </div>
                    <span className="w-16 shrink-0 text-right font-mono text-[11px] tabular-nums text-paper/80">
                      {p.ms.toFixed(1)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3 border-t border-ink-2/20 pt-3">
                <Stat label={pick({ zh: '总耗时', en: 'total' })} value={fmtMs(nav.total)} />
                <Stat label={pick({ zh: '文档大小', en: 'document' })} value={fmtBytes(nav.transferSize)} />
                <Stat label={pick({ zh: '导航类型', en: 'nav type' })} value={nav.navType} />
              </div>
            </>
          ) : (
            <p className="text-sm text-dim">
              {pick({ zh: '暂无 Navigation Timing 数据。', en: 'No navigation timing available.' })}
            </p>
          )}
        </Card>
      </div>

      {/* ---- resources ---- */}
      <Card
        title={pick({ zh: '资源加载统计', en: 'Resource Timing' })}
        icon={<Layers size={15} />}
        action={
          <button
            onClick={refresh}
            className="flex items-center gap-1.5 rounded-md border border-ink-2/30 px-2.5 py-1 text-[11px] text-paper transition-colors hover:bg-ink-2/10 press-sm"
          >
            <RotateCcw size={12} /> {pick({ zh: '刷新', en: 'Refresh' })}
          </button>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-dim">
                <th className="border-b border-ink-2/20 px-2 py-1.5 text-left font-medium">type</th>
                <th className="border-b border-ink-2/20 px-2 py-1.5 text-right font-medium">count</th>
                <th className="border-b border-ink-2/20 px-2 py-1.5 text-right font-medium">transfer</th>
                <th className="border-b border-ink-2/20 px-2 py-1.5 text-right font-medium">decoded</th>
                <th className="border-b border-ink-2/20 px-2 py-1.5 text-right font-medium">slowest</th>
              </tr>
            </thead>
            <tbody className="font-mono text-xs tabular-nums">
              {groups.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-2 py-4 text-center text-dim">
                    {pick({ zh: '暂无资源条目', en: 'no resource entries' })}
                  </td>
                </tr>
              )}
              {groups.map((g) => (
                <tr key={g.type} className="transition-colors hover:bg-ink-2/[0.08]">
                  <td className="border-b border-ink-2/[0.12] px-2 py-1.5 text-paper">{g.type}</td>
                  <td className="border-b border-ink-2/[0.12] px-2 py-1.5 text-right text-paper/80">
                    {g.count}
                  </td>
                  <td className="border-b border-ink-2/[0.12] px-2 py-1.5 text-right text-paper/80">
                    {fmtBytes(g.transfer)}
                  </td>
                  <td className="border-b border-ink-2/[0.12] px-2 py-1.5 text-right text-paper/80">
                    {fmtBytes(g.decoded)}
                  </td>
                  <td className="border-b border-ink-2/[0.12] px-2 py-1.5 text-right text-paper/80">
                    {g.slowest.toFixed(0)} ms
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-mono text-xs font-semibold tabular-nums text-accent">
                <td className="px-2 py-2">total</td>
                <td className="px-2 py-2 text-right">{total.count}</td>
                <td className="px-2 py-2 text-right">{fmtBytes(total.transfer)}</td>
                <td className="px-2 py-2 text-right">{fmtBytes(total.decoded)}</td>
                <td className="px-2 py-2 text-right">{total.slowest.toFixed(0)} ms</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      {/* ---- stress test ---- */}
      <Card title={pick({ zh: '压力测试', en: 'Stress Test' })} icon={<Zap size={15} />}>
        <p className="text-sm leading-relaxed text-dim">
          {pick({
            zh: '制造可控的渲染 / 主线程负载，观察上方帧率曲线与卡顿帧计数的变化。',
            en: 'Generate controlled render / main-thread load and watch the fps chart above react.',
          })}
        </p>
        <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,20rem)_1fr]">
          <div className="space-y-4">
            <div>
              <div className="mb-2 flex items-center justify-between text-xs font-medium uppercase tracking-wider text-dim">
                <span>{pick({ zh: '动画节点数', en: 'animated nodes' })}</span>
                <span className="font-mono text-paper/80">{stressCount}</span>
              </div>
              <input
                type="range"
                min={0}
                max={1200}
                step={50}
                value={stressCount}
                onChange={(e) => setStressCount(Number(e.target.value))}
                className="w-full"
              />
            </div>

            <label className="flex cursor-pointer items-center justify-between gap-3 text-sm text-paper">
              <span className="flex items-center gap-2">
                <Cpu size={15} className="text-dim" />
                {pick({ zh: '强制同步回流', en: 'Force sync reflow' })}
              </span>
              <button
                type="button"
                onClick={() => setThrash((v) => !v)}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ease-[var(--ease-out)] ${
                  thrash ? 'bg-gradient-accent' : 'bg-ink-2/30'
                }`}
                aria-pressed={thrash}
              >
                <span
                  className={`absolute top-0.5 size-5 rounded-full bg-ink shadow-sm transition-transform duration-200 ease-[var(--ease-spring)] ${
                    thrash ? 'translate-x-[22px]' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </label>

            <div>
              <div className="mb-2 flex items-center justify-between text-xs font-medium uppercase tracking-wider text-dim">
                <span>{pick({ zh: '阻塞时长', en: 'block duration' })}</span>
                <span className="font-mono text-paper/80">{blockMs} ms</span>
              </div>
              <input
                type="range"
                min={50}
                max={1000}
                step={50}
                value={blockMs}
                onChange={(e) => setBlockMs(Number(e.target.value))}
                className="w-full"
              />
              <button
                onClick={() => blockMainThread(blockMs)}
                className="mt-3 w-full rounded-md border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-400 transition-colors hover:bg-red-500/20 press-sm"
              >
                {pick({ zh: '阻塞主线程', en: 'Block main thread' })}
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <StressField count={stressCount} thrash={thrash} />
            <div className="grid grid-cols-3 gap-3 rounded-lg border border-ink-2/20 bg-ink-2/[0.06] p-3">
              <Stat
                label={pick({ zh: '当前帧率', en: 'fps now' })}
                value={`${stats.fps}`}
                tone={fpsTone(stats.fps)}
              />
              <Stat
                label={pick({ zh: '帧耗时', en: 'frame' })}
                value={stats.lastFrameMs.toFixed(1)}
                sub="ms"
              />
              <Stat
                label={pick({ zh: '长任务', en: 'long tasks' })}
                value={`${vitals.longTasks}`}
                tone={vitals.longTasks > 0 ? 'text-amber-400' : 'text-paper'}
              />
            </div>
            <p className="font-mono text-[11px] leading-relaxed text-dim">
              {pick({
                zh: '提示：开启「强制同步回流」后每个节点都会触发一次布局重算，节点数越多掉帧越明显。',
                en: 'Tip: with sync reflow on, every node forces a layout recalc — fps drops fast as the count grows.',
              })}
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
}
