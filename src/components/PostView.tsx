import { useRef, useEffect, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeRaw from 'rehype-raw'
import { codeToHtml } from 'shiki'
import { gsap, useGSAP, SplitText, prefersReducedMotion } from '../lib/gsap'
import { useLang } from '../i18n'
import { type PostDef } from '../data/posts'
import { ArrowLeft } from 'lucide-react'
import PostComments from './PostComments'

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const SHIKI_LIGHT = 'vitesse-light'
const SHIKI_DARK = 'vitesse-dark'

/** code block rendered with the CommentTerminal frosted-panel look.
 *  Uses shiki for syntax highlighting (dual light/dark themes that follow
 *  the site's `[data-theme]`). A fenced block with language `terminal`
 *  becomes the custom terminal block (no highlighting). */
function CodeBlock({ lang, content }: { lang: string; content: string }) {
  const label = lang ? lang : 'code'
  const isTerminal = lang.toLowerCase() === 'terminal'
  const [html, setHtml] = useState<string>('')

  useEffect(() => {
    let cancelled = false
    if (isTerminal) {
      setHtml(`<pre class="shiki"><code>${escapeHtml(content)}</code></pre>`)
      return
    }
    codeToHtml(content, {
      lang: lang || 'text',
      themes: { light: SHIKI_LIGHT, dark: SHIKI_DARK },
    })
      .then((out) => !cancelled && setHtml(out))
      .catch(
        () =>
          !cancelled &&
          setHtml(`<pre class="shiki"><code>${escapeHtml(content)}</code></pre>`),
      )
    return () => {
      cancelled = true
    }
  }, [lang, content, isTerminal])

  return (
    <div className="not-prose my-5 overflow-hidden rounded-xl border border-line bg-ink/80 backdrop-blur-sm">
      <div className="border-line flex items-center gap-2 border-b px-4 py-2 font-mono text-[10px] tracking-[0.25em] uppercase text-dim">
        <span className="bg-accent inline-block size-2 rounded-full" />
        {label}
      </div>
      {html ? (
        <div dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <pre className="overflow-x-auto p-4 text-xs leading-relaxed">
          <code className="font-mono text-paper/90">{content}</code>
        </pre>
      )}
    </div>
  )
}

const TRACK_MARKER = /^\s*\^(.+?)\^\s*$/

type HeadingLevel = 1 | 2 | 3
type Heading = { id: string; level: HeadingLevel; text: string }

/** detect a heading line: `#`/`##`/`###` markdown, or legacy `**bold**` line (= h2) */
function parseHeading(line: string): { level: HeadingLevel; text: string } | null {
  const md = line.match(/^(#{1,3})\s+(.+)$/)
  if (md) return { level: md[1].length as HeadingLevel, text: md[2].trim() }
  if (line.startsWith('**') && line.endsWith('**') && line.length > 4) {
    return { level: 2, text: line.replace(/\*\*/g, '').trim() }
  }
  return null
}

const HEADING_CLASS: Record<HeadingLevel, string> = {
  1: 'text-accent mt-10 mb-5 text-xl font-bold tracking-tight md:text-2xl',
  2: 'text-accent mt-8 mb-4 text-lg font-bold tracking-tight md:text-xl',
  3: 'text-accent mt-6 mb-3 text-base font-bold tracking-tight md:text-lg',
}

/** a parsed block of post body, classified by the custom block parser */
type Block =
  | { kind: 'track'; id: string; key: number }
  | { kind: 'heading'; level: HeadingLevel; text: string; key: number }
  | { kind: 'code'; lang: string; content: string; key: number }
  | { kind: 'paragraph'; lines: string[]; key: number }

/** convert Obsidian-style ==highlight== into <mark>, ignoring spaced `a == b` comparisons */
function withHighlight(md: string) {
  return md.replace(/(?<![\s=])==(?!\s)([^\n=]+?)(?<!\s)==(?![\s=])/g, '<mark>$1</mark>')
}

/** left-side table of contents with scrollspy */
function Toc({ headings, label }: { headings: Heading[]; label: string }) {
  const [activeId, setActiveId] = useState('')

  useEffect(() => {
    const onScroll = () => {
      if (headings.length === 0) return
      // reached the very bottom -> last section is being read
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
        setActiveId(headings[headings.length - 1].id)
        return
      }
      // otherwise: the last heading above the reading line (130px from top);
      // before the first heading, default to the first section
      let cur = headings[0].id
      for (const h of headings) {
        const el = document.getElementById(h.id)
        if (el && el.getBoundingClientRect().top <= 130) cur = h.id
      }
      setActiveId(cur)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [headings])

  if (headings.length === 0) return null

  return (
    <nav
      data-post-meta
      aria-label={label}
      className="fixed top-44 left-[max(0.75rem,calc(50%-39rem))] hidden w-56 xl:block"
    >
      <div className="text-dim mb-3 flex items-center gap-2 font-mono text-[16px] tracking-[0.2em] uppercase">
        <span className="bg-accent inline-block size-2" />
        {label}
      </div>
      <ul className="border-line border-l">
        {headings.map((h) => (
          <li key={h.id}>
            <button
              onClick={() =>
                document.getElementById(h.id)?.scrollIntoView({ behavior: 'smooth' })
              }
              aria-current={activeId === h.id ? 'true' : undefined}
              className={`-ml-px block w-full truncate border-l-2 py-1 pr-2 text-left font-mono text-[17px] transition-colors ${
                activeId === h.id
                  ? 'border-accent text-accent bg-accent/10 font-bold'
                  : 'text-dim hover:text-paper border-transparent'
              }`}
              style={{ paddingLeft: `${10 + (h.level - 1) * 12}px` }}
            >
              {h.text}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export default function PostView({ post, onBack }: { post: PostDef; onBack: () => void }) {
  const { t } = useLang()
  const scope = useRef<HTMLElement>(null)

  // posts are Chinese-only by design — the language toggle affects UI chrome
  // (nav, buttons, labels) but never article content
  const bodyLines = useMemo(() => post.body.zh.split('\n'), [post])

  /** custom block parser: keep track markers, headings (-> TOC) and fenced
   *  code blocks as first-class blocks; everything else becomes a paragraph
   *  block rendered by react-markdown. */
  const blocks = useMemo<Block[]>(() => {
    const out: Block[] = []
    const lines = bodyLines
    let i = 0
    let key = 0
    while (i < lines.length) {
      const line = lines[i]
      const marker = line.match(TRACK_MARKER)
      if (marker) {
        out.push({ kind: 'track', id: marker[1].trim(), key: key++ })
        i++
        continue
      }
      const heading = parseHeading(line)
      if (heading) {
        out.push({ kind: 'heading', level: heading.level, text: heading.text, key: key++ })
        i++
        continue
      }
      if (line.startsWith('```')) {
        const lang = line.slice(3).trim()
        const contentLines: string[] = []
        let j = i + 1
        while (j < lines.length && !lines[j].startsWith('```')) {
          contentLines.push(lines[j])
          j++
        }
        out.push({ kind: 'code', lang, content: contentLines.join('\n'), key: key++ })
        i = j + 1
        continue
      }
      if (line.trim() === '') {
        i++
        continue
      }
      const para: string[] = []
      while (
        i < lines.length &&
        !lines[i].match(TRACK_MARKER) &&
        !parseHeading(lines[i]) &&
        !lines[i].startsWith('```') &&
        lines[i].trim() !== ''
      ) {
        para.push(lines[i])
        i++
      }
      out.push({ kind: 'paragraph', lines: para, key: key++ })
    }
    return out
  }, [bodyLines])

  const headings = useMemo(
    () =>
      blocks
        .filter((b): b is Extract<Block, { kind: 'heading' }> => b.kind === 'heading')
        .map((b) => ({ level: b.level, text: b.text, id: `h-${b.key}` })),
    [blocks],
  )

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [post.id])

  useGSAP(
    () => {
      if (prefersReducedMotion()) return
      const split = SplitText.create('[data-post-title]', { type: 'chars', mask: 'chars' })
      gsap
        .timeline()
        .from(split.chars, { yPercent: 120, duration: 0.9, ease: 'power4.out', stagger: 0.03 })
        .from('[data-post-meta]', { y: 16, autoAlpha: 0, duration: 0.5, ease: 'power3.out' }, '-=0.4')
        .from('[data-post-body]', { y: 20, autoAlpha: 0, duration: 0.6, ease: 'power3.out' }, '-=0.2')
      return () => split.revert()
    },
    { scope, dependencies: [post.id] },
  )

  return (
    <section ref={scope} className="relative overflow-hidden">
      <Toc headings={headings} label={t('post.toc')} />
      <div className="mx-auto w-full max-w-3xl px-4 pt-28 pb-16 md:pt-44 md:pb-28">
        <button
          data-post-meta
          onClick={onBack}
          className="text-dim hover:text-accent mb-8 flex items-center gap-2 font-mono text-s tracking-[0.2em] transition-colors"
        >
          <ArrowLeft className="size-3.5" />
          {t('post.back')}
        </button>

        <div data-post-meta className="flex flex-wrap gap-2 mb-5">
          {post.tags.map((tag) => (
            <span
              key={tag}
              className="border-accent/30 text-accent inline-block border px-2 py-0.5 font-mono text-[10px] tracking-[0.15em]"
            >
              {tag}
            </span>
          ))}
        </div>

        <h1
          data-post-title
          className="text-3xl font-bold tracking-tight md:text-5xl leading-tight"
        >
          {post.title.zh}
        </h1>

        <p data-post-meta className="text-dim mt-4 font-mono text-xs tracking-[0.2em]">
          {t('post.published')} {post.date} · {post.readTime}
        </p>

        <div data-post-body className="mt-10">
          <div className="rounded-xl border border-line bg-ink/40 p-6 backdrop-blur-sm md:p-10">
            <div
              className="prose prose-invert max-w-none leading-relaxed text-sm md:text-base"
              style={{ color: 'var(--color-paper)' }}
            >
            {blocks.map((b) => {
              // in-post music cards were removed so article audio can never
              // interrupt or replace the home BGM — marker lines render nothing
              if (b.kind === 'track') {
                return null
              }
              if (b.kind === 'heading') {
                const Tag = `h${b.level}` as 'h1' | 'h2' | 'h3'
                return (
                  <Tag
                    key={b.key}
                    id={`h-${b.key}`}
                    className={`scroll-mt-24 ${HEADING_CLASS[b.level]}`}
                  >
                    {b.text}
                  </Tag>
                )
              }
              if (b.kind === 'code') {
                return <CodeBlock key={b.key} lang={b.lang} content={b.content} />
              }
              return (
                <ReactMarkdown
                  key={b.key}
                  remarkPlugins={[remarkGfm, remarkMath]}
                  rehypePlugins={[rehypeRaw, rehypeKatex]}
                  components={{
                    code({ node: _node, className, children, ...rest }) {
                      return (
                        <code
                          className={`rounded bg-ink px-1.5 py-0.5 font-mono text-[0.85em] text-accent ${className ?? ''}`}
                          {...rest}
                        >
                          {children}
                        </code>
                      )
                    },
                    a({ node: _node, children, ...rest }) {
                      return (
                        <a
                          className="text-accent underline underline-offset-2"
                          target="_blank"
                          rel="noreferrer"
                          {...rest}
                        >
                          {children}
                        </a>
                      )
                    },
                    mark({ node: _node, children, ...rest }) {
                      return (
                        <mark
                          className="rounded bg-accent/25 px-1 py-0.5 text-inherit"
                          {...rest}
                        >
                          {children}
                        </mark>
                      )
                    },
                  }}
                >
                  {withHighlight(b.lines.join('\n'))}
                </ReactMarkdown>
              )
            })}
          </div>
        </div>
      </div>

        <PostComments postId={post.id} />

        <button
          data-post-meta
          onClick={onBack}
          className="text-dim hover:text-accent border-line mt-12 flex items-center gap-2 border-t pt-6 font-mono text-xs tracking-[0.2em] transition-colors"
        >
          <ArrowLeft className="size-3.5" />
          {t('post.back')}
        </button>
      </div>
    </section>
  )
}
