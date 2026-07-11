/** Generic asynchronous coordination helpers for Node-side plugin services. */
export class SerializedTaskQueue {
    private readonly reportError: (error: unknown) => void
    private tail = Promise.resolve()

    constructor(reportError: (error: unknown) => void) {
        this.reportError = reportError
    }

    enqueue(task: () => Promise<void>): Promise<void> {
        const work = this.tail.then(task)
        this.tail = work.catch(this.reportError)
        return work
    }

    async waitForIdle(): Promise<void> {
        await this.tail
    }
}
