// 微信 DOM API 由 vpt.js.org 独立发现，完全 MIT 开源，如果需要使用此方法请注明来自 VPT，谢谢。
// This private WeChat DOM API is independently discovered by vpt.js.org, and open sourced as MIT.
// Please give credits and link to VPT itself when reusing. Thank you.
// VPT, 2026-10-18

import type { MpEvent } from 'vite-plugin-taro-runtime/runtime/mini'
import type { WxNativeElement, WxNativeNode, WxNativeText, WxRoot } from './wx-types.ts'

/** Model paths address host data; general lvalue paths start with 0=data, 1=script, or 2=inline script. */
type DataPath = (string | number)[]

/** `true` replaces a whole subtree; objects/arrays identify changed descendants. */
type UpdatePathTree = true | { [key: string]: UpdatePathTree } | UpdatePathTree[]

type TemplateComponent = WxNativeElement & ReturnType<WxRoot['getHostNode']> & { getShadowRoot(): WxRoot | null }

type PropertyInitializer = (element: WxNativeElement, creation: boolean) => void

type ChangePropertyListener<Value> = (
    this: null,
    newValue: Value,
    oldValue: Value | undefined,
    host: TemplateComponent,
    element: WxNativeElement
) => void

type ChangePropertyFilter = <Value>(
    listener: ChangePropertyListener<Value>,
    generalLvaluePath: DataPath | null | undefined,
    element: WxNativeElement,
    name: string
) => ChangePropertyListener<Value>

/** Receives the SDK event; the installed WX wrapper adapts it to the mini-program event shape. */
type EventListener = (event: unknown) => unknown

interface EventListenerWrapper {
    (
        element: WxNativeElement,
        name: string,
        listener: EventListener,
        final: boolean,
        mutated: boolean,
        capture: boolean,
        generalLvaluePath?: DataPath | null
    ): EventListener | null
    isEventListenerWrapper?: true
}

type BindingMap = Record<
    string,
    ((
        data: unknown,
        elementUpdated: (element: WxNativeElement) => void,
        updateText: (node: WxNativeText, content: string) => void
    ) => void)[]
>

/** Positional callbacks supplied by the SDK when executing a compiled children function. */
type ChildDefinitions = [
    defineTextNode: (text: string | undefined, initialize?: (node: WxNativeText) => boolean) => void,
    defineElement: (
        tag: string,
        genericImplementations: Record<string, string>,
        initialize: PropertyInitializer,
        children: DefineChildren,
        slot?: string,
        dynamicSlotValueNames?: string[]
    ) => void,
    defineIfGroup: (branchKey: number | string, children: DefineChildren) => void,
    defineForLoop: (
        list: unknown[],
        key: string | null,
        listUpdatePathTree: UpdatePathTree | undefined,
        lvaluePath: DataPath | null,
        item: (
            creation: boolean,
            value: unknown,
            index: number | string,
            itemUpdatePathTree: UpdatePathTree | undefined,
            indexUpdatePathTree: UpdatePathTree | undefined,
            itemLvaluePath: DataPath | null,
            ...definitions: ChildDefinitions
        ) => void
    ) => void,
    defineSlot: (name: string | undefined, initialize?: (element: WxNativeElement) => void, slot?: string) => void,
    definePureVirtualNode: (children: DefineChildren, slot: string | undefined) => void
]

type DefineChildren = (
    creation: boolean,
    ...args: [
        ...ChildDefinitions,
        dynamicSlotValues: Record<string, unknown> | undefined,
        slotValueUpdatePathTrees: UpdatePathTree | undefined
    ]
) => void

/**
 * Private glass-easel `templateInstance.procGenWrapper` methods, inventoried in WX SDK 3.17.4.
 * Includes all 16 binding opcodes and 18 template/helper methods on that wrapper.
 * The SDK also owns its compiler function, shadow root, filters, and binding-map state.
 *
 * Source for signatures and behavior:
 * https://github.com/wechat-miniprogram/glass-easel/blob/5a17ae5e2c335a4dcda3d726da6f334ecfc2cc6a/glass-easel/src/tmpl/proc_gen_wrapper.ts
 *
 * Binding opcodes operate on glass-easel nodes. Property writes on custom components can be
 * queued; finish each element with `endBindingMapUpdateForElement`. Indexed class/style writes
 * also require this boundary. It flushes SDK binding state, rather than guaranteeing a paint.
 */
