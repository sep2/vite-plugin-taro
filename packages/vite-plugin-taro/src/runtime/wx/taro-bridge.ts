import { createPageConfig } from '@tarojs/runtime'

import '@tarojs/plugin-platform-weapp/dist/runtime.js'

// @ts-expect-error Taro exposes createReactApp from this runtime-only deep entry without types.
import { createReactApp } from '@tarojs/plugin-framework-react/dist/runtime'

import ReactDOM from '@tarojs/react'

export { createPageConfig, createReactApp, ReactDOM }
