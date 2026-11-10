import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { Children, isValidElement, type PropsWithChildren } from 'react'
import { build } from 'vite'

const require = createRequire(import.meta.url)
const templateRoot = fileURLToPath(new URL('../../../../create-vite-taro/templates/default/', import.meta.url))

type TabButtonProps = {
    id: string
    'aria-current': string
    onClick(): void
}

for (const target of ['xhs', 'tt'] as const) {
    test(`the ${target} starter uses its target's tab presentation`, async () => {
        const result = await build({
            root: templateRoot,
            configFile: false,
            logLevel: 'silent',
            define: { 'import.meta.env.VITE_VPT_TARGET': JSON.stringify(target) },
            build: {
                write: false,
                minify: false,
                rolldownOptions: {
                    input: path.join(templateRoot, 'src/components/tab-bar/tab-bar.tsx'),
                    preserveEntrySignatures: 'strict',
                    external: ['react/jsx-runtime', 'virtual:taro/api', 'virtual:taro/components'],
                    output: { format: 'cjs' }
                }
            }
        })
        assert.ok(!Array.isArray(result) && 'output' in result)
        const chunk = result.output.find((output) => output.type === 'chunk')
        assert.ok(chunk)
        const module: { exports: Record<string, unknown> } = { exports: {} }
        // This fixture-local journal records native navigation requests from the rendered buttons.
        const navigations: string[] = []
        runInNewContext(chunk.code, {
            module,
            exports: module.exports,
            require(id: string) {
                if (id === 'virtual:taro/api') {
                    return { switchTab: ({ url }: { url: string }) => navigations.push(url) }
                }
                if (id === 'virtual:taro/components') {
                    return { Button: 'button', Image: 'image', Text: 'text', View: 'view' }
                }
                return require(id)
            }
        })
        const { TabBar } = module.exports
        assert.ok(typeof TabBar === 'function')
        const element: unknown = TabBar({ activePath: 'pages/home/index' })
        if (target === 'xhs') {
            assert.equal(element, null)
            assert.deepEqual(navigations, [])
            return
        }
        assert.ok(isValidElement<PropsWithChildren>(element))
        const buttons = Children.toArray(element.props.children).map((child) => {
            assert.ok(isValidElement<TabButtonProps>(child))
            return child.props
        })
        assert.deepEqual(
            buttons.map(({ id }) => id),
            ['tab-home', 'tab-explore', 'tab-about']
        )
        const [home, explore] = buttons
        assert.ok(home && explore)
        assert.equal(home['aria-current'], 'page')
        assert.equal(explore['aria-current'], 'false')
        home.onClick()
        assert.deepEqual(navigations, [])
        explore.onClick()
        assert.deepEqual(navigations, ['/pages/explore/explore-page'])
    })
}
