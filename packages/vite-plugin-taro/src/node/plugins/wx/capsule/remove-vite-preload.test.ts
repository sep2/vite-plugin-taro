import assert from 'node:assert/strict'
import test from 'node:test'
import { transformSync } from '@babel/core'
import type { Rolldown } from 'vite'
import { removeVitePreloadPlugin } from './remove-vite-preload.ts'
import { renderCapsule } from './render-capsule.ts'

/** Applies only the capsule preload rewrite under test. */
function removeVitePreload(code: string): string {
    const result = transformSync(code, {
        babelrc: false,
        configFile: false,
        plugins: [removeVitePreloadPlugin],
        sourceType: 'module'
    })
    if (!result?.code) {
        throw new Error('Failed to transform the preload fixture')
    }
    return result.code
}

test('unwraps Vite dynamic imports and removes only the preload import', () => {
    const result = removeVitePreload(`import { createNativeConfig, __vitePreload } from './bootstrap.js'
export const load = () => __vitePreload(() => import('./lazy.js'), __VITE_PRELOAD__)
export { createNativeConfig }`)

    assert.doesNotMatch(result, /__vitePreload|__VITE_PRELOAD__/)
    assert.match(result, /import\s*\{\s*createNativeConfig\s*\}\s*from\s*['"]\.\/bootstrap\.js['"]/)
    assert.match(result, /\(\(\) => import\(['"]\.\/lazy\.js['"]\)\)\(\)/)
})

test('leaves non-Vite calls and imports unchanged', () => {
    const result = removeVitePreload(`import { __vitePreload } from './custom.js'
export const load = () => __vitePreload(() => import('./lazy.js'), customDependencies)`)

    assert.match(result, /__vitePreload/)
    assert.match(result, /customDependencies/)
})

test('removes the native bootstrap dependency from a final capsule', () => {
    const result = renderCapsule(
        `import { __vitePreload } from './bootstrap.js'
export const load = () => __vitePreload(() => import('./lazy.js'), __VITE_PRELOAD__)`,
        { fileName: 'assets/root.js' } as Rolldown.RenderedChunk
    )
    const commonJsModule: { exports?: unknown } = {}
    Function('module', result.code)(commonJsModule)

    assert.ok(Array.isArray(commonJsModule.exports))
    assert.deepEqual(commonJsModule.exports[0], [])
    assert.match(result.code, /_context\.import\(['"]\.\/lazy\.js['"]\)/)
})
