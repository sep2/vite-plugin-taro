import { homeTranslations } from './home-translations.ts'

export type HomeLanguage = 'zh-CN' | 'en'

const english: ReadonlyMap<string, string> = new Map(Object.entries(homeTranslations))
const chinese: ReadonlyMap<string, string> = new Map(
    Object.entries(homeTranslations).map(([source, translation]) => [translation, source])
)

/** Exact text-node matches preserve surrounding whitespace and leave code and unknown copy untouched. */
export function translateHomeText(value: string, language: HomeLanguage): string {
    const translations = language === 'en' ? english : chinese
    return value.replace(/\S(?:[\s\S]*\S)?/, (text) => translations.get(text.replace(/\s+/g, ' ')) ?? text)
}

/**
 * Only mutate homepage copy, never replace elements: demo state, focus, video playback, and listeners survive.
 * Each switch is O(n) in homepage nodes. Walking again includes phone-page clones created by the demo.
 */
export function applyHomeLanguage(document: Document, language: HomeLanguage): void {
    document.querySelectorAll('.hero, .home-content-rail, theme-toggle').forEach((root) => {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
        // The walker cursor advances through this one subtree; no DOM references survive the update.
        let node = walker.nextNode()
        while (node !== null) {
            const value = node.nodeValue!
            const translated = translateHomeText(value, language)
            if (translated !== value) {
                node.nodeValue = translated
            }
            node = walker.nextNode()
        }

        for (const element of [root, ...root.querySelectorAll('[aria-label], [title], track')]) {
            for (const attribute of element.attributes) {
                if (
                    ['aria-label', 'title'].includes(attribute.name) ||
                    (element.tagName === 'TRACK' && ['src', 'srclang', 'label'].includes(attribute.name))
                ) {
                    const translated = translateHomeText(attribute.value, language)
                    if (translated !== attribute.value) {
                        attribute.value = translated
                    }
                }
            }
        }
    })

    document.documentElement.lang = language
    document.title = translateHomeText(document.title, language)
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]')!
    description.content = translateHomeText(description.content, language)
    // Documentation navigation and search stay Chinese, even when the landing-page copy is English.
    document.querySelectorAll<HTMLElement>('header.header, nav.sidebar, .sl-skip-link').forEach((element) => {
        element.lang = 'zh-CN'
    })
    document.querySelectorAll<HTMLElement>('theme-toggle').forEach((toggle) => {
        toggle.lang = language
    })
    // Live announcements describe past interactions; clear them instead of leaving stale-language messages.
    document
        .querySelectorAll<HTMLOutputElement>('[data-page-announcement], [data-native-announcement]')
        .forEach((output) => {
            output.value = ''
        })
}
