import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'
import { type LoanHmrDevTools, waitFor } from './hmr-devtools.ts'
import { type LoanHmrFixture, replaceOnce } from './hmr-fixture.ts'

type HmrContext = Readonly<{
    devTools: LoanHmrDevTools
    fixture: LoanHmrFixture
}>

type SourceEdit = Readonly<{
    apply: (source: string) => string
    file: string
}>

type EditFlow = Readonly<{
    edits: readonly SourceEdit[]
    name: string
}>

type PreparedEdit = Readonly<{
    edit: SourceEdit
    original: string
}>

const calculatorMarker = 'src/pages/calculator/hmr-marker.ts'
const monthlyMarker = 'src/pages/calculator/monthly-payments/hmr-marker.ts'
const historyMarker = 'src/pages/calculator/history/hmr-marker.ts'
const calculatorRoute = 'pages/calculator/index'
const monthlyRoute = 'pages/calculator/monthly-payments/index'
const historyRoute = 'pages/calculator/history/index'
const initialLoanValue = '888'
const primaryInput = '#loan-input-loanAmount'

/** Exercises stateful Page replacement across component, overlay, navigation, burst and recovery boundaries. */
export async function runLoanHmrCases(context: HmrContext): Promise<void> {
    await context.devTools.navigate('reLaunch', `/${calculatorRoute}`)
    await waitForMarker(context, calculatorMarker, 'baseline')
    await waitForElement(context, primaryInput)
    await context.devTools.element(primaryInput, 'input', initialLoanValue)
    await waitFor(
        async () => (await context.devTools.element(primaryInput, 'value', undefined)) === initialLoanValue,
        5_000,
        75
    )
    await context.devTools.element('#loan-submit', 'tap', undefined)
    await waitForElement(context, '#loan-result-header')

    await runIsolatedPageFlow(context)
    await runCalculatorFlows(context)
    await runOverlayFlows(context)
    await runNavigationFlows(context)
    await runRecoveryFlow(context)
    await runNormalRemountFlow(context)
    assert.equal(await context.devTools.readConsoleErrors(), '')
}

async function runIsolatedPageFlow(context: HmrContext): Promise<void> {
    const file = 'src/pages/calculator/index.tsx'
    const original = await context.fixture.read(file)
    try {
        await context.fixture.write(file, replaceOnce(original, 'direct-page-baseline', 'direct-page-updated'))
        await waitForElementText(context, '#loan-direct-page-probe', 'direct-page-updated')
        await assertCalculatorState(context)
    } finally {
        await context.fixture.write(file, original)
    }
    await waitForElementText(context, '#loan-direct-page-probe', 'direct-page-baseline')
    await assertCalculatorState(context)
    console.log('[loan-hmr] 00-isolated-page-self-update passed')
}

async function runCalculatorFlows(context: HmrContext): Promise<void> {
    const flows: readonly EditFlow[] = [
        textFlow(
            '01-page-text',
            'src/pages/calculator/index.tsx',
            '<Text>房贷计算器</Text>',
            '<Text>房贷计算器·01</Text>'
        ),
        textFlow(
            '02-form-parent',
            'src/pages/calculator/line-wrap.tsx',
            'className="relative flex flex-row items-center justify-between py-5.5"',
            'className="relative flex flex-row items-center justify-between py-5.5 flow-02"'
        ),
        textFlow(
            '03-option-component',
            'src/pages/calculator/title-tpl.tsx',
            'className="relative ml-5 flex items-center"',
            'className="relative ml-5 flex items-center flow-03"'
        ),
        textFlow(
            '04-result-leaf',
            'src/pages/calculator/compute-header/index.tsx',
            '查看历史</Text>',
            '查看历史·04</Text>'
        ),
        textFlow(
            '05-box-shadow',
            'src/components/box-shadow/index.tsx',
            'className={clsx(className)}',
            "className={clsx(className, 'flow-05')}"
        ),
        textFlow(
            '06-gradient',
            'src/components/linear-gradient/index.tsx',
            "clsx('relative z-2 w-full', className)",
            "clsx('relative z-2 w-full flow-06', className)"
        ),
        textFlow(
            '07-navigation',
            'src/components/navigation-bar/navigation-bar.tsx',
            "clsx('flex relative w-full', props.className)",
            "clsx('flex relative w-full flow-07', props.className)"
        ),
        textFlow(
            '08-config-constant',
            'src/pages/calculator/constants.ts',
            "name: '按贷款总额'",
            "name: '按贷款总额·08'"
        ),
        textFlow(
            '09-calculation-helper',
            'src/pages/calculator/helper.ts',
            'const commerceMonth = commerceLoanYear * 12',
            'const commerceMonth = commerceLoanYear * 12 + 0'
        ),
        textFlow('10-shared-utility', 'src/utils/common.ts', 'return f\n}', 'return Number(f)\n}'),
        appendFlow('11-global-css', 'src/app.css', '\n.loan-flow-11 { color: inherit; }\n'),
        textFlow(
            '12-page-layout',
            'src/pages/calculator/index.tsx',
            'id="loan-calculator-page" className="relative',
            'id="loan-calculator-page" className="flow-12 relative'
        ),
        {
            name: '13-multi-file-parent-child',
            edits: [
                replacement('src/pages/calculator/index.tsx', '<Text>房贷计算器</Text>', '<Text>房贷计算器·13</Text>'),
                replacement(
                    'src/pages/calculator/line-wrap.tsx',
                    'className="flex flex-1 flex-row items-center"',
                    'className="flex flex-1 flex-row items-center flow-13"'
                ),
                replacement('src/pages/calculator/compute-header/index.tsx', '首付款</Text>', '首付款·13</Text>')
            ]
        }
    ]

    for (const flow of flows) {
        await runFlow(context, calculatorMarker, flow, () => assertCalculatorState(context))
    }
    await runSequentialFlow(context)
    await runBurstFlow(context)
}

