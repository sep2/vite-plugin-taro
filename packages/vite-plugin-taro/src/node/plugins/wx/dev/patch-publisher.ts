import { randomUUID } from 'node:crypto'
import { type HostPatch, renderHmrPatches } from './hmr-files.ts'

/**
 * Abstracts the held HTTP response; the engine closes over the real ServerResponse.
 * The response carries no information — publishIfBehind runs on every hold, so the sync
 * is position-independent and the response is only a latch release.
 */
export type Release = () => void

/** Abstracts the physical patches write; the engine owns the file destination. */
export type WritePatches = (content: string) => Promise<void>

/**
 * Owns the per-build patch history and the held version poll — the two states the write
 * decision reads. All I/O is externalized: the rendered payload goes through the injected
 * WritePatches callback and the held response through the injected Release callback, so the
 * class is pure and testable without HTTP or the file system.
 */
export class PatchPublisher {
    private readonly writePatches: WritePatches
    private buildId: string | undefined
    private readonly patches: HostPatch[] = []
    private held: Readonly<{ version: number; release: Release }> | undefined

    // Explicit field assignment: node --test strips types and does not support parameter properties.
    constructor(writePatches: WritePatches) {
        this.writePatches = writePatches
    }

    /** True when the buildId belongs to the current full build. */
    isCurrentBuild(buildId: string): boolean {
        return buildId === this.buildId
    }

    /**
     * Begins a fresh full build: a new build identity, a reset history, and any stale hold
     * released. Returns the new identity so the caller can write it into the App metadata.
     */
    startBuild(): string {
        this.buildId = randomUUID()
        this.patches.length = 0
        this.release()
        return this.buildId
    }

    /** Appends a batch of patches; publishes once when a held report is behind. */
    produce(patches: readonly HostPatch[]): void {
        this.patches.push(...patches)
        void this.publishIfBehind()
    }

    /** Holds the runtime's version report; publish happens when a patch lands while held. */
    hold(version: number, release: Release): void {
        this.release()
        this.held = { version, release }
        void this.publishIfBehind()
    }

    /** Writes the missing suffix when the held version is behind, then releases the poll. */
    private async publishIfBehind(): Promise<void> {
        const held = this.held
        // held implies a current build: hold() is only reached through isCurrentBuild. The
        // buildId guard is still needed for the type narrow.
        if (this.buildId === undefined || !held || held.version >= this.patches.length) {
            return
        }
        await this.writePatches(renderHmrPatches(this.buildId, this.patches, held.version))
        this.release()
    }

    private release(): void {
        if (this.held) {
            const { release } = this.held
            this.held = undefined
            release()
        }
    }
}
