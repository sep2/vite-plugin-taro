import '../amphibious/bootstrap.ts'

// @ts-expect-error: The wx build resolves the route-specific Page capsule.
import pageConfig from '\0vpt:page-capsule'

Page(pageConfig)