async function runSequentialFlow(context: HmrContext): Promise<void> {
    const file = 'src/pages/calculator/index.tsx'
    const original = await context.fixture.read(file)
    try {
        await context.fixture.write(
            file,
            replaceOnce(original, '<Text>房贷计算器</Text>', '<Text>房贷计算器·14a</Text>')
        )
        await context.fixture.publishMarker(calculatorMarker, 'flow-14a')
        await waitForMarker(context, calculatorMarker, 'flow-14a')
        await assertCalculatorState(context)

        await context.fixture.write(
            file,
            replaceOnce(original, '<Text>房贷计算器</Text>', '<Text>房贷计算器·14b</Text>')
        )
        await context.fixture.publishMarker(calculatorMarker, 'flow-14b')
        await waitForMarker(context, calculatorMarker, 'flow-14b')
        await assertCalculatorState(context)
    } finally {
        await Promise.all([
            context.fixture.write(file, original),
            context.fixture.publishMarker(calculatorMarker, 'baseline')
        ])
    }
    await waitForMarker(context, calculatorMarker, 'baseline')
    console.log('[loan-hmr] 14-sequential-generations passed')
}

async function runBurstFlow(context: HmrContext): Promise<void> {
    const file = 'src/pages/calculator/index.tsx'
    const original = await context.fixture.read(file)
    try {
        for (const index of Array.from({ length: 12 }, (_, value) => value)) {
            await Promise.all([
                context.fixture.write(
                    file,
                    replaceOnce(original, '<Text>房贷计算器</Text>', `<Text>房贷计算器·15-${index}</Text>`)
                ),
                context.fixture.writeMarkerSource(calculatorMarker, `flow-15-${index}`)
            ])
            await delay(12)
        }
        await delay(700)
        await waitForMarker(context, calculatorMarker, 'flow-15-11')
        await assertCalculatorState(context)
    } finally {
        await Promise.all([
            context.fixture.write(file, original),
            context.fixture.publishMarker(calculatorMarker, 'baseline')
        ])
    }
    await waitForMarker(context, calculatorMarker, 'baseline')
    console.log('[loan-hmr] 15-rapid-burst passed')
}

