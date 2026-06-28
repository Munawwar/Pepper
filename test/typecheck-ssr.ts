import type {HtmlTag, SsrRenderOptions} from '../pepper-ssr'
import {component, renderComponentToString} from '../pepper-ssr'
import type {SsrTemplateView} from '../src/html-ssr.js'
import {html} from '../src/html-ssr.js'

type AppContext = {
	requestId: string
}

const ssrView: SsrTemplateView = html`<div>ok</div>`
const ssrTemplate = ssrView.template
const ssrResult = ssrView(Symbol())

ssrTemplate
ssrResult

const SsrComponent = component<Record<string, never>, (tag: HtmlTag) => unknown, AppContext>(
	function SsrComponent({getContext}) {
		const requestId = getContext('requestId')
		const idLength: number = requestId.length
		idLength
		return tag => tag`<div>${requestId}</div>`
	},
)

const options: SsrRenderOptions<AppContext> = {
	context: {requestId: 'req-1'},
}
const markup: string = renderComponentToString(SsrComponent, {}, options)

markup

// @ts-expect-error SSR context values should match the declared context shape
const badOptions: SsrRenderOptions<AppContext> = {context: {requestId: 1}}
