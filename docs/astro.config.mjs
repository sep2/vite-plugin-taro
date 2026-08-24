// @ts-check

import { unified } from '@astrojs/markdown-remark'
import starlight from '@astrojs/starlight'
import { defineConfig } from 'astro/config'
import { documentationSections } from './src/documentation-navigation.ts'
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
            sidebar: documentationSections.map((section) => ({
                label: section.sidebarLabel,
                items: section.items.map((item) => ({
                    label: item.label,
                    slug: item.slug
                }))
            }))
        })
    ]
})
