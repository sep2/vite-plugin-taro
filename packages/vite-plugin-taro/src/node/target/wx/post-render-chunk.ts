import { transformSync } from '@babel/core'
// @ts-expect-error Babel's CommonJS plugin package does not publish TypeScript declarations.
import transformDynamicImportModule from '@babel/plugin-transform-dynamic-import'
// @ts-expect-error Babel's CommonJS plugin package does not publish TypeScript declarations.
import transformModulesSystemjsModule from '@babel/plugin-transform-modules-systemjs'
import type { Rolldown } from 'vite'
import { systemRegisterCapsulePlugin } from './post-render-chunk/system-register.ts'
import { normalizeVitePreloadPlugin } from './post-render-chunk/vite-preload.ts'

/** Normalizes and converts one final Rolldown ESM chunk into an inert native System registration capsule. */
export function transformWxSystemRegisterChunk(
    code: string,
    chunk: Rolldown.RenderedChunk
): { code: string; map: Rolldown.SourceMapInput } {
    const capsule = transformSync(code, {
        babelrc: false,
        compact: false,
        configFile: false,
        filename: chunk.fileName,
        plugins: [
            normalizeVitePreloadPlugin,
            transformDynamicImportModule.default,
            transformModulesSystemjsModule.default,
            systemRegisterCapsulePlugin
        ],
        sourceFileName: chunk.fileName,
        sourceMaps: true,
        sourceType: 'module'
    })

    if (!capsule?.code || !capsule.map) {
        throw new Error(`Failed to generate the capsule for ${chunk.fileName}`)
    }

    return { code: capsule.code, map: capsule.map }
}
