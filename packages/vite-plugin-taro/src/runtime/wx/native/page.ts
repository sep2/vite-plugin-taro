import { createPageShell } from '../amphibious/bootstrap.ts'

// @ts-expect-error: The wx build resolves the route-specific Page module.
const loadPageModule = () => import('\0vpt:page-module')

Page(createPageShell(loadPageModule))
