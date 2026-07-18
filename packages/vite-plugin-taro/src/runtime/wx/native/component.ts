import { createComponentShell } from '../amphibious/bootstrap.ts'

Component(createComponentShell(() => import('../capsule/component.ts')))
