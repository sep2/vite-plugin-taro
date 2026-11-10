import type { Rolldown } from 'vite'
import type { MiniContract, MiniProjectSkeletonInput } from '../mini/mini-contract.ts'
import { createRecursiveSkeleton } from '../mini/skeleton/create-recursive-skeleton.ts'
import { createTtTemplate } from './create-tt-template.ts'

/** Emits recursive TTML and common code packages for require.async (base library 2.86.1+). */
export function createTtSkeleton(input: MiniProjectSkeletonInput, contract: MiniContract): Rolldown.EmittedAsset[] {
    return createRecursiveSkeleton(input, contract, {
        template: createTtTemplate(),
        extension: '.ttml',
        directive: 'tt',
        subpackages: input.subpackages.map(({ root }) => ({ root, pages: [], common: true }))
    })
}
