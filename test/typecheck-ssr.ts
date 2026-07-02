import type {HtmlTag, SsrRenderOptions} from '../pepper-ssr'
import {component, portal, renderComponentToString, stableId} from '../pepper-ssr'
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
		const generatedId: string = stableId()
		const idLength: number = requestId.length
		idLength
		generatedId
		return tag => tag`<div id=${generatedId}>${requestId}</div>`
	},
)

const options: SsrRenderOptions<AppContext> = {
	context: {requestId: 'req-1'},
	identifierPrefix: 'ssr-',
}
const markup: string = renderComponentToString(SsrComponent, {}, options)
const ssrPortal = portal('#modal', html`<div>modal</div>`)

markup
ssrPortal()

// @ts-expect-error SSR context values should match the declared context shape
const badOptions: SsrRenderOptions<AppContext> = {context: {requestId: 1}}
