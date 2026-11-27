/** Native App stylesheet that imports the global stylesheet. */
export function appStyleName(ext: string): string {
    return `app${ext}`
}

/** Shared stylesheet published by the Mini style pipeline. */
export function globalStyleName(ext: string): string {
    return `assets/global${ext}`
}
