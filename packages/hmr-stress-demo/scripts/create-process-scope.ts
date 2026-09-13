import type { SpawnOptionsWithoutStdio } from 'node:child_process'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

/** Owns subprocess groups so wrapper exits cannot orphan their workers. */
export function createProcessScope() {
    // Retain wrappers until cleanup: their descendants can outlive the wrapper's exit.
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
        return child
    }

    function signal(pid: number, value: NodeJS.Signals | 0): boolean {
        try {
            process.kill(process.platform === 'win32' ? pid : -pid, value)
            return true
        } catch (error) {
            if (error instanceof Error && 'code' in error) {
                if (error.code === 'ESRCH') {
                    return false
                }
                // EPERM is not evidence of absence. Keep polling an inaccessible or
                // exiting group; actual termination permission failures still throw.
                if (value === 0 && error.code === 'EPERM') {
                    return true
                }
            }
            throw error
        }
    }

    async function waitForGroupExit(pid: number): Promise<boolean> {
        const deadline = Date.now() + 2_000
        while (signal(pid, 0)) {
            if (Date.now() >= deadline) {
                return false
            }
            await delay(10)
        }
        return true
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
        // Wait for the entire group, not just its wrapper. On macOS an immediate second
        // signal can return EPERM while the last descendant is already exiting.
        if (!(await waitForGroupExit(pid))) {
            signal(pid, 'SIGKILL')
            if (!(await waitForGroupExit(pid))) {
                throw new Error(`Subprocess group ${pid} survived SIGKILL`)
            }
        }
        await exited
        children.delete(child)
    }

    async function close(): Promise<void> {
        const results = await Promise.allSettled([...children].map(stop))
        const errors = results.flatMap((result) => (result.status === 'rejected' ? [result.reason] : []))
        if (errors.length > 0) {
            throw new AggregateError(errors, 'Failed to terminate subprocess groups')
        }
    }

    return { start: start, stop: stop, close: close }
}
