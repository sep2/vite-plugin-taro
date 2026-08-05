import { randomUUID } from 'node:crypto'
import { type HostPatch, renderHmrPatches } from './hmr-files.ts'

/** Abstracts the physical patches write; the engine owns the file destination. */
export type WritePatches = (content: string) => Promise<void>

/**
 * Owns the per-build patch history and the runtime's stored version — the two states the
 * write decision reads. All I/O is externalized: the rendered payload goes through the
 * injected WritePatches callback, so the class is pure and testable without the file system.
 */
export class PatchPublisher {
    private readonly writePatches: WritePatches
    private buildId: string | undefined
    private readonly patches: HostPatch[] = []

    /** The runtime's last reported stored version; the write suffix starts after it. */
    // The produce-write needs this position to render only the missing suffix: without it,
    // produce would have to write the full history (rejected) or wait for a report that can
    // only arrive after a write (deadlock). The report is the only source of this number.
    private knownVersion = 0

    // Explicit field assignment: node --test strips types and does not support parameter properties.
    constructor(writePatches: WritePatches) {
        this.writePatches = writePatches
    }

    /** True when the buildId belongs to the current full build. */
    isCurrentBuild(buildId: string): boolean {
        return buildId === this.buildId
    }

    /**
     * Begins a fresh full build: a new build identity, a reset history, and the runtime
     * position back to zero. Returns the new identity so the caller can write it into the
     * App metadata.
     */
    startBuild(): string {
        this.buildId = randomUUID()
        this.patches.length = 0
        this.knownVersion = 0
        return this.buildId
    }

    /**
     * Appends a batch of patches; publishes once when the runtime is behind.
     *
     * The produce-write is the loop's engine: the runtime only reports after a re-execution,
     * and a re-execution only happens after patches.js changes, so the first (and every)
     * write must come from here, triggered directly by the edit.
     */
    produce(patches: readonly HostPatch[]): void {
        this.patches.push(...patches)
        void this.publishIfBehind()
    }

    /**
     * Records the runtime's stored version; publishes the missing suffix when behind.
     *
     * The report-write is the catch-up path: a delayed report (network reordering, a missed
     * re-execution) re-publishes whatever the runtime has not acknowledged yet. Storing is
     * idempotent, so the redundant refresh it causes is harmless.
     *
     * Returns true when the version went backward — a fresh App heap (DevTools restart)
     * starts at zero, so the caller can trigger a full rebuild instead of replaying patches.
     */
    report(version: number): boolean {
        const restarting = version < this.knownVersion
        this.knownVersion = version
        void this.publishIfBehind()
        return restarting
    }

    /** Writes the missing suffix when the runtime's stored version is behind. */
    private async publishIfBehind(): Promise<void> {
        if (this.buildId === undefined || this.knownVersion >= this.patches.length) {
            return
        }
        await this.writePatches(renderHmrPatches(this.buildId, this.patches, this.knownVersion))
    }
}
