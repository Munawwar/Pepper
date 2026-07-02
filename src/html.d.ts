export type TemplateNodes = readonly (Element | Text)[]
export type WeakMapKey = symbol | object | Function
export type TemplateKey = WeakMapKey
export type TemplateMode = 'html' | 'svg' | 'mathml'

declare const FORCE_SYMBOL: unique symbol
declare const UNSAFE_HTML_SYMBOL: unique symbol
declare const UNSAFE_SVG_SYMBOL: unique symbol
declare const UNSAFE_MATHML_SYMBOL: unique symbol
declare const RAW_TEXT_SYMBOL: unique symbol

export type ForceValue<T = unknown> = {
	[FORCE_SYMBOL]: T
}

export type UnsafeHTMLValue = {
	[UNSAFE_HTML_SYMBOL]: string
}

export type UnsafeSVGValue = {
	[UNSAFE_SVG_SYMBOL]: string
}

export type UnsafeMathMLValue = {
	[UNSAFE_MATHML_SYMBOL]: string
}

export type RawTextValue = {
	[RAW_TEXT_SYMBOL]: string
}

export type TemplateMetadata = {
	readonly el?: HTMLTemplateElement
}

export type TemplateView = ((key?: TemplateKey, liveNodes?: readonly Node[]) => TemplateNodes) & {
	readonly template?: TemplateMetadata
}

export type PrimitiveChild = string | number | boolean | bigint | null | undefined
export type AttributeValue = string | number | boolean | bigint | null | undefined
export type ChildValue =
	| PrimitiveChild
	| Node
	| TemplateView
	| UnsafeHTMLValue
	| UnsafeSVGValue
	| UnsafeMathMLValue
	| RawTextValue
	| readonly ChildValue[]
export type EventValue<E extends Event = Event> = ((event: E) => unknown) | string | null | undefined | false | ''

type ElementForTag<Tag extends string> = Tag extends keyof HTMLElementTagNameMap
	? HTMLElementTagNameMap[Tag]
	: Tag extends keyof SVGElementTagNameMap
		? SVGElementTagNameMap[Tag]
		: Element

export type PropertyValue<Tag extends string, Prop extends string> = Prop extends keyof ElementForTag<Tag>
	? ElementForTag<Tag>[Prop]
	: unknown

/**
 * A Pepper `html` template tag function for declarative DOM creation and updates.
 */
export function html(strings: TemplateStringsArray, ...values: readonly unknown[]): TemplateView
/**
 * A Pepper `svg` template tag function for declarative SVG DOM creation and updates.
 */
export function svg(strings: TemplateStringsArray, ...values: readonly unknown[]): TemplateView
/**
 * A Pepper `mathml` template tag function for declarative MathML DOM creation and updates.
 */
export function mathml(strings: TemplateStringsArray, ...values: readonly unknown[]): TemplateView
/**
 * Wrap a value in `force()` to skip equality checks when applying updates.
 */
export function force<T>(value: T): ForceValue<T>
/**
 * Mark a string as trusted raw HTML and inject it without escaping.
 */
export function unsafeHTML(value: string): UnsafeHTMLValue
/**
 * Mark a string as trusted raw SVG and inject it without escaping.
 */
export function unsafeSVG(value: string): UnsafeSVGValue
/**
 * Mark a string as trusted raw MathML and inject it without escaping.
 */
export function unsafeMathML(value: string): UnsafeMathMLValue
/**
 * Emit raw text content without entity escaping.
 */
export function rawText(value: string): RawTextValue
