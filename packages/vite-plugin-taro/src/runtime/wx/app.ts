import { createAppShell } from './bootstrap.ts'

App(createAppShell(() => import('./app-module.ts')))
