import { parseSync } from 'vite'

/** The HMR runtime starts before SystemJS. Its browser-only lazy request must not create a dependency on that loader. */
export function disableRolldownLazyLoading(code: string, filename: string): string {
    const { program } = parseSync(filename, code)
    const runtime = program.body
        .flatMap((statement) => (statement.type === 'VariableDeclaration' ? statement.declarations : []))
        .find(({ id }) => id.type === 'Identifier' && id.name === 'DevRuntime')?.init
    if (runtime?.type === 'ClassExpression') {
        for (const member of runtime.body.body) {
            if (
                member.type !== 'MethodDefinition' ||
                member.kind !== 'method' ||
                member.static ||
                member.computed ||
                member.key.type !== 'Identifier' ||
                member.key.name !== 'loadLazyChunk'
            ) {
                continue
            }
            // The installed runtime is JavaScript: a class method has a body and a template has a leading quasi.
            const statements = member.value.body!.body
            const statement = statements[0]
            const request = statement?.type === 'ReturnStatement' ? statement.argument : null
            if (
                statements.length === 1 &&
                request?.type === 'ImportExpression' &&
                request.source.type === 'TemplateLiteral' &&
                request.source.quasis[0]!.value.raw.startsWith('/@vite/lazy?')
            ) {
                return (
                    code.slice(0, request.start) +
                    "Promise.reject(new Error('Mini Program development uses an eager module graph.'))" +
                    code.slice(request.end)
                )
            }
        }
    }
    throw new Error(`Expected DevRuntime.loadLazyChunk() to return an import from /@vite/lazy in ${filename}`)
}
