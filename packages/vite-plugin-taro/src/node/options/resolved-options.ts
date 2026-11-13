import type { VptOptions, VptPageOption } from '../../options.ts'

/** Internal build options with validated, entry-first page order supplied by resolveOptions. */
export type ResolvedOptions = Readonly<
    Omit<VptOptions, 'pages'> & {
        pages: readonly VptPageOption[]
    }
>
