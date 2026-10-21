/**
 * Adapts a Web-API `(Request) => Response` handler to the Node `(req, res)`
 * signature Vercel uses for a CommonJS export. Kept in one place because the
 * alternative is four copies drifting apart, and the failure mode (a dropped
 * Response surfacing as FUNCTION_INVOCATION_TIMEOUT) is invisible locally.
 */
export type WebHandler = (request: Request) => Promise<Response>

type NodeRequest = {
  method?: string
  url?: string
  headers: Record<string, string | string[] | undefined>
  body?: unknown
  [Symbol.asyncIterator]?: () => AsyncIterator<unknown>
}

type NodeResponse = {
  statusCode: number
  setHeader: (key: string, value: string) => void
  end: (body?: Uint8Array) => void
}

export function nodeEntry(handler: WebHandler) {
  return async function entry(req: NodeRequest, res: NodeResponse): Promise<void> {
    const chunks: Buffer[] = []
    if (req.body !== undefined && req.body !== null) {
      const raw = req.body
      chunks.push(Buffer.isBuffer(raw) ? raw : Buffer.from(typeof raw === 'string' ? raw : JSON.stringify(raw)))
    } else if (req.method !== 'GET' && req.method !== 'HEAD' && typeof req[Symbol.asyncIterator] === 'function') {
      for await (const chunk of req as AsyncIterable<Buffer>) chunks.push(Buffer.from(chunk))
    }

    const host = req.headers.host ?? 'quotekilat.vercel.app'
    const headers = Object.entries(req.headers).flatMap(([key, value]) =>
      value === undefined ? [] : [[key, Array.isArray(value) ? value.join(',') : String(value)] as [string, string]],
    )

    const request = new Request(`https://${host}${req.url ?? '/'}`, {
      method: req.method ?? 'GET',
      headers,
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks),
    })

    const response = await handler(request)
    res.statusCode = response.status
    response.headers.forEach((value, key) => res.setHeader(key, value))
    res.end(Buffer.from(await response.arrayBuffer()))
  }
}
