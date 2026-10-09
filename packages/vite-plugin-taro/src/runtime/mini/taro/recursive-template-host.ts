import { ensure } from '@tarojs/shared'
import type { RendererHost } from 'vite-plugin-taro-runtime/react'
import { document, FormElement, TaroElement, type TaroNode, type TaroText } from 'vite-plugin-taro-runtime/runtime/mini'

const pageOutlet = 'vpt_page_outlet'
const pageOutletBranch = 'vo'
const pageOutletSpineKey = Symbol('vptPageOutletSpine')

type AppContainer = TaroElement & {
    // Each App root retains only the outlet-to-root identities from its latest React commit.
    [pageOutletSpineKey]?: readonly TaroElement[]
}

/**
 * WX VPT Page outlet projection
 * -----------------------------
 * VPT retains one React ownership tree while WX exposes one independent setData surface per native Page. The singleton App
 * host records live in each Page's `app` data, the current Page records live in `page`, and Page WXML supplies its own template
 * as the default light-DOM slot of the virtual recursive App component. Taro restarts deep template recursion through nested
 * `comp` components. At every such native component boundary the slot must be forwarded only through the App branch that
 * contains the VPT Page outlet rendered for React's `{children}`: forwarding through all sibling branches creates duplicate
 * unnamed slot consumers, while forwarding through none loses the Page.
 *
 * `vo` is the compact, branch-local answer to "does this App subtree contain the VPT Page outlet?". WXML reads only `i.vo`,
 * so its decision is O(1) and it never scans descendants or receives Page data. The recursive host owns `vo` rather than Taro's
 * hydrate or root scheduler because React's commit boundary is the first point where every host mutation has completed and
 * the final parent chain is authoritative. TaroElement already supports arbitrary properties: setAttribute updates
 * node.props and queues the normal granular `app.*.vo` path. Structural Taro payloads are lazy functions flushed by setTimeout,
 * so they run after resetAfterCommit and naturally serialize the same final `vo` props. There is consequently no
 * projection-specific hydration mode, update-path translation, or full App snapshot.
 *
 * High-level commit flow:
 * 1. React applies all Taro host insertions, removals, and reparenting synchronously.
 * 2. resetAfterCommit obtains the unique VPT Page outlet and walks its element parents from that outlet to the App root.
 * 3. The unchanged root-side suffix is skipped; old leaf-side nodes receive vo=false and new ones receive vo=true.
 * 4. Ordinary Taro attribute updates join structural updates in the already scheduled App batch.
 * 5. Lazy hydration observes node.props.vo, and the App batch fans out unchanged to every retained native Page.
 *
 * The App root stores the only persistent projection state as a VPT Page outlet-to-root node array. It contains O(D)
 * references, where D is outlet depth, so index 0 is the outlet represented by the latest queued native batch. A normal commit
 * performs an O(D) parent walk and raw array comparison and emits no native data when the spine is unchanged. A move touches
 * only the leaf-side portions outside the common root-side suffix and never depends on total App size W or Page size. React
 * can replace a host when moving it across parents; only then (and during initialization) a single O(W) search finds the new
 * VPT Page outlet. WXML still performs one constant-time boolean check per recursive boundary.
 */

/** Finds the VPT Page outlet only during initialization or after React replaced the cached outlet host. */
function findPageOutlet(node: TaroNode): TaroElement | undefined {
    if (node instanceof TaroElement && node.nodeName === pageOutlet) {
        return node
    }
    for (const child of node.childNodes) {
        const outlet = findPageOutlet(child)
        if (outlet) {
            return outlet
        }
    }
}

/**
 * Builds the final ancestor identity array from the VPT Page outlet to the App root.
 * A found or still-connected outlet has an element parent chain ending at this App root.
 */
function collectPageOutletSpine(container: TaroElement, outlet: TaroElement): TaroElement[] {
    // Fill this local array in parent-link order, then retain it unchanged on the App root.
    const spine: TaroElement[] = []
    for (let node = outlet; node !== container; node = node.parentElement!) {
        spine.push(node)
    }
    return spine
}

/** Reconciles VPT Page outlet branch membership through ordinary Taro host props after one complete React commit. */
function reconcilePageOutletSpine(container: AppContainer): void {
    // Other React roots, including standalone Page/component roots, do not own the singleton VPT App-view projection.
    if (container.parentNode?.nodeName !== 'container') {
        return
    }
    const previousSpine = container[pageOutletSpineKey] ?? []
    const previousOutlet = previousSpine[0]
    /*
     * Reuse the cached VPT Page outlet while it remains under this App root. Cross-parent React reconciliation may replace
     * the host rather than reparent its Taro node, so a detached cache entry requires one search of the committed tree.
     */
    const outlet = previousOutlet && previousOutlet._root === container ? previousOutlet : findPageOutlet(container)
    ensure(outlet !== undefined, 'App must render children exactly once.')
    const currentSpine = collectPageOutletSpine(container, outlet)

    /*
     * VPT Page outlet parent chains are stored outlet-to-root, so equal nodes form a root-side suffix. These mutable indexes
     * walk that suffix once without iterator, callback, Set, or intermediate-array allocation; the remaining prefixes are the
     * only candidates whose branch marker can differ.
     */
    let previousIndex = previousSpine.length - 1
    let currentIndex = currentSpine.length - 1
    while (previousIndex >= 0 && currentIndex >= 0 && previousSpine[previousIndex] === currentSpine[currentIndex]) {
        previousIndex--
        currentIndex--
    }
    /*
     * Detached old nodes are already removed by their parent's structural payload. Surviving nodes in the changed old prefix
     * still have native records, so clear their marker through Taro's ordinary attribute queue.
     */
    for (let index = 0; index <= previousIndex; index++) {
        const node = previousSpine[index]
        if (node._root === container) {
            node.setAttribute(pageOutletBranch, false)
        }
    }
    // Write the changed current prefix after clearing the old prefix so any surviving moved identity ends with vo=true.
    for (let index = 0; index <= currentIndex; index++) {
        currentSpine[index].setAttribute(pageOutletBranch, true)
    }
    // This is the sole persistent VPT projection state: the ancestor identities in the latest queued native App batch.
    container[pageOutletSpineKey] = currentSpine
}

/** Taro node creation and recursive Page projection used by the shared React renderer. */
const recursiveTemplateHost: RendererHost<TaroElement, object, TaroElement, TaroText> = {
    createElement(_container, _context, type) {
        return document.createElement(type)
    },
    createText(_container, _context, text) {
        return document.createTextNode(text)
    },
    isFormElement(element) {
        return element instanceof FormElement
    },
    /*
     * React calls this after host mutations. Taro's lazy structural payloads observe the final outlet markers when its
     * existing native update batch is serialized.
     */
    afterCommit: reconcilePageOutletSpine
}

export default recursiveTemplateHost
