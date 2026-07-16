import 'systemjs/s.js'

declare function __VITE_PLUGIN_TARO_NATIVE_REQUIRE__(id: './transport.js'): Pick<System.Loader, 'instantiate'>

System.instantiate = __VITE_PLUGIN_TARO_NATIVE_REQUIRE__('./transport.js').instantiate
