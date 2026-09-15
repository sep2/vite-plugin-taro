import assert from 'node:assert/strict'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { dev } from 'astro'

/** Render the real overrides so a Starlight upgrade cannot leave its button targeting a non-popover pane. */
test('page frames preserve the navigation contract and forwarded slots', async (context) => {
    const server = await dev({
        root: fileURLToPath(new URL('../', import.meta.url)),
        logLevel: 'silent',
        server: { host: '127.0.0.1', port: 0 },
        devToolbar: { enabled: false }
    })
    context.after(() => server.stop())

    for (const [route, hasSidebar] of [
        ['/guides/quick-start/', true],
        ['/guides/configuration/', true],
        ['/', false]
    ] as const) {
        await context.test(route, async () => {
            const response = await fetch(`http://127.0.0.1:${server.address.port}${route}`)
            assert.equal(response.status, 200)
            const html = await response.text()
            const pane = html.match(/<[\w-]+\b[^>]*\bid="starlight__sidebar"[^>]*>/)?.[0]
            assert.ok(pane, 'the navigation must render its controlled sidebar')
            assert.equal(html.match(/\bid="starlight__sidebar"/g)?.length, 1)
            assert.match(html, /<a\b[^>]*\bhref="\/"[^>]*>/, 'the header slot must retain the home link')
            assert.match(html, /<h1\b/, 'the default slot must retain the page content')
            assert.match(html, /href="\/guides\/configuration\/"/, 'the sidebar must retain documentation links')

            if (hasSidebar) {
                assert.match(html, /<button\b[^>]*\bpopovertarget="starlight__sidebar"[^>]*>/)
                assert.match(pane, /\spopover(?:=|\s|>)/, 'the Starlight menu button requires a popover target')
            } else {
                assert.match(html, /<vpt-navigation-menu\b/, 'the homepage must retain its custom drawer')
                assert.match(html, /<button\b[^>]*\baria-controls="starlight__sidebar"[^>]*>/)
            }
        })
    }
})
