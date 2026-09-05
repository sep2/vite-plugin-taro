import { UnRecursiveTemplate } from '@tarojs/shared/dist/template.js'
import { recursiveMerge } from '../recursive-merge.ts'
import wxComponents from './wx-components.json' with { type: 'json' }

type ComponentAttributes = Record<string, string>
type ComponentDefinitions = Record<string, ComponentAttributes>
type ComponentAlias = ComponentAttributes & Readonly<{ _num: string }>
type TemplatePage = Readonly<{
    content: Record<string, unknown>
    path: string
}>

class WxTemplate extends UnRecursiveTemplate {
    supportXS = true
    Adapter = {
        if: 'wx:if',
        else: 'wx:else',
        elseif: 'wx:elif',
        for: 'wx:for',
        forItem: 'wx:for-item',
        forIndex: 'wx:for-index',
        key: 'wx:key',
        xs: 'wxs',
        type: 'weapp'
    }

    /** Taro moves Page-owned native components out of the recursive host-template table. */
    readonly transferComponents: ComponentDefinitions = {}

    constructor() {
        super()
        this.nestElements.set('root-portal', 3)
    }

    buildXsTemplate(filePath: string | undefined): string {
        return `<wxs module="xs" src="${filePath ?? './utils'}.wxs" />`
    }

    createMiniComponents(components: ComponentDefinitions): ComponentDefinitions {
        const result = super.createMiniComponents(components)

        // These records move to the Page template and therefore intentionally leave the recursive component registry.
        this.transferComponents['page-meta'] = result['page-meta']
        this.transferComponents['navigation-bar'] = result['navigation-bar']
        delete result['page-meta']
        delete result['navigation-bar']

        return result
    }

    protected replacePropName(
        name: string,
        value: string,
        componentName: string,
        componentAlias: ComponentAlias
    ): string {
        if (value === 'eh') {
            const lowerCaseName = name.toLowerCase()
            return lowerCaseName === 'bindlongtap' && componentName !== 'canvas' ? 'bindlongpress' : lowerCaseName
        }
        if (componentName === 'share-element' && value === `i.${componentAlias.mapkey}`) {
            return 'key'
        }
        return name
    }

    /** Upstream invokes this retained callback while assembling each component template. */
    protected modifyTemplateResult = (result: string, nodeName: string): string => {
        return nodeName === 'keyboard-accessory' ? '' : result
    }

    buildPageTemplate = (baseTemplatePath: string, page: TemplatePage | undefined): string => {
        const pageMetaTemplate = page?.content.enablePageMeta ? this.buildPageMeta(baseTemplatePath) : ''
        return `<import src="${baseTemplatePath}"/>${pageMetaTemplate}
<template is="taro_tmpl" data="{{${this.dataKeymap('root:root')}}}" />`
    }

    private buildPageMeta(baseTemplatePath: string): string {
        const pageMetaAttributes = this.buildTransferredAttributes('page-meta', 'pageMeta.')
        const navigationBarAttributes = this.buildTransferredAttributes('navigation-bar', 'navigationBar.')
        return `
<wxs module="xs" src="${baseTemplatePath.replace('base.wxml', 'utils.wxs')}" />
<page-meta data-sid="{{pageMeta.sid}}" ${pageMetaAttributes}>
  <navigation-bar ${navigationBarAttributes}/>
</page-meta>`
    }

    private buildTransferredAttributes(componentName: string, dataPath: string): string {
        return Object.entries(this.transferComponents[componentName])
            .map(([name, value]) => `${name}="${value === 'eh' ? value : `{{${value.replace('i.', dataPath)}}}`}" `)
            .join('')
    }
}

/** Creates the Taro 4.2.1 WX template implementation without loading its CLI platform package. */
export function createWxTemplate(): UnRecursiveTemplate {
    const template = new WxTemplate()

    // Taro's template registry and sets are retained mutable configuration assembled once for this generated skeleton.
    template.mergeComponents({ helper: { recursiveMerge } }, wxComponents)
    template.voidElements.add('voip-room')
    template.voidElements.add('native-slot')
    template.focusComponents.add('editor')

    return template
}
