/**
 * Prefix a public asset path with Vite's dynamic base URL.
 *
 * `import.meta.env.BASE_URL` is injected by Vite from the resolved `base`
 * (e.g. "/" locally, "/mikudayo-kirakiradokidoki/" on GitHub Pages project
 * sites). Asset paths stored as plain strings in config / post data are NOT
 * rewritten by Vite's `base`, so we prepend it at the point of use.
 *
 * Absolute URLs and data URIs are returned unchanged.
 */
export function withBase(url: string): string {
  if (!url) return url
  if (/^(https?:)?\/\//.test(url) || url.startsWith('data:')) return url
  const base = import.meta.env.BASE_URL
  return base + url.replace(/^\//, '')
}
