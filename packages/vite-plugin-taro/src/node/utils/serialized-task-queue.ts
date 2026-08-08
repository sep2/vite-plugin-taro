/** Runs asynchronous tasks in insertion order without letting one failure block later work. */
export class SerializedTaskQueue {
    /** Mutable promise tail confines ordering state to this queue. */
    private tail: Promise<void> = Promise.resolve()
    private readonly reportError: (operation: string, error: unknown) => void

    constructor(reportError: (operation: string, error: unknown) => void) {
        this.reportError = reportError
    }

    /** Schedules a background task and reports its failure. */
    enqueue(operation: string, task: () => void | PromiseLike<void>): void {
        void this.run(task).catch((error) => {
            this.reportError(operation, error)
        })
    }

    /** Schedules a task whose result and failure belong to the caller. */
    run<Result>(task: () => Result | PromiseLike<Result>): Promise<Result> {
        const result = this.tail.then(task)
        this.tail = result.then(
            () => undefined,
            () => undefined
        )
        return result
    }

    /** Waits for every task that was queued when this method was called. */
    async waitForIdle(): Promise<void> {
        await this.tail
    }
}
