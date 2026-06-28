export * from './src/html.js'
export { Store } from './src/store.js'

export type RenderCallback = () => void
export type PepperContext = Record<string, unknown>
export type ContextInput<Context extends PepperContext = PepperContext> =
	| Context
	| ReadonlyMap<Extract<keyof Context, string>, Context[Extract<keyof Context, string>]>
export type HtmlTag = typeof import('./src/html.js').html
export type ComponentSetupApi<Props = Record<string, unknown>, Context extends PepperContext = PepperContext> = {
	getProps(): Props
	getContext<Key extends Extract<keyof Context, string>>(key: Key): Context[Key]
	getContext(key: string): unknown
	getError(): unknown | null
	hasContext(key: string): boolean
	onMount(handler: () => void | (() => void)): void
	onProps(handler: (changedProps: string[], oldProps: Props) => void): void
	resetError(): void
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
export type ResolvedComponentModel<Result extends ComponentFactoryResult> = Result extends ComponentRenderFunction
	? { render: Result }
	: Result

export type PepperComponent<
	Props = Record<string, unknown>,
	Result extends ComponentFactoryResult = ComponentFactoryResult,
	Context extends PepperContext = PepperContext,
> = (
	api: ComponentSetupApi<Props, Context>
) => Result

export type ComponentOptions<Props = Record<string, unknown>> = {
	autoEffectEvent?: boolean
	errorBoundary?: boolean
	memo?: boolean
	propsComparator?: ((previousProps: Props, nextProps: Props) => boolean) | null
}
export type RootContainer = string | Element
export type PortalTarget = RootContainer
export type PortalRenderable = (key?: import('./src/html.js').TemplateKey) => []
export type RootOptions<Context extends PepperContext = PepperContext> = {
	context?: ContextInput<Context>
	debugKeys?: boolean
}

export function component<
	Props = Record<string, unknown>,
	Result extends ComponentFactoryResult = ComponentFactoryResult,
	Context extends PepperContext = PepperContext,
>(
	factory: PepperComponent<Props, Result, Context>,
	options?: ComponentOptions<Props>,
): PepperComponent<Props, Result, Context>

export function state<T>(
	initialValue: T,
	comparator?: (nextValue: T, previousValue: T) => boolean,
): [() => T, (valueOrSetter: T | ((value: T) => T), callback?: false | RenderCallback) => void]

export function ref<T = Node>(): { current: T | null }
export function portal(target: PortalTarget, renderable: unknown): PortalRenderable

export function render<
	Props = Record<string, unknown>,
	Result extends ComponentFactoryResult = ComponentFactoryResult,
	Context extends PepperContext = PepperContext,
>(
	componentType: PepperComponent<Props, Result, Context>,
	container: RootContainer,
	props?: Props,
	options?: RootOptions<Context>,
): ResolvedComponentModel<Result>

export function hydrate<
	Props = Record<string, unknown>,
	Result extends ComponentFactoryResult = ComponentFactoryResult,
	Context extends PepperContext = PepperContext,
>(
	componentType: PepperComponent<Props, Result, Context>,
	container: RootContainer,
	props?: Props,
	options?: RootOptions<Context>,
): ResolvedComponentModel<Result>

export function renderToString<
	Props = Record<string, unknown>,
	Result extends ComponentFactoryResult = ComponentFactoryResult,
	Context extends PepperContext = PepperContext,
>(
	componentType: PepperComponent<Props, Result, Context>,
	props?: Props,
	options?: RootOptions<Context>,
): string
