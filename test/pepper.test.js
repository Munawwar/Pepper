import {component, html, hydrate, ref, render, state} from '../src/index.js'

/**
 * @param {any} actual
 * @param {any} expected
 * @param {string} message
 */
function assertEquals(actual, expected, message = '') {
	if (actual !== expected)
		throw new Error(`Assertion failed: ${message}\nExpected: >>>${expected}<<<\nActual: >>>${actual}<<<`)
}

/**
 * @param {any} condition
 * @param {string} message
 */
function assertTrue(condition, message = '') {
	if (!condition) throw new Error(`Assertion failed: ${message}\nExpected truthy value`)
}

function flushRender() {
	return new Promise(resolve => queueMicrotask(resolve))
}

describe('Pepper component runtime', () => {
	afterEach(() => {
		document.body.replaceChildren()
	})

	it('renders keyed nested components and preserves DOM nodes across reorder', () => {
		function Row({getProps}) {
			return html => html`<li data-id=${getProps().item.id}>${getProps().item.label}</li>`
		}

		function App({getProps}) {
			return html => html`<ul>${getProps().items.map(item => html`<${Row} key=${item.id} item=${item} />`)}</ul>`
		}

		const container = document.createElement('div')
		document.body.append(container)

		render(App, container, {
			items: [
				{id: 1, label: 'one'},
				{id: 2, label: 'two'},
			],
		})

		const [first, second] = container.querySelectorAll('li')
		assertEquals(first.textContent, 'one', 'First render should match input order')
		assertEquals(second.textContent, 'two', 'First render should match input order')

		render(App, container, {
			items: [
				{id: 2, label: 'two'},
				{id: 1, label: 'one'},
			],
		})

		const [movedFirst, movedSecond] = container.querySelectorAll('li')
		assertEquals(movedFirst, second, 'Keyed reorder should move the existing second node to the front')
		assertEquals(movedSecond, first, 'Keyed reorder should move the existing first node to the end')
	})

	it('preserves keyed nested component DOM nodes across rotate reorder', () => {
		function Row({getProps}) {
			return html => html`<li data-id=${getProps().item.id}>${getProps().item.label}</li>`
		}

		function App({getProps}) {
			return html => html`<ul>${getProps().items.map(item => html`<${Row} key=${item.id} item=${item} />`)}</ul>`
		}

		const container = document.createElement('div')
		document.body.append(container)

		render(App, container, {
			items: [
				{id: 1, label: 'one'},
				{id: 2, label: 'two'},
				{id: 3, label: 'three'},
			],
		})

		const [first, second, third] = container.querySelectorAll('li')

		render(App, container, {
			items: [
				{id: 2, label: 'two'},
				{id: 3, label: 'three'},
				{id: 1, label: 'one'},
			],
		})

		const [rotatedFirst, rotatedSecond, rotatedThird] = container.querySelectorAll('li')
		assertEquals(rotatedFirst, second, 'Rotate should move the existing second node to the front')
		assertEquals(rotatedSecond, third, 'Rotate should keep the existing third node in the middle')
		assertEquals(rotatedThird, first, 'Rotate should move the existing first node to the end')
	})

	it('adds x-key attributes for keyed child components when debugKeys is enabled', () => {
		function Row({getProps}) {
			return html => html`<li>${getProps().label}</li>`
		}

		function App({getProps}) {
			return html => html`<ul>${getProps().items.map(item => html`<${Row} key=${item.id} label=${item.label} />`)}</ul>`
		}

		const container = document.createElement('div')
		document.body.append(container)

		render(
			App,
			container,
			{items: [{id: 1, label: 'one'}, {id: 2, label: 'two'}]},
			{debugKeys: true},
		)
		const keyedItems = Array.from(container.querySelectorAll('li'))
		assertEquals(keyedItems[0].getAttribute('x-key'), '1', 'debugKeys should expose the first component key')
		assertEquals(keyedItems[1].getAttribute('x-key'), '2', 'debugKeys should expose the second component key')

		render(
			App,
			container,
			{items: [{id: 2, label: 'two'}, {id: 1, label: 'one'}]},
			{debugKeys: false},
		)
		assertEquals(keyedItems[0].getAttribute('x-key'), null, 'Turning debugKeys off should remove previous key attributes')
		assertEquals(keyedItems[1].getAttribute('x-key'), null, 'Turning debugKeys off should remove previous key attributes')
	})

	it('keeps paired-tag child template nodes stable across parent rerenders', async () => {
		function Frame({getProps}) {
			return html => html`<section>${getProps().children?.()}</section>`
		}

		function Row({getProps}) {
			return html => html`<li>${getProps().label}</li>`
		}

		function App() {
			const [getItems, setItems] = state([
				{id: 1, label: 'one'},
				{id: 2, label: 'two'},
			])
			const [getNextId, setNextId] = state(3)
			const addRow = () => {
				const nextId = getNextId()
				setItems([...getItems(), {id: nextId, label: `item-${nextId}`}])
				setNextId(nextId + 1)
			}

			return html => html`
				<${Frame}>
					<button @click=${addRow}>Add row</button>
					<ul>${getItems().map(item => html`<${Row} key=${item.id} ...${item} />`)}</ul>
				</${Frame}>
			`
		}

		const container = document.createElement('div')
		document.body.append(container)
		render(App, container)

		const firstList = container.querySelector('ul')
		const button = /** @type {HTMLButtonElement} */ (container.querySelector('button'))
		button.click()
		await flushRender()
		const secondList = container.querySelector('ul')

		assertEquals(secondList, firstList, 'Paired-tag children should keep stable nested DOM identities across rerenders')
		assertEquals(container.querySelectorAll('ul').length, 1, 'Rerender should not duplicate list containers')
	})

	it('hydrates nested component tags and keeps refs bound to adopted nodes', async () => {
		let latestButtonRef = null

		function Counter() {
			const [getCount, setCount] = state(0)
			const buttonRef = ref()
			latestButtonRef = buttonRef
			return html => html`<button ref=${buttonRef} @click=${() => setCount(getCount() + 1)}>${getCount()}</button>`
		}

		function App() {
			return html => html`<section><${Counter} /></section>`
		}

		const container = document.createElement('div')
		container.innerHTML = '<section><button>0</button></section>'
		document.body.append(container)

		const liveButton = container.querySelector('button')
		hydrate(App, container)
		const button = container.querySelector('button')

		assertEquals(button, liveButton, 'Hydration should adopt the existing child DOM node')
		assertEquals(latestButtonRef.current, liveButton, 'ref() should point at the adopted DOM node')

		button.click()
		await flushRender()

		assertEquals(button.textContent, '1', 'Hydrated event handlers should update component state')
		assertEquals(latestButtonRef.current, liveButton, 'ref() should stay bound after rerender')
	})

	it('memoizes props by default and allows component-level overrides', () => {
		let plainRenders = 0
		let eventMemoRenders = 0
		let unmemoizedRenders = 0
		let customComparatorRenders = 0
		let noAutoEffectEventRenders = 0

		function Plain({getProps}) {
			return html => {
				plainRenders++
				return html`<div>${getProps().value.label}</div>`
			}
		}

		function EventMemo({getProps}) {
			return html => {
				eventMemoRenders++
				return html`<button>${getProps().label}</button>`
			}
		}

		const Unmemoized = component(({getProps}) => {
			return html => {
				unmemoizedRenders++
				return html`<div>${getProps().value.label}</div>`
			}
		}, {memo: false})

		const VersionMemo = component(({getProps}) => {
			return html => {
				customComparatorRenders++
				return html`<div>${getProps().label}</div>`
			}
		}, {
			propsComparator: (previousProps, nextProps) => previousProps.version === nextProps.version,
		})

		const NoAutoEffectEvent = component(({getProps}) => {
			return html => {
				noAutoEffectEventRenders++
				return html`<button>${getProps().label}</button>`
			}
		}, {autoEffectEvent: false})

		const containers = Array.from({length: 5}, () => {
			const container = document.createElement('div')
			document.body.append(container)
			return container
		})

		render(Plain, containers[0], {value: {label: 'same'}})
		render(Plain, containers[0], {value: {label: 'same'}})
		assertEquals(plainRenders, 1, 'Plain components should skip rerender for deep-equal props by default')

		render(EventMemo, containers[1], {label: 'save', onSave: () => 1})
		render(EventMemo, containers[1], {label: 'save', onSave: () => 2})
		assertEquals(eventMemoRenders, 1, 'Default auto effect events should ignore handler identity changes for memo')

		render(Unmemoized, containers[2], {value: {label: 'same'}})
		render(Unmemoized, containers[2], {value: {label: 'same'}})
		assertEquals(unmemoizedRenders, 2, 'component(..., {memo:false}) should rerender on reference changes')

		render(VersionMemo, containers[3], {label: 'one', version: 1})
		render(VersionMemo, containers[3], {label: 'two', version: 1})
		render(VersionMemo, containers[3], {label: 'three', version: 2})
		assertEquals(customComparatorRenders, 2, 'propsComparator should decide whether parent props trigger rerender')

		render(NoAutoEffectEvent, containers[4], {label: 'save', onSave: () => 1})
		render(NoAutoEffectEvent, containers[4], {label: 'save', onSave: () => 2})
		assertEquals(
			noAutoEffectEventRenders,
			2,
			'component(..., {autoEffectEvent:false}) should treat event prop identity changes as rerender triggers',
		)
		assertTrue(document.body.childElementCount === 5, 'Test should keep all containers mounted during assertions')
	})

	it('does not rerender when state setter receives false as the second argument', async () => {
		let renders = 0
		let appModel

		function App({update}) {
			const [getCount, setCount] = state(0)
			appModel = {
				bumpSilently() {
					setCount(1, false)
				},
				flush() {
					update()
				},
			}

			return html => {
				renders++
				return html`<span>${getCount()}</span>`
			}
		}

		const container = document.createElement('div')
		document.body.append(container)
		render(App, container)

		assertEquals(renders, 1, 'Initial render should happen once')
		assertEquals(container.textContent, '0', 'Initial DOM should reflect initial state')

		appModel.bumpSilently()
		await flushRender()

		assertEquals(renders, 1, 'setState(value, false) should not trigger a rerender')
		assertEquals(container.textContent, '0', 'Silent state changes should not update DOM immediately')

		appModel.flush()
		await flushRender()

		assertEquals(renders, 2, 'Explicit update() should rerender after a silent state change')
		assertEquals(container.textContent, '1', 'Later rerender should pick up the silent state change')
	})
})
