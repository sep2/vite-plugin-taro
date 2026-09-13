import type { SpawnOptionsWithoutStdio } from 'node:child_process'
import { spawn } from 'node:child_process'

/** Owns subprocess groups so wrapper exits cannot orphan their workers. */
export function createProcessScope() {
    // The scope tracks live groups until cleanup, including descendants of exited wrappers.
    const groups = new Set<number>()
    const children = new Set<ReturnType<typeof start>>()
    // Share termination when a command timeout and scope interruption overlap.
    const stopping = new WeakMap<ReturnType<typeof start>, Promise<void>>()

    function start(command: string, args: readonly string[], options: SpawnOptionsWithoutStdio) {
        const child = spawn(command, args, {
            ...options,
            detached: process.platform !== 'win32',
            stdio: ['ignore', 'pipe', 'pipe']
        })
        children.add(child)
        if (child.pid !== undefined) {
            groups.add(child.pid)
        }
        return child
    }

    function signal(pid: number, value: NodeJS.Signals): void {
        try {
            process.kill(process.platform === 'win32' ? pid : -pid, value)
        } catch (error) {
            if (!(error instanceof Error && 'code' in error && error.code === 'ESRCH')) {
                throw error
            }
        }
    }

    function stop(child: ReturnType<typeof start>): Promise<void> {
        const existing = stopping.get(child)
        if (existing) {
            return existing
        }
        const completion = terminate(child)
        stopping.set(child, completion)
        return completion
    }

    async function terminate(child: ReturnType<typeof start>): Promise<void> {
        if (child.pid === undefined) {
            children.delete(child)
            return
        }
        const pid = child.pid
        const exited =
            child.exitCode !== null || child.signalCode !== null
                ? Promise.resolve()
                : new Promise<void>((resolve) => child.once('exit', () => resolve()))
        signal(pid, 'SIGTERM')
        // Assigned by the synchronous Promise executor; finalization owns cancellation.
        let timeout: ReturnType<typeof setTimeout> | undefined
        const forced = new Promise<void>((_resolve, reject) => {
            timeout = setTimeout(() => {
                try {
                    signal(pid, 'SIGKILL')
                } catch (error) {
                    reject(error)
                }
            }, 2_000)
        })
        try {
            await Promise.race([exited, forced])
        } finally {
            clearTimeout(timeout)
            // An exited wrapper does not imply that its descendants have exited.
            signal(pid, 'SIGKILL')
            groups.delete(pid)
            children.delete(child)
        }
    }

    async function close(): Promise<void> {
        await Promise.all([...children].map(stop))
        for (const pid of groups) {
            signal(pid, 'SIGKILL')
        }
        groups.clear()
    }

    return { start: start, stop: stop, close: close }
}
