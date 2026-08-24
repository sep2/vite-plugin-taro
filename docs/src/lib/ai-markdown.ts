import type { Paragraph, Root, Strong, Text } from 'mdast'
import type { MdxJsxAttribute, MdxJsxExpressionAttribute } from 'mdast-util-mdx-jsx'
import remarkMdx from 'remark-mdx'
import remarkParse from 'remark-parse'
import remarkStringify from 'remark-stringify'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'

interface MarkdownDocument {
    body: string
    description: string | undefined
    isMdx: boolean
    title: string
}

const markdownProcessor = unified().use(remarkParse).use(rewriteDocumentationLinks).use(remarkStringify, {
    bullet: '-',
    fences: true
})

const mdxProcessor = unified()
    .use(remarkParse)
    .use(remarkMdx)
    .use(removeMdxScaffolding)
    .use(rewriteDocumentationLinks)
    .use(remarkStringify, {
        bullet: '-',
        fences: true
    })

export async function renderAiMarkdown(document: MarkdownDocument): Promise<string> {
    const processor = document.isMdx ? mdxProcessor : markdownProcessor
    const renderedBody = String(await processor.process(document.body)).trim()
    const heading = `# ${document.title}`
    const introduction = document.description === undefined ? heading : `${heading}\n\n> ${document.description}`

    return `${introduction}\n\n${renderedBody}\n`
}

/**
 * MDX imports and presentation-only components are useful to Astro but not to a Markdown reader.
 * Unified creates a fresh syntax tree for every document, so this transformer mutates only that
 * short-lived tree while replacing tabs with ordinary Markdown and removing component wrappers.
 */
function removeMdxScaffolding() {
    return (tree: Root): void => {
        tree.children = tree.children.filter((node) => node.type !== 'mdxjsEsm')

        visit(tree, 'mdxJsxFlowElement', (node, index, parent) => {
            if (index === undefined || parent === undefined) {
                return
            }

            if (node.name === 'TabItem') {
                parent.children.splice(index, 1, createTabLabel(readTabLabel(node.attributes)), ...node.children)
                return index
            }

            parent.children.splice(index, 1, ...node.children)
            return index
        })
    }
}

function readTabLabel(attributes: ReadonlyArray<MdxJsxAttribute | MdxJsxExpressionAttribute>): string {
    const label = attributes.find(
        (attribute): attribute is MdxJsxAttribute => attribute.type === 'mdxJsxAttribute' && attribute.name === 'label'
    )

    if (label === undefined || typeof label.value !== 'string') {
        throw new Error('Every TabItem in the documentation must have a string label')
    }

    return label.value
}

function createTabLabel(label: string): Paragraph {
    const text: Text = {
        type: 'text',
        value: `${label}:`
    }
    const strong: Strong = {
        type: 'strong',
        children: [text]
    }

    return {
        type: 'paragraph',
        children: [strong]
    }
}

/**
 * Link nodes belong to the same per-document transient tree described above. Rewriting them in
 * place ensures one generated Markdown page links directly to the next generated Markdown page.
 */
function rewriteDocumentationLinks() {
    return (tree: Root): void => {
        visit(tree, 'link', (node) => {
            node.url = toMarkdownUrl(node.url)
        })
    }
}

function toMarkdownUrl(url: string): string {
    const [path, fragment] = url.split('#')
    if (path === undefined || (!path.startsWith('/guides/') && !path.startsWith('/references/'))) {
        return url
    }

    const markdownPath = `${path.replace(/\/$/, '')}.md`
    return fragment === undefined ? markdownPath : `${markdownPath}#${fragment}`
}