async function runOverlayFlows(context: HmrContext): Promise<void> {
    await context.devTools.element('#loan-picker-root', 'tap', undefined)
    await waitForElement(context, 'picker-view')
    await runFlow(
        context,
        calculatorMarker,
        textFlow(
            '16-picker-open-component-edit',
            'src/components/picker/index.tsx',
            'className="h-75"',
            'className="h-75 flow-16"'
        ),
        async () => {
            await assertCalculatorState(context)
            await waitForElement(context, 'picker-view')
        }
    )
    await runFlow(
        context,
        calculatorMarker,
        appendFlow('17-picker-open-css-edit', 'src/components/picker/index.module.css', '\n.flow17 { opacity: 1; }\n'),
        async () => {
            await assertCalculatorState(context)
            await waitForElement(context, 'picker-view')
        }
    )
    await context.devTools.element('#loan-picker-confirm', 'tap', undefined)
    await delay(250)

    await context.devTools.element('#loan-explain-loanLrp', 'tap', undefined)
    await waitForElement(context, '#loan-explain-dialog')
    await runFlow(
        context,
        calculatorMarker,
        textFlow(
            '18-explanation-modal-open',
            'src/components/modal/index.tsx',
            'id="loan-modal-panel" className="relative',
            'id="loan-modal-panel" className="flow-18 relative'
        ),
        async () => {
            await assertCalculatorState(context)
            await waitForElement(context, '#loan-explain-dialog')
        }
    )
    await context.devTools.element('#loan-explain-dialog button', 'tap', undefined)
    await delay(100)

    await runFlow(
        context,
        calculatorMarker,
        textFlow(
            '19-result-tree-structural',
            'src/pages/calculator/compute-header/index.tsx',
            'id="loan-result-header"',
            'id="loan-result-header" data-flow="19"'
        ),
        () => assertCalculatorState(context)
    )
}

async function runNavigationFlows(context: HmrContext): Promise<void> {
    await context.devTools.element('#loan-open-monthly', 'tap', undefined)
    await waitForRoute(context, monthlyRoute)
    await waitForMarker(context, monthlyMarker, 'baseline')
    await context.devTools.element('#loan-payment-equalPrincipal', 'tap', undefined)
    assert.match(
        await context.devTools.element('#loan-payment-equalPrincipal', 'outerWxml', undefined),
        /comm_form_icon_gouxuan\.png/
    )

    await runFlow(
        context,
        monthlyMarker,
        textFlow(
            '20-monthly-current-page',
            'src/pages/calculator/monthly-payments/index.tsx',
            '<Text>对比月供</Text>',
            '<Text>对比月供·20</Text>'
        ),
        async () => {
            await assertRoute(context, monthlyRoute)
            assert.match(
                await context.devTools.element('#loan-payment-equalPrincipal', 'outerWxml', undefined),
                /comm_form_icon_gouxuan\.png/
            )
        }
    )
    await runFlow(
        context,
        monthlyMarker,
        textFlow(
            '21-monthly-shared-layout',
            'src/components/safe-area-view/index.tsx',
            "clsx('pb-safe w-full bg-white', className)",
            "clsx('pb-safe w-full bg-white flow-21', className)"
        ),
        async () => {
            await assertRoute(context, monthlyRoute)
            assert.match(
                await context.devTools.element('#loan-payment-equalPrincipal', 'outerWxml', undefined),
                /comm_form_icon_gouxuan\.png/
            )
        }
    )
    await runFlow(
        context,
        monthlyMarker,
        textFlow(
            '22-hidden-calculator-page',
            'src/pages/calculator/index.tsx',
            '<Text>房贷计算器</Text>',
            '<Text>房贷计算器·22</Text>'
        ),
        () => assertRoute(context, monthlyRoute)
    )
    await context.devTools.navigate('navigateBack', undefined)
    await waitForRoute(context, calculatorRoute)
    await assertCalculatorState(context)

    await context.devTools.element('#loan-open-history', 'tap', undefined)
    await waitForRoute(context, historyRoute)
    await waitForMarker(context, historyMarker, 'baseline')
    await runFlow(
        context,
        historyMarker,
        textFlow(
            '23-history-current-page',
            'src/pages/calculator/history/index.tsx',
            '<Text>计算历史</Text>',
            '<Text>计算历史·23</Text>'
        ),
        () => assertRoute(context, historyRoute)
    )
    await runFlow(
        context,
        historyMarker,
        {
            name: '24-history-with-hidden-shared-edits',
            edits: [
                replacement('src/pages/calculator/index.tsx', '<Text>房贷计算器</Text>', '<Text>房贷计算器·24</Text>'),
                replacement(
                    'src/components/navigation-bar/navigation-bar.tsx',
                    "'text-base font-medium'",
                    "'text-base font-medium flow-24'"
                )
            ]
        },
        () => assertRoute(context, historyRoute)
    )
    await context.devTools.navigate('navigateBack', undefined)
    await waitForRoute(context, calculatorRoute)
    await assertCalculatorState(context)
}

