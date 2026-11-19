// @ts-nocheck

import * as Pepper from '../src/index.js'
import {html as domHtml, mathml as domMathml, svg as domSvg} from '../src/html.js'
import {renderComponentToString} from '../src/pepper-ssr.js'

const {component, hydrate, portal, render, state, stableId} = Pepper

function assert(condition, message) {
	if (!condition) throw new Error(message)
}

function assertEquals(actual, expected, message) {
	if (!Object.is(actual, expected))
		throw new Error(`${message}\nExpected: ${String(expected)}\nActual: ${String(actual)}`)
}

function assertThrows(callback, pattern, message) {
	try {
		callback()
	} catch (error) {
		if (pattern.test(String(error))) return
		throw error
	}
	throw new Error(message)
}

const flushRender = () => Promise.resolve()
const createContainer = () => document.body.appendChild(document.createElement('div'))
const throwOnRealize = message => () => { throw new Error(message) }
const createBoundary = () => component(function Boundary({getError, getProps}) {
	return html => getError() ? html`<p>fallback</p>` : getProps().children?.()
}, {errorBoundary: true})
const renderWithBoundary = Child => {
	const Boundary = createBoundary()
	function App() {
		return html => html`<${Boundary}><${Child} /></${Boundary}>`
	}
	const container = createContainer()
	render(App, container)
	return container
}

