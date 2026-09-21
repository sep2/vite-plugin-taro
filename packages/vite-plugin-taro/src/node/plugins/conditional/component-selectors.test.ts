import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { parseSync } from 'rolldown/utils'
import { createConditionalDirectivePlugin } from './conditional-directives.ts'

const repositoryRoot = new URL('../../../../../../', import.meta.url)
const selectors = [
    {
        path: 'packages/create-vite-taro/templates/default/src/components/counter/counter.tsx',
        name: 'Counter',
        targets: [
            ['wx', 'NativeCounter'],
            ['zfb', 'SharedCounter'],
            ['tt', 'SharedCounter'],
            ['h5', 'SharedCounter']
        ]
    },
    {
        path: 'demo/native-comp-demo/src/pages/index/native-counter.tsx',
        name: 'NativeCounter',
        targets: [
            ['wx', 'WxNativeCounter'],
            ['zfb', 'ZfbNativeCounter'],
            ['tt', 'TtNativeCounter']
        ]
    },
    {
        path: 'demo/loan-genius/src/components/picker/index.tsx',
        name: 'TaroPickerSelector',
        targets: [
            ['wx', 'TaroPickerSelectorMini'],
            ['zfb', 'TaroPickerSelectorMini'],
            ['tt', 'TaroPickerSelectorMini'],
            ['h5', 'TaroPickerSelectorH5']
        ]
    }
] as const

for (const selector of selectors) {
    for (const [target, component] of selector.targets) {
        test(`${selector.name}: ${target} selects one component by identity without a wrapper`, async () => {
            const filename = fileURLToPath(new URL(selector.path, repositoryRoot))
            const source = await readFile(filename, 'utf8')
            const hook = createConditionalDirectivePlugin(target).transform
            assert.ok(hook && typeof hook === 'object')
            const result: unknown = Reflect.apply(hook.handler, {}, [source, filename])
            assert.ok(result && typeof result === 'object' && 'code' in result && typeof result.code === 'string')
            const parsed = parseSync(filename, result.code)
            assert.deepEqual(parsed.errors, [])

            const declarations = parsed.program.body.flatMap((statement) => {
                const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement
                return declaration?.type === 'VariableDeclaration' ? [declaration] : []
            })
            const declaration = declarations.find((declaration) =>
                declaration.declarations.some(
                    ({ id }) =>
                        id.type === 'ArrayPattern' &&
                        id.elements.length === 1 &&
                        id.elements[0]?.type === 'Identifier' &&
                        id.elements[0].name === selector.name
                )
            )
            assert.ok(declaration, 'The selected component must be a destructured binding')
            assert.equal(declaration.kind, 'const')
            assert.equal(declaration.declarations.length, 1)
            const initializer = declaration.declarations[0].init
            assert.ok(initializer?.type === 'ArrayExpression')
            assert.equal(initializer.elements.length, 1)
            const selected = initializer.elements[0]
            assert.ok(selected?.type === 'Identifier')
            assert.equal(selected.name, component)

            // Evaluating only the selector proves identity without running React or native component registration.
            const implementation = () => assert.fail('Selecting a component must not call it')
            assert.strictEqual(
                runInNewContext(`${result.code.slice(declaration.start, declaration.end)}\n${selector.name}`, {
                    [component]: implementation
                }),
                implementation
            )
        })
    }
}
