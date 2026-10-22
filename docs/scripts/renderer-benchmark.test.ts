import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { translateHomeText } from '../src/lib/home-language.ts'

const component = await readFile(
    new URL('../src/components/renderer-benchmark-showcase.astro', import.meta.url),
    'utf8'
)
const homepage = await readFile(new URL('../src/components/home-page.astro', import.meta.url), 'utf8')
const homeLink = await readFile(new URL('../src/components/home-link.astro', import.meta.url), 'utf8')
const appView = await readFile(new URL('../src/components/app-view-showcase.astro', import.meta.url), 'utf8')

test('homepage renderer charts use saved observations and precede the App layout', () => {
    assert.match(
        component,
        /import result from '\.\.\/\.\.\/\.\.\/demo\/benchmark-demo\/results\/wechat-devtools\.json'/
    )
    assert.ok(homepage.indexOf('<RendererBenchmarkShowcase />') < homepage.indexOf('<AppViewShowcase />'))
    assert.match(component, /const multiplier = result\.geometricMeanSpeedup\.toFixed\(1\)/)
    assert.match(component, /<strong>\{multiplier\}<small>倍<\/small><\/strong>/)
    assert.match(component, /Math\.max\(item\.dom\.median, item\.template\.median\)/)
    assert.match(component, /item\.dom\.median \/ item\.scale \* 100/)
    assert.match(component, /item\.template\.median \/ item\.scale \* 100/)
    assert.doesNotMatch(component, /<script\b/, 'charts work without client-side JavaScript')
})

test('the comparison presents six saved workload cases', () => {
    const labels = Array.from(component.matchAll(/'([a-z]+-\d+)': '([^']+)'/g), (match) => match.slice(1))
    assert.deepEqual(labels, [
        ['create-1000', '创建 1,000 行'],
        ['replace-1000', '替换 1,000 行'],
        ['update-1000', '更新每第 10 行'],
        ['append-1000', '追加 1,000 行'],
        ['clear-1000', '清空 1,000 行'],
        ['create-10000', '创建 10,000 行']
    ])
    assert.match(component, /Object\.hasOwn\(labels, id\)/)
})

test('the renderer and App links share the outlined pill button', () => {
    for (const source of [component, appView]) {
        assert.match(source, /import HomeLink from '\.\/home-link\.astro'/)
    }
    assert.match(component, /<HomeLink href="\/guides\/configuration\/#renderer">开启 DOM 渲染<\/HomeLink>/)
    assert.match(appView, /<HomeLink href="\/guides\/app-and-pages\/">了解 App 与页面<\/HomeLink>/)
    assert.match(homeLink, /border: 1px solid var\(--vpt-border-strong\)/)
    assert.match(homeLink, /border-radius: 999px/)
    assert.match(homeLink, /background: var\(--vpt-surface\)/)
    assert.match(homeLink, /<span aria-hidden="true">→<\/span>/)
    assert.match(homeLink, /\.home-link:focus-visible/)
})

test('chart durations include their millisecond unit', () => {
    assert.match(component, /<b>\{format\(item\.dom\.median\)\} ms<\/b>/)
    assert.match(component, /<b>\{format\(item\.template\.median\)\} ms<\/b>/)
})

test('the performance readout presents its multiplier with the comparison label', () => {
    const readout = component.match(/<aside class="benchmark-score"[\s\S]*?<\/aside>/)?.[0]
    assert.ok(readout)
    const label = readout.match(/<div class="score-label">([\s\S]*?)<\/div>/)?.[1]
    assert.ok(label)
    assert.match(label, /<span>比 Taro 更快，实测为证。<\/span>/)
    assert.match(label, /<svg class="score-mark"[^>]*aria-hidden="true"/)
    assert.match(
        readout,
        /<p class="score-comparison">VPT 相对 Taro 递归模板的平均性能达 <span>\{multiplier\}<\/span> 倍，已达到原生渲染水平<\/p>/
    )
    assert.match(readout, /<strong>\{multiplier\}<small>倍<\/small><\/strong>/)
    assert.equal(translateHomeText('倍', 'en'), '×')
})

test('the score uses the shared sans-serif typography and aligned numerals', () => {
    const styles = component.match(/\.benchmark-score > strong\s*\{([^}]+)\}/)?.[1]
    assert.ok(styles)
    assert.match(styles, /font-family: var\(--sl-font\)/)
    assert.match(styles, /font-weight: 700/)
    assert.match(styles, /font-variant-numeric: lining-nums tabular-nums/)
})

test('the displayed comparison identifies the baseline as setData', () => {
    const visibleCopy = Array.from(component.matchAll(/>([^<>{}]+)</g), (match) => match[1]!.trim()).join(' ')
    assert.match(visibleCopy, /Taro setData/)
    assert.match(component, /<span>setData<\/span>/)
    assert.doesNotMatch(visibleCopy, /\btemplate\b/i)
})

test('benchmark text, case labels, and accessible names translate in place', () => {
    const chinese = /[\u3400-\u9fff]/
    const textNodes = Array.from(component.matchAll(/>([^<>{}]+)</g), (match) => match[1]!.trim())
    const attributes = Array.from(component.matchAll(/aria-label="([^"]+)"/g), (match) => match[1]!)
    const labels = Array.from(component.matchAll(/'[^']+': '([^']+)'/g), (match) => match[1]!)
    const copy = [...textNodes, ...attributes, ...labels].filter((value) => chinese.test(value))
    assert.ok(copy.includes('开启 DOM 渲染'))
    assert.ok(copy.includes('清空 1,000 行'))
    for (const value of copy) {
        const english = translateHomeText(value, 'en')
        assert.equal(chinese.test(english), false, value)
        assert.equal(translateHomeText(english, 'zh-CN'), value)
    }
})
