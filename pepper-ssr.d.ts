export * from './src/html-ssr.js'
export { component, ref, state } from './index.js'

export type RenderCallback = () => void
export type ComponentSetupApi<Props = Record<string, unknown>> = {
	getProps(): Props
	onMount(handler: () => void | (() => void)): void
	onProps(handler: (changedProps: string[], oldProps: Props) => void): void
	update(callback?: RenderCallback): void
}

export type ComponentModel = {
	render(html: typeof import('./src/html-ssr.js').html): unknown
	[key: string]: unknown
}

export type PepperComponent<Props = Record<string, unknown>> = (
	api: ComponentSetupApi<Props>
) => ComponentModel | ((html: typeof import('./src/html-ssr.js').html) => unknown)

export function renderComponentToString<Props = Record<string, unknown>>(
	componentType: PepperComponent<Props>,
	props?: Props,
): string
