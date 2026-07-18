import generate from '@babel/generator'

const generatorOptions = {
    comments: false,
    compact: true,
    concise: true,
    minified: true
} as const

/** Serializes a Babel AST node as a compact expression for Oxc substitution. */
export function ast2str(node: Parameters<typeof generate>[0]): string {
    return generate(node, generatorOptions).code
}

/** Validates exactly one placeholder before Babel expression substitution. */
export function requireOnePlaceholder(code: string, placeholder: string): void {
    const replacementCount = code.split(placeholder).length - 1
    if (replacementCount !== 1) {
        throw new Error(`Expected one placeholder ${placeholder}, found ${replacementCount}`)
    }
}