export interface WxTemplateBindings {
    /** Assign the node's slot name and notify its `change:slot` listener. */
    s(element: WxNativeElement, value: string): void

    /** Set a dynamic slot value; other slot modes interpret legacy event-binding prefixes. Notify `change:name`. */
    l(element: WxNativeElement, name: string, value: unknown, generalLvaluePath?: DataPath | null): void

    /** Assign the node ID and notify `change:id`. */
    i(element: WxNativeElement, value: string): void

    /** Set node classes and, on components declaring it, the external class named `class`. Notify `change:class`. */
    c(element: WxNativeElement, value: string | string[]): void

    /**
     * Merge positional node-class entries into the cached list and apply it immediately.
     * Null entries and an omitted trailing portion retain their cached values.
     * This cache is independent of `c` and direct node-class assignments.
     */
    e(element: WxNativeElement, classNames: (string | null)[]): void

    /** Replace one cached class entry by zero-based index; mark it dirty for the element flush. Seed names with `e`. */
    ei(element: WxNativeElement, index: number, className: string): void

    /**
     * Set a complete CSS string in the MAIN style segment, or queue the component's declared `style` property.
     * Notify `change:style`. Direct `element.style = cssText` always targets the node's MAIN segment.
     */
    y(element: WxNativeElement, value: string): void

    /**
     * Merge alternating [name, value, name, value, ...] entries and apply the entire cached style list immediately.
     * A null value preserves its cached name/value pair; a shorter list preserves the cached tail.
     * Empty strings clear values while retaining their names. Application follows `y`'s property/MAIN routing.
     * This cache is independent of `y` and direct style assignments; mixing them requires synchronizing the list.
     */
    w(element: WxNativeElement, styles: (string | null)[]): void

    /**
     * Replace only the cached value at `2 * valueIndex + 1`; mark the list dirty for the element flush.
     * The zero-based index identifies a pair seeded by `w`, rather than a CSS property name or style segment.
     * For w(node, ['color', 'red', 'width', '100px']), wi(node, 1, '') clears width at the next flush.
     * Flushing still serializes the complete list into CSS text before calling the backend's string setter.
     */
    wi(element: WxNativeElement, valueIndex: number, newValue: string): void

    /**
     * Set a dataset entry. With fallbackDataHyphen, try the component's dataFoo property, data-foo external
     * class/property, then dataset plus attribute; native nodes receive both dataset and data-foo attribute.
     * The component fallback branch also notifies the named change listener.
     */
    d(element: WxNativeElement, name: string, value: unknown, fallbackDataHyphen: boolean): void

    /** Set `mark:name` metadata used in event propagation. */
    m(element: WxNativeElement, name: string, value: unknown): void

    /**
     * Bind a function or host method name through the configured event wrapper.
     * final=catch, mutated=mut-bind, capture=capture phase; dynamic replaces the listener cached by event name.
     * A dynamic null/empty handler clears the binding. Keep final/mutated/capture stable across replacements:
     * removal uses the new call's options to detach the cached listener. generalLvaluePath goes to the wrapper.
     */
    v(
        element: WxNativeElement,
        name: string,
        handler: ((event: MpEvent) => unknown) | string | null,
        final: boolean,
        mutated: boolean,
        capture: boolean,
        dynamic: boolean,
        generalLvaluePath?: DataPath | null
    ): void

    /**
     * Queue a component property (dash-to-camel name), set its external class, or update a native attribute.
     * Event fallbacks recognize bind/captureBind/catch/captureCatch/on; native fallback requires the wrapper's
     * fallbackListenerOnNativeNode flag. Notify `change:name`.
     * For component properties, an undefined model path preserves its listener, null installs a no-op,
     * and a path writes two-way model changes back to host data. Flush pending component properties afterward.
     */
    r(
        element: WxNativeElement,
        name: string,
        value: unknown,
        modelLvaluePath?: DataPath | null,
        generalLvaluePath?: DataPath | null
    ): void

    /** Call the node's updateAttribute directly and notify `change:name`; component property routing belongs to `r`. */
    a(element: WxNativeElement, name: string, value: unknown): void

    /** Deliver a worklet directive value to a component's worklet-change lifetime. */
    wl(element: WxNativeElement, name: string, value: unknown): void

    /** Install a filtered `change:name` listener, replacing its entry and resetting its previous value to undefined. */
    p(
        element: WxNativeElement,
        name: string,
        listener: ChangePropertyListener<unknown>,
        generalLvaluePath?: DataPath | null
    ): void

