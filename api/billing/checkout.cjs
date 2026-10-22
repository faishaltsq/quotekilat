// Vercel function entry; logic lives in the compiled CommonJS build.
const { nodeEntry } = require('../../vercel-api/server/_lib/nodeEntry.js')
const mod = require('../../vercel-api/server/billing/checkout.js')

module.exports = nodeEntry(mod.default || mod)
