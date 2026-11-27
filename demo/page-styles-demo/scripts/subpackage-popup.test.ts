import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'

test('WX: only the orders detail page loads Taroify Popup styles', async () => {
    const result = await build({
        root: fileURLToPath(new URL('../fixtures/popup/', import.meta.url)),
        build: { write: false },
        logLevel: 'silent'
    })
    assert.ok(!Array.isArray(result) && 'output' in result)
    const styles = new Map(
        result.output.flatMap((file) =>
            file.type === 'asset' && file.fileName.endsWith('.wxss')
                ? [[file.fileName, String(file.source)] as const]
                : []
        )
    )
    const popup = /\.taroify-popup\s*\{[^}]*\bposition:\s*fixed\b/
    function loadsPopup(entry: string): boolean {
        // Each entry follows its own WXSS imports, including the global companion imported by app.wxss.
        const visited = new Set<string>()
        function visit(fileName: string): boolean {
            if (visited.has(fileName)) {
                return false
            }
            visited.add(fileName)
            const css = styles.get(fileName)
            assert.ok(typeof css === 'string', `Missing WXSS: ${fileName}`)
            return (
                popup.test(css) ||
                Array.from(css.matchAll(/@import\s+["']([^"']+)["']/g)).some(([, specifier]) =>
                    visit(path.posix.join(path.posix.dirname(fileName), specifier!))
                )
            )
        }
        return visit(entry)
    }
    assert.ok(loadsPopup('orders/detail.wxss'))
    assert.equal(loadsPopup('app.wxss'), false)
    assert.equal(loadsPopup('home.wxss'), false)
    for (const [fileName, css] of styles) {
        if (!fileName.startsWith('orders/')) {
            assert.doesNotMatch(css, /\.taroify-popup\b/, fileName)
        }
    }
})
