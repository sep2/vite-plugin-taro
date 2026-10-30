import assert from 'node:assert/strict'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { dev } from 'astro'
import { homeTranslations } from '../src/lib/home-translations.ts'

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

            if (route === '/') {
                assert.match(html, /<home-language-switch\b/, 'the homepage must offer an in-place language switch')
                assert.match(html, /<button\b[^>]*aria-label="Switch to English"/)
                assert.doesNotMatch(html, /href="\/en(?:\/|")/, 'switching must not navigate to another path')
                const benchmark = html.indexOf('id="renderer-benchmark-title"')
                const appLayout = html.indexOf('id="app-view-title"')
                assert.ok(benchmark > 0 && benchmark < appLayout, 'the measured renderer showcase precedes App layout')
                assert.equal(html.match(/<article\b[^>]*class="operation-chart\b/g)?.length, 6)
                assert.deepEqual(
                    Array.from(html.matchAll(/<h4\b[^>]*\bid="chart-([^"]+)"/g), (match) => match[1]),
                    ['create-1000', 'replace-1000', 'update-1000', 'append-1000', 'clear-1000', 'create-10000']
                )
                assert.match(
                    html,
                    /href="https:\/\/github\.com\/sep2\/vite-plugin-taro\/tree\/main\/demo\/benchmark-demo"/
                )
                assert.match(html, /最快的全功能/)
                for (const copy of Object.keys(homeTranslations)) {
                    if (copy.includes('微信') && copy.includes('支付宝')) {
                        assert.ok(html.includes(copy), `the homepage must render its translated platform copy: ${copy}`)
                    }
                }
            } else {
                assert.doesNotMatch(html, /<home-language-switch\b/, 'documentation must not offer a language switch')
            }

            const toggle = html.match(/<button\b[^>]*\bpopovertarget="starlight__sidebar"[^>]*>/)?.[0]
            assert.ok(toggle, 'the menu button must toggle its sidebar without JavaScript')
            assert.match(pane, /\spopover(?:=|\s|>)/, 'the menu button requires a native popover target')
            assert.doesNotMatch(toggle, /\saria-expanded=/, 'the browser must manage the implicit expanded state')
        })
    }
})
