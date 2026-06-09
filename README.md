## Pepper

Project status: work in progress.

Pepper is a function-component runtime with DOM rendering, pseudo-hydration, and SSR.

```js
import { hydrate, ref, render, renderToString, state } from '@pepper-js/pepper'

function TodoRow({ getProps }) {
	return html => html`<li>${getProps().label}</li>`
}

function TodoApp() {
	const inputRef = ref()
	const [getItems, setItems] = state([
		{ id: 1, label: 'Write docs' },
		{ id: 2, label: 'Ship demo' },
	])
	const [getNextId, setNextId] = state(3)

	function addItem() {
		const label = inputRef.current?.value?.trim()
		if (!label) return
		const nextId = getNextId()
		setItems([...getItems(), { id: nextId, label }])
		setNextId(nextId + 1)
		inputRef.current.value = ''
		inputRef.current.focus()
	}

	return html => html`
		<input ref=${inputRef} placeholder="New todo" />
		<button @click=${addItem}>Add</button>
		<ul>
			${getItems().map(item => html`<${TodoRow} key=${item.id} label=${item.label} />`)}
		</ul>
	`
}

render(TodoApp, domNodeOrCssSelector, props)
hydrate(TodoApp, domNodeOrCssSelector, props)
renderToString(TodoApp, props)
```

Note:
- pass 4th param `{ debugKeys: true }` to `render()` or `hydrate()` to stamp keyed child roots with `x-key="..."`

### Demo

- `examples/components.html` shows nested components, keyed child lists, and spread props
- `tooling/pepper-vscode/pepper-vscode.vsix` is the installable VS Code extension bundle kept in-repo until marketplace publishing exists

### Install

```bash
npm install @pepper-js/pepper
```

### Component API

Setup API:

- `getProps()`
- `onProps(handler)`
- `onMount(handler)`
- `update(callback?)`

Direct imports:

- `state(initialValue, comparator?)`
- `ref()`

Components may return:

- a render function
- an object with `render(html)`

### "I don't want auto-memoization" / `component()` wrapper

Plain function components use Pepper’s default runtime behavior:

- deep prop memoization
- automatic ignoring of `onX` function props for memo comparisons

When you want to opt out, wrap the component:

```js
import { component } from '@pepper-js/pepper'

const Unmemoized = component(function Unmemoized(api) {
	return html => html`<div />`
}, {
	memo: false,
})
```

Supported options:

- `memo: boolean`
- `propsComparator(prevProps, nextProps)`
- `autoEffectEvent: boolean`

### Layout components / children()

Pepper supports paired component tags for layout-style composition:

```js
function Layout({ getProps }) {
	return html => html`
		<section class="layout">
			<header>${getProps().title}</header>
			<main>${getProps().children?.()}</main>
		</section>
	`
}

function Screen() {
	return html => html`
		<${Layout} title=${'Settings'}>
			<span>${'inside'}</span>
		</${Layout}>
	`
}
```

Rules:

- `key=${...}` is reserved for component identity in child-component lists
- `...${spreadProps}` works on child component tags
- paired tags pass lazy `children()` to the child component
- named slots are not supported yet

### Tooling

The repo now includes in-repo tooling packages:

- `tooling/pepper-template-analyzer`
- `tooling/pepper-typescript-plugin`
- `tooling/pepper-lint`
- `tooling/pepper-vscode`

VS Code extension:

- rebuild: `npm run vscode:package`
- install locally: `npm run vscode:install`
- repo bundle path: `tooling/pepper-vscode/pepper-vscode.vsix`

### Browser support

Pepper targets modern browsers:

- Safari 15.6+
- latest Chrome
- latest Edge
- latest Firefox
- latest Samsung Internet
