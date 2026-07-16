// biome-ignore assist/source/organizeImports: Taro must initialize before the App component.
import '@tarojs/plugin-platform-weapp/dist/runtime.js'

// @ts-expect-error Taro exposes createReactApp from this runtime-only deep entry without types.
import { createReactApp } from '@tarojs/plugin-framework-react/dist/runtime'
import ReactDOM from '@tarojs/react'
import React from 'react'

// @ts-expect-error The WX build resolves this private App component.
import AppComponent from '\0vpt:app'

declare const __VITE_PLUGIN_TARO_APP_CONFIG__: Record<string, unknown>

export default createReactApp(AppComponent, React, ReactDOM, __VITE_PLUGIN_TARO_APP_CONFIG__)
