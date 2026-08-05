import { loadCapsuleConfig } from '../amphibious/bootstrap.ts'

// This source import() only marks the eager App capsule split; native rendering replaces it with System.importSync().
App(loadCapsuleConfig('App', () => import('../capsule/app.ts')))
