import { anilistApi } from '../../server/api.mjs'

const middleware = anilistApi()

export default function handler(req, res) {
  return middleware(req, res, () => {
    res.statusCode = 404
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ ok: false, code: 'not_found' }))
  })
}
