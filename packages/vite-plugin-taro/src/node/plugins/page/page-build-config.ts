/* c8 ignore start -- Type-only module; validated by tsc. */
import type { InlineConfig } from 'vite'

/** Project resolution and compile-time constants shared with the page configuration build. */
export type PageBuildConfig = Readonly<Pick<InlineConfig, 'define' | 'resolve'> & { root: string }>
/* c8 ignore stop */
