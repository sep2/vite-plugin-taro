import { randomUUID } from 'node:crypto'
import { type PatchUpdate, renderHmrPatches } from './hmr-files.ts'

/** Abstracts the physical patches write; the engine owns the file destination. */
type WritePatches = (content: string) => Promise<void>

/**
 * Owns the cumulative sequence range between the host's published frontier and the runtime's applied frontier.
 *
 * For example, if the runtime has applied sequence 4:
 *
 * 1. produce([5, 6]) writes [5, 6];
 * 2. produce([7]) before an application report writes [5, 6, 7], so DevTools may miss the first file event safely;
 * 3. acknowledge(6) retains [7];
 * 4. produce([8]) then writes [7, 8], exactly the suffix the runtime still needs.
 *
 * The host may advance Rolldown's published frontier through 8 immediately after those writes, but this history is pruned only
 * through 6 until the runtime reports successful application. Published sequence and applied sequence are deliberately distinct.
 */
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

    /**
     * Appends a Rolldown batch and publishes the complete range not yet applied by the runtime.
     *
     * Resolution means the cumulative JavaScript generation is physically visible. The host may then advance Rolldown's
     * published frontier immediately; pendingPatches remains intact until an application report proves the runtime caught up.
     */
    async produce(patches: readonly PatchUpdate[]): Promise<void> {
        if (this.buildId === undefined || patches.length === 0) {
            return
        }

        this.pendingPatches.push(...patches)

        await this.writePatches(renderHmrPatches(this.buildId, this.pendingPatches))
    }

    /**
     * Removes only the prefix covered by the runtime's successful application frontier. Publication alone never calls this:
     * retaining the gap between published and applied frontiers is what lets DevTools safely miss intermediate file events.
     */
    acknowledge(seq: number): void {
        let appliedCount = 0

        while (appliedCount < this.pendingPatches.length && this.pendingPatches[appliedCount].seq <= seq) {
            appliedCount++
        }

        this.pendingPatches.splice(0, appliedCount)
    }
}
