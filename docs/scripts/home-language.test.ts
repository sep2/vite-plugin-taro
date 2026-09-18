import assert from 'node:assert/strict'
import test from 'node:test'
import { translateHomeText } from '../src/lib/home-language.ts'
import { homeTranslations } from '../src/lib/home-translations.ts'

test('every homepage translation switches in both directions without ambiguity', () => {
    const translations = Object.entries(homeTranslations)
    assert.equal(new Set(translations.map(([, english]) => english)).size, translations.length)

    for (const [chinese, english] of translations) {
        assert.equal(translateHomeText(chinese, 'en'), english)
        assert.equal(translateHomeText(english, 'zh-CN'), chinese)
        assert.equal(translateHomeText(english, 'en'), english)
        assert.equal(translateHomeText(chinese, 'zh-CN'), chinese)
    }
})

test('translations preserve surrounding whitespace and normalize wrapped copy', () => {
    assert.equal(translateHomeText('\n  快速开始  \n', 'en'), '\n  Get started  \n')
    assert.equal(translateHomeText('\n  Get started  \n', 'zh-CN'), '\n  快速开始  \n')
    assert.equal(translateHomeText('深层 React\n    组件即时更新', 'en'), 'Instant updates for nested React components')
})

test('unknown text, code, empty nodes, and counters are not changed', () => {
    for (const text of [
        '',
        '  \n ',
        '13',
        'React 19',
        "import { View } from 'virtual:taro/components'",
        '其他文档内容'
    ]) {
        assert.equal(translateHomeText(text, 'en'), text)
        assert.equal(translateHomeText(text, 'zh-CN'), text)
    }
})
