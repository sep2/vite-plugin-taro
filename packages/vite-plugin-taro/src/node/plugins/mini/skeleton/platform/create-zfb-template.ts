import { capitalize, RecursiveTemplate, toCamelCase } from '@tarojs/shared/dist/template.js'
import { recursiveMerge } from '../recursive-merge.ts'
import zfbComponents from './zfb-components.json' with { type: 'json' }

type ComponentAttributes = Record<string, string>
type ComponentDefinitions = Record<string, ComponentAttributes>
type ComponentAlias = ComponentAttributes & Readonly<{ _num: string }>
type TemplatePage = Readonly<{
    content: Record<string, unknown>
    path: string
}>

const nodeNameKey = 'nn'

class ZfbTemplate extends RecursiveTemplate {
    exportExpr = 'export default'
    supportXS = true
    isXMLSupportRecursiveReference = false
    Adapter = {
        if: 'a:if',
        else: 'a:else',
        elseif: 'a:elif',
        for: 'a:for',
        forItem: 'a:for-item',
        forIndex: 'a:for-index',
        key: 'a:key',
        xs: 'sjs',
        type: 'alipay'
    }

    /** Taro moves PageMeta out of the recursive host-template table. */
    readonly transferComponents: ComponentDefinitions = {}

    constructor() {
        super()
        this.nestElements.set('root-portal', 3)
    }

    buildXsTemplate(filePath: string | undefined): string {
        return `<import-sjs name="xs" from="${filePath ?? './utils'}.sjs" />`
    }

    protected replacePropName(
        name: string,
        value: string,
        componentName: string,
        componentAlias: ComponentAlias
    ): string {
        if (value === 'eh') {
            return name.replace('bind', 'on')
        }
        if (componentName === 'map' && value.includes(componentAlias.polygons)) {
            return 'polygon'
        }
        return name
    }

    protected getClickEvent(): Record<string, string> {
        return { onTap: 'eh' }
    }

    protected getEvents(): Record<string, string> {
        return {
            onTap: 'eh',
            onTouchMove: 'eh',
            onTouchEnd: 'eh',
            onTouchCancel: 'eh',
            onLongTap: 'eh'
        }
    }

    protected buildThirdPartyAttr(attributes: Set<string>): string {
        return [...attributes]
            .map((attribute) => {
                if (attribute.startsWith('@')) {
                    return `on${capitalize(attribute.slice(1))}="eh" `
                }
                if (attribute.startsWith('bind') || attribute.startsWith('on')) {
                    return `${attribute}="eh" `
                }
                return ` ${attribute}="{{ i.${toCamelCase(attribute)} }}" `
            })
            .join('')
    }

    createMiniComponents(components: ComponentDefinitions): ComponentDefinitions {
        const result = super.createMiniComponents(components)

        // Alipay 2.0 excludes slot hosts, while PageMeta moves to the Page-owned template.
        delete result.slot
        delete result['slot-view']
        delete result['native-slot']
        this.transferComponents['page-meta'] = result['page-meta']
        delete result['page-meta']

        return result
    }

    /** Alipay retains these callbacks on the template instance while rendering component loops. */
    protected modifyLoopBody = (child: string): string => {
        return child
    }

    protected modifyLoopContainer = (children: string, nodeName: string): string => {
        if (nodeName === 'picker') {
            return `
  <view>${children}</view>
  `
        }
        if (nodeName === 'swiper') {
            return `
    <block a:for="{{xs.f(i.cn)}}" a:key="sid">
      <swiper-item class="{{item.cl}}" style="{{item.st}}" id="{{item.uid||item.sid}}" data-sid="{{item.sid}}">
        <block a:for="{{item.cn}}" a:key="sid">
          <template is="{{xs.a(0, item.${nodeNameKey})}}" data="{{i:item}}" />
        </block>
      </swiper-item>
    </block>
  `
        }
        return children
    }

    protected modifyTemplateResult = (result: string, nodeName: string): string => {
        return nodeName === 'swiper-item' ? '' : result
    }

    protected modifyThirdPartyLoopBody = (): string => {
        const slot = this.componentsAlias.slot
        const slotAlias = slot._num
        const slotNamePropertyAlias = slot.name

        return `<view a:if="{{item.nn==='${slotAlias}'}}" slot="{{item.${slotNamePropertyAlias}}}" id="{{item.uid||item.sid}}" data-sid="{{item.sid}}">
        <block a:for="{{item.cn}}" a:key="sid">
          <template is="{{xs.a(0, item.${nodeNameKey})}}" data="{{i:item}}" />
        </block>
      </view>
      <template a:else is="{{xs.a(0, item.${nodeNameKey})}}" data="{{i:item}}" />`
    }

    protected buildXSTmpExtra(): string {
        const swiperItemAlias = this.componentsAlias['swiper-item']._num
        return `f: function (l) {
    return l.filter(function (i) {return i.nn === '${swiperItemAlias}'})
  }`
    }

    buildPageTemplate = (baseTemplatePath: string, page: TemplatePage | undefined): string => {
        const pageMetaTemplate = page?.content.enablePageMeta ? this.buildPageMeta(baseTemplatePath) : ''
        return `<import src="${baseTemplatePath}"/>${pageMetaTemplate}
<template is="taro_tmpl" data="{{${this.dataKeymap('root:root')}}}" />`
    }

    private buildPageMeta(baseTemplatePath: string): string {
        const pageMetaAttributes = this.buildTransferredAttributes('page-meta', 'pageMeta.')
        return `
<import-sjs name="xs" from="${baseTemplatePath.replace('base.axml', 'utils.sjs')}" />
<page-meta data-sid="{{pageMeta.sid}}" ${pageMetaAttributes}></page-meta>`
    }

    private buildTransferredAttributes(componentName: string, dataPath: string): string {
        return Object.entries(this.transferComponents[componentName])
            .map(([name, value]) => `${name}="${value === 'eh' ? value : `{{${value.replace('i.', dataPath)}}}`}" `)
            .join('')
    }
}

/** Creates the Taro 4.2.1 Alipay template implementation without loading its CLI platform package. */
export function createZfbTemplate(): RecursiveTemplate {
    const template = new ZfbTemplate()

    // Taro retains and mutates this component registry while applying platform-specific removals.
    template.mergeComponents({ helper: { recursiveMerge } }, zfbComponents)
    delete template.internalComponents.Slider['block-size']
    delete template.internalComponents.Slider['block-color']
    delete template.internalComponents.Swiper.bindAnimationFinish

    return template
}
