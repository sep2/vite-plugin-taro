/** A single-line query passes intact through Windows command shims. */
export const rendererEnvironmentSource = [
    'function () {',
    'const pages = getCurrentPages();',
    'const page = pages[pages.length - 1];',
    'return {',
    'nativeRoot: !!page.__vptWxRoot,',
    'renderer: page.renderer,',
    'dataKeys: Object.keys(page.data)',
    '};',
    '}'
].join(' ')