async function runRecoveryFlow(context: HmrContext): Promise<void> {
    const file = 'src/pages/calculator/index.tsx'
    const original = await context.fixture.read(file)
    try {
        await context.fixture.write(file, 'export default function Broken(\n')
        await delay(500)
        assert.equal(await context.devTools.element('#loan-hmr-marker', 'text', undefined), 'baseline')
        await assertCalculatorState(context)
    } finally {
        await context.fixture.write(file, original)
    }
    await context.fixture.publishMarker(calculatorMarker, 'flow-25-recovered')
    await waitForMarker(context, calculatorMarker, 'flow-25-recovered')
    await assertCalculatorState(context)
    await context.fixture.publishMarker(calculatorMarker, 'baseline')
    await waitForMarker(context, calculatorMarker, 'baseline')
    console.log('[loan-hmr] 25-syntax-error-recovery passed')
}

async function runNormalRemountFlow(context: HmrContext): Promise<void> {
    await context.devTools.navigate('redirectTo', `/${historyRoute}`)
    await waitForRoute(context, historyRoute)
    await context.devTools.navigate('redirectTo', `/${calculatorRoute}`)
    await waitForRoute(context, calculatorRoute)
    await waitForElement(context, primaryInput)
    assert.equal(await context.devTools.element(primaryInput, 'value', undefined), '0')
    console.log('[loan-hmr] normal-unmount-remount passed')
}

async function runFlow(
    context: HmrContext,
    markerFile: string,
    flow: EditFlow,
    assertState: () => Promise<void>
): Promise<void> {
    const preparedEdits: readonly PreparedEdit[] = await Promise.all(
        flow.edits.map(async (edit) => ({ edit: edit, original: await context.fixture.read(edit.file) }))
    )
    try {
        await Promise.all([
            ...preparedEdits.map(({ edit, original }) => context.fixture.write(edit.file, edit.apply(original))),
            context.fixture.publishMarker(markerFile, `flow-${flow.name}`)
        ])
        await waitForMarker(context, markerFile, `flow-${flow.name}`)
        await assertState()
        await assertWxSafeClasses(context, `${flow.name} application`)
    } finally {
        await Promise.all([
            ...preparedEdits.map(({ edit, original }) => context.fixture.write(edit.file, original)),
            context.fixture.publishMarker(markerFile, 'baseline')
        ])
    }
    await waitForMarker(context, markerFile, 'baseline')
    await assertState()
    await assertWxSafeClasses(context, `${flow.name} restoration`)
    console.log(`[loan-hmr] ${flow.name} passed`)
}

async function assertWxSafeClasses(context: HmrContext, generation: string): Promise<void> {
    const currentPage = await context.devTools.readCurrentPage()
    if (currentPage.path !== calculatorRoute) {
        return
    }

    const wxml = await context.devTools.element('#loan-field-commerceLoanYear', 'outerWxml', undefined)
    assert.match(wxml, /py-5_d5/, `WX-unsafe class after ${generation}`)
}

async function assertCalculatorState(context: HmrContext): Promise<void> {
    await assertRoute(context, calculatorRoute)
    assert.equal(await context.devTools.element(primaryInput, 'value', undefined), initialLoanValue)
    await waitForElement(context, '#loan-result-header')
}

async function waitForMarker(context: HmrContext, markerFile: string, value: string): Promise<void> {
    await waitForElementText(context, '#loan-hmr-marker', value)
    assert.equal(await context.fixture.read(markerFile), `export const hmrMarker = '${value}'\n`)
}

async function waitForElementText(context: HmrContext, selector: string, value: string): Promise<void> {
    await waitFor(
        async () => {
            try {
                return (await context.devTools.element(selector, 'text', undefined)) === value
            } catch {
                return false
            }
        },
        8_000,
        75
    )
}

async function waitForRoute(context: HmrContext, route: string): Promise<void> {
    await waitFor(async () => (await context.devTools.readCurrentPage()).path === route, 8_000, 75)
}

async function assertRoute(context: HmrContext, route: string): Promise<void> {
    assert.equal((await context.devTools.readCurrentPage()).path, route)
}

async function waitForElement(context: HmrContext, selector: string): Promise<void> {
    await waitFor(
        async () => {
            try {
                await context.devTools.element(selector, 'wxml', undefined)
                return true
            } catch {
                return false
            }
        },
        8_000,
        75
    )
}

function textFlow(name: string, file: string, oldText: string, newText: string): EditFlow {
    return { name: name, edits: [replacement(file, oldText, newText)] }
}

function appendFlow(name: string, file: string, suffix: string): EditFlow {
    return {
        name: name,
        edits: [{ file: file, apply: (source) => `${source}${suffix}` }]
    }
}

function replacement(file: string, oldText: string, newText: string): SourceEdit {
    return { file: file, apply: (source) => replaceOnce(source, oldText, newText) }
}
