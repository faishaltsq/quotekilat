// Compiles server/ to CommonJS for the Vercel function entry.
// The .cjs shim in api/ requires this output, so the emitted tree must stay
// CommonJS even though the project root declares "type": "module".
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

execFileSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.api.json'], {
  cwd: root,
  stdio: 'inherit',
})

const out = join(root, 'vercel-api')
mkdirSync(out, { recursive: true })
writeFileSync(join(out, 'package.json'), JSON.stringify({ type: 'commonjs' }, null, 2) + '\n')
