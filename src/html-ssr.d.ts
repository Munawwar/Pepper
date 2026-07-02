export type TemplateMode = 'html' | 'svg' | 'mathml'
export type WeakMapKey = symbol | object | Function
export type TemplateKey = WeakMapKey

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

export type SsrTemplateResult = {
	mode: TemplateMode
	strings: TemplateStringsArray
	values: readonly unknown[]
}
export type SsrTemplateMetadata = {
	readonly mode: TemplateMode
	readonly strings: TemplateStringsArray
}

export type SsrTemplateView = ((key?: TemplateKey, liveNodes?: readonly unknown[]) => SsrTemplateResult) & {
	readonly template: SsrTemplateMetadata
}

/**
 * A Pepper `html` template tag function for server-side rendering.
 */
export function html(strings: TemplateStringsArray, ...values: readonly unknown[]): SsrTemplateView
/**
 * A Pepper `svg` template tag function for server-side rendering.
 */
export function svg(strings: TemplateStringsArray, ...values: readonly unknown[]): SsrTemplateView
/**
 * A Pepper `mathml` template tag function for server-side rendering.
 */
export function mathml(strings: TemplateStringsArray, ...values: readonly unknown[]): SsrTemplateView
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
export function clearTemplateCache(): void
/**
 * Serialize a Pepper SSR template value to a string.
 */
export function renderToString(value: unknown): string
