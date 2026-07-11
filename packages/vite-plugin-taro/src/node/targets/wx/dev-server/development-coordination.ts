/** Full-build scheduling owned by one WX development session. */

type FullBuildPhase = 'idle' | 'scheduled' | 'building' | 'building-with-pending-request' | 'closed'

/** Coalesces trailing-edge requests while guaranteeing one full build at a time. */
export class FullBuildScheduler {
    private readonly delay: number
    private readonly runBuild: () => Promise<void>
    private readonly reportError: (error: unknown) => void
    private phase: FullBuildPhase = 'idle'
    private timer: NodeJS.Timeout | undefined
    private work: Promise<void> | undefined

    constructor(delay: number, runBuild: () => Promise<void>, reportError: (error: unknown) => void) {
        this.delay = delay
        this.runBuild = runBuild
        this.reportError = reportError
    }

    request(): void {
        switch (this.phase) {
            case 'closed':
                return
            case 'building':
                this.phase = 'building-with-pending-request'
                return
            case 'building-with-pending-request':
                return
            case 'idle':
            case 'scheduled':
                if (this.timer) clearTimeout(this.timer)
                this.phase = 'scheduled'
                this.timer = setTimeout(() => this.start(), this.delay)
        }
    }

    async close(): Promise<void> {
        if (this.phase === 'closed') {
            await this.work
            return
        }
        this.phase = 'closed'
        if (this.timer) clearTimeout(this.timer)
        this.timer = undefined
        await this.work
    }

    private start(): void {
        if (this.phase !== 'scheduled') return
        this.timer = undefined
        this.phase = 'building'
        this.work = this.runBuild()
            .catch(this.reportError)
            .finally(() => {
                this.work = undefined
                if (this.phase === 'closed') return
                const repeat = this.phase === 'building-with-pending-request'
                this.phase = 'idle'
                if (repeat) this.request()
            })
    }
}
