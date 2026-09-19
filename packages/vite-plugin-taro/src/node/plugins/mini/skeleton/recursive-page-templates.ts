import { replaceExactlyOnce } from './skeleton-utils.ts'

/** Threads a Page root through recursive template scopes without serializing it into the App's compact tree. */
export function buildRecursiveBaseTemplate(source: string, directive: 'a' | 'tt'): string {
    const recursiveData = 'data="{{i:item}}"'
    if (!source.includes(recursiveData)) {
        throw new Error('Recursive base templates must recurse through compact child data')
    }

    // One linear pass carries p through host and third-party child loops; CustomWrapper is a real component boundary.
    const pageRootRecursion = source.replaceAll(recursiveData, 'data="{{i:item,p:p}}"')
    const customWrapperRecursion = replaceExactlyOnce(
        pageRootRecursion,
        '<custom-wrapper i="{{i}}"',
        '<custom-wrapper i="{{i}}" p="{{p}}"',
        'CustomWrapper Page-root bridge'
    )

    return `${customWrapperRecursion}
<template name="tmpl_0_vpt_fragment">
  <template
    is="{{xs.a(0, item.nn)}}"
    data="{{i:item,p:p}}"
    ${directive}:for="{{i.cn}}"
    ${directive}:key="sid"
  />
</template>
<template name="tmpl_0_vpt_page_outlet">
  <template is="taro_tmpl" data="{{root:p}}" />
</template>
`
}

/** Starts the recursive App host with both independent native data roots. */
export function buildRecursiveComponentTemplate(source: string): string {
    return replaceExactlyOnce(source, 'data="{{i:i}}"', 'data="{{i:i,p:p}}"', 'recursive component entry')
}

/** Keeps the independent Page root when App rendering crosses CustomWrapper. */
export function buildRecursiveCustomWrapperTemplate(source: string): string {
    return replaceExactlyOnce(source, 'data="{{i:item}}"', 'data="{{i:item,p:p}}"', 'CustomWrapper recursion')
}
