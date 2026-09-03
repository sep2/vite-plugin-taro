// App and Page shells activate independently; make Current.app initialization an explicit prerequisite for Page mount.
import './app.ts'

// @ts-expect-error: The Mini Program build replaces this private import with the configured Page component.
import PageComponent from '\0vpt:page-component'
import { createPageConfig } from './taro-runtime.ts'

/*
 * Generated Page templates invoke Taro's unchanged recursive component, whose input is one compact node selected by i.nn.
 * App JSX does not have that cardinality: it may return one or many top-level hosts, and the private Page outlet may occur at
 * any depth within them. vpt_fragment is therefore a native-template-only collection adapter. Its fixed nn selects a transparent
 * template that iterates cn while one surrounding component owns the Page-content boundary. Runtime projection markers relay
 * that content only through the App branch containing the outlet. Without the fragment, each App root would need a separate
 * recursive component and potential Page-content copy, or the component would need an App-specific collection mode.
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
