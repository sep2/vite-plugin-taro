/**
 * Creates a function that runs its argument once and returns the first result on every
 * later call.
 *
 * @example
 * const initialize = once(createApplication)
 * initialize() // runs createApplication
 * initialize() // returns the cached result
 */
export function once<F extends (...args: never[]) => unknown>(func: F): F {
    let called = false
    let cache: ReturnType<F>

    return ((...args: Parameters<F>): ReturnType<F> => {
        if (!called) {
            called = true
            cache = func(...args) as ReturnType<F>
        }
        return cache
    }) as F
}
