import { createPageShell } from '../amphibious/bootstrap.ts'

// @ts-expect-error: The wx build resolves the route-specific Page capsule.
const loadPageCapsule = () => import('\0vpt:page-capsule')

Page(createPageShell(loadPageCapsule))
