const { nodeEntry } = require('../../vercel-api/server/_lib/nodeEntry.js')
const mod = require('../../vercel-api/server/billing/status.js')

module.exports = nodeEntry(mod.default || mod)
