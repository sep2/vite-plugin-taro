import { randomUUID } from 'node:crypto'
import { type PatchUpdate, renderHmrPatches } from './hmr-files.ts'

/** Abstracts the physical patches write; the engine owns the file destination. */
export type WritePatches = (content: string) => Promise<void>

/** Owns one build's unacknowledged patches and physical publish decision. */
export class PatchPublisher {
    private readonly writePatches: WritePatches
    private buildId: string | undefined

    /** Executable updates retained only until the runtime acknowledges physical delivery. */
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

    /** Removes the pending prefix covered by the runtime's Rolldown sequence receipt. */
    acknowledge(seq: number): string[] {
        let deliveredCount = 0
        while (deliveredCount < this.pendingPatches.length && this.pendingPatches[deliveredCount].seq <= seq) {
            deliveredCount++
        }
        return this.pendingPatches.splice(0, deliveredCount).map((patch) => patch.filename)
    }
}
