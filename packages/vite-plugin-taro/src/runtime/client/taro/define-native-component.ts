import type { ComponentType } from 'react'

export type NativeSchema =
    | StringConstructor
    | NumberConstructor
    | BooleanConstructor
    | ObjectConstructor
    | ArrayConstructor
    | { readonly [name: string]: NativeSchema }

export type NativeEventHandler<Detail> = (event: { readonly detail: Detail }) => void

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
    [Name in keyof Events]?: NativeEventHandler<SchemaValue<Events[Name]>>
}

/** Defines a typed native facade that the target compiler must replace before runtime. */
export function defineNativeComponent<
    const Properties extends Readonly<Record<string, NativeSchema>>,
    const Events extends Readonly<Record<string, NativeSchema>>
>(
    folder: string,
    _schema: {
        readonly properties: Properties
        readonly events: Events
    }
): ComponentType<PropertyProps<Properties> & EventProps<Events>> {
    throw new Error(`Native component facade was not compiled: ${folder}`)
}
