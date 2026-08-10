import assert from 'node:assert/strict'
import test from 'node:test'
import { createStyleCapturePlugin, type ProcessedStyle } from './create-style-capture-plugin.ts'

test('captures final Vite CSS and upstream Tailwind root identity', async () => {
    // This mutable journal observes the plugin's capture boundary.
    const captures: Array<Readonly<{ id: string; style: ProcessedStyle }>> = []
    const plugin = createStyleCapturePlugin((id, style) => {
        captures.push({ id: id, style: style })
    })
    const transform = plugin.transform
    if (typeof transform !== 'function') {
        throw new Error('Expected style capture transform')
    }

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
