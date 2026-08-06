import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { parseNativeComponentSchemas, transformNativeComponentFacades } from './native-component-schema.ts'

const moduleId = path.resolve('/project/src/native-counter.ts')

test('parses an aliased static native component schema', () => {
    const definitions = parseNativeComponentSchemas(
        `
            import { defineNativeComponent as defineNative } from 'virtual:taro/native'

            export const NativeCounter = defineNative('./native/native-counter', {
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
        moduleId
    )

    assert.deepEqual(definitions, [
        {
            moduleId,
            callStart: definitions[0]?.callStart,
            folder: './native/native-counter',
            sourceDirectory: path.resolve('/project/src/native/native-counter'),
            properties: ['count', 'label', 'options'],
            events: ['increment', 'ready']
        }
    ])
    assert.equal(typeof definitions[0]?.callStart, 'number')
})

test('replaces facade calls with native tag strings and removes only the macro import', () => {
    const transformed = transformNativeComponentFacades(
        `
            import { defineNativeComponent as defineNative, type NativeSchema } from 'virtual:taro/native'

            const schema: NativeSchema = Number
            export const NativeCounter = defineNative('./native/native-counter', {
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
    assert.match(transformed.code, /import\s*{\s*type NativeSchema\s*}/)
    assert.equal(transformed.definitions[0]?.folder, './native/native-counter')
})

test('ignores unrelated and shadowed functions with the same name', () => {
    const definitions = parseNativeComponentSchemas(
        `
            import { defineNativeComponent } from 'virtual:taro/native'
            function create(defineNativeComponent: () => void) {
                defineNativeComponent()
            }
            create(() => {})
        `,
        moduleId
    )

    assert.deepEqual(definitions, [])
})

const invalidSchemas = [
    {
        name: 'dynamic folders',
        source: `
            import { defineNativeComponent } from 'virtual:taro/native'
            defineNativeComponent(folder, { properties: {}, events: {} })
        `,
        message: /folder must be a static relative string/
    },
    {
        name: 'missing sections',
        source: `
            import { defineNativeComponent } from 'virtual:taro/native'
            defineNativeComponent('./counter', { properties: {} })
        `,
        message: /schema is missing events/
    },
    {
        name: 'spread fields',
        source: `
            import { defineNativeComponent } from 'virtual:taro/native'
            defineNativeComponent('./counter', { properties: { ...properties }, events: {} })
        `,
        message: /properties cannot use spread fields/
    },
    {
        name: 'computed fields',
        source: `
            import { defineNativeComponent } from 'virtual:taro/native'
            defineNativeComponent('./counter', { properties: { [name]: Number }, events: {} })
        `,
        message: /properties must use static fields/
    },
    {
        name: 'unsupported schema expressions',
        source: `
            import { defineNativeComponent } from 'virtual:taro/native'
            defineNativeComponent('./counter', { properties: { count: number() }, events: {} })
        `,
        message: /Unsupported native component schema at properties.count/
    },
    {
        name: 'property and event collisions',
        source: `
            import { defineNativeComponent } from 'virtual:taro/native'
            defineNativeComponent('./counter', {
                properties: { increment: Number },
                events: { increment: { value: Number } }
            })
        `,
        message: /field increment is both a property and an event/
    }
] as const

invalidSchemas.forEach(({ name, source, message }) => {
    test(`rejects ${name}`, () => {
        assert.throws(() => parseNativeComponentSchemas(source, moduleId), message)
    })
})
