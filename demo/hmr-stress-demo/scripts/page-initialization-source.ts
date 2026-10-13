/** Keep the native query on one line so Windows command shims transmit its complete function body. */
export const pageInitializationSource = [
    'function () {',
    'const pages = getCurrentPages();',
    'const page = pages[pages.length - 1];',
    'return {',
    'renderer: page.renderer,',
    "glassEasel: typeof page.groupUpdates === 'function',",
    "prerendered: typeof page.$taroPath === 'string' && page.$taroPath.includes('$vptPage='),",
    'appNodeName: page.data.app?.nn',
    '};',
    '}'
].join(' ')
