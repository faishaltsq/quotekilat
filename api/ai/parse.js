// Vercel function entry.
//
// Two things force this shape:
//  1. CommonJS - the platform generates /var/task/package.json without a module
//     type, so an ESM entry dies on its first import.
//  2. Node (req, res) signature - with a CJS export the launcher cannot detect a
//     Web handler, calls it as Node middleware, and the returned Response is
//     dropped, which surfaces as FUNCTION_INVOCATION_TIMEOUT.
//
// The logic lives in server/ai/parse.ts, compiled to CommonJS by
// scripts/build-api.mjs; this file only adapts Node in/out to that handler.
const mod = require('../../vercel-api/server/ai/parse.js')

const handler = mod.default || mod

module.exports = async function entry(req, res) {
  const chunks = []
  if (req.body !== undefined && req.body !== null) {
    const raw = req.body
    chunks.push(Buffer.isBuffer(raw) ? raw : Buffer.from(typeof raw === 'string' ? raw : JSON.stringify(raw)))
  } else if (req.method !== 'GET' && req.method !== 'HEAD') {
    for await (const chunk of req) chunks.push(Buffer.from(chunk))
  }

  const host = req.headers.host || 'quotekilat.vercel.app'
  const headers = Object.entries(req.headers).flatMap(([key, value]) =>
    value === undefined ? [] : [[key, Array.isArray(value) ? value.join(',') : String(value)]],
  )

  const request = new Request(`https://${host}${req.url || '/api/ai/parse'}`, {
    method: req.method,
    headers,
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks),
  })

  const response = await handler(request)
  res.statusCode = response.status
  response.headers.forEach((value, key) => res.setHeader(key, value))
  res.end(Buffer.from(await response.arrayBuffer()))
}
