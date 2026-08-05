import { loadCapsuleConfig } from '../amphibious/bootstrap.ts'

// This source import() only marks the eager Page capsule split; native rendering replaces it with System.importSync().
// @ts-expect-error: The wx build resolves the route-specific Page capsule.
const loadPageCapsule = () => import('\0vpt:page-capsule')

Page(loadCapsuleConfig('Page', loadPageCapsule))
