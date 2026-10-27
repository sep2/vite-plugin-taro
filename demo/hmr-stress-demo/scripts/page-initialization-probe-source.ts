/** Marks native data-factory results in the disposable DevTools fixture. */
export const pageInitializationProbeSource = `
const initialData = pageConfig.data;
if (typeof initialData === 'function') {
    pageConfig.data = function (...args) {
        return { ...initialData.apply(this, args), __hmrDataFactoryRan: true };
    };
}
registerPage(pageConfig);
`
