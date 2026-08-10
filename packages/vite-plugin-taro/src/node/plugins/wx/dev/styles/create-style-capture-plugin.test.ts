import assert from 'node:assert/strict'
import test from 'node:test'
import type { GetModuleInfo } from 'rolldown'
import { createStyleCapturePlugin, type ProcessedStyle } from './create-style-capture-plugin.ts'

test('captures final Vite CSS and upstream Tailwind root identity', async () => {
    // These mutable journals observe both plugin capture boundaries.
    const captures: Array<Readonly<{ id: string; style: ProcessedStyle }>> = []
    const graphReaders: GetModuleInfo[] = []
    const plugin = createStyleCapturePlugin({
        captureGraph(reader) {
            graphReaders.push(reader)
        },
        captureStyle(id, style) {
            captures.push({ id: id, style: style })
        }
    })
    const buildStart = plugin.buildStart
    const transform = plugin.transform
    if (typeof buildStart !== 'function' || typeof transform !== 'function') {
        throw new Error('Expected style capture hooks')
    }

    await Reflect.apply(buildStart, { getModuleInfo: () => null }, [])
    assert.equal(graphReaders[0]?.('/missing'), null)

    const css = '/*! weapp-tailwindcss vite-generated-css:app.css */\n.app {}'
    const code = `const __vite__css = ${JSON.stringify(css)}\nexport default __vite__css`
    await Reflect.apply(transform, {}, [code, '/project/app.css'])

    assert.deepEqual(captures, [
        {
            id: '/project/app.css',
            style: { css: css, isTailwindRoot: true }
        }
    ])
})
