import {component, hydrate, ref, render, state} from '../src/index.js'

/**
 * @typedef {(strings: TemplateStringsArray, ...values: readonly unknown[]) => unknown} HtmlTag
 * @typedef {{ id: number, label: string }} Item
 */

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
	return Promise.resolve()
}

describe('Pepper component runtime', () => {
	afterEach(() => {
		document.body.replaceChildren()
	})

	it('renders keyed nested components and preserves DOM nodes across reorder', () => {
		/** @param {{ getProps(): Record<string, unknown> }} param0 */
		function Row({getProps}) {
			/** @param {HtmlTag} html */
			return html => {
				const props = /** @type {{ item: Item }} */ (getProps())
				return html`<li data-id=${props.item.id}>${props.item.label}</li>`
			}
		}

		/** @param {{ getProps(): Record<string, unknown> }} param0 */
		function App({getProps}) {
			/** @param {HtmlTag} html */
			return html => html`<ul>${/** @type {{ items: Item[] }} */ (getProps()).items.map(
				/** @param {Item} item */ item => html`<${Row} key=${item.id} item=${item} />`,
			)}</ul>`
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
		/** @param {{ getProps(): Record<string, unknown> }} param0 */
		function Row({getProps}) {
			/** @param {HtmlTag} html */
			return html => {
				const props = /** @type {{ item: Item }} */ (getProps())
				return html`<li data-id=${props.item.id}>${props.item.label}</li>`
			}
		}

		/** @param {{ getProps(): Record<string, unknown> }} param0 */
		function App({getProps}) {
			/** @param {HtmlTag} html */
			return html => html`<ul>${/** @type {{ items: Item[] }} */ (getProps()).items.map(
				/** @param {Item} item */ item => html`<${Row} key=${item.id} item=${item} />`,
			)}</ul>`
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
		/** @param {{ getProps(): Record<string, unknown> }} param0 */
		function Row({getProps}) {
			/** @param {HtmlTag} html */
			return html => html`<li>${/** @type {{ label: string }} */ (getProps()).label}</li>`
		}

		/** @param {{ getProps(): Record<string, unknown> }} param0 */
		function App({getProps}) {
			/** @param {HtmlTag} html */
			return html => html`<ul>${/** @type {{ items: Item[] }} */ (getProps()).items.map(
				/** @param {Item} item */ item => html`<${Row} key=${item.id} label=${item.label} />`,
			)}</ul>`
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
		/** @param {{ getProps(): Record<string, unknown> }} param0 */
		function Frame({getProps}) {
			/** @param {HtmlTag} html */
			return html => html`<section>${/** @type {{ children?: (() => unknown) | undefined }} */ (getProps()).children?.()}</section>`
		}

		/** @param {{ getProps(): Record<string, unknown> }} param0 */
		function Row({getProps}) {
			/** @param {HtmlTag} html */
			return html => html`<li>${/** @type {{ label: string }} */ (getProps()).label}</li>`
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

			/** @param {HtmlTag} html */
			return html => html`
					<${Frame}>
						<button @click=${addRow}>Add row</button>
						<ul>${getItems().map(
							/** @param {Item} item */ item => html`<${Row} key=${item.id} ...${item} />`,
						)}</ul>
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
		/** @type {{ current: HTMLButtonElement | null } | null} */
		let latestButtonRef = null

		function Counter() {
			const [getCount, setCount] = state(0)
			const buttonRef = /** @type {{ current: HTMLButtonElement | null }} */ (ref())
			latestButtonRef = buttonRef
			/** @param {HtmlTag} html */
			return html => html`<button ref=${buttonRef} @click=${() => setCount(getCount() + 1)}>${getCount()}</button>`
		}

		function App() {
			/** @param {HtmlTag} html */
			return html => html`<section><${Counter} /></section>`
		}

		const container = document.createElement('div')
		container.innerHTML = '<section><button>0</button></section>'
		document.body.append(container)

		const liveButton = /** @type {HTMLButtonElement | null} */ (container.querySelector('button'))
		hydrate(App, container)
		const button = /** @type {HTMLButtonElement | null} */ (container.querySelector('button'))
		if (!liveButton || !button || !latestButtonRef) throw new Error('Expected hydrated button refs to exist')
		const buttonRef = /** @type {{ current: HTMLButtonElement | null }} */ (latestButtonRef)

		assertEquals(button, liveButton, 'Hydration should adopt the existing child DOM node')
		assertEquals(buttonRef.current, liveButton, 'ref() should point at the adopted DOM node')

		button.click()
		await flushRender()

		assertEquals(button.textContent, '1', 'Hydrated event handlers should update component state')
		assertEquals(buttonRef.current, liveButton, 'ref() should stay bound after rerender')
	})

	it('memoizes props by default and allows component-level overrides', () => {
		let plainRenders = 0
		let eventMemoRenders = 0
		let unmemoizedRenders = 0
		let customComparatorRenders = 0
		let noAutoEffectEventRenders = 0

		/** @param {{ getProps(): Record<string, unknown> }} param0 */
		function Plain({getProps}) {
			/** @param {HtmlTag} html */
			return html => {
				plainRenders++
				return html`<div>${/** @type {{ value: { label: string } }} */ (getProps()).value.label}</div>`
			}
		}

		/** @param {{ getProps(): Record<string, unknown> }} param0 */
		function EventMemo({getProps}) {
			/** @param {HtmlTag} html */
			return html => {
				eventMemoRenders++
				return html`<button>${/** @type {{ label: string }} */ (getProps()).label}</button>`
			}
		}

		const Unmemoized = component(/** @param {{ getProps(): Record<string, unknown> }} param0 */ ({getProps}) => {
			/** @param {HtmlTag} html */
			return html => {
				unmemoizedRenders++
				return html`<div>${/** @type {{ value: { label: string } }} */ (getProps()).value.label}</div>`
			}
		}, {memo: false})

		const VersionMemo = component(/** @param {{ getProps(): Record<string, unknown> }} param0 */ ({getProps}) => {
			/** @param {HtmlTag} html */
			return html => {
				customComparatorRenders++
				return html`<div>${/** @type {{ label: string }} */ (getProps()).label}</div>`
			}
		}, {
			propsComparator: (previousProps, nextProps) => (
				/** @type {{ version?: number }} */ (previousProps).version ===
				/** @type {{ version?: number }} */ (nextProps).version
			),
		})

		const NoAutoEffectEvent = component(/** @param {{ getProps(): Record<string, unknown> }} param0 */ ({getProps}) => {
			/** @param {HtmlTag} html */
			return html => {
				noAutoEffectEventRenders++
				return html`<button>${/** @type {{ label: string }} */ (getProps()).label}</button>`
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
		/** @type {{ bumpSilently(): void, flush(): void } | null} */
		let appModel = null

		/** @param {{ update(callback?: () => void): void }} param0 */
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

			/** @param {HtmlTag} html */
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

		if (!appModel) throw new Error('Expected app model to be initialized')
		const model = /** @type {{ bumpSilently(): void, flush(): void }} */ (appModel)
		model.bumpSilently()
		await flushRender()

		assertEquals(renders, 1, 'setState(value, false) should not trigger a rerender')
		assertEquals(container.textContent, '0', 'Silent state changes should not update DOM immediately')

		model.flush()
		await flushRender()

		assertEquals(renders, 2, 'Explicit update() should rerender after a silent state change')
		assertEquals(container.textContent, '1', 'Later rerender should pick up the silent state change')
	})

	it('does not rerender ancestors when a deep child updates local state', async () => {
		let rootRenders = 0
		let branchRenders = 0
		let leafRenders = 0

		function Leaf() {
			const [getCount, setCount] = state(0)
			/** @param {HtmlTag} html */
			return html => {
				leafRenders++
				return html`<button @click=${() => setCount(getCount() + 1)}>${getCount()}</button>`
			}
		}

		function Branch() {
			/** @param {HtmlTag} html */
			return html => {
				branchRenders++
				return html`<section><${Leaf} /></section>`
			}
		}

		function App() {
			/** @param {HtmlTag} html */
			return html => {
				rootRenders++
				return html`<main><${Branch} /></main>`
			}
		}

		const container = document.createElement('div')
		document.body.append(container)
		render(App, container)

		assertEquals(rootRenders, 1, 'Initial root render should happen once')
		assertEquals(branchRenders, 1, 'Initial branch render should happen once')
		assertEquals(leafRenders, 1, 'Initial leaf render should happen once')

		const button = /** @type {HTMLButtonElement} */ (container.querySelector('button'))
		button.click()
		await flushRender()

		assertEquals(rootRenders, 1, 'Local leaf state updates should not rerender the root')
		assertEquals(branchRenders, 1, 'Local leaf state updates should not rerender intermediate ancestors')
		assertEquals(leafRenders, 2, 'Local leaf state updates should rerender the leaf itself')
		assertEquals(button.textContent, '1', 'Leaf DOM should still update correctly')
	})
})
