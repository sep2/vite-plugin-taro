import { type PluginObject, type PluginTarget, transformSync, types } from '@babel/core'
import type { Rolldown } from 'vite'
import type { VitePluginTaroOptions, VitePluginTaroPageOption } from '../../../options.ts'
import { createPageComponentImportPath } from '../../utils/modules.ts'
import { createAppConfig } from '../../utils/project-config.ts'

const appConfigPlaceholder = '__VITE_PLUGIN_TARO_H5_APP_CONFIG__'
const routesPlaceholder = '__VITE_PLUGIN_TARO_H5_ROUTES__'

/** Specializes the physical H5 App for one configured project. */
export function transformH5App({
    code,
    id,
    options,
    projectRoot
}: {
    code: string
    id: string
    options: VitePluginTaroOptions
    projectRoot: string
}): { code: string; map: Rolldown.ExistingRawSourceMap } {
    const replacements = {
        config: 0,
        routes: 0
    }

    const appModule = transformSync(code, {
        babelrc: false,
        compact: false,
        configFile: false,
        filename: id,
        plugins: [
            createH5AppTransform({
                options,
                projectRoot,
                replacements
            }) as PluginTarget
        ],
        sourceFileName: id,
        sourceMaps: true,
        sourceType: 'module'
    })

    if (!appModule?.code || !appModule.map) {
        throw new Error(`Failed to transform H5 App ${id}`)
    }
    if (replacements.config !== 1 || replacements.routes !== 1) {
        throw new Error(`Expected one config and routes placeholder in H5 App ${id}`)
    }

    return {
        code: appModule.code,
        map: appModule.map as Rolldown.ExistingRawSourceMap
    }
}

/** Creates the H5 App placeholder transform. */
function createH5AppTransform({
    options,
    projectRoot,
    replacements
}: {
    options: VitePluginTaroOptions
    projectRoot: string
    replacements: { config: number; routes: number }
}): PluginObject {
    return {
        name: 'vite-plugin-taro:transform-h5-app',
        visitor: {
            Identifier(identifierPath) {
                if (!identifierPath.isReferencedIdentifier()) {
                    return
                }
                if (identifierPath.node.name === appConfigPlaceholder) {
                    identifierPath.replaceWith(
                        types.valueToNode({
                            router: {},
                            ...createAppConfig(options)
                        })
                    )
                    replacements.config++
                } else if (identifierPath.node.name === routesPlaceholder) {
                    identifierPath.replaceWith(
                        types.arrayExpression(
                            options.pages.map((page) => {
                                return createRoute({ page, projectRoot })
                            })
                        )
                    )
                    replacements.routes++
                }
            }
        }
    }
}

/** Creates one lazy H5 route object. */
function createRoute({
    page,
    projectRoot
}: {
    page: VitePluginTaroPageOption
    projectRoot: string
}): ReturnType<typeof types.objectExpression> {
    const pageComponentPath = createPageComponentImportPath({
        pagePath: page.path,
        projectRoot
    })
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
