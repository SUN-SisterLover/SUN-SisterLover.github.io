import type { IncomingMessage, ServerResponse } from 'node:http'

export declare function steamApi(options?: { basePath?: string }): (
  req: IncomingMessage,
  res: ServerResponse,
  next: (err?: unknown) => void,
) => void | Promise<void>

export declare function statsApi(options?: {
  basePath?: string
  file?: string | null
  flushDelayMs?: number
  persistOnExit?: boolean
}): (
  req: IncomingMessage,
  res: ServerResponse,
  next: (err?: unknown) => void,
) => void | Promise<void>
