import { rmSync } from 'node:fs'
import path from 'node:path'

for (const directory of process.argv.slice(2)) {
    rmSync(path.resolve(directory), { recursive: true, force: true })
}
