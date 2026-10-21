import {
    addLeadingSlash,
    CONTEXT_ACTIONS,
    Current,
    type createPageConfig,
    document,
    getOnHideEventKey,
    getOnReadyEventKey,
    getOnShowEventKey,
    invalidateNearestCtx,
    type MpInstance,
    PAGE_INIT,
    type PageInstance,
    perf,
    type TaroRootElement,
    window
} from 'vite-plugin-taro-runtime/runtime/mini'
import type { createPageIdentity } from './create-page-identity.ts'
import type { VptPageOptions } from './vpt-page-options.d.ts'

/** Mounts the supplied Page identity and calls onCommit before initial native presentation. */
export function mountPage(
    this: PageInstance & MpInstance,
    component: Parameters<typeof createPageConfig>[0],
    options: VptPageOptions,
    identity: ReturnType<typeof createPageIdentity>,
    onCommit?: () => void
) {
    this.$taroPath = identity.path
    this.$taroParams = identity.params
    this.config = options.config ?? {}

    const activate = () => {
        Current.page = this
        Current.router = {
            params: this.$taroParams!,
            path: addLeadingSlash(this.route || this.__route__ || options.path),
            $taroPath: this.$taroPath,
            onReady: getOnReadyEventKey(options.path),
            onShow: getOnShowEventKey(options.path),
            onHide: getOnHideEventKey(options.path),
            exitState: this.exitState
        }
    }

    activate()
    window.trigger(CONTEXT_ACTIONS.INIT, identity.path)
    perf.start(PAGE_INIT)

    Current.app!.mount!(component, identity.path, () => {
        const root = document.getElementById<TaroRootElement>(identity.path)!
        if (onCommit) {
            activate()
            onCommit()
        }
        root.ctx = this
        invalidateNearestCtx(root)
        root.performUpdate(true)
    })
}
