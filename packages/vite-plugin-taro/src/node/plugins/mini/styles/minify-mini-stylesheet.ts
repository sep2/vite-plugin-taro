import type { BuildOptions } from 'vite'

/** Minifies only the completed global native stylesheet, without another browser compatibility or preprocessing pass. */
export async function minifyMiniStylesheet(
    css: string,
    options: Readonly<{ filename: string; minify: BuildOptions['cssMinify'] }>
): Promise<string> {
    if (!options.minify) {
        return css
    }

    // Use Lightning CSS in every mode. No browser targets: Mini conversion already owns compatibility,
    // including rpx and application/Tailwind prefixes, which must not be retargeted through a browser baseline here.
    const { transform } = await import('lightningcss')
    return transform({
        filename: options.filename,
        code: Buffer.from(css),
        minify: true
    }).code.toString()
}
