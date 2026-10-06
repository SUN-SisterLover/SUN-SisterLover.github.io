import type { Bilingual } from '../../i18n'

export type PostDef = {
  id: string
  index: string
  title: Bilingual
  excerpt: Bilingual
  body: Bilingual
  tags: string[]
  date: string
  readTime: string
  hidden?: boolean
  /** tracks referenced in the body via ^id^ markers */
  audio?: PostAudioTrack[]
}

export type PostAudioTrack = {
  id: string
  url: string
  title?: string
  artist?: string
  cover?: string
}
