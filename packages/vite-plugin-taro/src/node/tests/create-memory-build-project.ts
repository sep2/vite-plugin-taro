import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { normalizePath, type Plugin } from 'vite'
import { createMemoryFilesystem } from './create-memory-filesystem.ts'

const dependencyImporter = path.resolve(import.meta.dirname, '../../../package.json')
const extensions = ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json']

/** Feeds VFS sources to the real bundler while resolving installed dependencies from the plugin workspace. */
export function createMemoryBuildProject(files: Readonly<Record<string, string | Uint8Array>>) {
    const fixture = createMemoryFilesystem()
    const { root } = fixture
    const sourcePaths = new Set(Object.keys(files).map((file) => normalizePath(path.join(root, file))))
    for (const [file, source] of Object.entries(files)) {
        const filename = path.join(root, file)
        mkdirSync(path.dirname(filename), { recursive: true })
        writeFileSync(filename, typeof source === 'string' ? source : Buffer.from(source))
    }
    const prefix = `${normalizePath(root)}/`
    const plugin: Plugin = {
        name: 'test:memory-build-sources',
        enforce: 'pre',
        async resolveId(id, importer) {
            const resolved = normalizePath(
                importer && id.startsWith('.') ? path.resolve(path.dirname(importer), id) : id
            )
            const queryStart = resolved.indexOf('?')
            const filename = queryStart < 0 ? resolved : resolved.slice(0, queryStart)
            const candidates = [
                filename,
                ...extensions.map((extension) => `${filename}${extension}`),
                ...extensions.map((extension) => `${filename}/index${extension}`)
            ]
            const source = candidates.find((candidate) => sourcePaths.has(candidate))
            if (source) {
                return source + resolved.slice(filename.length)
            }
            if (importer && normalizePath(importer).startsWith(prefix) && !id.startsWith('.') && !path.isAbsolute(id)) {
                return this.resolve(id, dependencyImporter, { skipSelf: true })
            }
        },
        load: {
            order: 'post',
            handler(id) {
                if (sourcePaths.has(normalizePath(id))) {
                    return readFileSync(id, 'utf8')
                }
            }
        }
    }
    return { ...fixture, plugin }
}
