import { execFile } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { promisify } from 'node:util'
import type { LoanHmrFixture } from './hmr-fixture.ts'

export type LoanHmrDevTools = Readonly<{
    closeProject: () => Promise<void>
    inputElement: (selector: string, value: string) => Promise<void>
    navigate: (action: string, url: string | undefined) => Promise<void>
    openProject: () => Promise<void>
    readConsoleErrors: () => Promise<string>
    readCurrentPage: () => Promise<Readonly<{ path: string }>>
    readElement: (selector: string, action: ElementReadAction) => Promise<string>
    tapElement: (selector: string) => Promise<void>
}>

type ElementInteractionAction = 'input' | 'tap'
type ElementReadAction = 'outerWxml' | 'text' | 'value' | 'wxml'
type ToolParameters = Readonly<Record<string, string>>

const execFileAsync = promisify(execFile)
const commandTimeoutMilliseconds = 12_000
const devToolsClient = process.env.VPT_LOAN_HMR_DEVTOOLS_CLIENT ?? 'Pi'

export function createLoanHmrDevTools(fixture: LoanHmrFixture): LoanHmrDevTools {
    const runTool = (tool: string, parameters: ToolParameters) => executeTool(fixture, tool, parameters)
    const interactWithElement = async (
        selector: string,
        action: ElementInteractionAction,
        value: string | undefined
    ): Promise<void> => {
        const parameters: ToolParameters =
            value === undefined
                ? { selector: selector, action: action }
                : { selector: selector, action: action, value: value }
        const result = await runTool('automation_element_action', parameters)
        if (!isRecord(result) || result.success !== true) {
            throw new Error(`Expected successful interaction result for ${selector}:${action}`)
        }
    }

    return {
        closeProject: async () => {
            await runTool('close_project_window', {})
        },
        inputElement: (selector, value) => interactWithElement(selector, 'input', value),
        navigate: async (action, url) => {
            const parameters: ToolParameters = url === undefined ? { action: action } : { action: action, url: url }
            await runTool('automation_navigate', parameters)
        },
        openProject: async () => {
            await runToolWithTimeout(fixture, 'open_project_window', {}, 30_000)
            await delay(10_000)
            try {
                await runTool('automation_runtime_info', { action: 'currentPage' })
            } catch {
                // A clean project can finish compilation just after the automator's first response deadline.
                await runTool('automation_runtime_info', { action: 'currentPage' })
            }
        },
        readConsoleErrors: async () => {
            const result = await runTool('get_app_console_content', {
                command: "grep -i -E 'error|warn|exception'"
            })
            if (typeof result !== 'string') {
                throw new Error('Expected DevTools console text')
            }
            return result
                .split('\n')
                .filter((line) => line.length > 0 && isErrorConsoleEntry(line))
                .join('\n')
        },
        readCurrentPage: async () => {
            const result = await runTool('automation_runtime_info', { action: 'currentPage' })
            if (!isRecord(result) || !isRecord(result.currentPage) || typeof result.currentPage.path !== 'string') {
                throw new Error('Expected current DevTools page')
            }
            return { path: result.currentPage.path }
        },
        readElement: async (selector, action) => {
            const result = await runTool('automation_element_action', { selector: selector, action: action })
            if (typeof result !== 'string') {
                throw new Error(`Expected string result for ${selector}:${action}`)
            }
            return result
        },
        tapElement: (selector) => interactWithElement(selector, 'tap', undefined)
    }
}

async function executeTool(fixture: LoanHmrFixture, tool: string, parameters: ToolParameters): Promise<unknown> {
    return runToolWithTimeout(fixture, tool, parameters, commandTimeoutMilliseconds)
}

async function runToolWithTimeout(
    fixture: LoanHmrFixture,
    tool: string,
    parameters: ToolParameters,
    timeoutMilliseconds: number
): Promise<unknown> {
    const parameterArguments = Object.entries(parameters).flatMap(([name, value]) => [`--${name}`, value])
    const { stdout } = await execFileAsync(
        'wechatide',
        ['-c', devToolsClient, '-t', tool, '--project', fixture.outDir, ...parameterArguments],
        {
            cwd: fixture.repositoryRoot,
            env: process.env,
            timeout: timeoutMilliseconds,
            maxBuffer: 10 * 1024 * 1024
        }
    )
    const response = parseToolResponse(stdout)
    if (response.ok !== true) {
        throw new Error(`wechatide ${tool} failed: ${stdout}`)
    }
    return response.result
}

function isErrorConsoleEntry(line: string): boolean {
    const entry: unknown = JSON.parse(line)
    return Array.isArray(entry) && (entry[0] === '[error]' || entry[0] === '[warn]')
}

function parseToolResponse(output: string): Record<string, unknown> {
    const jsonStart = output.indexOf('{')
    if (jsonStart < 0) {
        throw new Error(`wechatide returned no JSON: ${output}`)
    }
    const response: unknown = JSON.parse(output.slice(jsonStart))
    if (!isRecord(response)) {
        throw new Error(`wechatide returned invalid JSON: ${output}`)
    }
    return response
}

export async function waitFor(
    predicate: () => boolean | Promise<boolean>,
    timeoutMilliseconds: number,
    intervalMilliseconds: number
): Promise<void> {
    const startedAt = Date.now()
    while (!(await predicate())) {
        if (Date.now() - startedAt > timeoutMilliseconds) {
            throw new Error(`Timed out after ${timeoutMilliseconds}ms`)
        }
        await delay(intervalMilliseconds)
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null
}
