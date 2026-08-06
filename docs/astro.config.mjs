// @ts-check

import starlight from '@astrojs/starlight'
import { defineConfig } from 'astro/config'

// https://astro.build/config
export default defineConfig({
    site: 'https://sep2.github.io',
    base: '/vite-plugin-taro',
    integrations: [
        starlight({
            title: 'vite-plugin-taro',
            customCss: ['./src/styles/custom.css'],
            locales: {
                root: {
                    label: '简体中文',
                    lang: 'zh-CN'
                }
            },
            social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/sep2/vite-plugin-taro' }],
            sidebar: [
                {
                    label: '开始使用',
                    items: [{ label: '快速开始', slug: 'guides/quick-start' }]
                },
                {
                    label: '参考',
                    items: [{ label: '配置选项', slug: 'reference/configuration' }]
                }
            ]
        })
    ]
})
