import { useState, type ReactNode } from 'react'
import PostCard from './PostCard'
import CommentTerminal from './CommentTerminal'
import PerfMonitor from './PerfMonitor'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useTheme, type ThemePref } from '../theme'
import { useLang } from '../i18n'
import { SITE_CONFIG, type PaletteId } from '../site.config'
import type { PostDef } from '../data/posts'
import {
  ArrowLeft,
  Moon,
  Sun,
  Monitor,
  Play,
  Pause,
  Code2,
  Loader2,
  Volume2,
  Terminal,
  CreditCard,
  Check,
} from 'lucide-react'

/* ---------- layout helpers ---------- */
function Section({
  id,
  title,
  desc,
  children,
}: {
  id: string
  title: string
  desc: string
  children: ReactNode
}) {
  return (
    <section id={id} className="mx-auto w-full max-w-5xl px-5 py-12 md:px-8">
      <h2 className="text-accent font-mono text-xs uppercase tracking-[0.2em]">{id}</h2>
      <h3 className="text-paper mt-1 text-2xl font-semibold md:text-3xl">{title}</h3>
      <p className="text-dim mt-2 max-w-2xl text-sm leading-relaxed">{desc}</p>
      <div className="mt-6">{children}</div>
    </section>
  )
}

function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl border border-ink-2/20 bg-ink-2/[0.06] p-5 ${className}`}
    >
      {children}
    </div>
  )
}

function PaletteSwatch({ id }: { id: PaletteId }) {
  const colors = SITE_CONFIG.colors[id].colors.dark
  return (
    <span
      className="inline-block size-4 rounded-full border border-line"
      style={{ background: `linear-gradient(135deg, ${colors.accent}, ${colors.accent2})` }}
    />
  )
}

/* ---------- sample data ---------- */
const samplePost: PostDef = {
  id: 'test-sample',
  index: '00',
  title: { zh: '示例文章标题', en: 'Sample Post Title' },
  excerpt: {
    zh: '这是一段示例摘要，用于展示 PostCard 卡片样式与悬停动效。',
    en: 'A sample excerpt used to showcase the PostCard style and hover motion.',
  },
  body: {
    zh: '# 示例正文\n这里是正文内容，包含 **粗体** 与 `代码`。',
    en: '# Sample body\nBody content with **bold** and `code`.',
  },
  tags: ['test', 'demo', 'ui'],
  date: '2026-08-07',
  readTime: '3 min',
  audio: [],
}

/* ---------- custom inline markdown ---------- */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const regex = /(\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\))/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    if (m[2] !== undefined) {
      nodes.push(
        <strong key={`${keyPrefix}-b${i}`} className="text-paper font-semibold">
          {m[2]}
        </strong>,
      )
    } else if (m[3] !== undefined) {
      nodes.push(
        <code
          key={`${keyPrefix}-c${i}`}
          className="rounded-md bg-ink-2/20 px-1.5 py-0.5 font-mono text-[0.85em] text-accent"
        >
          {m[3]}
        </code>,
      )
    } else if (m[4] !== undefined) {
      nodes.push(
        <a
          key={`${keyPrefix}-l${i}`}
          href={m[5]}
          target="_blank"
          rel="noreferrer"
          className="text-accent underline underline-offset-2 transition-colors hover:text-paper"
        >
          {m[4]}
        </a>,
      )
    }
    last = regex.lastIndex
    i++
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

/* ---------- custom block parser ---------- */
type Block =
  | { kind: 'track'; id: string }
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'code'; lang: string; code: string }
  | { kind: 'paragraph'; text: string }

function parseBlocks(md: string): Block[] {
  const lines = md.split('\n')
  const blocks: Block[] = []
  let i = 0
  while (i < lines.length) {
    const t = lines[i].trim()
    if (!t) {
      i++
      continue
    }
    const tm = t.match(/^\^([\w-]+)\^$/)
    if (tm) {
      blocks.push({ kind: 'track', id: tm[1] })
      i++
      continue
    }
    const hm = t.match(/^(#{1,3})\s+(.+)$/)
    if (hm) {
      blocks.push({ kind: 'heading', level: hm[1].length, text: hm[2] })
      i++
      continue
    }
    const cm = t.match(/^```(\w*)\s*$/)
    if (cm) {
      const lang = cm[1]
      const code: string[] = []
      i++
      while (i < lines.length && lines[i].trim() !== '```') {
        code.push(lines[i])
        i++
      }
      i++
      blocks.push({ kind: 'code', lang, code: code.join('\n') })
      continue
    }
    const para: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(\^[\w-]+\^|#{1,3}\s|```)/.test(lines[i].trim())
    ) {
      para.push(lines[i])
      i++
    }
    blocks.push({ kind: 'paragraph', text: para.join(' ') })
  }
  return blocks
}

