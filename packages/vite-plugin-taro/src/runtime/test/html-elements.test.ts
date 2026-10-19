import assert from 'node:assert/strict'
import test from 'node:test'
import { blockElements, ensureHtmlClass, inlineElements } from 'vite-plugin-taro-runtime/plugin-html/html-elements'

test('HTML semantic classes preserve complete tokens and exact whitespace', () => {
    const cases: readonly (readonly [string | undefined, string])[] = [
        [undefined, 'h5-span '],
        ['', 'h5-span '],
        ['price', 'h5-span price'],
        ['h5-span', 'h5-span'],
        ['h5-span price', 'h5-span price'],
        ['price h5-span', 'price h5-span'],
        ['price h5-span active', 'price h5-span active'],
        ['  price  ', 'h5-span   price  '],
        ['  h5-span  ', '  h5-span  '],
        ['h5-span h5-span', 'h5-span h5-span'],
        ['h5-span-extra', 'h5-span h5-span-extra'],
        ['prefix-h5-span', 'h5-span prefix-h5-span'],
        ['h5-span-extra h5-span active', 'h5-span-extra h5-span active'],
        ['h5-span\tprice', 'h5-span h5-span\tprice'],
        ['price\nh5-span', 'h5-span price\nh5-span'],
        ['h5-span\r', 'h5-span h5-span\r'],
        ['h5-span\f', 'h5-span h5-span\f'],
        ['\u00a0h5-span', 'h5-span \u00a0h5-span'],
        ['H5-SPAN', 'h5-span H5-SPAN'],
        ['金额 h5-span active', '金额 h5-span active'],
        ['price h5-span-extra active', 'h5-span price h5-span-extra active']
    ]
    for (const [className, expected] of cases) {
        assert.equal(ensureHtmlClass('span', className), expected, JSON.stringify(className))
    }
})

test('HTML semantic class matching follows upstream space-token semantics for every classified tag', () => {
    for (const tagName of [...blockElements, ...inlineElements]) {
        const marker = `h5-${tagName}`
        const tokens = ['', marker, `${marker}-extra`, `prefix-${marker}`, 'price', `价格\t${marker}`]
        for (const left of tokens) {
            for (const right of tokens) {
                for (const separator of [' ', '  ', '\t', '\n', '\r', '\f', '\u00a0']) {
                    const className = `${left}${separator}${right}`
                    // Upstream splits on literal spaces; other whitespace remains inside its tokens.
                    const expected = className.split(' ').includes(marker) ? className : `${marker} ${className}`
                    assert.equal(
                        ensureHtmlClass(tagName, className),
                        expected,
                        `${tagName}: ${JSON.stringify(className)}`
                    )
                }
            }
        }
    }
})
