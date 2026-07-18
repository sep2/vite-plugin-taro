import { createAppShell } from '../amphibious/bootstrap.ts'

App(createAppShell(() => import('../capsule/app.ts')))
