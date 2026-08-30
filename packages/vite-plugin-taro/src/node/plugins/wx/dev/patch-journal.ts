import { randomUUID } from 'node:crypto'
import type { PatchPublication, PatchUpdate } from './hmr-protocol.ts'

type PublishPatches = (publication: PatchPublication) => Promise<void>

/**
 * Owns the cumulative sequence range between the host's published frontier and the runtime's applied frontier.
 *
 * For example, if the runtime has applied sequence 4:
 *
 * 1. produce([5, 6]) publishes [5, 6];
 * 2. produce([7]) before an application report publishes [5, 6, 7], so a mode may miss the first delivery safely;
 * 3. acknowledge(6) retains [7];
 * 4. produce([8]) then publishes [7, 8], exactly the suffix the runtime still needs.
 *
 * The host may advance Rolldown's published frontier immediately after each durable publication, but the journal prunes only
 * through the runtime's last successful ACK. Published and applied sequences are deliberately distinct: collapsing them would
 * make one missed delivery unrecoverable. The journal owns that gap and build identity while the mode owns representation.
 */
export class PatchJournal {
    private readonly publishPatches: PublishPatches

    /*
     * This mutable identity is the sole session authority for runtime reports and per-client Rolldown updates. startBuild rotates
     * it only after a successful complete output reaches the serialized host reducer. Delayed reports retain their original ID
     * and therefore fail isCurrentBuild instead of pruning or rebuilding the new session. An immutable constructor value cannot
     * represent full-build rotation, while deriving identity from patches would leave empty builds without a client ID.
     */
    private buildId: string | undefined

    /*
     * This mutable ordered suffix bridges two independent frontiers: Rolldown payloads become published after selected-mode
     * delivery, but entries remain here until the runtime acknowledges applying their sequence. Appending is lossless because
     * later patches are deltas; prefix removal is the only valid mutation because acknowledgements are monotonic frontiers. A
     * Set or latest-only value would lose duplicate filenames and intermediate factories, while immutable reconstruction would
     * copy the complete unacknowledged suffix for every editor burst.
     */
    private readonly pendingPatches: PatchUpdate[] = []

    // Explicit field assignment: node --test strips types and does not support parameter properties.
    constructor(publishPatches: PublishPatches) {
        this.publishPatches = publishPatches
    }

    /** Request-local view serialized synchronously when an interpreter socket reconnects; never retain it across host actions. */
    get current(): PatchPublication | undefined {
        if (this.buildId === undefined) {
            return undefined
        }
        return { buildId: this.buildId, patches: this.pendingPatches }
    }

    /** True when the buildId belongs to the current complete build. */
    isCurrentBuild(buildId: string): boolean {
        return buildId === this.buildId
    }

    /** Begins a fresh build and returns both sides of the client-session rotation. */
    startBuild(): Readonly<{ buildId: string; previousBuildId: string | undefined }> {
        const previousBuildId = this.buildId
        const buildId = randomUUID()
        this.buildId = buildId
        this.pendingPatches.length = 0
        return { buildId: buildId, previousBuildId: previousBuildId }
    }

    /**
     * Appends a Rolldown batch and publishes the complete range not yet applied by the runtime.
     *
     * Host action serialization guarantees this readonly view cannot be mutated by an ACK, build rotation, or later production
     * until publishPatches settles. Resolution proves only that the mode made the suffix durable, not that the App applied it; a
     * failed publication therefore leaves the appended range intact, and a successful one remains until an explicit ACK.
     */
    async produce(patches: readonly PatchUpdate[]): Promise<void> {
        if (this.buildId === undefined || patches.length === 0) {
            return
        }

        this.pendingPatches.push(...patches)

        await this.publishPatches({ buildId: this.buildId, patches: this.pendingPatches })
    }

    /**
     * Removes only the prefix covered by the runtime's successful application frontier.
     *
     * Publication must never call this method: retaining the gap between published and applied frontiers is what lets a mode
     * safely coalesce, replay, or miss an intermediate delivery without losing a factory required by the live App generation.
     */
    acknowledge(seq: number): void {
        /*
         * This local counter scans the monotonic prefix without allocating or invoking a callback for each patch. It exists only
         * long enough to supply splice's prefix length; pendingPatches remains the sole durable frontier and is mutated once.
         */
        let appliedCount = 0

        while (appliedCount < this.pendingPatches.length && this.pendingPatches[appliedCount].seq <= seq) {
            appliedCount++
        }

        this.pendingPatches.splice(0, appliedCount)
    }
}
