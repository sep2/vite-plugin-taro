// #ifdef wx
import { WxNativeCounter } from './wx-native-counter.tsx'
// #endif

// #ifdef zfb
import { ZfbNativeCounter } from './zfb-native-counter.tsx'
// #endif

// Conditional compilation leaves exactly one target-native component in this tuple.
export const [NativeCounter] = [
    // #ifdef wx
    WxNativeCounter,
    // #endif
    // #ifdef zfb
    ZfbNativeCounter
    // #endif
]
