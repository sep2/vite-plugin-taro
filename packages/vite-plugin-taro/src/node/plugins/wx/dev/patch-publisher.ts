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

    /** Appends a batch of patches; publishes once when the runtime is behind. */
    produce(patches: readonly HostPatch[]): void {
        this.patches.push(...patches)
        void this.publishIfBehind()
    }

    /** Records the runtime's stored version; publishes the missing suffix when behind. */
    report(version: number): void {
        this.knownVersion = version
        void this.publishIfBehind()
    }

    /** Writes the missing suffix when the runtime's stored version is behind. */
    private async publishIfBehind(): Promise<void> {
        if (this.buildId === undefined || this.knownVersion >= this.patches.length) {
            return
        }
        await this.writePatches(renderHmrPatches(this.buildId, this.patches, this.knownVersion))
    }
}
