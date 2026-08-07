import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { transformNativeComponentFacades } from './native-component-schema.ts'

const moduleId = path.resolve('/project/src/native-counter.ts')

test('extracts an aliased static native component schema', () => {
    const { definitions } = transformNativeComponentFacades(
        `
            import { defineNativeComponent as defineNative } from 'virtual:taro/native'

            export const NativeCounter = defineNative(() => import('./native/native-counter/counter.js'), {
                properties: {
                    count: Number,
                    label: String,
                    options: {
                        enabled: Boolean,
                        values: Array
                    }
                },
                events: {
                    increment: {
                        value: Number
                    },
                    ready: Object
                }
            })
        `,
        moduleId,
        false
    )

    assert.deepEqual(definitions, [
        {
            folder: path.resolve('/project/src/native/native-counter'),
            entry: 'counter',
            properties: ['count', 'label', 'options'],
            events: ['increment', 'ready']
        }
    ])
})

test('replaces facade calls with native tag strings and removes only the macro import', () => {
    const transformed = transformNativeComponentFacades(
        `
            import { defineNativeComponent as defineNative } from 'virtual:taro/native'

            const schema = Number
            export const NativeCounter = defineNative(() => import('./native/native-counter/index.js'), {
                properties: { count: Number },
                events: { increment: { value: Number } }
            })
            console.log(schema)
        `,
        moduleId,
        false
    )

    assert.match(transformed.code, /NativeCounter\s*=\s*['"]native-counter['"]/)
    assert.doesNotMatch(transformed.code, /defineNativeComponent|defineNative|properties:/)
    assert.doesNotMatch(transformed.code, /virtual:taro\/native/)
    assert.deepEqual(transformed.definitions[0], {
        folder: path.resolve('/project/src/native/native-counter'),
        entry: 'index',
        properties: ['count'],
        events: ['increment']
    })
})

test('ignores unrelated and shadowed functions with the same name', () => {
    const { definitions } = transformNativeComponentFacades(
        `
            import { defineNativeComponent } from 'virtual:taro/native'
            function create(defineNativeComponent: () => void) {
                defineNativeComponent()
            }
            create(() => {})
        `,
        moduleId,
        false
    )

    assert.deepEqual(definitions, [])
})

const invalidEntryMessage = /entry must use \(\) => import\(\.\.\.\) with a static relative \.js path/

const invalidSchemas = [
    {
        name: 'plain entry strings',
        source: `
            import { defineNativeComponent } from 'virtual:taro/native'
            defineNativeComponent('./counter.js', { properties: {}, events: {} })
        `,
        message: invalidEntryMessage
    },
    {
        name: 'direct imports',
        source: `
            import { defineNativeComponent } from 'virtual:taro/native'
            defineNativeComponent(import('./counter.js'), { properties: {}, events: {} })
        `,
        message: invalidEntryMessage
    },
    {
        name: 'dynamic entries',
        source: `
            import { defineNativeComponent } from 'virtual:taro/native'
            defineNativeComponent(() => import(entry), { properties: {}, events: {} })
        `,
        message: invalidEntryMessage
    },
    {
        name: 'folder imports without a JavaScript entry',
        source: `
            import { defineNativeComponent } from 'virtual:taro/native'
            defineNativeComponent(() => import('./counter'), { properties: {}, events: {} })
        `,
        message: invalidEntryMessage
    },
    {
        name: 'missing sections',
        source: `
            import { defineNativeComponent } from 'virtual:taro/native'
            defineNativeComponent(() => import('./counter.js'), { properties: {} })
        `,
        message: /schema is missing events/
    },
    {
        name: 'spread fields',
        source: `
            import { defineNativeComponent } from 'virtual:taro/native'
            defineNativeComponent(() => import('./counter.js'), { properties: { ...properties }, events: {} })
        `,
        message: /properties cannot use spread fields/
    },
    {
        name: 'computed fields',
        source: `
            import { defineNativeComponent } from 'virtual:taro/native'
            defineNativeComponent(() => import('./counter.js'), { properties: { [name]: Number }, events: {} })
        `,
        message: /properties must use static fields/
    },
    {
        name: 'unsupported schema expressions',
        source: `
            import { defineNativeComponent } from 'virtual:taro/native'
            defineNativeComponent(() => import('./counter.js'), { properties: { count: number() }, events: {} })
        `,
        message: /Unsupported native component schema at properties.count/
    },
    {
        name: 'property and event collisions',
        source: `
            import { defineNativeComponent } from 'virtual:taro/native'
            defineNativeComponent(() => import('./counter.js'), {
                properties: { increment: Number },
                events: { increment: { value: Number } }
            })
        `,
        message: /field increment is both a property and an event/
    }
] as const

invalidSchemas.forEach(({ name, source, message }) => {
    test(`rejects ${name}`, () => {
        assert.throws(() => transformNativeComponentFacades(source, moduleId, false), message)
    })
})
