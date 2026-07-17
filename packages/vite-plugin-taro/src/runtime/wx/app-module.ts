// biome-ignore assist/source/organizeImports: Taro must initialize before the App component.
import { createReactApp, ReactDOM } from './taro-runtime.ts'
import React from 'react'

// @ts-expect-error: The WX build resolves this private App component.
import AppComponent from '\0vpt:app-component'

declare const __VITE_PLUGIN_TARO_APP_CONFIG__: Record<string, unknown>

export default createReactApp(AppComponent, React, ReactDOM, __VITE_PLUGIN_TARO_APP_CONFIG__)
