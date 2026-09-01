import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { normalizePath } from 'vite'
import { transformNativeComponentInterfaces } from './native-component-interface.ts'

const moduleId = normalizePath(path.resolve('/project/src/native-counter.ts'))

test('extracts fields from a local native component type', () => {
    const { definitions } = transformNativeComponentInterfaces(
        `
            import { defineNativeComponent as defineNative } from 'virtual:taro/native'
            import type { Options } from './options.ts'

            type NativeCounterProps = {
                readonly count: number
                label?: string
                options: Options
                onIncrement?: (event: { detail: { value: number } }) => void
                onReady?(event: { detail: unknown }): void
                children?: unknown
            }

            export const NativeCounter = defineNative<NativeCounterProps>(
                () => import('./native/native-counter/counter.js')
            )
        `,
        moduleId,
        false
    )

    assert.deepEqual(definitions, [
        {
            folder: normalizePath(path.resolve('/project/src/native/native-counter')),
            entry: 'counter',
            fields: ['count', 'label', 'options', 'onIncrement', 'onReady']
        }
    ])
})

test('supports local TypeScript interface declarations', () => {
    const { definitions } = transformNativeComponentInterfaces(
        `
            import { defineNativeComponent } from 'virtual:taro/native'

            interface NativeCardProps {
                value: string
                onChange?: (event: { detail: string }) => void
            }

            export const NativeCard = defineNativeComponent<NativeCardProps>(
                () => import('./native-card/card.js')
            )
        `,
        moduleId,
        false
    )

    assert.deepEqual(definitions[0]?.fields, ['value', 'onChange'])
})

