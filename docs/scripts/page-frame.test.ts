import assert from 'node:assert/strict'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { dev } from 'astro'

/** Render the real overrides to keep both menus usable before JavaScript loads or when it is disabled. */
test('page frames preserve the navigation contract and forwarded slots', async (context) => {
    const server = await dev({
        root: fileURLToPath(new URL('../', import.meta.url)),
        logLevel: 'silent',
        server: { host: '127.0.0.1', port: 0 },
        devToolbar: { enabled: false }
    })
    context.after(() => server.stop())

    for (const route of ['/guides/quick-start/', '/guides/configuration/', '/']) {
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

            const toggle = html.match(/<button\b[^>]*\bpopovertarget="starlight__sidebar"[^>]*>/)?.[0]
            assert.ok(toggle, 'the menu button must toggle its sidebar without JavaScript')
            assert.match(pane, /\spopover(?:=|\s|>)/, 'the menu button requires a native popover target')
            assert.doesNotMatch(toggle, /\saria-expanded=/, 'the browser must manage the implicit expanded state')
        })
    }
})
