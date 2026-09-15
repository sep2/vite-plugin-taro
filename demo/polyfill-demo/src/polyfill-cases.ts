interface PolyfillCase {
    module: string
    name: string
    check: () => boolean | Promise<boolean>
}

/** Shared by Vite and the page so every check explicitly opts into its core-js module. */
export const polyfillCases: readonly PolyfillCase[] = [
    {
        module: 'web.url',
        name: 'URL: relative resolution and query encoding',
        check: () => {
            const url = new URL('../child', 'https://example.com/dir/page')
            url.searchParams.set('q', 'hello world')
            return url.href === 'https://example.com/child?q=hello+world'
        }
    },
    {
        module: 'web.url-search-params',
        name: 'URLSearchParams: duplicate keys and iteration',
        check: () => {
            const params = new URLSearchParams('a=1&b=hello+world&a=3')
            return params.getAll('a').join(',') === '1,3' && [...params.values()].join('|') === '1|hello world|3'
        }
    },
    {
        module: 'es.array.at',
        name: 'Array.at: negative and out-of-range indexes',
        check: () => [1, 2, 3].at(-1) === 3 && [1].at(2) === undefined
    },
    {
        module: 'es.array.find-last',
        name: 'Array.findLast: last matching item',
        check: () => [1, 2, 3, 4].findLast((value) => value % 2 === 0) === 4
    },
    {
        module: 'es.array.to-sorted',
        name: 'Array.toSorted: leaves the original unchanged',
        check: () => {
            const original = [3, 1, 2]
            return original.toSorted().join(',') === '1,2,3' && original.join(',') === '3,1,2'
        }
    },
    {
        module: 'es.array.to-reversed',
        name: 'Array.toReversed: leaves the original unchanged',
        check: () => {
            const original = [1, 2, 3]
            return original.toReversed().join(',') === '3,2,1' && original.join(',') === '1,2,3'
        }
    },
    {
        module: 'es.object.from-entries',
        name: 'Object.fromEntries: iterable input',
        check: () => Object.fromEntries(new Map([['answer', 42]])).answer === 42
    },
    {
        module: 'es.string.replace-all',
        name: 'String.replaceAll: literal replacements',
        check: () => 'a.b.a'.replaceAll('.', '-') === 'a-b-a'
    },
    {
        module: 'es.promise.all-settled',
        name: 'Promise.allSettled: fulfillment and rejection',
        check: async () => {
            const results = await Promise.allSettled([Promise.resolve(42), Promise.reject('expected')])
            return (
                results[0].status === 'fulfilled' &&
                results[0].value === 42 &&
                results[1].status === 'rejected' &&
                results[1].reason === 'expected'
            )
        }
    },
    {
        module: 'es.promise.any',
        name: 'Promise.any: first fulfillment',
        check: async () => (await Promise.any([Promise.reject('expected'), Promise.resolve(42)])) === 42
    },
    {
        module: 'web.structured-clone',
        name: 'structuredClone: Map, Date and independent nested objects',
        check: () => {
            const source = { nested: { value: 1 }, map: new Map([['answer', 42]]), date: new Date(0) }
            const clone = structuredClone(source)
            clone.nested.value = 2
            return (
                source.nested.value === 1 &&
                clone.map !== source.map &&
                clone.map.get('answer') === 42 &&
                clone.date.getTime() === 0
            )
        }
    },
    {
        module: 'web.queue-microtask',
        name: 'queueMicrotask: asynchronous FIFO execution',
        check: async () => {
            // Local journal records execution order across the synchronous turn and two microtasks.
            const order: string[] = []
            await new Promise<void>((resolve) => {
                queueMicrotask(() => order.push('first'))
                queueMicrotask(() => {
                    order.push('second')
                    resolve()
                })
                order.push('sync')
            })
            return order.join(',') === 'sync,first,second'
        }
    }
]
