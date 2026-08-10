import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'rolldown'
import type { Plugin } from 'vite'
import { createTailwindRootTracker } from './create-tailwind-root-tracker.ts'

const generateServePluginName = 'weapp-tailwindcss:adaptor:generate:serve'

test('records only generated Tailwind roots as physical module IDs', async () => {
    const upstream: Plugin = {
        name: generateServePluginName,
        transform: {
            order: 'pre',
            handler(code) {
                if (!code.includes('@tailwind-root')) {
                    return
                }
                return { code: 'export const generated = true', map: null }
            }
        }
    }
    const sources: Plugin = {
        name: 'test:tailwind-root-sources',
        resolveId(id) {
            if (id === 'virtual:app') {
                return '/project/src/app.css?weapp-vite-sidecar=style'
            }
            if (id === 'virtual:page') {
                return '/project/src/page.css'
            }
        },
        load(id) {
            if (id.startsWith('/project/src/app.css')) {
                return { code: '@tailwind-root', moduleType: 'js' }
            }
            if (id === '/project/src/page.css') {
                return { code: 'export const page = true', moduleType: 'js' }
            }
        }
    }
    const tracker = createTailwindRootTracker([upstream])

    await build({
        input: ['virtual:app', 'virtual:page'],
        plugins: [sources, tracker.plugins],
        output: { format: 'es' },
        write: false
    })

    assert.deepEqual([...tracker.getTailwindRoots()], ['/project/src/app.css'])
})
