import { getCollection } from 'astro:content'
import type { APIRoute, GetStaticPaths, InferGetStaticPropsType } from 'astro'
import { renderAiMarkdown } from '../lib/ai-markdown'

export const prerender = true

export const getStaticPaths = (async () => {
    const entries = await getCollection(
        'docs',
        (entry) => entry.data.draft !== true && (entry.id.startsWith('guides/') || entry.id.startsWith('references/'))
    )

    return entries.map((entry) => ({
        params: { slug: entry.id },
        props: { entry: entry }
    }))
}) satisfies GetStaticPaths

type Props = InferGetStaticPropsType<typeof getStaticPaths>

export const GET: APIRoute<Props> = async ({ props }) => {
    if (props.entry.body === undefined || props.entry.filePath === undefined) {
        throw new Error(`Documentation entry ${props.entry.id} must have a Markdown source file`)
    }

    const markdown = await renderAiMarkdown({
        body: props.entry.body,
        description: props.entry.data.description,
        isMdx: props.entry.filePath.endsWith('.mdx'),
        title: props.entry.data.title
    })

    return new Response(markdown, {
        headers: {
            'Content-Type': 'text/markdown; charset=utf-8'
        }
    })
}
