import { randomUUID } from 'node:crypto'
import { type PatchUpdate, renderHmrPatches } from './hmr-files.ts'

/** Abstracts the physical patches write; the engine owns the file destination. */
export type WritePatches = (content: string) => Promise<void>

/** Owns the cumulative range between the host's published frontier and the runtime's applied frontier. */
export class PatchPublisher {
    private readonly writePatches: WritePatches
    private buildId: string | undefined

    /** Executable updates retained until the runtime confirms successful application. */
    private readonly pendingPatches: PatchUpdate[] = []

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
        this.pendingPatches.length = 0
        return { buildId, previousBuildId }
    }

    /** Appends a Rolldown batch and publishes every unacknowledged patch. */
    async produce(patches: readonly PatchUpdate[]): Promise<void> {
        if (this.buildId === undefined || patches.length === 0) return
        this.pendingPatches.push(...patches)
        await this.writePatches(renderHmrPatches(this.buildId, this.pendingPatches))
    }

    /** Removes the pending prefix covered by the runtime's applied sequence. */
    acknowledge(seq: number): void {
        let appliedCount = 0
        while (appliedCount < this.pendingPatches.length && this.pendingPatches[appliedCount].seq <= seq) {
            appliedCount++
        }
        this.pendingPatches.splice(0, appliedCount)
    }
}
