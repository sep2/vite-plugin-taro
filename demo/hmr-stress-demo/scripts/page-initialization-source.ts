/** Keep the native query on one line so Windows command shims transmit its complete function body. */
export const pageInitializationSource = [
    'function () {',
    'const pages = getCurrentPages();',
    'const page = pages[pages.length - 1];',
    'return {',
    'renderer: page.renderer,',
    "glassEasel: typeof page.groupUpdates === 'function',",
    'dataFactoryRan: page.data.__hmrDataFactoryRan === true,',
    'appNodeName: page.data.app?.nn',
    '};',
    '}'
].join(' ')
