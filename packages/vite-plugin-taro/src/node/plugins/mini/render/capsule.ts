import type { Rolldown } from 'vite'
import type { AstTransformResult } from '../../../utils/transform.ts'
import { resolveLogicalChunkReference } from '../module/chunk-path.ts'
import { type SystemJsReferenceKind, transformSystemJs } from './system-js/system-js.ts'

/**
 * Converts one final Rolldown ESM chunk into the inert registration consumed by the Mini Program module runtime.
 *
 * Why this boundary exists:
 *
 * - Rolldown produces an ESM chunk graph, but a Mini Program loads emitted JavaScript through native `require` and
 *   `require.async`; it does not provide the browser ESM loader that normally links Vite chunks.
 * - Native App, Page, and Component shells must start through the host's synchronous lifecycle APIs, while their application
 *   graph still needs ESM linking semantics such as cycles, live exports, dynamic imports, `import.meta`, and top-level await.
 * - The plugin therefore keeps native lifecycle shells as CommonJS and executes application "capsules" through the bundled
 *   SystemJS runtime. Native shells enter that graph through the platform-global `System.importSync`, and asynchronous boundaries use
 *   the same runtime through `System.import`.
 *
 * What this renderer emits:
 *
 * The result is CommonJS source whose `module.exports` is a SystemJS registration tuple:
 * `[logicalDependencyIds, declaration]`. Requiring a capsule only returns this inert tuple; it does not execute application
 * code or call a global `System.register`. The generated transport can consequently load the physical file from either the
 * main package or a subpackage, then hand its registration to the loader. The loader owns linking, setter invocation,
 * execution order, cycle handling, and export publication.
 *
 * Why references are rewritten:
 *
 * Rolldown imports name physical output files whose relative paths include placement directories and content hashes. The
 * SystemJS registry instead uses package-neutral logical chunk IDs. Canonicalizing both static and literal dynamic references
 * here lets transport independently map a stable module identity to the physical `require` path selected by Mini Program placement.
 * Runtime-computed dynamic IDs cannot be canonicalized and are intentionally preserved.
 *
 * This function runs on final Rolldown output rather than arbitrary source modules. `transformSystemJs` accepts only the
 * normalized final-chunk grammar required by this pipeline and fails the build on unsupported forms instead of risking a
 * partial or semantically incorrect capsule. Source maps remain optional because Mini Program development output deliberately disables
 * them on this startup-critical path.
 */
export function renderCapsule(code: string, chunk: Rolldown.RenderedChunk, sourcemap: boolean): AstTransformResult {
    return transformSystemJs({
        code,
        filename: chunk.fileName,
        // Native require must return registration data without executing or globally registering the capsule.
        format: 'commonjs-registration',
        sourcemap,
        // Bind every compile-time chunk edge to the same logical identity understood by transport and SystemJS.
        resolveReference(reference, kind) {
            return resolveCapsuleReference(chunk.fileName, reference, kind)
        }
    })
}

/** Canonicalizes physical chunk paths while preserving runtime-computed and package-like dynamic IDs. */
function resolveCapsuleReference(fileName: string, reference: string, kind: SystemJsReferenceKind): string {
    if (kind === 'dynamic' && !reference.startsWith('./') && !reference.startsWith('../')) return reference
    return resolveLogicalChunkReference(fileName, reference)
}