    /**
     * Flush dirty indexed classes, then styles, then pending component properties with model listeners skipped.
     * Clears the class/style dirty flags before applying their lists. Called explicitly by VPT after `r`.
     */
    endBindingMapUpdateForElement(element: WxNativeElement): void

    /** Apply the cached class list and notify `change:class`; the element flush owns its dirty flag. */
    applyClassListUpdates(element: WxNativeElement): void

    /** Serialize cached pairs as `name:value;`, route through the component style property or MAIN, and notify change. */
    applyStyleListUpdates(element: WxNativeElement): void

    /** Invoke a registered change listener only when its value differs by strict equality; remember the new value first. */
    tryCallPropertyChangeListener(element: WxNativeElement, name: string, value: unknown): void

    /** Recognize legacy event prefixes and bind through `v` with dynamic replacement; return whether a prefix matched. */
    checkFallbackEventListener(
        element: WxNativeElement,
        camelName: string,
        value: unknown,
        generalLvaluePath?: DataPath | null
    ): boolean

    /** Set the filter applied when subsequent `p` calls register property-change listeners. */
    setFnFilter(filter: ChangePropertyFilter): void

    /** Set the wrapper used by subsequent `v` calls; undefined leaves the installed wrapper unchanged. */
    setEventListenerWrapper(wrapper?: EventListenerWrapper): void

    /** Return the persistent per-element DevTools metadata object; `A` contains active attribute names. */
    devArgs(element: WxNativeElement): { A?: string[] }

    // Compiled-template execution and child construction.

    /** Execute the compiler function in creation mode, insert its children into the shadow root, and return its binding map. */
    create(data: unknown): BindingMap | undefined

    /** Execute the compiler function in update mode, reconcile its children, and return its binding map. */
    update(
        data: unknown,
        dataUpdatePathTree: UpdatePathTree,
        bindingMap: BindingMap | undefined
    ): BindingMap | undefined

    /**
     * Run one field's binding-map updaters, flushing when their target element changes and after the final element.
     * Returns false when binding-map updates are disabled or that field has no updater list.
     */
    bindingMapUpdate(field: string, data: unknown, bindingMap: BindingMap): boolean

    /** Create text/element/branch/list/slot/virtual children; unmatched dynamic slots receive virtual placeholders. */
    handleChildrenCreation(
        children: DefineChildren,
        slotElement: WxNativeElement | undefined,
        dynamicSlotName: string | undefined
    ): WxNativeNode[]

    /** Create children through handleChildrenCreation and append the resulting batch to the parent. */
    handleChildrenCreationAndInsert(
        children: DefineChildren,
        parentNode: WxNativeElement | WxRoot,
        slotElement: WxNativeElement | undefined,
        dynamicSlotName: string | undefined
    ): void

    /** Reconcile compiled child positions, branch keys, keyed lists, properties, and slot assignments in place. */
    handleChildrenUpdate(
        children: DefineChildren,
        parentNode: WxNativeElement | WxRoot,
        slotElement: WxNativeElement | undefined,
        dynamicSlotName: string | undefined
    ): void

    /** Install dynamic-slot insertion/removal/value handlers; return the component's dynamic shadow root or null. */
    dynamicSlotUpdate(
        element: TemplateComponent,
        dynamicSlotValueNames: string[] | undefined,
        children: DefineChildren
    ): WxRoot | null

    /** Create a slot-associated virtual placeholder marked as unmatched; its backend is destroyed on removal. */
    createDynamicPlaceholder(slotElement: WxNativeElement): WxNativeElement

    /** Build a component/native initializer that configures dynamic slots, applies initial properties, and flushes slot updates. */
    getInitPropValuesCallback(
        initialize: PropertyInitializer,
        children: DefineChildren,
        dynamicSlotValueNames: string[] | undefined
    ): (element: WxNativeElement) => void

    /**
     * Create a component/native element with generic implementations and initialized properties/children.
     * Retain the initializer for asynchronous component placeholders; dynamic slots disable binding-map updates.
     * Mark the backend for destruction on removal.
     */
    createCommonElement(
        tagName: string,
        genericImplementations: Record<string, string>,
        initialize: PropertyInitializer,
        children: DefineChildren,
        dynamicSlotValueNames: string[] | undefined
    ): WxNativeElement
}
