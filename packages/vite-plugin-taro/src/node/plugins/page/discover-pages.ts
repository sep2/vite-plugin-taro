import type { Dirent } from 'node:fs'
import { glob, readFile } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { normalizePath, parseSync } from 'vite'
import { apiModuleId } from '../api/api-module-id.ts'

const readConcurrency = 16

/** Streams candidate reads with bounded concurrency and returns lexically ordered routes relative to src. */
export async function discoverPages(root: string): Promise<string[]> {
    const directory = path.resolve(root, 'src')
    const entries = glob('**/*.tsx', {
        cwd: directory,
        withFileTypes: true,
        exclude: (entry) => entry.name === 'node_modules'
    })

    // The collected route list is local to this scan and sorted for deterministic output.
    const routes: string[] = await Readable.from(entries)
        .filter((entry: Dirent) => entry.isFile())
        .map((entry: Dirent) => path.join(entry.parentPath, entry.name))
        .filter(async (filename: string) => importsPageApi(filename, await readFile(filename, 'utf8')), {
            concurrency: readConcurrency
        })
        .map((filename: string) => normalizePath(path.relative(directory, filename)).slice(0, -'.tsx'.length))
        .toArray()

    return routes.sort()
}

/** Text filtering avoids parsing unrelated files; import metadata identifies direct runtime bindings. */
function importsPageApi(filename: string, source: string): boolean {
    if (!source.includes(apiModuleId)) {
        return false
    }

    const parsed = parseSync(filename, source)
    if (parsed.errors.length > 0) {
        return false
    }

    return parsed.module.staticImports.some(
        (declaration) =>
            declaration.moduleRequest.value === apiModuleId && declaration.entries.some((entry) => !entry.isType)
    )
}
