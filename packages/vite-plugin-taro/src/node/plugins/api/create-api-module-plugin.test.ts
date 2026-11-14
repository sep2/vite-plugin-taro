import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from '../../utils/vite-rolldown.ts'
import { createApiModulePlugin } from './create-api-module-plugin.ts'

test('resolves the public module and leaves unrelated imports to Vite', () => {
    const plugin = createApiModulePlugin()
    assert.equal(plugin.name, 'vpt:api-module')
    assert.ok(typeof plugin.resolveId === 'function' && typeof plugin.load === 'function')
    assert.equal(Reflect.apply(plugin.resolveId, {}, ['virtual:vpt']), '\0virtual:vpt')
    assert.equal(typeof Reflect.apply(plugin.load, {}, ['\0virtual:vpt']), 'string')
    for (const id of ['virtual:taro/api', 'virtual:vpt/other', '/src/pages/home.tsx']) {
        assert.equal(Reflect.apply(plugin.resolveId, {}, [id]), undefined)
        assert.equal(Reflect.apply(plugin.load, {}, [id]), undefined)
    }
    assert.equal(Reflect.apply(plugin.load, {}, ['virtual:vpt']), undefined)
})

test('leaves synchronous and asynchronous configuration factories unevaluated', async (context) => {
    const plugin = createApiModulePlugin()
    assert.ok(typeof plugin.load === 'function')
    const source: unknown = Reflect.apply(plugin.load, {}, ['\0virtual:vpt'])
    assert.ok(typeof source === 'string')
    const module: typeof import('virtual:vpt') = await import(`data:text/javascript,${encodeURIComponent(source)}`)
    const syncFactory = context.mock.fn(() => ({}))
    const asyncFactory = context.mock.fn(async () => ({}))
    assert.equal(module.defineVptPage(syncFactory), undefined)
    assert.equal(module.defineVptPage(asyncFactory), undefined)
    assert.equal(syncFactory.mock.callCount(), 0)
    assert.equal(asyncFactory.mock.callCount(), 0)
})

async function bundleConsumer(source: string) {
    const entryId = '\0test:vpt-consumer'
    const result = await build({
        input: entryId,
        plugins: [
            createApiModulePlugin(),
            {
                name: 'test:vpt-consumer',
                resolveId: (id) => (id === entryId ? id : undefined),
                load: (id) => (id === entryId ? source : undefined)
            }
        ],
        output: { format: 'es', minify: false },
        write: false
    })
    const chunk = result.output[0]
    assert.ok(chunk?.type === 'chunk')
    return chunk.code
}

for (const declaration of [
    `import { defineVptPage } from 'virtual:vpt'; defineVptPage(() => ({ config: { title: 'CONFIGURATION_ONLY' } }));`,
    `import { defineVptPage as declarePage } from 'virtual:vpt'; const register = declarePage; register(async () => ({ config: { title: 'CONFIGURATION_ONLY' } }));`,
    `import * as vpt from 'virtual:vpt'; vpt.defineVptPage(() => ({ config: { title: 'CONFIGURATION_ONLY' } }));`
]) {
    test(`tree shakes ordinary declaration bindings: ${declaration}`, async () => {
        const code = await bundleConsumer(`
            ${declaration}
            export const marker = 'APPLICATION_MARKER';
        `)
        assert.doesNotMatch(code, /defineVptPage|virtual:vpt|CONFIGURATION_ONLY/)
        assert.match(code, /APPLICATION_MARKER/)
    })
}

test('preserves module and argument evaluation side effects', async () => {
    const code = await bundleConsumer(`
        import { defineVptPage } from 'virtual:vpt';
        // This module-owned journal records evaluation outside the dormant factory.
        export const events = [];
        events.push('module');
        defineVptPage((events.push('argument'), () => {
            events.push('factory');
            return {};
        }));
    `)
    const module: { events: string[] } = await import(`data:text/javascript,${encodeURIComponent(code)}`)
    assert.deepEqual(module.events, ['module', 'argument'])
})
