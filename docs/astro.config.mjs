// @ts-check

import { unified } from '@astrojs/markdown-remark'
import starlight from '@astrojs/starlight'
import { defineConfig } from 'astro/config'
import { externalLinks } from './src/plugins/external-links.mjs'

// https://astro.build/config
export default defineConfig({
    site: 'https://sep2.github.io',
    base: '/vite-plugin-taro',
    markdown: {
        processor: unified({ rehypePlugins: [externalLinks] })
    },
    integrations: [
        starlight({
            title: 'vite-plugin-taro',
            customCss: ['./src/styles/custom.css'],
            components: {
                Hero: './src/components/hero.astro',
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
                        { label: '全自动分包', slug: 'guides/automatic-subpackages' }
                    ]
                },
                {
                    label: '参考',
                    items: [{ label: '配置选项', slug: 'reference/configuration' }]
                }
            ]
        })
    ]
})
