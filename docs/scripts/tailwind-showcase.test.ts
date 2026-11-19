import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const component = await readFile(new URL('../src/components/tailwind-showcase.astro', import.meta.url), 'utf8')

// Astro adds a scope attribute to both sides of a child selector, increasing its specificity.
test('step card decorations stay out of the content flow', () => {
    for (const decoration of ['steps-orbit', 'style-update-flash']) {
        const styles = component.match(new RegExp(`\\.${decoration}\\s*\\{([^}]+)\\}`))?.[1]
        assert.ok(styles, `missing .${decoration} styles`)
        assert.match(styles, /\bposition:\s*absolute\b/)
    }
    assert.doesNotMatch(component, /\.steps-card\s*>\s*\*\s*\{[^}]*\bposition\s*:/)
})

test('the step label and WXSS badge share a wrapping row', () => {
    const heading = component.match(/<div class="steps-heading">([\s\S]*?)<\/div>/)?.[1]
    assert.ok(heading)
    assert.match(heading, /class="metric-label\b[\s\S]*class="style-hmr-toast"/)
    const styles = component.match(/\.steps-heading\s*\{([^}]+)\}/)?.[1]
    assert.ok(styles)
    assert.match(styles, /\bdisplay:\s*flex\b/)
    assert.match(styles, /\bflex-wrap:\s*wrap\b/)
})
