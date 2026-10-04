// biome-ignore assist/source/organizeImports: VPT runtime must initialize before the Page capsule.
import { Page } from '../amphibious/vpt.ts'
import pageConfig from '\0vpt:page-capsule'

Page(pageConfig)
