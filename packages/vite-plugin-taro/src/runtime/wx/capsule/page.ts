// App and Page shells activate independently; make Current.app initialization an explicit prerequisite for Page mount.
import './app.ts'

// @ts-expect-error: The wx build replaces this private import with the configured Page component.
import PageComponent from '\0vpt:page-component'
import { createPageConfig } from './taro-runtime.ts'

declare const __VPT_PAGE_PATH__: string
declare const __VPT_PAGE_CONFIG__: Record<string, unknown>

/*
 * Generated Page WXML invokes Taro's unchanged recursive comp, whose input contract is one compact node selected by i.nn.
 * App JSX does not have that cardinality: it may return zero, one, or many top-level hosts, and the private Page outlet may
 * occur at any depth within them. vpt_fragment is therefore a WXML-only collection adapter. Its fixed nn selects a
 * transparent template that iterates cn while one surrounding comp carries the Page's default slot through the complete App
 * tree. Without it, Page WXML would need one comp—and one copy of the Page slot—for every App root, or comp would need an
 * App-specific collection mode.
 *
 * This record is not a Taro host: it has no Fiber, event source, ref, lifecycle, native element, or keyed parent collection.
 * It consequently needs no sid. Only cn is seeded and updated; nn remains the stable generic-template discriminator.
 */
const config = createPageConfig(
    PageComponent,
    __VPT_PAGE_PATH__,
    { app: { nn: 'vpt_fragment', cn: [] }, page: { cn: [] } },
    __VPT_PAGE_CONFIG__
)

export default config
