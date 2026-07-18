import { types } from '@babel/core'
import type { VitePluginTaroOptions, VitePluginTaroPageOption } from '../../../options.ts'
import { createPageComponentImportPath } from '../../utils/modules.ts'
import { createAppConfig } from '../../utils/project-config.ts'
import { type AstTransformResult, replaceWithAst } from '../utils/babel.ts'

const appConfigPlaceholder = '__VITE_PLUGIN_TARO_H5_APP_CONFIG__'
const routesPlaceholder = '__VITE_PLUGIN_TARO_H5_ROUTES__'

/** Specializes the physical H5 App for one configured project. */
export async function transformH5App({
    code,
    id,
    options,
    projectRoot
}: {
    code: string
    id: string
    options: VitePluginTaroOptions
    projectRoot: string
}): Promise<AstTransformResult> {
    const transformed = await replaceWithAst(code, id, {
        [appConfigPlaceholder]: types.valueToNode({
            router: {},
            ...createAppConfig(options)
        }),
        [routesPlaceholder]: types.arrayExpression(
            options.pages.map((page) => {
                return createRoute({ page, projectRoot })
            })
        )
    })

    return { code: transformed.code, map: transformed.map }
}

/**
 * Creates one lazy H5 route shaped like:
 * {
 *     path: 'pages/home/index',
 *     load: async function (context, params) {
 *         const page = await import('/@fs/project/src/pages/home/index.tsx')
 *         return [page, context, params]
 *     },
 *     ...pageConfig
 * }
 */
function createRoute({
    page,
    projectRoot
}: {
    page: VitePluginTaroPageOption
    projectRoot: string
}): ReturnType<typeof types.objectExpression> {
    const pageComponentPath = createPageComponentImportPath({ pagePath: page.path, projectRoot })

    const load = types.functionExpression(
        null,
        [types.identifier('context'), types.identifier('params')],
        types.blockStatement([
            types.variableDeclaration('const', [
                types.variableDeclarator(
                    types.identifier('page'),
                    types.awaitExpression(types.importExpression(types.stringLiteral(pageComponentPath)))
                )
            ]),
            types.returnStatement(
                types.arrayExpression([
                    types.identifier('page'),
                    types.identifier('context'),
                    types.identifier('params')
                ])
            )
        ]),
        false,
        true
    )
    return types.objectExpression([
        types.objectProperty(types.identifier('path'), types.stringLiteral(page.path)),
        types.objectProperty(types.identifier('load'), load),
        types.spreadElement(types.valueToNode(page.config))
    ])
}
