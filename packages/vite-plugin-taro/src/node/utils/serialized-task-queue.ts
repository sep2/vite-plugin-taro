/** Runs asynchronous tasks in insertion order. A rejected task stops the queue unless the task handles it. */
export class SerializedTaskQueue {
    private tail: Promise<void> = Promise.resolve()

    enqueue(task: () => Promise<void>): Promise<void> {
        const work = this.tail.then(task)
        this.tail = work
        return work
    }

    /** Waits for every task that was queued when this method was called. */
    async waitForIdle(): Promise<void> {
        await this.tail
    }
}
