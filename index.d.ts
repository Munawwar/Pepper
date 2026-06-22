export * from './src/html.js'
export { Store } from './src/store.js'

export type RenderCallback = () => void
export type ContextInput = Record<string, unknown> | Map<string, unknown>
export type ComponentSetupApi<Props = Record<string, unknown>> = {
	getProps(): Props
	getContext(key: string): unknown
	hasContext(key: string): boolean
	onMount(handler: () => void | (() => void)): void
	onProps(handler: (changedProps: string[], oldProps: Props) => void): void
	setContext(key: string, value: unknown): unknown
	update(callback?: RenderCallback): void
}

export type ComponentModel = {
	render(html: typeof import('./src/html.js').html): unknown
	[key: string]: unknown
}

export type PepperComponent<Props = Record<string, unknown>> = (
	api: ComponentSetupApi<Props>
) => ComponentModel | ((html: typeof import('./src/html.js').html) => unknown)

export type ComponentOptions<Props = Record<string, unknown>> = {
	autoEffectEvent?: boolean
	memo?: boolean
	propsComparator?: (previousProps: Props, nextProps: Props) => boolean
}

export function component<Props = Record<string, unknown>>(
	factory: PepperComponent<Props>,
	options?: ComponentOptions<Props>,
): PepperComponent<Props>

export function state<T>(
	initialValue: T,
	comparator?: (nextValue: T, previousValue: T) => boolean,
): [() => T, (valueOrSetter: T | ((value: T) => T), callback?: false | RenderCallback) => void]

export function ref<T = Node>(): { current: T | null }

export function render<Props = Record<string, unknown>>(
	componentType: PepperComponent<Props>,
	container: string | Element,
	props?: Props,
	options?: { context?: ContextInput; debugKeys?: boolean },
): ComponentModel

export function hydrate<Props = Record<string, unknown>>(
	componentType: PepperComponent<Props>,
	container: string | Element,
	props?: Props,
	options?: { context?: ContextInput; debugKeys?: boolean },
): ComponentModel

export function renderToString<Props = Record<string, unknown>>(
	componentType: PepperComponent<Props>,
	props?: Props,
	options?: { context?: ContextInput; debugKeys?: boolean },
): string
