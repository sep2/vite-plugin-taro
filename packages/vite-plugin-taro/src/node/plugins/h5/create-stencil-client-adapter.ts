import type { WalkerEnter } from 'oxc-walker'
import type { RolldownMagicString } from 'rolldown'
import type { Plugin } from 'vite'
import { normalizeModuleId } from '../../utils/modules.ts'
import { transformWithOxcWalker } from '../../utils/oxc-transform.ts'
import { packageRequire } from '../../utils/packages.ts'

const stencilClientPath = packageRequire.resolve('@stencil/core/internal/client', {
    paths: [packageRequire.resolve('@tarojs/components/package.json')]
})
const normalizedStencilClientPath = normalizeModuleId(stencilClientPath)

/**
 * Creates the compiler-owned adaptation of Stencil's client style insertion.
 *
 * Taro components inject their styles through this internal client. Its default insertion point places those styles
 * after application CSS, allowing component defaults to override application rules. The adapter is registered in both
 * Vite's application pipeline and the independent dependency-optimization build: removing either registration leaves
 * production or development with an unadapted client. This explicit dual registration removes the former optimization
 * exclusion while keeping one transformation implementation.
 */
export function createStencilClientAdapter(): Plugin {
    return {
        name: 'vpt:h5-stencil-client',
        transform: adaptStencilClient
    }
}

/**
 * Applies the shared Stencil adaptation with one Oxc parse and one range edit.
 *
 * The physical module check is essential because the optimizer and application pipelines can
 * present query-suffixed or platform-normalized IDs. Transforming by source text alone could
 * modify user code that happens to contain the same insertion expression. Source maps remain
 * enabled because this adapter runs before Vite/Rolldown's later transforms in both pipelines;
 * dropping the map would attribute downstream diagnostics to the edited generated positions.
 */
export function adaptStencilClient(code: string, id: string) {
    if (normalizeModuleId(id) !== normalizedStencilClientPath) {
        return
    }

    return transformWithOxcWalker({
        code,
        filename: id,
        sourcemap: true,
        createVisitor: createStencilVisitor
    })
}

/**
 * Finds Stencil's exact default style insertion call and replaces only its insertion anchor.
 *
 * Stencil normally inserts `styleElm` before the first stylesheet link. During Vite development,
 * application CSS is commonly represented by a `<style>` element instead, so that link-only
 * lookup returns `null` and Taro component defaults are appended after application CSS. Those
 * defaults then override the application's selectors despite having the same specificity.
 *
 * Taro Stencil components are identified by the `sc-taro-` scope prefix. For those components,
 * the replacement anchors before the first `<style>` or stylesheet `<link>`, keeping component
 * defaults before application rules. The original link-only lookup is preserved for every other
 * Stencil component so VPT does not globally redefine upstream style-ordering behavior.
 */
function createStencilVisitor(editor: RolldownMagicString): WalkerEnter {
    return function enter(node) {
        if (
            node.type !== 'CallExpression' ||
            node.callee.type !== 'MemberExpression' ||
            node.callee.computed ||
            node.callee.object.type !== 'Identifier' ||
            node.callee.object.name !== 'styleContainerNode' ||
            node.callee.property.type !== 'Identifier' ||
            node.callee.property.name !== 'insertBefore'
        ) {
            return
        }

        // Match the complete upstream call, not merely `insertBefore`: range edits have no
        // generated-AST type safety, so a broad match could silently alter unrelated runtime
        // behavior when Stencil changes its implementation.
        const [style, query] = node.arguments
        const selector = query?.type === 'CallExpression' ? query.arguments[0] : undefined
        if (
            node.arguments.length !== 2 ||
            style?.type !== 'Identifier' ||
            style.name !== 'styleElm' ||
            query?.type !== 'CallExpression' ||
            query.callee.type !== 'MemberExpression' ||
            query.callee.computed ||
            query.callee.object.type !== 'Identifier' ||
            query.callee.object.name !== 'styleContainerNode' ||
            query.callee.property.type !== 'Identifier' ||
            query.callee.property.name !== 'querySelector' ||
            selector?.type !== 'Literal' ||
            selector.value !== 'link'
        ) {
            return
        }

        // Replace only the second argument expression. Preserving the surrounding Stencil
        // source avoids Babel-style whole-file regeneration and keeps its formatting, comments,
        // and source positions stable. Removing this edit restores the H5 cascade bug described
        // above; applying it unconditionally would change non-Taro Stencil components.
        editor.overwrite(
            query.start,
            query.end,
            'scopeId.startsWith("sc-taro-") ? styleContainerNode.querySelector("style,link[rel=\\"stylesheet\\"]") : styleContainerNode.querySelector("link")'
        )
    }
}
