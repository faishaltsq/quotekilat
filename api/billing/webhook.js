// Vercel function entry. The platform builds /var/task/package.json from the
// app root, which declares "type": "module", so this file is executed as an
// ES module — a CommonJS body here dies with "require is not defined". The
// compiled build under vercel-api/ is CommonJS and interoperates cleanly.
import { nodeEntry } from '../../vercel-api/server/_lib/nodeEntry.js'
import handler from '../../vercel-api/server/billing/qrisWebhook.js'

export default nodeEntry(handler.default || handler)
