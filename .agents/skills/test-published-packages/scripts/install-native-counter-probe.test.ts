import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { installNativeCounterProbe } from './install-native-counter-probe.ts'

test('adds the probe id to the generated native component props without changing its implementation', () => {
    const source = readFileSync(
        new URL(
            '../../../../packages/create-vite-taro/templates/default/src/components/counter/native-counter.tsx',
            import.meta.url
        ),
        'utf8'
    )
    for (const newline of ['\n', '\r\n']) {
        const original = source.replace(/\r?\n/g, newline)
        const patched = installNativeCounterProbe(original)
        assert.ok(patched.includes(`type NativeCounterProps = {${newline}    id: string${newline}`))
        assert.equal(patched.replace(`    id: string${newline}`, ''), original)
    }
})

test('rejects missing or ambiguous native props declarations', () => {
    for (const source of [
        '',
        'export interface CounterProps {\n}',
        'type NativeCounterProps = {\ntype NativeCounterProps = {\n'
    ]) {
        assert.throws(() => installNativeCounterProbe(source), /Expected one NativeCounterProps type/)
    }
})
