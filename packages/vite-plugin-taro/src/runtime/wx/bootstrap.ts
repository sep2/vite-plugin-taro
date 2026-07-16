import 'systemjs/s.js'

declare const __VITE_PLUGIN_TARO_NATIVE_REQUIRE__: (
    id: './transport.js'
) => Pick<System.Loader, 'instantiate' | 'resolve'>

const transport = __VITE_PLUGIN_TARO_NATIVE_REQUIRE__('./transport.js')
System.resolve = transport.resolve
System.instantiate = transport.instantiate
