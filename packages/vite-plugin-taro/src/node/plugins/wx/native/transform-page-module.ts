import { type PluginObject, type PluginTarget, transformSync, types } from '@babel/core'
import type { Rolldown } from 'vite'
import type { VitePluginTaroPageOption } from '../../../../options.ts'
import { createPageComponentImportPath } from '../../../utils/modules.ts'
import { pageComponentId } from './constant.ts'

const pagePathPlaceholder = '__VITE_PLUGIN_TARO_PAGE_PATH__'
const pageConfigPlaceholder = '__VITE_PLUGIN_TARO_PAGE_CONFIG__'

/** Specializes the real Page module for one configured route. */
export function transformPageModule({
    code,
    id,
    page,
    projectRoot
}: {
    code: string
    id: string
    page: VitePluginTaroPageOption
    projectRoot: string
}): { code: string; map: Rolldown.ExistingRawSourceMap } {
    const replacements = {
        component: 0,
        path: 0,
        config: 0
    }
    const pageComponentPath = createPageComponentImportPath({ pagePath: page.path, projectRoot })

    const pageModule = transformSync(code, {
        babelrc: false,
        compact: false,
        configFile: false,
        filename: id,
        plugins: [
            createPageModuleTransform({
                page,
                pageComponentPath,
                replacements
            }) as PluginTarget
        ],
        sourceFileName: id,
        sourceMaps: true,
        sourceType: 'module'
    })
    if (!pageModule?.code || !pageModule.map) {
        throw new Error(`Failed to transform Page module ${id}`)
    }
    if (replacements.component !== 1 || replacements.path !== 1 || replacements.config !== 1) {
        throw new Error(`Expected one component, path, and config placeholder in Page module ${id}`)
    }

    return {
        code: pageModule.code,
        map: pageModule.map as Rolldown.ExistingRawSourceMap
    }
}

/** Creates the route-specific Page-module AST transform. */
function createPageModuleTransform({
    page,
    pageComponentPath,
    replacements
}: {
    page: VitePluginTaroPageOption
    pageComponentPath: string
    replacements: { component: number; path: number; config: number }
}): PluginObject {
    return {
        name: 'vite-plugin-taro:transform-page-module',
        visitor: {
            ImportDeclaration(importPath) {
                if (importPath.node.source.value === pageComponentId) {
                    importPath.node.source = types.stringLiteral(pageComponentPath)
                    replacements.component++
                }
            },

            Identifier(identifierPath) {
                if (!identifierPath.isReferencedIdentifier()) {
                    return
                }
                if (identifierPath.node.name === pagePathPlaceholder) {
                    identifierPath.replaceWith(types.stringLiteral(page.path))
                    replacements.path++
                } else if (identifierPath.node.name === pageConfigPlaceholder) {
                    identifierPath.replaceWith(types.valueToNode(page.config))
                    replacements.config++
                }
            }
        }
    }
}
