import { randomUUID } from 'node:crypto'
import { type PatchUpdate, renderHmrPatches } from './hmr-files.ts'

/** Abstracts the physical patches write; the engine owns the file destination. */
export type WritePatches = (content: string) => Promise<void>

/** Owns one build's patch history, runtime position, and physical publish decision. */
export class PatchPublisher {
    private readonly writePatches: WritePatches
    private buildId: string | undefined
    private readonly patches: PatchUpdate[] = []

    /** Runtime delivery position; the next physical write begins after it. */
    private knownVersion = 0

    // Explicit field assignment: node --test strips types and does not support parameter properties.
    constructor(writePatches: WritePatches) {
        this.writePatches = writePatches
    }

    /** True when the buildId belongs to the current full build. */
    isCurrentBuild(buildId: string): boolean {
        return buildId === this.buildId
    }

    /** Begins a fresh build and returns both sides of the client-session rotation. */
    startBuild(): Readonly<{ buildId: string; previousBuildId: string | undefined }> {
        const previousBuildId = this.buildId
        const buildId = randomUUID()
        this.buildId = buildId
        this.patches.length = 0
        this.knownVersion = 0
        return { buildId, previousBuildId }
    }

    /** Appends a batch and publishes the suffix the runtime has not acknowledged. */
    async produce(patches: readonly PatchUpdate[]): Promise<void> {
        this.patches.push(...patches)
        if (this.buildId === undefined || this.knownVersion >= this.patches.length) return
        await this.writePatches(renderHmrPatches(this.buildId, this.patches, this.knownVersion))
    }

    /**
     * Advances the runtime's stored version and returns the newly delivered Rolldown files.
     * The host commits those filenames to the engine's per-client ship map. Delayed reports
     * cannot move the monotonic delivery position backwards.
     */
    report(version: number): string[] {
        if (!Number.isSafeInteger(version) || version < 0 || version > this.patches.length) {
            throw new Error('Cannot report an invalid WX patch version.')
        }
        if (version <= this.knownVersion) {
            return []
        }

        const previousVersion = this.knownVersion
        this.knownVersion = version
        return this.patches.slice(previousVersion, version).map((patch) => patch.filename)
    }
}
