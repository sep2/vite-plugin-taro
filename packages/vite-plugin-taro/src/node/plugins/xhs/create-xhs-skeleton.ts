import type { Rolldown } from 'vite'
import type { MiniContract, MiniProjectSkeletonInput } from '../mini/mini-contract.ts'
import { createRecursiveSkeleton } from '../mini/skeleton/create-recursive-skeleton.ts'
import { createJsonAsset } from '../mini/skeleton/skeleton-utils.ts'
import { createXhsTemplate } from './create-xhs-template.ts'

/** Emits XHS templates and a CommonJS package scope for the native module graph. */
export function createXhsSkeleton(input: MiniProjectSkeletonInput, contract: MiniContract): Rolldown.EmittedAsset[] {
    return [
        // XHS's Webpack compiler reads package metadata when classifying physical JavaScript modules.
        createJsonAsset('package.json', { type: 'commonjs' }, input.isProduction),
        ...createRecursiveSkeleton(input, contract, {
            template: createXhsTemplate(),
            extension: '.xhsml',
            directive: 'xhs',
            subpackages: input.subpackages.map(({ root }) => ({ root, pages: [] }))
        })
    ]
}
