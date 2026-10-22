import { parseArgs } from 'node:util'

export type PublishedRenderer = 'template' | 'dom'

export interface PublishedFixture {
    readonly config: string
    readonly page: string
    readonly counter: string
    readonly nativeCounter: string
}

export const nativeCounterProbeId = 'published-native-counter'

export function getPublishedRenderers(args: readonly string[]): readonly PublishedRenderer[] {
    const { values } = parseArgs({
        args: [...args],
        options: { renderer: { type: 'string' } },
        strict: true,
        allowPositionals: false
    })
    if (values.renderer === undefined) {
        return ['template', 'dom']
    }
    if (values.renderer === 'template' || values.renderer === 'dom') {
        return [values.renderer]
    }
    throw new Error('--renderer must be template or dom')
}

function replaceOnce(source: string, from: string, to: string, label: string): string {
    if (source.split(from).length !== 2) {
        throw new Error(`Expected one ${label}`)
    }
    return source.replace(from, to)
}

function installTextProbe(source: string, probe: { readonly id: string; readonly text: string }): string {
    if (source.split(probe.text).length !== 2) {
        throw new Error(`Expected one source occurrence of: ${probe.text}`)
    }
    const literalIndex = source.indexOf(probe.text)
    const openingTagIndex = source.lastIndexOf('<Text ', literalIndex)
    const openingTagEnd = source.indexOf('>', openingTagIndex)
    if (openingTagIndex < 0 || openingTagEnd < openingTagIndex) {
        throw new Error('Unable to locate the HMR probe Text element')
    }
    if (source.slice(openingTagIndex, openingTagEnd).includes(' id=')) {
        throw new Error('The HMR probe Text element already has an id')
    }
    return `${source.slice(0, openingTagIndex)}<Text id="${probe.id}"${source.slice(openingTagIndex + 5)}`
}

/** Prepare each renderer from the same pristine scaffold so mode-specific probes remain isolated. */
export function preparePublishedFixture(
    sources: PublishedFixture,
    renderer: PublishedRenderer,
    probe: { readonly id: string; readonly text: string }
): PublishedFixture {
    const target = '                target,\n'
    const config = replaceOnce(
        sources.config,
        target,
        `${target}                renderer: '${renderer}',\n`,
        'renderer configuration target'
    )
    const page = installTextProbe(sources.page, probe)
    if (renderer === 'template') {
        return { ...sources, config, page }
    }
    const counter = (source: string) =>
        replaceOnce(source, '    count: number', '    id?: string\n    count: number', 'counter count declaration')
    return {
        config,
        page: replaceOnce(
            page,
            '<Counter\n',
            `<Counter\n                        id="${nativeCounterProbeId}"\n`,
            'native counter element'
        ),
        counter: counter(sources.counter),
        nativeCounter: counter(sources.nativeCounter)
    }
}

/** DevTools exposes native component property values as strings. */
export function parseNativeCounterProperty(value: unknown): number {
    if (typeof value !== 'string' || !/^-?\d+$/.test(value)) {
        throw new Error(`Expected an integer native counter property, received ${JSON.stringify(value)}`)
    }
    const count = Number(value)
    if (!Number.isSafeInteger(count)) {
        throw new Error('Native counter property exceeds the safe integer range')
    }
    return count
}

export function assertPublishedRenderer(renderer: PublishedRenderer, environment: Record<string, unknown>): void {
    const { nativeRoot, dataKeys } = environment
    if (
        typeof nativeRoot !== 'boolean' ||
        !Array.isArray(dataKeys) ||
        !dataKeys.every((key) => typeof key === 'string')
    ) {
        throw new Error('Invalid native renderer environment')
    }
    const active =
        nativeRoot && !dataKeys.includes('page')
            ? 'dom'
            : !nativeRoot && dataKeys.includes('page')
              ? 'template'
              : undefined
    if (active !== renderer) {
        throw new Error(`Expected ${renderer} renderer, received ${JSON.stringify(environment)}`)
    }
}