test('replaces interface calls while preserving unrelated source', () => {
    const transformed = transformNativeComponentInterfaces(
        `
            import { defineNativeComponent as defineNative } from 'virtual:taro/native'

            const untouched = '😀'
            export const NativeCounter = defineNative<{
                count: number
                onIncrement?: (event: { detail: { value: number } }) => void
            }>(() => import('./native/native-counter/index.js'))
            console.log(untouched)
        `,
        moduleId,
        false
    )

    assert.match(transformed.code, /NativeCounter\s*=\s*['"]native-counter['"]/)
    assert.match(transformed.code, /const untouched = '😀'/)
    assert.match(transformed.code, /console\.log\(untouched\)/)
    assert.doesNotMatch(transformed.code, /defineNativeComponent|defineNative|onIncrement/)
    assert.doesNotMatch(transformed.code, /virtual:taro\/native/)
    assert.deepEqual(transformed.definitions[0], {
        folder: normalizePath(path.resolve('/project/src/native/native-counter')),
        entry: 'index',
        fields: ['count', 'onIncrement']
    })
})

test('generates a source map for native interface edits', () => {
    const source = `
        import { defineNativeComponent } from 'virtual:taro/native'
        export const NativeDivider = defineNativeComponent(() => import('./native-divider/divider.js'))
    `
    const transformed = transformNativeComponentInterfaces(source, moduleId, true)

    assert.equal(transformed.map?.version, 3)
    assert.deepEqual(transformed.map?.sources, [moduleId])
    assert.deepEqual(transformed.map?.sourcesContent, [source])
    assert.notEqual(transformed.map?.mappings, '')
})

test('supports a default-exported macro call and quoted interface fields', () => {
    const transformed = transformNativeComponentInterfaces(
        `
            import nativeApi, { defineNativeComponent, unrelated as other } from 'virtual:taro/native'
            export default defineNativeComponent<{
                'data-value': string
            }>(() => import('./native-card/card.js'))
            void nativeApi
            void other
        `,
        moduleId,
        false
    )

    assert.match(transformed.code, /export default ['"]native-card['"]/)
    assert.deepEqual(transformed.definitions[0]?.fields, ['data-value'])
})

test('supports native components without fields', () => {
    const { definitions } = transformNativeComponentInterfaces(
        `
            import { defineNativeComponent } from 'virtual:taro/native'
            export const NativeDivider = defineNativeComponent(() => import('./native-divider/divider.js'))
        `,
        moduleId,
        false
    )

    assert.deepEqual(definitions[0], {
        folder: normalizePath(path.resolve('/project/src/native-divider')),
        entry: 'divider',
        fields: []
    })
})

test('ignores unrelated imports, default exports, and shadowed functions', () => {
    const { definitions } = transformNativeComponentInterfaces(
        `
            import nativeApi, { unrelated } from 'virtual:taro/native'
            export default function Component() {}
            function create(defineNativeComponent: () => void) {
                defineNativeComponent()
            }
            create(() => {})
            void nativeApi
            void unrelated
        `,
        moduleId,
        false
    )

    assert.deepEqual(definitions, [])
})

const invalidEntryMessage = /entry must use \(\) => import\(\.\.\.\) with a static relative \.js path/

const invalidInterfaces = [
    {
        name: 'schema arguments',
        source: `
            import { defineNativeComponent } from 'virtual:taro/native'
            defineNativeComponent(() => import('./counter.js'), { count: Number })
        `,
        message: /requires exactly one entry loader/
    },
    {
        name: 'plain entry strings',
        source: `
            import { defineNativeComponent } from 'virtual:taro/native'
            defineNativeComponent('./counter.js')
        `,
        message: invalidEntryMessage
    },
    {
        name: 'direct imports',
        source: `
            import { defineNativeComponent } from 'virtual:taro/native'
            defineNativeComponent(import('./counter.js'))
        `,
        message: invalidEntryMessage
    },
    {
        name: 'dynamic entries',
        source: `
            import { defineNativeComponent } from 'virtual:taro/native'
            defineNativeComponent(() => import(entry))
        `,
        message: invalidEntryMessage
    },
    {
        name: 'folder imports without a JavaScript entry',
        source: `
            import { defineNativeComponent } from 'virtual:taro/native'
            defineNativeComponent(() => import('./counter'))
        `,
        message: invalidEntryMessage
    },
    {
        name: 'imported interfaces',
        source: `
            import { defineNativeComponent } from 'virtual:taro/native'
            import type { Props } from './props.ts'
            defineNativeComponent<Props>(() => import('./counter.js'))
        `,
        message: /interface must be inline or declared in the same module/
    },
    {
        name: 'multiple interfaces',
        source: `
            import { defineNativeComponent } from 'virtual:taro/native'
            defineNativeComponent<{ count: number }, { label: string }>(() => import('./counter.js'))
        `,
        message: /interface must be one TypeScript object type/
    },
    {
        name: 'index signatures',
        source: `
            import { defineNativeComponent } from 'virtual:taro/native'
            defineNativeComponent<{ [name: string]: unknown }>(() => import('./counter.js'))
        `,
        message: /interface must contain only static fields/
    },
    {
        name: 'computed fields',
        source: `
            import { defineNativeComponent } from 'virtual:taro/native'
            defineNativeComponent<{ [name]: number }>(() => import('./counter.js'))
        `,
        message: /interface contains a computed field/
    },
    {
        name: 'numeric fields',
        source: `
            import { defineNativeComponent } from 'virtual:taro/native'
            defineNativeComponent<{ 0: number }>(() => import('./counter.js'))
        `,
        message: /interface contains a computed field/
    },
    {
        name: 'dynamic import options',
        source: `
            import { defineNativeComponent } from 'virtual:taro/native'
            defineNativeComponent(() => import('./counter.js', { with: { type: 'json' } }))
        `,
        message: invalidEntryMessage
    },
    {
        name: 'duplicate fields',
        source: `
            import { defineNativeComponent } from 'virtual:taro/native'
            defineNativeComponent<{ count: number; count: string }>(() => import('./counter.js'))
        `,
        message: /Duplicate native component interface field: count/
    }
] as const

invalidInterfaces.forEach(({ name, source, message }) => {
    test(`rejects ${name}`, () => {
        assert.throws(() => transformNativeComponentInterfaces(source, moduleId, false), message)
    })
})