const customMdSample = `^demo-track-01^
# 自定义解析标题
这是一段 **粗体** 与 \`行内代码\` 的段落，以及 [一个链接](https://example.com)。
## 子标题
普通段落，展示自定义 block 渲染管线。
\`\`\`ts
const greet = (name: string) => \`hello \${name}\`
\`\`\``

const gfmSample = `# GFM 标准解析
支持 **粗体**、*斜体*、[链接](https://example.com)、\`行内代码\` 与 ~~删除线~~。

- 列表项 A
- 列表项 B
- 嵌套支持

1. 有序一
2. 有序二

> 这是一段引用，用于展示 blockquote 样式。

| 表头 A | 表头 B |
| --- | --- |
| 单元格 1 | 单元格 2 |
| 单元格 3 | 单元格 4 |

\`\`\`js
const sum = (a, b) => a + b
console.log(sum(1, 2))
\`\`\`
`

/* ============================================================ */
export default function TestPage({ onExit }: { onExit: () => void }) {
  const { theme, setTheme, palette, setPalette, availablePalettes } = useTheme()
  const { lang, setLang, pick } = useLang()

  const [count, setCount] = useState(0)
  const [text, setText] = useState('hello test')
  const [volume, setVolume] = useState(60)
  const [checked, setChecked] = useState(true)
  const [radio, setRadio] = useState('a')
  const [select, setSelect] = useState('x')
  const [toggle, setToggle] = useState(false)
  const [playing, setPlaying] = useState(false)

  // font playground
  const [fontStack, setFontStack] = useState<'sf' | 'pingfang' | 'system' | 'mono'>('sf')
  const [fontSize, setFontSize] = useState(20)
  const [fontWeight, setFontWeight] = useState(400)
  const [sampleText, setSampleText] = useState(
    'The quick brown fox 跳过了 懒狗 1234567890 — ABCabc',
  )

  const blocks = parseBlocks(customMdSample)

  return (
    <div className="min-h-[100dvh] pb-24">
      {/* header */}
      <header className="sticky top-0 z-40 border-b border-ink-2/20 bg-ink/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3 md:px-8">
          <div className="flex items-center gap-3">
            <button
              onClick={onExit}
              className="flex items-center gap-1.5 text-sm text-paper/70 transition-colors hover:text-paper press-sm"
            >
              <ArrowLeft size={16} /> 返回首页
            </button>
            <span className="font-mono text-xs text-dim">/test</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const order: ThemePref[] = ['system', 'light', 'dark']
                const idx = order.indexOf(theme)
                setTheme(order[(idx + 1) % order.length])
              }}
              className="flex items-center gap-1.5 rounded-md border border-ink-2/20 px-3 py-2 text-xs font-medium transition-colors hover:bg-ink-2/10 press-sm"
              title="切换主题"
            >
              {theme === 'system' && <Monitor size={16} />}
              {theme === 'light' && <Sun size={16} />}
              {theme === 'dark' && <Moon size={16} />}
              <span className="font-mono">
                {theme === 'system' ? 'SYS' : theme === 'light' ? 'LIGHT' : 'DARK'}
              </span>
            </button>
            <button
              onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
              className="rounded-md border border-ink-2/20 px-3 py-2 text-xs font-medium transition-colors hover:bg-ink-2/10 press-sm"
              title="切换语言"
            >
              {lang === 'zh' ? 'EN' : '中'}
            </button>
          </div>
        </div>
      </header>

      <div className="border-t border-line" />

      <section className="mx-auto w-full max-w-5xl px-5 pt-16 md:px-8">
        <p className="text-accent font-mono text-xs uppercase tracking-[0.3em]">UI Kit</p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight text-paper md:text-5xl">
          {pick({ zh: '组件测试页', en: 'Component Test Page' })}
        </h1>
        <p className="mt-3 max-w-2xl leading-relaxed text-dim">
          {pick({
            zh: '这里汇总了站点所有基础控件、自定义卡片，以及标准 / 自定义 Markdown 解析的演示。',
            en: 'A showcase of every basic control, custom card, and standard / custom markdown parsing.',
          })}
        </p>
      </section>

      {/* ===== 调色板 ===== */}
      <Section
        id="00"
        title={pick({ zh: '调色板', en: 'Palettes' })}
        desc={pick({
          zh: '点击切换全站配色方案；经典方案保留原有视觉。',
          en: 'Click to switch the site color palette; the classic scheme preserves the original look.',
        })}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {availablePalettes.map((id) => (
            <button
              key={id}
              onClick={() => setPalette(id)}
              className={`flex items-center gap-3 rounded-xl border p-4 text-left transition-all duration-200 ease-[var(--ease-out)] press-sm ${
                palette === id
                  ? 'border-accent bg-accent/10'
                  : 'border-ink-2/20 bg-ink-2/[0.06] hover:border-ink-2/40 hover:bg-ink-2/10'
              }`}
            >
              <PaletteSwatch id={id} />
              <span className="text-sm font-medium text-paper">{pick(SITE_CONFIG.colors[id].label)}</span>
              {palette === id && <Check className="ml-auto size-4 text-accent" />}
            </button>
          ))}
        </div>
      </Section>

      {/* ===== 基础控件 ===== */}
      <Section
        id="01"
        title={pick({ zh: '基础控件', en: 'Basic Controls' })}
        desc={pick({
          zh: '按钮、输入框、滑块、开关、单选/多选、下拉与状态指示。',
          en: 'Buttons, inputs, sliders, switches, radio/checkbox, select and status indicators.',
        })}
      >
        <div className="grid gap-5 md:grid-cols-2">
          <Panel>
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-dim">Buttons</p>
            <div className="flex flex-wrap gap-3">
              <button className="rounded-md bg-gradient-accent px-4 py-2 text-sm font-semibold text-ink shadow-lg shadow-accent/10 transition-all duration-200 ease-[var(--ease-out)] hover:brightness-105 active:scale-95">
                Primary
              </button>
              <button className="rounded-md border border-ink-2/30 px-4 py-2 text-sm text-paper transition-colors hover:border-ink-2/50 hover:bg-ink-2/10 press-sm">
                Ghost
              </button>
              <button className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-400 transition-colors hover:bg-red-500/20 press-sm">
                Danger
              </button>
              <button
                onClick={() => setPlaying((v) => !v)}
                className="flex items-center gap-2 rounded-md border border-ink-2/30 px-4 py-2 text-sm text-paper transition-colors hover:bg-ink-2/10 press-sm"
              >
                {playing ? <Pause size={15} /> : <Play size={15} />} {playing ? 'Pause' : 'Play'}
              </button>
            </div>
          </Panel>

          <Panel>
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-dim">Inputs</p>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="w-full rounded-md border border-ink-2/20 bg-ink-2/10 px-3 py-2 text-sm text-paper outline-none transition-colors placeholder:text-dim focus:border-accent focus-ring"
              placeholder="Type something..."
            />
            <textarea
              rows={2}
              className="mt-3 w-full resize-none rounded-md border border-ink-2/20 bg-ink-2/10 px-3 py-2 text-sm text-paper outline-none transition-colors placeholder:text-dim focus:border-accent focus-ring"
              placeholder="Multiline..."
            />
            <div className="mt-3 flex items-center gap-2">
              <Volume2 size={16} className="text-dim" />
              <input
                type="range"
                min={0}
                max={100}
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                className="w-full"
              />
              <span className="w-9 text-right font-mono text-xs text-dim">{volume}</span>
            </div>
          </Panel>

          <Panel>
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-dim">Toggles & Radios</p>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => setChecked(e.target.checked)}
                className="accent-accent"
              />
              启用通知
            </label>
            <div className="mt-3 flex gap-4 text-sm">
              {['a', 'b', 'c'].map((v) => (
                <label key={v} className="flex cursor-pointer items-center gap-1.5">
                  <input
                    type="radio"
                    name="demo-radio"
                    checked={radio === v}
                    onChange={() => setRadio(v)}
                    className="accent-accent"
                  />
                  选项 {v.toUpperCase()}
                </label>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between">
              <span className="text-sm">开关</span>
              <button
                onClick={() => setToggle((v) => !v)}
                className={`relative h-6 w-11 rounded-full transition-colors duration-200 ease-[var(--ease-out)] ${
                  toggle ? 'bg-gradient-accent' : 'bg-ink-2/30'
                }`}
              >
                <span
                  className={`absolute top-0.5 size-5 rounded-full bg-ink shadow-sm transition-transform duration-200 ease-[var(--ease-spring)] ${
                    toggle ? 'translate-x-[22px]' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>
            <select
              value={select}
              onChange={(e) => setSelect(e.target.value)}
              className="mt-4 w-full rounded-md border border-ink-2/20 bg-ink-2/10 px-3 py-2 text-sm text-paper outline-none transition-colors focus:border-accent focus-ring"
            >
              <option value="x">选项 X</option>
              <option value="y">选项 Y</option>
              <option value="z">选项 Z</option>
            </select>
          </Panel>

          <Panel>
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-dim">States & Badges</p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-accent/15 px-3 py-1 text-xs font-medium text-accent">
                #tag
              </span>
              <span className="rounded-full bg-ink-2/20 px-3 py-1 text-xs text-paper">demo</span>
              <span className="rounded-full bg-green-500/15 px-3 py-1 text-xs text-green-400">在线</span>
              <span className="rounded-full bg-amber-500/15 px-3 py-1 text-xs text-amber-400">维护中</span>
            </div>
            <div className="mt-4 flex items-center gap-4">
              <span className="flex items-center gap-1.5 text-sm">
                <span className="size-2 rounded-full bg-green-400" /> 状态点
              </span>
              <Loader2 size={16} className="animate-spin-slow text-accent" />
              <span className="font-mono text-xs text-dim">loading...</span>
            </div>
            <div className="mt-4">
              <button
                onClick={() => setCount((c) => c + 1)}
                className="rounded-md bg-ink-2/15 px-4 py-2 text-sm text-paper transition-colors hover:bg-ink-2/25 press-sm"
              >
                计数：{count}
              </button>
            </div>
          </Panel>
        </div>
      </Section>

      {/* ===== 自定义卡片 ===== */}
      <Section
        id="02"
        title={pick({ zh: '自定义卡片', en: 'Custom Cards' })}
        desc={pick({
          zh: 'PostCard、CommentTerminal，以及一个手写的音乐卡片与统计卡片。',
          en: 'PostCard, CommentTerminal, plus a hand-built music card and stat card.',
        })}
      >
        <div className="grid gap-5 md:grid-cols-2">
          <Panel className="!p-0 overflow-hidden">
            <PostCard post={samplePost} onSelect={() => {}} />
          </Panel>

          <div className="flex flex-col gap-5">
            <Panel className="!p-0 overflow-hidden">
              <div className="flex items-center gap-3 border-b border-ink-2/20 bg-ink-2/10 px-4 py-3">
                <CreditCard size={16} className="text-accent" />
                <span className="text-sm font-medium text-paper">Music Card (demo)</span>
              </div>
              <div className="flex items-center gap-4 p-4">
                <div className="size-14 shrink-0 rounded-lg bg-ink-2/20" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-paper">Track Title</p>
                  <p className="truncate text-xs text-dim">Artist · Album</p>
                </div>
                <button className="flex size-10 items-center justify-center rounded-full bg-gradient-accent text-ink shadow-lg transition-transform active:scale-95">
                  <Play size={16} />
                </button>
              </div>
            </Panel>

            <Panel>
              <p className="mb-2 text-sm font-semibold text-paper">Stat Card</p>
              <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-ink-2/20 bg-ink-2/[0.08] divide-x divide-ink-2/[0.15]">
                {[
                  ['69', 'Games'],
                  ['4019h', 'Played'],
                  ['Lv.18', 'Steam'],
                ].map(([v, l]) => (
                  <div key={l} className="bg-transparent px-2 py-3 text-center">
                    <div className="text-lg font-bold text-paper">{v}</div>
                    <div className="text-[10px] uppercase tracking-wider text-dim">{l}</div>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </div>

        <Panel className="mt-5 !p-0 overflow-hidden">
          <div className="flex items-center gap-3 border-b border-ink-2/20 bg-ink-2/10 px-4 py-3">
            <Terminal size={16} className="text-accent" />
            <span className="text-sm font-medium text-paper">CommentTerminal</span>
          </div>
          <CommentTerminal />
        </Panel>
      </Section>

      {/* ===== 标准 MD 解析 ===== */}
      <Section
        id="03"
        title={pick({ zh: '标准 MD 解析', en: 'Standard Markdown' })}
        desc={pick({
          zh: '使用 react-markdown + remark-gfm 渲染常见 GFM 元素。',
          en: 'Render common GFM elements via react-markdown + remark-gfm.',
        })}
      >
        <Panel className="!p-0 overflow-hidden">
          <article className="prose-test max-w-none p-5">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({ children }) => (
                  <h1 className="mb-3 mt-2 text-2xl font-bold text-paper">{children}</h1>
                ),
                h2: ({ children }) => (
                  <h2 className="mb-2 mt-5 text-xl font-semibold text-paper">{children}</h2>
                ),
                h3: ({ children }) => (
                  <h3 className="mb-2 mt-4 text-lg font-semibold text-paper">{children}</h3>
                ),
                p: ({ children }) => <p className="my-2 leading-relaxed text-paper/80">{children}</p>,
                a: ({ href, children }) => (
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="text-accent underline underline-offset-2 transition-colors hover:text-paper"
                  >
                    {children}
                  </a>
                ),
                ul: ({ children }) => (
                  <ul className="my-2 list-disc space-y-1 pl-5 text-paper/80">{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol className="my-2 list-decimal space-y-1 pl-5 text-paper/80">{children}</ol>
                ),
                blockquote: ({ children }) => (
                  <blockquote className="my-3 border-l-2 border-accent/40 pl-3 italic text-paper/60">
                    {children}
                  </blockquote>
                ),
                code: ({ className, children }) => {
                  const inline = !className
                  if (inline)
                    return (
                      <code className="rounded-md bg-ink-2/20 px-1.5 py-0.5 font-mono text-[0.85em] text-accent">
                        {children}
                      </code>
                    )
                  return (
                    <pre className="my-3 overflow-x-auto rounded-xl border border-ink-2/20 bg-ink-2/15 p-3">
                      <code className="font-mono text-sm text-paper/85">{children}</code>
                    </pre>
                  )
                },
                table: ({ children }) => (
                  <div className="my-3 overflow-x-auto">
                    <table className="w-full border-collapse text-sm">{children}</table>
                  </div>
                ),
                th: ({ children }) => (
                  <th className="border border-ink-2/20 px-3 py-1.5 text-left font-semibold">
                    {children}
                  </th>
                ),
                td: ({ children }) => (
                  <td className="border border-ink-2/20 px-3 py-1.5">{children}</td>
                ),
              }}
            >
              {gfmSample}
            </ReactMarkdown>
          </article>
        </Panel>
      </Section>

      {/* ===== 自定义 MD 解析 ===== */}
      <Section
        id="04"
        title={pick({ zh: '自定义 MD 解析', en: 'Custom Markdown' })}
        desc={pick({
          zh: '自定义 block 解析管线：^track^ 标记、标题、围栏代码，并带行内样式。',
          en: 'Custom block parser: ^track^ markers, headings, fenced code, with inline styling.',
        })}
      >
        <Panel className="!p-0 overflow-hidden">
          <div className="flex items-center gap-3 border-b border-ink-2/20 bg-ink-2/10 px-4 py-3">
            <Code2 size={16} className="text-accent" />
            <span className="text-sm font-medium text-paper">parseBlocks() pipeline</span>
          </div>
          <div className="space-y-4 p-5">
            {blocks.map((b, i) => {
              if (b.kind === 'track')
                return (
                  <div
                    key={i}
                    className="flex items-center gap-2 rounded-xl border border-accent/30 bg-accent/15 px-3 py-2 text-sm font-medium text-accent"
                  >
                    <Play size={14} /> track: {b.id}
                  </div>
                )
              if (b.kind === 'heading') {
                const cls =
                  b.level === 1
                    ? 'text-2xl font-bold'
                    : b.level === 2
                      ? 'text-xl font-semibold'
                      : 'text-lg font-semibold'
                return (
                  <h3 key={i} className={`text-paper ${cls}`}>
                    {renderInline(b.text, `h${i}`)}
                  </h3>
                )
              }
              if (b.kind === 'code')
                return (
                  <pre
                    key={i}
                    className="overflow-x-auto rounded-xl border border-ink-2/20 bg-ink-2/15 p-3"
                  >
                    <code className="font-mono text-sm text-paper/85">{b.code}</code>
                  </pre>
                )
              return (
                <p key={i} className="leading-relaxed text-paper/80">
                  {renderInline(b.text, `p${i}`)}
                </p>
              )
            })}
          </div>
          <pre className="m-5 mt-0 overflow-x-auto rounded-xl border border-ink-2/20 bg-ink-2/15 p-3">
            <code className="font-mono text-xs text-dim">{customMdSample}</code>
          </pre>
        </Panel>
      </Section>

      {/* ===== 字体对比 ===== */}
      <Section
        id="05"
        title={pick({ zh: '字体对比', en: 'Font Playground' })}
        desc={pick({
          zh: '对比不同字体栈，实时调节字号与字重，预览中英文混排效果。',
          en: 'Compare font stacks with live size / weight controls and mixed CJK + Latin preview.',
        })}
      >
        <div className="grid gap-5 lg:grid-cols-[20rem_1fr]">
          {/* controls */}
          <Panel className="space-y-5">
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-dim">字体栈</p>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ['sf', 'SF Pro', "'SF Pro', 'PingFang UI', sans-serif"],
                    ['pingfang', 'PingFang', "'PingFang UI', 'PingFang SC', sans-serif"],
                    ['system', 'System', 'system-ui, sans-serif'],
                    ['mono', 'Monospace', "ui-monospace, 'JetBrains Mono', monospace"],
                  ] as const
                ).map(([key, label, _stack]) => (
                  <button
                    key={key}
                    onClick={() => setFontStack(key)}
                    className={`rounded-md border px-3 py-2 text-sm transition-all duration-200 ease-[var(--ease-out)] press-sm ${
                      fontStack === key
                        ? 'border-accent bg-accent/10 text-paper'
                        : 'border-ink-2/20 text-dim hover:bg-ink-2/10'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between text-xs font-medium uppercase tracking-wider text-dim">
                <span>字号</span>
                <span className="font-mono text-paper/80">{fontSize}px</span>
              </div>
              <input
                type="range"
                min={12}
                max={64}
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                className="w-full"
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between text-xs font-medium uppercase tracking-wider text-dim">
                <span>字重</span>
                <span className="font-mono text-paper/80">{fontWeight}</span>
              </div>
              <input
                type="range"
                min={100}
                max={900}
                step={100}
                value={fontWeight}
                onChange={(e) => setFontWeight(Number(e.target.value))}
                className="w-full"
              />
            </div>

            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-dim">预览文字</p>
              <textarea
                rows={2}
                value={sampleText}
                onChange={(e) => setSampleText(e.target.value)}
                className="w-full resize-none rounded-md border border-ink-2/20 bg-ink-2/10 px-3 py-2 text-sm text-paper outline-none transition-colors placeholder:text-dim focus:border-accent focus-ring"
              />
            </div>
          </Panel>

          {/* preview */}
          <Panel className="flex flex-col">
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-dim">预览</p>
            <div
              className="flex-1 leading-relaxed text-paper"
              style={{
                fontFamily:
                  fontStack === 'sf'
                    ? "'SF Pro', 'PingFang UI', sans-serif"
                    : fontStack === 'pingfang'
                      ? "'PingFang UI', 'PingFang SC', sans-serif"
                      : fontStack === 'mono'
                        ? "ui-monospace, 'JetBrains Mono', monospace"
                        : 'system-ui, sans-serif',
                fontSize: `${fontSize}px`,
                fontWeight,
              }}
            >
              {sampleText || ' '}
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3 border-t border-ink-2/20 pt-3 font-mono text-xs text-dim">
              <div>
                <span className="text-accent">Aa</span> 字母
              </div>
              <div>你苹方中文字重</div>
              <div>0123456780</div>
            </div>
          </Panel>
        </div>
      </Section>

      {/* ===== 性能监测 ===== */}
      <Section
        id="06"
        title={pick({ zh: '性能监测', en: 'Performance' })}
        desc={pick({
          zh: '实时帧率与帧耗时、JS 堆内存、Core Web Vitals、加载阶段瀑布图、资源统计，以及可控的渲染 / 主线程压力测试。',
          en: 'Live fps & frame time, JS heap, Core Web Vitals, load-phase waterfall, resource stats, and a controllable render / main-thread stress test.',
        })}
      >
        <PerfMonitor />
      </Section>

      <footer className="mt-10 text-center font-mono text-xs text-dim">
        test page · {pick({ zh: '调色板 / 基础控件 / 自定义卡片 / MD 解析 / 自定义 MD 解析 / 字体对比 / 性能监测', en: 'palettes / controls / cards / md / custom md / fonts / perf' })}
      </footer>
    </div>
  )
}