describe('Known Pepper browser regressions', () => {
	afterEach(() => document.body.replaceChildren())

	it.skip('[A02] renders when WeakMap only accepts object keys', () => {
		const originalSet = WeakMap.prototype.set
		WeakMap.prototype.set = function setObjectKeyOnly(key, value) {
			if (typeof key === 'symbol') throw new TypeError('Invalid value used as weak map key')
			return originalSet.call(this, key, value)
		}

		try {
			const [element] = domHtml`<div>compatible</div>`()
			assertEquals(element.textContent, 'compatible', 'Safari 15.6 should render without symbol weak keys')
		} finally {
			WeakMap.prototype.set = originalSet
		}
	})

	it('[A03] commits a child-local root template change', async () => {
		let showOn

		function Child() {
			const [getOn, setOn] = state(false)
			showOn = () => setOn(true)
			return html => getOn() ? html`<strong>on</strong>` : html`<em>off</em>`
		}

		function App() {
			return html => html`<section><${Child} /></section>`
		}

		const container = createContainer()
		render(App, container)
		showOn()
		await flushRender()

		assertEquals(container.innerHTML, '<section><strong>on</strong></section>', 'The new child root should replace the old root')
	})

	it('[A03] removes every node owned after an empty-to-complex transition', async () => {
		let showChildContent
		let hideChild

		function Child() {
			const [getVisible, setVisible] = state(false)
			showChildContent = () => setVisible(true)
			return html => html`${getVisible() ? html`<b>child</b>` : ''}`
		}

		function App() {
			const [getVisible, setVisible] = state(true)
			hideChild = () => setVisible(false)
			return html => html`<section>${getVisible() ? html`<${Child} />` : ''}</section>`
		}

		const container = createContainer()
		render(App, container)
		showChildContent()
		await flushRender()
		hideChild()
		await flushRender()

		assertEquals(container.innerHTML, '<section></section>', 'Removing the child should clear nodes created by its local update')
	})

	it('[A03] reconciles nested empty and multi-root transitions without remounting', async () => {
		let setMode
		let childSetups = 0
		let middleSetups = 0

		function Child() {
			childSetups++
			const [getMode, updateMode] = state(0)
			setMode = updateMode
			return html => {
				if (getMode() === 0) return html``
				if (getMode() === 1) return html`<b>one</b><i>two</i>`
				return html`<u>three</u>`
			}
		}

		function Middle() {
			middleSetups++
			return html => html`<article><${Child} /></article>`
		}

		function App() {
			return html => html`<section><${Middle} /><span>stable</span></section>`
		}

		const container = createContainer()
		render(App, container)
		const stableNode = container.querySelector('span')

		setMode(1)
		await flushRender()
		assertEquals(container.innerHTML, '<section><article><b>one</b><i>two</i></article><span>stable</span></section>', 'Empty output should grow to multiple roots')
		setMode(2)
		await flushRender()
		assertEquals(container.innerHTML, '<section><article><u>three</u></article><span>stable</span></section>', 'Multiple roots should switch template shape')
		setMode(0)
		await flushRender()

		assertEquals(container.innerHTML, '<section><article></article><span>stable</span></section>', 'The child should reconcile back to empty output')
		assertEquals(childSetups, 1, 'The child should retain its runtime')
		assertEquals(middleSetups, 1, 'Ancestor components should not remount')
		assertEquals(container.querySelector('span'), stableNode, 'Unchanged sibling DOM should retain identity')
	})

	it('[A03] preserves local state through a component-only root transition', async () => {
		let showContent
		let setups = 0

		function Child() {
			setups++
			const [getVisible, setVisible] = state(false)
			showContent = () => setVisible(true)
			return html => getVisible() ? html`<b>visible</b><i>roots</i>` : html``
		}

		function App() {
			return html => html`<${Child} />`
		}

		const container = createContainer()
		render(App, container)
		showContent()
		await flushRender()

		assertEquals(container.innerHTML, '<b>visible</b><i>roots</i>', 'A component-only root should reconcile local state')
		assertEquals(setups, 1, 'The child runtime should survive its root transition')
	})

	it('[A03] reconciles batched sibling transitions within one interpolation', async () => {
		const expand = new Map()
		let hideItems

		function Item({getProps}) {
			const [getExpanded, setExpanded] = state(false)
			const id = getProps().id
			expand.set(id, () => setExpanded(true))
			return html => getExpanded() ? html`<b>${id}</b><i>expanded</i>` : html`<span>${id}</span>`
		}

		function App() {
			const [getVisible, setVisible] = state(true)
			hideItems = () => setVisible(false)
			return html => html`
				<section>${getVisible() ? ['a', 'b'].map(id => html`<${Item} key=${id} id=${id} />`) : ''}</section>
			`
		}

		const container = createContainer()
		render(App, container)
		expand.get('a')()
		expand.get('b')()
		await flushRender()

		assertEquals(container.innerHTML, '<section><b>a</b><i>expanded</i><b>b</b><i>expanded</i></section>', 'Each sibling should replace only its own segment')
		hideItems()
		await flushRender()
		assertEquals(container.innerHTML, '<section></section>', 'Removing the list should clear every locally replaced segment')
	})

	it('[A03] reactivates a shared ref when restoring a cached root template', async () => {
		let toggle
		let elementRef

		function App() {
			elementRef = Pepper.ref()
			const [getOn, setOn] = state(false)
			toggle = () => setOn(value => !value)
			return html => getOn() ? html`<strong ref=${elementRef}>on</strong>` : html`<em ref=${elementRef}>off</em>`
		}

		const container = createContainer()
		render(App, container)
		const cachedElement = container.querySelector('em')
		toggle()
		await flushRender()
		assertEquals(elementRef.current, container.querySelector('strong'), 'The newly active root should claim the ref')
		toggle()
		await flushRender()

		assertEquals(container.querySelector('em'), cachedElement, 'The cached root should retain node identity')
		assertEquals(elementRef.current, cachedElement, 'The restored cached root should reclaim the ref')
	})

	it('[A03] clears refs omitted by the next root template', async () => {
		let hide
		let elementRef

		function App() {
			elementRef = Pepper.ref()
			const [getVisible, setVisible] = state(true)
			hide = () => setVisible(false)
			return html => getVisible() ? html`<span ref=${elementRef}>on</span>` : html`<b>off</b>`
		}

		const container = createContainer()
		render(App, container)
		hide()
		await flushRender()

		assertEquals(elementRef.current, null, 'A detached root should release its ref')
	})

	it('[A03] updates refs across nested cached template transitions', async () => {
		let toggle
		let elementRef

		function App() {
			elementRef = Pepper.ref()
			const [getOn, setOn] = state(false)
			toggle = () => setOn(value => !value)
			return html => html`<section>${getOn() ? html`<strong ref=${elementRef}>on</strong>` : html`<em ref=${elementRef}>off</em>`}</section>`
		}

		const container = createContainer()
		render(App, container)
		const cachedElement = container.querySelector('em')
		toggle()
		await flushRender()
		assertEquals(elementRef.current, container.querySelector('strong'), 'The active nested template should claim the ref')
		toggle()
		await flushRender()

		assertEquals(elementRef.current, cachedElement, 'The restored nested template should reclaim the ref')
	})

	it('[A04] preserves an unkeyed component-only child across parent renders', () => {
		let setups = 0

		function Child({getProps}) {
			setups++
			return html => html`<span>${getProps().value}</span>`
		}

		function App({getProps}) {
			return html => html`<${Child} value=${getProps().value} />`
		}

		const container = createContainer()
		render(App, container, {value: 'first'})
		const firstSpan = container.firstElementChild
		render(App, container, {value: 'second'})

		assertEquals(setups, 1, 'The child should not be recreated')
		assertEquals(container.firstElementChild, firstSpan, 'The child DOM should retain identity')
		assertEquals(container.textContent, 'second', 'The retained child should receive new props')
	})

	it('[A04] preserves distinct unkeyed children in component-only slots', () => {
		let setups = 0

		function Child({getProps}) {
			setups++
			return html => html`<span>${getProps().value}</span>`
		}

		function App({getProps}) {
			return html => {
				const {first, second} = getProps()
				return html`<${Child} value=${first} /><${Child} value=${second} />`
			}
		}

		const container = createContainer()
		render(App, container, {first: 'one', second: 'two'})
		const initialSpans = Array.from(container.querySelectorAll('span'))
		render(App, container, {first: 'three', second: 'four'})
		const updatedSpans = Array.from(container.querySelectorAll('span'))

		assertEquals(setups, 2, 'Each positional child should be created once')
		assertEquals(updatedSpans[0], initialSpans[0], 'The first slot should retain its child')
		assertEquals(updatedSpans[1], initialSpans[1], 'The second slot should retain its child')
		assertEquals(container.textContent, 'threefour', 'Both retained children should receive new props')
	})

	it('[A04] hydrates a component-only root and binds its live node', async () => {
		function Child() {
			const [getCount, setCount] = state(0)
			return html => html`<button @click=${() => setCount(getCount() + 1)}>${getCount()}</button>`
		}

		function App() {
			return html => html`<${Child} />`
		}

		const container = createContainer()
		container.innerHTML = '<button>0</button>'
		const liveButton = container.firstElementChild

		hydrate(App, container)
		liveButton.click()
		await flushRender()

		assertEquals(container.firstElementChild, liveButton, 'Hydration should adopt the server-rendered button')
		assertEquals(liveButton.textContent, '1', 'Hydration should attach the child event handler')
	})

	it('[A05] hydrates a top-level dynamic template range', () => {
		const container = createContainer()
		container.innerHTML = '<span>live</span>'
		const liveSpan = container.firstElementChild
		const key = {}
		const view = value => domHtml`${value}`

		const [span] = view(domHtml`<span>live</span>`)(key, Array.from(container.childNodes))

		assertEquals(span, liveSpan, 'Hydration should adopt the top-level dynamic node')
		assertEquals(container.firstElementChild, liveSpan, 'The adopted node should remain in the container')

		view(domHtml`<strong>next</strong>`)(key)
		assertEquals(container.innerHTML, '<strong>next</strong>', 'The hydrated range should remain live for updates')
	})

	it('[A06] treats unsupported event values as no handler', () => {
		let clicks = 0
		const key = {}
		const view = handler => domHtml`<button @click=${handler}>click</button>`(key)
		const container = createContainer()
		const [button] = view(() => clicks++)
		container.append(button)
		button.click()
		view(123)
		button.click()
		view({handleEvent: () => clicks++})
		button.click()

		assertEquals(clicks, 1, 'Unsupported values should remove the previous handler without throwing')
	})

	it('[A06] catches descendant effect errors in an error boundary', () => {
		const Boundary = createBoundary()

		function Broken({effect, getProps}) {
			effect((dependencies, previousDependencies) => {
				if (previousDependencies) throw new Error('prop failure')
			}, () => [getProps().value])
			return html => html`<span>${getProps().value}</span>`
		}

		function App({getProps}) {
			return html => html`<div><${Boundary}><${Broken} value=${getProps().value} /></${Boundary}></div>`
		}

		const container = createContainer()
		render(App, container, {value: 1})
		render(App, container, {value: 2})

		assertEquals(container.textContent, 'fallback', 'The boundary should catch the effect failure')
	})

	it('[A06] catches descendant effect errors without dropping pending effects', () => {
		const Boundary = createBoundary()
		let cleanups = 0
		let siblingMounts = 0

		function Broken({effect}) {
			effect(() => () => cleanups++, () => [])
			effect(() => {
				throw new Error('mount failure')
			}, () => [])
			return html => html`<span>broken</span>`
		}

		function Sibling({effect}) {
			effect(() => siblingMounts++, () => [])
			return html => html`<span>sibling</span>`
		}

		function App() {
			return html => html`<${Boundary}><${Broken} /></${Boundary}><${Sibling} />`
		}

		const container = createContainer()
		render(App, container)

		assertEquals(container.textContent, 'fallbacksibling', 'The boundary should replace only the failed subtree')
		assertEquals(cleanups, 1, 'Cleanups registered before the failure should run')
		assertEquals(siblingMounts, 1, 'A later sibling should still mount')
	})

	it('[A06] sends a boundary effect error to its ancestor', () => {
		const OuterBoundary = component(function OuterBoundary({getError, getProps}) {
			return html => getError() ? html`<p>outer fallback</p>` : getProps().children?.()
		}, {errorBoundary: true})
		const InnerBoundary = component(function InnerBoundary({effect, getError, getProps}) {
			effect(() => {
				throw new Error('inner mount failure')
			}, () => [])
			return html => getError() ? html`<p>inner fallback</p>` : getProps().children?.()
		}, {errorBoundary: true})

		function App() {
			return html => html`<${OuterBoundary}><${InnerBoundary}><span>child</span></${InnerBoundary}></${OuterBoundary}>`
		}

		const container = createContainer()
		render(App, container)

		assertEquals(container.textContent, 'outer fallback', 'A boundary should not catch its own mount error')
	})

	it('[A06] catches descendant effect cleanup errors in an error boundary', () => {
		let laterCleanups = 0

		function Broken({effect}) {
			effect(() => () => {
				throw new Error('cleanup failure')
			}, () => [])
			effect(() => () => laterCleanups++, () => [])
			return html => html`<span>broken</span>`
		}
		const Boundary = component(function Boundary({getError, getProps}) {
			return html => getError()
				? html`<p>fallback</p>`
				: getProps().show ? html`<${Broken} />` : html`<span>removed</span>`
		}, {errorBoundary: true})

		function App({getProps}) {
			return html => html`<${Boundary} show=${getProps().show} />`
		}

		const container = createContainer()
		render(App, container, {show: true})
		render(App, container, {show: false})

		assertEquals(container.textContent, 'fallback', 'The boundary should catch the mount cleanup failure')
		assertEquals(laterCleanups, 1, 'A failed cleanup should not prevent later cleanups')
	})

	it('[A06] lets a root boundary catch an effect cleanup error', () => {
		function Broken({effect}) {
			effect(() => () => {
				throw new Error('root cleanup failure')
			}, () => [])
			return html => html`<span>broken</span>`
		}
		const App = component(function App({getError, getProps}) {
			return html => getError()
				? html`<p>root fallback</p>`
				: getProps().show ? html`<${Broken} />` : html`<span>removed</span>`
		}, {errorBoundary: true})

		const container = createContainer()
		render(App, container, {show: true})
		render(App, container, {show: false})

		assertEquals(container.textContent, 'root fallback', 'The root boundary should catch its child cleanup error')
	})

	it('[A06] skips a destroyed boundary when an effect cleanup throws', () => {
		function Broken({effect}) {
			effect(() => () => {
				throw new Error('nested cleanup failure')
			}, () => [])
			return html => html`<span>broken</span>`
		}
		const InnerBoundary = component(function InnerBoundary({getError}) {
			return html => getError() ? html`<p>inner fallback</p>` : html`<${Broken} />`
		}, {errorBoundary: true})
		const OuterBoundary = component(function OuterBoundary({getError, getProps}) {
			return html => getError()
				? html`<p>outer fallback</p>`
				: getProps().show ? html`<${InnerBoundary} />` : html`<span>removed</span>`
		}, {errorBoundary: true})

		function App({getProps}) {
			return html => html`<${OuterBoundary} show=${getProps().show} />`
		}

		const container = createContainer()
		render(App, container, {show: true})
		render(App, container, {show: false})

		assertEquals(container.textContent, 'outer fallback', 'The active outer boundary should catch the cleanup error')
	})

	it('[A06] catches multiple effect cleanup errors during a scheduled update', async () => {
		let hideChildren
		let cleanups = 0

		function Broken({effect}) {
			effect(() => () => {
				cleanups++
				throw new Error('scheduled cleanup failure')
			}, () => [])
			return html => html`<span>broken</span>`
		}
		const Boundary = component(function Boundary({getError}) {
			const [getVisible, setVisible] = state(true)
			hideChildren = () => setVisible(false)
			return html => getError()
				? html`<p>fallback</p>`
				: getVisible() ? html`<${Broken} /><${Broken} />` : html`<span>removed</span>`
		}, {errorBoundary: true})

		const container = createContainer()
		render(Boundary, container)
		hideChildren()
		await flushRender()

		assertEquals(container.textContent, 'fallback', 'The boundary should remain active through cleanup retries')
		assertEquals(cleanups, 2, 'Every removed component cleanup should run')
	})

	it('[A06] runs every changed effect cleanup before reporting an error', () => {
		let cleanups = 0
		function Broken({effect, getProps}) {
			effect(() => () => {
				cleanups++
				throw new Error('dependency cleanup failure')
			}, () => [getProps().value])
			effect(() => () => cleanups++, () => [getProps().value])
			return html => html`<span>${getProps().value}</span>`
		}
		const Boundary = createBoundary()
		function App({getProps}) {
			return html => html`<${Boundary}><${Broken} value=${getProps().value} /></${Boundary}>`
		}

		const container = createContainer()
		render(App, container, {value: 1})
		render(App, container, {value: 2})

		assertEquals(container.textContent, 'fallback', 'The boundary should catch the dependency cleanup error')
		assertEquals(cleanups, 2, 'One failed cleanup should not prevent the other changed cleanup')
	})

	it('[A06] catches a nested renderable error during DOM realization', () => {
		function Broken() {
			return html => html`<div>${throwOnRealize('nested renderable failure')}</div>`
		}

		const container = renderWithBoundary(Broken)

		assertEquals(container.textContent, 'fallback', 'The boundary should catch the nested renderable failure')
	})

	it('[A06] catches a custom-element property setter error during DOM realization', () => {
		const elementName = 'pepper-a06-throwing-property'
		if (!customElements.get(elementName)) customElements.define(elementName, class extends HTMLElement {
			set explode(_value) {
				throw new Error('property setter failure')
			}
		})
		function Broken() {
			return html => html`<pepper-a06-throwing-property .explode=${true}></pepper-a06-throwing-property>`
		}

		const container = renderWithBoundary(Broken)

		assertEquals(container.textContent, 'fallback', 'The boundary should catch the property setter failure')
	})

	it('[A06] sends a boundary DOM-realization error to its ancestor', () => {
		const OuterBoundary = component(function OuterBoundary({getError, getProps}) {
			return html => getError() ? html`<p>outer fallback</p>` : getProps().children?.()
		}, {errorBoundary: true})
		const InnerBoundary = component(function InnerBoundary({getError}) {
			return html => getError()
				? html`<p>inner fallback</p>`
				: html`<div>${throwOnRealize('inner realization failure')}</div>`
		}, {errorBoundary: true})

		function App() {
			return html => html`<${OuterBoundary}><${InnerBoundary} /></${OuterBoundary}>`
		}

		const container = createContainer()
		render(App, container)

		assertEquals(container.textContent, 'outer fallback', 'A boundary should not catch its own realization error')
	})

	it('[A06] catches portal target errors during DOM realization', () => {
		function Broken() {
			return html => html`<div>${portal('#pepper-a06-missing-portal', 'portal')}</div>`
		}

		const container = renderWithBoundary(Broken)

		assertEquals(container.textContent, 'fallback', 'The boundary should catch portal target resolution failures')
	})

	it('[A06] removes portal output after a later DOM-realization error', () => {
		const portalTarget = createContainer()

		function Broken() {
			return html => html`${portal(portalTarget, 'portal')}${throwOnRealize('failure after portal')}`
		}

		const container = renderWithBoundary(Broken)

		assertEquals(container.textContent, 'fallback', 'The boundary should catch the later realization failure')
		assertEquals(portalTarget.textContent, '', 'The failed component should remove its portal output')
	})

	it('[A06] catches DOM-realization errors during a scheduled child update', async () => {
		const Boundary = createBoundary()
		let breakChild

		function Broken() {
			const [getBroken, setBroken] = state(false)
			breakChild = () => setBroken(true)
			return html => getBroken()
				? html`${throwOnRealize('scheduled realization failure')}`
				: html`<span>ready</span>`
		}

		function App() {
			return html => html`<${Boundary}><${Broken} /></${Boundary}>`
		}

		const container = createContainer()
		render(App, container)
		breakChild()
		await flushRender()

		assertEquals(container.textContent, 'fallback', 'The boundary should catch a scheduled realization failure')
	})

	it('[A06] sends a scheduled boundary realization error to its ancestor', async () => {
		let breakBoundary
		const OuterBoundary = component(function OuterBoundary({getError, getProps}) {
			return html => getError() ? html`<p>outer fallback</p>` : getProps().children?.()
		}, {errorBoundary: true})
		const InnerBoundary = component(function InnerBoundary({getError}) {
			const [getBroken, setBroken] = state(false)
			breakBoundary = () => setBroken(true)
			return html => getError()
				? html`<p>inner fallback</p>`
				: getBroken()
					? html`${throwOnRealize('scheduled inner realization failure')}`
					: html`<span>ready</span>`
		}, {errorBoundary: true})

		function App() {
			return html => html`<${OuterBoundary}><${InnerBoundary} /></${OuterBoundary}>`
		}

		const container = createContainer()
		render(App, container)
		breakBoundary()
		await flushRender()

		assertEquals(container.textContent, 'outer fallback', 'The inner boundary should not catch its scheduled failure')
	})

	it('[A06] rethrows a DOM-realization error without an ancestor boundary', () => {
		function Broken() {
			return html => html`${throwOnRealize('uncaught realization failure')}`
		}

		const container = createContainer()
		assertThrows(
			() => render(Broken, container),
			/uncaught realization failure/,
			'A root realization error should remain uncaught',
		)
	})

	it('[A07] preserves property casing around quoted greater-than characters', () => {
		const [element] = domHtml`
			<div .beforeProp=${1} title="a > b > c" .afterProp=${2} !.forcedProp=${3}></div>
		`({})

		assertEquals(element.beforeProp, 1, 'A property before the quoted delimiter should be assigned')
		assertEquals(element.afterProp, 2, 'A property after the quoted delimiter should preserve casing')
		assertEquals(element.forcedProp, 3, 'A forced property after the quoted delimiter should preserve casing')
		assertEquals(element.afterprop, undefined, 'A lower-cased shadow property should not be created')
	})

	it('[A07] preprocesses custom events and spreads after a single-quoted greater-than character', () => {
		let events = 0
		const [element] = domHtml`
			<div title='literal > .notAProperty' @someEvent=${() => events++} ...${{'.spreadProp': 4}}></div>
		`({})

		element.dispatchEvent(new Event('someEvent'))
		assertEquals(events, 1, 'The custom event name should preserve casing')
		assertEquals(element.spreadProp, 4, 'The spread after the quoted delimiter should be applied')
		assertEquals(element.title, 'literal > .notAProperty', 'Binding syntax inside quotes should remain literal')
	})

	it('[A07] accepts quoted less-than and repeated greater-than characters', () => {
		const [element] = domHtml`<div title="a < b > c > d" .someProp=${42}></div>`({})

		assertEquals(element.title, 'a < b > c > d', 'Quoted delimiters should remain in the attribute value')
		assertEquals(element.someProp, 42, 'The following property should preserve casing')
	})

	it('[A07] preserves SVG and MathML property casing after quoted delimiters', () => {
		const [circle] = domSvg`<circle title="a > b" .customProp=${'svg'} />`({})
		const [mi] = domMathml`<mi title='a > b' .customProp=${'mathml'}></mi>`({})

		assertEquals(circle.customProp, 'svg', 'The SVG property should preserve casing')
		assertEquals(mi.customProp, 'mathml', 'The MathML property should preserve casing')
	})

	it('[A09] lets a custom comparator suppress a removed prop', () => {
		let renders = 0
		let comparison = true
		let getLatestProps
		const Child = component(function Child({getProps}) {
			getLatestProps = getProps
			return html => {
				renders++
				return html`<span>${String(getProps().ignored ?? '')}</span>`
			}
		}, {propsComparator: () => comparison})

		function App({getProps}) {
			return html => html`<div><${Child} ...${getProps()} /></div>`
		}

		const container = createContainer()
		render(App, container, {ignored: 1})
		render(App, container, {})
		comparison = []
		render(App, container, {latest: 2})

		assertEquals(renders, 1, 'Both true and an empty list should suppress the child render')
		assert(!('ignored' in getLatestProps()), 'Stored props should still remove the suppressed prop')
		assertEquals(getLatestProps().latest, 2, 'Stored props should include silently added props')
	})

	it('[A09] rerenders for a non-empty custom comparator list', () => {
		let renders = 0
		const Child = component(function Child() {
			return html => {
				renders++
				return html`<span></span>`
			}
		}, {propsComparator: () => ['added', 'added']})

		function App({getProps}) {
			return html => html`<div><${Child} ...${getProps()} /></div>`
		}

		const container = createContainer()
		render(App, container)
		render(App, container, {added: 1})

		assertEquals(renders, 2, 'Any non-empty changed-prop list should rerender')
	})

	it('[A09] lets a custom comparator report removed props', () => {
		let renders = 0
		const Child = component(function Child({getProps}) {
			return html => {
				renders++
				return html`<span>${String(getProps().removed ?? '')}</span>`
			}
		}, {propsComparator: (previousProps, nextProps) => 'removed' in previousProps && !('removed' in nextProps) ? ['removed'] : true})

		function App({getProps}) {
			return html => html`<div><${Child} ...${getProps()} /></div>`
		}

		const container = createContainer()
		render(App, container, {removed: 1})
		render(App, container)

		assertEquals(renders, 2, 'A removed prop reported by the comparator should rerender')
		assertEquals(container.textContent, '', 'The rerender should observe the removed prop')
	})

	it('[A09] lets a custom comparator opt event props into rerenders', () => {
		let renders = 0
		const Child = component(() => html => {
			renders++
			return html`<span></span>`
		}, {propsComparator: () => ['onSave']})
		const container = createContainer()

		render(Child, container, {onSave: () => 1})
		render(Child, container, {onSave: () => 2})

		assertEquals(renders, 2, 'The custom changed-prop list should override autoEffectEvent filtering')
	})

	it('[A09] rejects the old boolean custom comparator result', () => {
		const Child = component(() => html => html`<span></span>`, {propsComparator: () => false})
		const container = createContainer()
		render(Child, container, {value: 1})

		assertThrows(
			() => render(Child, container, {value: 2}),
			/propsComparator must return true or an array/,
			'Legacy false results should fail with the new contract',
		)
	})

	it('[A10] conservatively rerenders separately allocated cyclic props', () => {
		let renders = 0
		function App({getProps}) {
			return html => {
				renders++
				return html`<span>${getProps().value.label}</span>`
			}
		}

		const first = {label: 'same'}
		const second = {label: 'same'}
		first.self = first
		second.self = second
		const container = createContainer()

		render(App, container, {value: first})
		render(App, container, {value: first})
		render(App, container, {value: second})

		assertEquals(container.textContent, 'same', 'Cyclic props should not crash comparison')
		assertEquals(renders, 2, 'Identical references should skip while unproven cyclic equality should rerender')
	})

	it('[A10] distinguishes sparse arrays from explicit undefined elements', () => {
		function App({getProps}) {
			return html => html`<span>${0 in getProps().value ? 'present' : 'hole'}</span>`
		}

		const sparse = Array(1)
		const container = createContainer()
		render(App, container, {value: sparse})
		render(App, container, {value: [undefined]})

		assertEquals(container.textContent, 'present', 'An explicit element should not compare equal to an array hole')
	})

	it('[A10] distinguishes arrays from objects with Array.prototype', () => {
		function App({getProps}) {
			return html => html`<span>${Array.isArray(getProps().value) ? 'array' : 'object'}</span>`
		}

		const container = createContainer()
		render(App, container, {value: []})
		render(App, container, {value: Object.create(Array.prototype)})

		assertEquals(container.textContent, 'object', 'Matching prototypes should not hide different array brands')
	})

	it('[A10] compares constructor as an ordinary object prop', () => {
		function App({getProps}) {
			return html => html`<span>${getProps().value.constructor}</span>`
		}

		const container = createContainer()
		render(App, container, {value: {constructor: 'first'}})
		render(App, container, {value: {constructor: 'second'}})

		assertEquals(container.textContent, 'second', 'A changed constructor prop should rerender')
	})

	it('[A10] distinguishes positive and negative zero', () => {
		function App({getProps}) {
			return html => html`<span>${Object.is(getProps().value, -0) ? 'negative' : 'positive'}</span>`
		}

		const container = createContainer()
		render(App, container, {value: 0})
		render(App, container, {value: -0})

		assertEquals(container.textContent, 'negative', 'Object.is semantics should distinguish signed zero')
	})

	it('[A11] creates distinct stable IDs for numeric and string keys', () => {
		function Row() {
			const id = stableId()
			return html => html`<li id=${id}></li>`
		}

		function App() {
			return html => html`<ul>${[1, '1'].map(key => html`<${Row} key=${key} />`)}</ul>`
		}

		const container = createContainer()
		render(App, container)
		const ids = [...container.querySelectorAll('li')].map(element => element.id)

		assertEquals(ids.length, 2, 'Both keyed children should render')
		assertEquals(new Set(ids).size, 2, 'Distinct key types should produce distinct IDs')
	})

	it('[A11] creates distinct IDs for separate component sites with the same key', () => {
		function Row() {
			const id = stableId()
			return html => html`<span id=${id}></span>`
		}

		function App() {
			return html => html`<div>${html`<${Row} key=${'same'} />`}${html`<${Row} key=${'same'} />`}</div>`
		}

		const container = createContainer()
		render(App, container)
		const ids = [...container.querySelectorAll('span')].map(element => element.id)

		assertEquals(ids.length, 2, 'Both component sites should render')
		assertEquals(new Set(ids).size, 2, 'Owner-local child ordinals should distinguish component sites')
	})

	it('[A11] rejects non-string and non-number component keys', () => {
		function Row() {
			return html => html`<span></span>`
		}

		function App() {
			return html => html`<${Row} key=${{id: 1}} />`
		}

		assertThrows(
			() => render(App, createContainer()),
			/component keys must be strings or numbers/,
			'Object keys should fail with the documented key contract',
		)
	})

	it('[A11] hydrates the same hierarchical component IDs produced by SSR', () => {
		function Row({getProps}) {
			const id = stableId()
			return html => html`<li id=${id}>${String(getProps().item)}</li>`
		}

		function App() {
			return html => html`<ul>${[1, 2].map(item => html`<${Row} key=${item} item=${item} />`)}</ul>`
		}

		const container = createContainer()
		container.innerHTML = renderComponentToString(App)
		const serverItems = [...container.querySelectorAll('li')]
		const serverIds = serverItems.map(item => item.id)

		hydrate(App, container)

		const clientItems = [...container.querySelectorAll('li')]
		assertEquals(clientItems.map(item => item.id).join(','), serverIds.join(','), 'Hydration should reproduce SSR IDs')
		assert(clientItems.every((item, index) => item === serverItems[index]), 'Hydration should adopt the SSR component nodes')
	})

	it('runs effects after hydration adopts the server DOM', () => {
		let effectNode
		function App({effect}) {
			effect(() => {
				effectNode = container.firstElementChild
			}, () => [])
			return html => html`<span>hydrated</span>`
		}

		const container = createContainer()
		container.innerHTML = renderComponentToString(App)
		const serverNode = container.firstElementChild
		hydrate(App, container)

		assertEquals(container.firstElementChild, serverNode, 'Hydration should retain the server node')
		assertEquals(effectNode, serverNode, 'The effect should observe the adopted node after commit')
	})

	it('[A12] refreshes only root-context consumers on repeated render', () => {
		let appRenders = 0
		let consumerRenders = 0
		let siblingRenders = 0

		function Consumer({getContext}) {
			return html => {
				consumerRenders++
				return html`<span>${getContext('value')}</span>`
			}
		}
		function Sibling() {
			return html => {
				siblingRenders++
				return html`<i>sibling</i>`
			}
		}
		function App() {
			return html => {
				appRenders++
				return html`<main><${Consumer} /><${Sibling} /></main>`
			}
		}

		const container = createContainer()
		render(App, container, {}, {context: {value: 'first'}})
		render(App, container, {}, {context: {value: 'second'}})

		assertEquals(container.textContent, 'secondsibling', 'The latest root context should be visible')
		assertEquals(consumerRenders, 2, 'The context consumer should rerender')
		assertEquals(appRenders, 1, 'The clean ancestor should remain memoized')
		assertEquals(siblingRenders, 1, 'The non-consumer sibling should remain memoized')
	})

	it('[A13] applies template properties to the adopted input', () => {
		const container = createContainer()
		container.innerHTML = '<input>'
		const liveInput = container.firstElementChild

		liveInput.value = 'typed before hydration'
		domHtml`<input .indeterminate=${true} .value=${'from template'}>`({}, [liveInput])

		assertEquals(liveInput.value, 'from template', 'An explicit property binding controls the adopted input')

		assertEquals(liveInput.indeterminate, true, 'Hydration should initialize indeterminate')
	})

	it('[A14] rejects force on a literal attribute', () => {
		assertThrows(() => domHtml`<div !class="same"></div>`({}), /Forced bindings require an interpolation/)
	})

	it('[A18] unmounts a root, cancels pending updates and permits a fresh mount', async () => {
		const container = createContainer()
		const outlet = createContainer()
		let cleanups = 0
		let callbacks = 0

		function App({effect, update}) {
			effect(() => () => cleanups++, () => [])
			return {update, render: html => html`<span>mounted</span>${portal(outlet, html`<b>portal</b>`)}`}
		}

		const model = render(App, container)
		assertEquals(outlet.textContent, 'portal')
		model.update(() => callbacks++)
		Pepper.unmount(container)
		Pepper.unmount(container)
		assertEquals(cleanups, 1)
		assertEquals(container.childNodes.length, 0)
		assertEquals(outlet.childNodes.length, 0)
		render(App, container)
		model.update(() => callbacks++)
		await Promise.resolve()
		assertEquals(callbacks, 0)
		assertEquals(container.textContent, 'mounted')
		assertEquals(outlet.textContent, 'portal')
		Pepper.unmount(container)
		assertEquals(cleanups, 2)
	})

	it.skip('[DOM] cleans up children inserted from a DocumentFragment', () => {
		const key = {}
		const fragment = document.createDocumentFragment()
		fragment.appendChild(document.createElement('span')).textContent = 'old'
		let value = fragment
		const renderValue = () => domHtml`<div>${value}</div>`(key)
		const [element] = renderValue()
		document.body.append(element)

		value = 'replacement'
		renderValue()

		assertEquals(element.innerHTML, 'replacement', 'Replacing a fragment should remove its inserted children')
	})

	it('[KEYS] rejects duplicate component keys at one render site', () => {
		function Row() {
			return html => html`<li>row</li>`
		}

		function App() {
			return html => html`<ul>${[1, 1].map(key => html`<${Row} key=${key} />`)}</ul>`
		}

		const container = createContainer()
		assertThrows(() => render(App, container), /duplicate key/i, 'Duplicate keys should fail clearly instead of collapsing DOM')
	})

	it.skip('[PORTAL] resolves a selector target created by the same render', () => {
		function App() {
			return html => html`
				<div id="local-outlet"></div>
				${portal('#local-outlet', html`<span>portal</span>`)}
			`
		}

		const container = createContainer()
		render(App, container)

		assertEquals(container.querySelector('#local-outlet')?.textContent, 'portal', 'Portal target resolution should occur after owner DOM commit')
	})
})
