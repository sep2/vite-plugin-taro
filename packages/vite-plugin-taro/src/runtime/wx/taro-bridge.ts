// Initializes Taro's core runtime first and provides the factory used by generated Page delegates.
import { createPageConfig } from '@tarojs/runtime'

// Installs WeChat host configuration, native components, lifecycle metadata, and native API hooks.
import '@tarojs/plugin-platform-weapp/dist/runtime.js'

// Registers React lifecycle hooks and provides the factory used by the generated App delegate.
// @ts-expect-error Taro exposes createReactApp from this runtime-only deep entry without types.
import { createReactApp } from '@tarojs/plugin-framework-react/dist/runtime'

// Provides the plugin-owned React 19 renderer used by the generated App delegate.
import ReactDOM from '@tarojs/react'

export { createPageConfig, createReactApp, ReactDOM }
