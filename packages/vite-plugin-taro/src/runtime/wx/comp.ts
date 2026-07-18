import { createComponentShell } from './bootstrap.ts'

Component(createComponentShell(() => import('./comp-module.ts')))
