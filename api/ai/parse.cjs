// Vercel function entry. The logic lives in server/ai/parse.ts, compiled to
// CommonJS by scripts/build-api.mjs; this file only adapts Node in/out to it.
const { nodeEntry } = require('../../vercel-api/server/_lib/nodeEntry.js')
const mod = require('../../vercel-api/server/ai/parse.js')

module.exports = nodeEntry(mod.default || mod)

