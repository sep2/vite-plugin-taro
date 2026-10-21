import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

for (const page of ['home/index', 'explore/explore-page', 'about/about-page']) {
    test(`the starter ${page} scroll container enables flex layout`, () => {
        const source = readFileSync(
            new URL(`../packages/create-vite-taro/templates/default/src/pages/${page}.tsx`, import.meta.url),
            'utf8'
        )
        const scrollViews = source.match(/<ScrollView\b[^>]*>/g)
        assert.ok(scrollViews)
        for (const scrollView of scrollViews) {
            assert.match(scrollView, /\benableFlex\b/)
        }
    })
}
