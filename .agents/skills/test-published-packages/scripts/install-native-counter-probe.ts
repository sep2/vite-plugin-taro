export function installNativeCounterProbe(source: string): string {
    // Counter re-exports NativeCounter directly, so its native props own the probe id.
    const propsOpening = /type NativeCounterProps = \{(\r?\n)/g
    if ([...source.matchAll(propsOpening)].length !== 1) {
        throw new Error('Expected one NativeCounterProps type in the generated native counter')
    }
    return source.replace(propsOpening, '$&    id: string$1')
}
