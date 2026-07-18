import type { Rolldown } from 'vite'
import { isTransportModule } from '../native/is-native-module.ts'

export type PackageLocation = { kind: 'main' } | { kind: 'subpackage'; root: string }
export type LoadMode = 'sync' | 'async'

type ChunkInfo = Pick<Rolldown.PreRenderedChunk, 'moduleIds'>

const mainPackage: PackageLocation = { kind: 'main' }

/** Creates the package-placement planner. The initial implementation places every chunk in the main package. */
export function createPlacer() {
    return {
        /** Preserves exact native entries while allowing transport to participate in content hashing. */
        entryFileNames(chunk: Rolldown.PreRenderedChunk): string {
            return isTransportModule(chunk) ? 'assets/[name]-[hash].js' : '[name]'
        },

        /** Places the initial shared and dynamic chunk graph in main-package assets. */
        chunkFileNames(): string {
            return 'assets/[name]-[hash].js'
        },

        /** Returns the physical package selected for one chunk. */
        locateChunk(_chunk: ChunkInfo): PackageLocation {
            return mainPackage
        },

        /** Main transport can synchronously load every chunk in the initial placement. */
        getLoadMode(_chunk: ChunkInfo): LoadMode {
            return 'sync'
        }
    }
}
