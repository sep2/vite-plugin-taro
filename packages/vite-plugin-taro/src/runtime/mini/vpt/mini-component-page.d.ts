import type { MpInstance, PageInstance } from 'vite-plugin-taro-runtime/runtime/mini'

/** Component registration keeps Page methods separate from initial native attachment. */
export type MiniComponentPage = {
    methods: PageInstance
    lifetimes: { attached(this: PageInstance & MpInstance): void }
}
