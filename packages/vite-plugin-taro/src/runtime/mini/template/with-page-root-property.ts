/** Preserves the Page root when recursive native components cross the App projection's outlet. */
export function withPageRootProperty<Config extends Readonly<{ properties: Readonly<Record<string, unknown>> }>>(
    config: Config
) {
    return {
        ...config,
        properties: {
            ...config.properties,
            p: { type: Object, value: { cn: [] } }
        }
    }
}
