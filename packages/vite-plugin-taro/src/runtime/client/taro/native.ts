import type { ComponentType, PropsWithChildren } from 'react'

export type NativeComponentEvent<Detail> = {
    readonly detail: Detail
}

/** Defines a typed JSX interface from a static `() => import('./relative-entry.js')` reference. */
export function defineNativeComponent(loadEntry: () => Promise<unknown>): ComponentType<PropsWithChildren>
export function defineNativeComponent<const Props extends object>(
    loadEntry: () => Promise<unknown>
): ComponentType<PropsWithChildren<Props>>
export function defineNativeComponent(loadEntry: () => Promise<unknown>): never {
    void loadEntry
    throw new Error('Native component interface was not compiled')
}
