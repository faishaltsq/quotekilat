const { nodeEntry } = require('../../vercel-api/server/_lib/nodeEntry.js')
const mod = require('../../vercel-api/server/billing/webhook.js')

module.exports = nodeEntry(mod.default || mod)
