/** Runs recoverable background tasks in insertion order and reports failures without blocking later work. */
export class SerializedTaskQueue {
    private tail: Promise<void> = Promise.resolve()
    private readonly reportError: (operation: string, error: unknown) => void

    constructor(reportError: (operation: string, error: unknown) => void) {
        this.reportError = reportError
    }

    enqueue(operation: string, task: () => Promise<void>): void {
        this.tail = this.tail.then(task).catch((error) => {
            this.reportError(operation, error)
        })
    }

    /** Waits for every task that was queued when this method was called. */
    async waitForIdle(): Promise<void> {
        await this.tail
    }
}
