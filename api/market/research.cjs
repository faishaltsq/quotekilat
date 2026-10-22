const { nodeEntry } = require('../../vercel-api/server/_lib/nodeEntry.js')
const mod = require('../../vercel-api/server/market/research.js')

module.exports = nodeEntry(mod.default || mod)
