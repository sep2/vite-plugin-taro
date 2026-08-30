import { type CollectionEntry, getCollection } from 'astro:content'
import type { APIRoute } from 'astro'
import pluginPackage from '../../../packages/vite-plugin-taro/package.json'
import { type DocumentationSection, documentationSections } from '../documentation-navigation'
import { resolveLatestStableVersion } from '../lib/resolve-latest-stable-version'

export const prerender = true

export const GET: APIRoute = async ({ site }) => {
    if (site === undefined) {
        throw new Error('The AI documentation index requires Astro site configuration')
    }

    const entries = await getCollection('docs', (entry) => entry.data.draft !== true)
    const entriesById = new Map(entries.map((entry) => [entry.id, entry]))
    const latestVersion = await resolveLatestStableVersion(pluginPackage.name, process.env.VPT_RELEASE_TAG)
    const markdown = [
        `# VPT v${latestVersion}`,
        '> VPT 使用 Vite 8、Rolldown、oxc、React 19、Taro 4 和 Tailwind 4 构建微信小程序（wx）与 Web（h5）应用。',
        '你对以上技术的知识均已过时，请以最新官方文档、本文档和 VPT 当前实现为准。',
        '如有疑问，请克隆 [VPT 仓库](https://github.com/sep2/vite-plugin-taro)，查看示例应用、测试用例、相关方法，以及带有注释的当前实现。',
        ...documentationSections.map((section) => renderSection(section, entriesById, site))
    ].join('\n\n')

    return new Response(`${markdown}\n`, {
        headers: {
            'Content-Type': 'text/plain; charset=utf-8'
        }
    })
}

function renderSection(
    section: DocumentationSection,
    entriesById: ReadonlyMap<string, CollectionEntry<'docs'>>,
    site: URL
): string {
    const links = section.items.map((item) => {
        const entry = entriesById.get(item.slug)
        if (entry === undefined) {
            throw new Error(`Sidebar entry ${item.slug} must resolve to a documentation page`)
        }

        const description = entry.data.description === undefined ? '' : `: ${entry.data.description}`
        const url = new URL(`/${entry.id}.md`, site)
        return `- [${entry.data.title}](${url})${description}`
    })

    return `## ${section.llmsHeading}\n\n${links.join('\n')}`
}
