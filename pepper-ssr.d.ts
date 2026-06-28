export * from './src/html-ssr.js'
export { ref, state } from './index.js'

export type RenderCallback = () => void
export type PepperContext = Record<string, unknown>
export type ContextInput<Context extends PepperContext = PepperContext> =
	| Context
	| ReadonlyMap<Extract<keyof Context, string>, Context[Extract<keyof Context, string>]>
export type HtmlTag = typeof import('./src/html-ssr.js').html
export type ComponentSetupApi<Props = Record<string, unknown>, Context extends PepperContext = PepperContext> = {
	getProps(): Props
	getContext<Key extends Extract<keyof Context, string>>(key: Key): Context[Key]
	getContext(key: string): unknown
	hasContext(key: string): boolean
	onMount(handler: () => void | (() => void)): void
	onProps(handler: (changedProps: string[], oldProps: Props) => void): void
	setContext<Key extends Extract<keyof Context, string>>(key: Key, value: Context[Key]): Context[Key]
	setContext<Key extends string, Value>(key: Exclude<Key, Extract<keyof Context, string>>, value: Value): Value
	update(callback?: RenderCallback): void
}

export type ComponentRenderFunction = (html: HtmlTag) => unknown
export type ComponentModel = {
	render(html: HtmlTag): unknown
	[key: string]: unknown
}
export type ComponentFactoryResult = ComponentModel | ComponentRenderFunction

export type PepperComponent<
	Props = Record<string, unknown>,
	Result extends ComponentFactoryResult = ComponentFactoryResult,
	Context extends PepperContext = PepperContext,
> = (
	api: ComponentSetupApi<Props, Context>
) => Result
export type SsrRenderOptions<Context extends PepperContext = PepperContext> = {
	context?: ContextInput<Context>
}

export function component<
	Props = Record<string, unknown>,
	Result extends ComponentFactoryResult = ComponentFactoryResult,
	Context extends PepperContext = PepperContext,
>(
	factory: PepperComponent<Props, Result, Context>,
	options?: import('./index.js').ComponentOptions<Props>,
): PepperComponent<Props, Result, Context>

export function renderComponentToString<
	Props = Record<string, unknown>,
	Result extends ComponentFactoryResult = ComponentFactoryResult,
	Context extends PepperContext = PepperContext,
>(
	componentType: PepperComponent<Props, Result, Context>,
	props?: Props,
	options?: SsrRenderOptions<Context>,
): string
