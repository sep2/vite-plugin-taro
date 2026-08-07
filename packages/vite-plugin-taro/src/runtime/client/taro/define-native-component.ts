import type { ComponentType, PropsWithChildren } from 'react'

type NativeSchema =
    | StringConstructor
    | NumberConstructor
    | BooleanConstructor
    | ObjectConstructor
    | ArrayConstructor
    | { readonly [name: string]: NativeSchema }

type SchemaValue<Schema> = Schema extends StringConstructor
    ? string
    : Schema extends NumberConstructor
      ? number
      : Schema extends BooleanConstructor
        ? boolean
        : Schema extends ObjectConstructor
          ? Readonly<Record<string, unknown>>
          : Schema extends ArrayConstructor
            ? readonly unknown[]
            : Schema extends Readonly<Record<string, NativeSchema>>
              ? { readonly [Name in keyof Schema]: SchemaValue<Schema[Name]> }
              : never

type PropertyProps<Properties> = {
    [Name in keyof Properties]: SchemaValue<Properties[Name]>
}

type EventProps<Events> = {
    [Name in keyof Events as Name extends string ? `on${Capitalize<Name>}` : never]?: (event: {
        readonly detail: SchemaValue<Events[Name]>
    }) => void
}

/** Defines a typed JSX interface from a static `() => import('./relative-entry.js')` reference. */
export function defineNativeComponent<
    const Properties extends Readonly<Record<string, NativeSchema>>,
    const Events extends Readonly<Record<string, NativeSchema>>
>(
    loadEntry: () => Promise<unknown>,
    schema: {
        readonly properties: Properties
        readonly events: Events
    }
): ComponentType<PropsWithChildren<PropertyProps<Properties> & EventProps<Events>>> {
    void loadEntry
    void schema
    throw new Error('Native component interface was not compiled')
}
