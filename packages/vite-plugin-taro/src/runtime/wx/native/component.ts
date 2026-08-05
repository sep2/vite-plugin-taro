import { loadCapsuleConfig } from '../amphibious/bootstrap.ts'

// This source import() only marks the eager Component capsule split; native rendering replaces it with System.importSync().
Component(loadCapsuleConfig('Component', () => import('../capsule/component.ts')))
