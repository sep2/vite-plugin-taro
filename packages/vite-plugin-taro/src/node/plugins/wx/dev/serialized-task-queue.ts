/**
 * Runs asynchronous tasks in insertion order while allowing callers to observe each task's own result.
 *
 * A rejected task does not poison the queue: its returned promise still rejects, but later tasks start after that failure
 * has settled. This is important for public-file watching, where one failed copy must be reported without permanently
 * disabling synchronization for subsequent events.
 */
export class SerializedTaskQueue {
    private tail: Promise<void> = Promise.resolve()

    enqueue<T>(task: () => T | PromiseLike<T>): Promise<T> {
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
