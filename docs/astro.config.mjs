// @ts-check

import { unified } from '@astrojs/markdown-remark'
import starlight from '@astrojs/starlight'
import { defineConfig } from 'astro/config'
import { externalLinks } from './src/plugins/external-links.mjs'

// https://astro.build/config
export default defineConfig({
    site: 'https://vpt.js.org',
    markdown: {
        processor: unified({ rehypePlugins: [externalLinks] })
    },
    integrations: [
        starlight({
            title: 'VPT',
            customCss: ['./src/styles/custom.css'],
            components: {
                Hero: './src/components/hero.astro',
                PageFrame: './src/components/page-frame.astro',
                SocialIcons: './src/components/social-icons.astro',
                ThemeSelect: './src/components/theme-select.astro'
            },
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
                    items: [
                        { label: '快速开始', slug: 'guides/quick-start' },
                        { label: '全自动分包', slug: 'guides/automatic-subpackages' },
                        { label: '开发者工具热更新', slug: 'guides/hot-module-replacement' },
                        { label: '微信原生组件', slug: 'guides/native-components' },
                        { label: 'Skyline 模式', slug: 'guides/skyline-mode' },
                        { label: '从 Taro CLI 迁移', slug: 'guides/migrate-from-taro' }
                    ]
                },
                {
                    label: '参考',
                    items: [
                        { label: '模块系统', slug: 'references/module-system' },
                        { label: '热更新原理', slug: 'references/hmr-implementation' },
                        { label: '配置选项', slug: 'references/configuration' },
                        { label: '仓库维护', slug: 'references/repository-management' }
                    ]
                }
            ]
        })
    ]
})
