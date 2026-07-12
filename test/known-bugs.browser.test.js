// @ts-nocheck

import * as Pepper from '../src/index.js'
import {html as domHtml} from '../src/html.js'

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
const createBoundary = () => component(function Boundary({getError, getProps}) {
	return html => getError() ? html`<p>fallback</p>` : getProps().children?.()
}, {errorBoundary: true})

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

	it.skip('[A06] catches descendant DOM realization errors in an error boundary', () => {
		const Boundary = createBoundary()

		function Broken() {
			return html => html`<button @click=${123}>broken</button>`
		}

		function App() {
			return html => html`<${Boundary}><${Broken} /></${Boundary}>`
		}

		const container = createContainer()
		render(App, container)

		assertEquals(container.innerHTML, '<p>fallback</p>', 'The nearest boundary should render its fallback')
	})

	it.skip('[A06] catches descendant onProps errors in an error boundary', () => {
		const Boundary = createBoundary()

		function Broken({getProps, onProps}) {
			onProps(() => {
				throw new Error('prop failure')
			})
			return html => html`<span>${getProps().value}</span>`
		}

		function App({getProps}) {
			return html => html`<div><${Boundary}><${Broken} value=${getProps().value} /></${Boundary}></div>`
		}

		const container = createContainer()
		render(App, container, {value: 1})
		render(App, container, {value: 2})

		assertEquals(container.textContent, 'fallback', 'The boundary should catch the onProps failure')
	})

	it.skip('[A07] preserves property casing after a quoted greater-than character', () => {
		const [element] = domHtml`<div title="a > b" .someProp=${42}></div>`({})

		assertEquals(element.someProp, 42, 'The case-sensitive property should be assigned')
		assertEquals(element.someprop, undefined, 'A lower-cased shadow property should not be created')
	})

	it.skip('[A08] rejects a mismatched dynamic component closing tag', () => {
		function Layout({getProps}) {
			return html => html`<section>${getProps().children?.()}</section>`
		}

		function Child() {
			return html => html`<b>child</b>`
		}

		function App() {
			return html => html`<${Layout}><${Child} /></${Child}>`
		}

		const container = createContainer()
		assertThrows(() => render(App, container), /matching closing tag|does not match/, 'Mismatched component tags should throw')
	})

	it.skip('[A09] lets a custom comparator suppress a removed prop', () => {
		let renders = 0
		const Child = component(function Child({getProps}) {
			return html => {
				renders++
				return html`<span>${String(getProps().ignored ?? '')}</span>`
			}
		}, {propsComparator: () => true})

		function App({getProps}) {
			return html => html`<div><${Child} ...${getProps()} /></div>`
		}

		const container = createContainer()
		render(App, container, {ignored: 1})
		render(App, container, {})

		assertEquals(renders, 1, 'The comparator should suppress the child render')
	})

	it.skip('[A09] reports each changed prop once with a custom comparator', () => {
		let changedProps = []
		const Child = component(function Child({onProps}) {
			onProps(changes => {
				changedProps = [...changes]
			})
			return html => html`<span></span>`
		}, {propsComparator: () => false})

		function App({getProps}) {
			return html => html`<div><${Child} ...${getProps()} /></div>`
		}

		const container = createContainer()
		render(App, container)
		render(App, container, {added: 1})

		assertEquals(changedProps.join(','), 'added', 'Changed prop names should be unique')
	})

	it.skip('[A10] compares cyclic props without overflowing', () => {
		function App({getProps}) {
			return html => html`<span>${getProps().value.label}</span>`
		}

		const first = {label: 'same'}
		const second = {label: 'same'}
		first.self = first
		second.self = second
		const container = createContainer()

		render(App, container, {value: first})
		render(App, container, {value: second})

		assertEquals(container.textContent, 'same', 'Cyclic props should not crash comparison')
	})

	it.skip('[A10] distinguishes sparse arrays from populated arrays', () => {
		function App({getProps}) {
			return html => html`<span>${String(getProps().value[0])}</span>`
		}

		const sparse = Array(1)
		const container = createContainer()
		render(App, container, {value: sparse})
		render(App, container, {value: [1]})

		assertEquals(container.textContent, '1', 'A populated array should not compare equal to a sparse array')
	})

	it.skip('[A11] creates distinct stable IDs for numeric and string keys', () => {
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

	it.skip('[A12] refreshes root context on repeated render', () => {
		function App({getContext, getProps}) {
			return html => html`<span>${getContext('value')}:${getProps().tick}</span>`
		}

		const container = createContainer()
		render(App, container, {tick: 1}, {context: {value: 'first'}})
		render(App, container, {tick: 2}, {context: {value: 'second'}})

		assertEquals(container.textContent, 'second:2', 'The latest root context should be visible')
	})

	it.skip('[A13] initializes non-form native properties during hydration', () => {
		const container = createContainer()
		container.innerHTML = '<input>'
		const liveInput = container.firstElementChild

		domHtml`<input .indeterminate=${true}>`({}, [liveInput])

		assertEquals(liveInput.indeterminate, true, 'Hydration should initialize indeterminate')
	})

	it.skip('[A14] reapplies a static forced regular attribute', async () => {
		const key = {}
		const renderForced = () => domHtml`<div !class="same"></div>`(key)
		const [element] = renderForced()
		document.body.append(element)
		let mutations = 0
		const observer = new MutationObserver(records => {
			mutations += records.filter(record => record.attributeName === 'class').length
		})
		observer.observe(element, {attributes: true})

		renderForced()
		await new Promise(resolve => setTimeout(resolve, 0))
		observer.disconnect()

		assert(mutations > 0, 'A static forced binding should set the same value again')
	})

	it.skip('[A18] exposes an explicit root unmount operation', () => {
		let cleanups = 0

		function App({onMount}) {
			onMount(() => () => cleanups++)
			return html => html`<span>mounted</span>`
		}

		const container = createContainer()
		render(App, container)
		assert(typeof Pepper.unmount === 'function', 'Pepper should export unmount(container)')
		Pepper.unmount(container)

		assertEquals(cleanups, 1, 'Unmount should run root cleanup exactly once')
		assertEquals(container.childNodes.length, 0, 'Unmount should remove root DOM')
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

	it.skip('[KEYS] rejects duplicate component keys at one render site', () => {
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
