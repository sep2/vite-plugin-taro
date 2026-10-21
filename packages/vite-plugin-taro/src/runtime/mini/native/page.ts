// Initialize the shared runtime before activating the Page capsule.
import '../amphibious/bootstrap.ts'

import pageConfig from '\0vpt:page-capsule'

const registerPage = 'methods' in pageConfig ? Component : Page

registerPage(pageConfig)
