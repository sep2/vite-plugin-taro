interface DocumentationNavigationItem {
    label: string
    slug: string
}

export interface DocumentationSection {
    items: ReadonlyArray<DocumentationNavigationItem>
    llmsHeading: string
    sidebarLabel: string
}

export const documentationSections: ReadonlyArray<DocumentationSection> = [
    {
        sidebarLabel: '开始使用',
        llmsHeading: 'Guides',
        items: [
            { label: '使用 AI', slug: 'guides/ai' },
            { label: '快速开始', slug: 'guides/quick-start' },
            { label: 'App 与页面', slug: 'guides/app-and-pages' },
            { label: '样式', slug: 'guides/styles' },
            { label: '全自动分包', slug: 'guides/automatic-subpackages' },
            { label: '微信原生组件', slug: 'guides/native-components' },
            { label: '组件与 API', slug: 'guides/components-and-api' },
            { label: '配置选项', slug: 'guides/configuration' },
            { label: '开发者工具热更新', slug: 'guides/hot-module-replacement' },
            { label: '条件编译', slug: 'guides/conditional-directives' },
            { label: 'Skyline 模式', slug: 'guides/skyline-mode' },
            { label: '从 Taro 迁移', slug: 'guides/migrate-from-taro' }
        ]
    },
    {
        sidebarLabel: '参考',
        llmsHeading: 'References',
        items: [
            { label: '模块系统', slug: 'references/module-system' },
            { label: 'App 视图', slug: 'references/app-view' },
            { label: '热更新原理', slug: 'references/hmr-implementation' },
            { label: '组件参考', slug: 'references/components' },
            { label: 'API 参考', slug: 'references/api' },
            { label: '仓库维护', slug: 'references/repository-management' }
        ]
    }
]
