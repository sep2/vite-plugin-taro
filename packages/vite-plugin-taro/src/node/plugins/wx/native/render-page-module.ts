import path from 'node:path'
import type { VitePluginTaroPageOption } from '../../../../options.ts'
import { appModulePath, taroRuntimePath } from './constant.ts'

/** Renders one route-specific Page module. */
export function renderPageModule(page: VitePluginTaroPageOption, projectRoot: string): string {
    const pageComponentPath = path.resolve(projectRoot, 'src', `${page.path}.tsx`)

    return `import ${JSON.stringify(appModulePath)}
import { createPageConfig } from ${JSON.stringify(taroRuntimePath)}
import PageComponent from ${JSON.stringify(pageComponentPath)}

export default createPageConfig(PageComponent, ${JSON.stringify(page.path)}, undefined, ${JSON.stringify(page.config)})`
}
