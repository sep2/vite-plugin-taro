export interface Row {
    readonly id: number
    readonly label: string
}

export interface State {
    readonly rows: readonly Row[]
    readonly selected: number | null
    readonly nextId: number
    readonly revision: number
}

export const actions = ['run', 'runlots', 'replace', 'update', 'select', 'swaprows', 'remove', 'add', 'clear'] as const
export type Action = (typeof actions)[number]

export const scenarios: readonly { id: string; label: string; setup: readonly Action[]; action: Action }[] = [
    { id: 'create-1000', label: 'Create 1,000 rows', setup: ['clear'], action: 'run' },
    { id: 'replace-1000', label: 'Replace 1,000 rows', setup: ['run'], action: 'replace' },
    { id: 'update-1000', label: 'Update every 10th row', setup: ['run'], action: 'update' },
    { id: 'select-1000', label: 'Select a row', setup: ['run'], action: 'select' },
    { id: 'swap-1000', label: 'Swap rows 2 and 999', setup: ['run'], action: 'swaprows' },
    { id: 'remove-1000', label: 'Remove a row', setup: ['run'], action: 'remove' },
    { id: 'append-1000', label: 'Append 1,000 rows', setup: ['run'], action: 'add' },
    { id: 'clear-1000', label: 'Clear 1,000 rows', setup: ['run'], action: 'clear' },
    { id: 'create-10000', label: 'Create 10,000 rows', setup: ['clear'], action: 'runlots' },
    { id: 'clear-10000', label: 'Clear 10,000 rows', setup: ['runlots'], action: 'clear' }
]

export const initialState: State = { rows: [], selected: null, nextId: 1, revision: 0 }

const adjectives = ['pretty', 'large', 'big', 'small', 'tall', 'short', 'long', 'handsome', 'plain', 'quaint']
const colors = ['red', 'yellow', 'blue', 'green', 'pink', 'brown', 'purple', 'white', 'black']
const nouns = ['table', 'chair', 'house', 'bbq', 'desk', 'car', 'pony', 'cookie', 'sandwich']

/** Stable pseudo-random labels give both renderers identical data for each monotonically increasing ID. */
function createRows(start: number, count: number): readonly Row[] {
    return Array.from({ length: count }, (_, index) => {
        const id = start + index
        const value = Math.imul(id, 2654435761) >>> 0
        return {
            id,
            label: `${adjectives[value % adjectives.length]} ${colors[(value >>> 8) % colors.length]} ${nouns[(value >>> 16) % nouns.length]}`
        }
    })
}

/** Immutable keyed-list operations; O(n) work, with O(1) selection and clearing. */
export function reduceWorkload(state: State, action: Action, rowId: number | undefined): State {
    const revision = state.revision + 1
    switch (action) {
        case 'run':
        case 'replace':
        case 'runlots': {
            const count = action === 'runlots' ? 10000 : 1000
            return { rows: createRows(state.nextId, count), nextId: state.nextId + count, selected: null, revision }
        }
        case 'add':
            return {
                ...state,
                rows: [...state.rows, ...createRows(state.nextId, 1000)],
                nextId: state.nextId + 1000,
                revision
            }
        case 'update':
            return {
                ...state,
                revision,
                rows: state.rows.map((row, index) => (index % 10 === 0 ? { ...row, label: `${row.label} !!!` } : row))
            }
        case 'select':
            return { ...state, revision, selected: rowId ?? state.rows[1]?.id ?? null }
        case 'remove': {
            const removed = rowId ?? state.rows[1]?.id
            return {
                ...state,
                revision,
                selected: state.selected === removed ? null : state.selected,
                rows: state.rows.filter((row) => row.id !== removed)
            }
        }
        case 'swaprows': {
            const second = state.rows[1]
            const other = state.rows[998]
            return {
                ...state,
                revision,
                rows:
                    second && other
                        ? state.rows.map((row, index) => (index === 1 ? other : index === 998 ? second : row))
                        : state.rows
            }
        }
        case 'clear':
            return { ...state, revision, rows: [], selected: null }
    }
}
