# Pepper

Project status: work in progress.

Pepper is a function-component runtime with DOM rendering, pseudo-hydration, SSR, portals, and error boundaries.

```ts
import {
  hydrate,
  ref,
  render,
  renderToString,
  state,
  type ComponentSetupApi,
} from '@pepper-js/pepper'

type TodoItem = {
  id: number
  label: string
}

type TodoRowProps = {
  label: string
}

function TodoRow({ getProps }: ComponentSetupApi<TodoRowProps>) {
  return html => html`<li>${getProps().label}</li>`
}

function TodoApp({ onMount, onProps }: ComponentSetupApi) {
  const [getItems, setItems] = state<TodoItem[]>([
    { id: 1, label: 'Write docs' },
    { id: 2, label: 'Ship demo' },
  ])
  const [getNextId, setNextId] = state(3)
  const inputRef = ref<HTMLInputElement>()

  function addItem() {
    const label = inputRef.current?.value.trim()
    if (!label) return
    const nextId = getNextId()
    setItems([...getItems(), { id: nextId, label }])
    setNextId(nextId + 1)
    inputRef.current.value = ''
    inputRef.current.focus()
  }

  onProps((changedProps, oldProps) => {
    changedProps
    oldProps
  })

  onMount(() => {
    console.log('mounted')
    return () => console.log('unmounted')
  })

  return html => html`
    <input ref=${inputRef} placeholder="New todo" />
    <button @click=${addItem}>Add</button>
    <ul>
      ${getItems().map(item => html`<${TodoRow} key=${item.id} label=${item.label} />`)}
    </ul>
  `
}

render(TodoApp, '#app')
hydrate(TodoApp, document.getElementById('app'))
renderToString(TodoApp)
```

Note:
- pass 4th param `{ debugKeys: true }` to `render()` or `hydrate()` to stamp keyed child roots with `x-key="..."`

## Demo

```
npm run demo
```
Check `examples/components.html` shows nested components, keyed child lists, and spread props.

## Install

```bash
npm install @pepper-js/pepper
```

Install VSCode extension from `tooling/pepper-vscode/pepper-vscode.vsix`

## Component API

Setup API:

- `getProps()`
- `getError()` - returns the currently captured error for an error-boundary component, otherwise `null`
- `onProps(handler)` - runs on later prop changes, not on initial mount
- `onMount(handler)`
- `resetError()` - clears the captured boundary error and retries rendering
- `update(callback?)` - callback is called after a re-render

Direct imports:

- `const [getState, setState] = state(initialValue, comparator?)`
  - `setState(newState, falseOrCallback?)`
    - If 2nd param is false, then no re-render is scheduled.
    - If 2nd param is a function, it's called after re-render.
- `ref()`
- `portal(target, renderable)`

Components may return:

- a render function
- an object with `render(html)`

Do not reuse one `html\`...\`` output in multiple holes:

```js
function BadExample() {
  return html => {
    const icon = html`<span>!</span>`
    return html`
      <div>${icon}</div>
      <div>${icon}</div>
    `
  }
}
```

Instead, create a fresh `html\`...\`` value per hole:

```js
function GoodExample() {
  return html => html`
    <div>${html`<span>!</span>`}</div>
    <div>${html`<span>!</span>`}</div>
  `
}
```

## SSR / Store / Context

Pepper roots accept a 4th-param `context` object. This is the intended way to pass request-local stores through the tree for both SSR and hydration.

```ts
import { Store, hydrate, renderToString } from '@pepper-js/pepper'

type CartItem = {
  id: string
  qty: number
}

type CartData = {
  items: CartItem[]
}

type CartStore = Store & {
  data: CartData
  assign(partial: Partial<CartData>): void
}

type AppContext = {
  cart: CartStore
}

function CartCount({ getContext, onMount, update }: import('@pepper-js/pepper').ComponentSetupApi<{}, AppContext>) {
  const cart = getContext('cart')
  const onCartChange = () => update()

  onMount(() => {
    cart.subscribe(['items'], onCartChange)
    return () => cart.unsubscribe(onCartChange)
  })

  return html => html`${cart.data.items.length}`
}

function HeaderCart() {
  return html => html`<span>Cart: <${CartCount} /></span>`
}

function SidebarCart() {
  return html => html`<aside>Items: <${CartCount} /></aside>`
}

// client: two islands sharing the same Store instance
const cart = new Store(window.initialCart as CartData) as CartStore

hydrate(HeaderCart, '#header-cart', {}, { context: { cart } })
hydrate(SidebarCart, '#sidebar-cart', {}, { context: { cart } })

// server: same API, but per-request data
const ssrCart = new Store(cartData) as CartStore
const headerHtml = renderToString(HeaderCart, {}, { context: { cart: ssrCart } })
const sidebarHtml = renderToString(SidebarCart, {}, { context: { cart: ssrCart } })
```

Context API available inside components:

- `getContext(key)`
- `setContext(key, value)`
- `hasContext(key)`

### Store API

`Store` is a small external state container intended to be passed through Pepper context.

```js
const cart = new Store({ items: [] })

cart.data
cart.data = { items: ['a'] }
cart.assign({ items: ['a', 'b'] })

const onCartChange = changedProps => {
  console.log(changedProps)
}

cart.subscribe(['items'], onCartChange)
cart.unsubscribe(onCartChange)
```

Notes:

- change detection is shallow, top-level only
- `store.data = nextData` replaces the whole data object
- `store.assign(partial)` shallow-merges into the existing data object
- subscribers are notified only for the top-level keys they subscribed to

## "I don't want auto-memoization" / `component()` wrapper

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
- `errorBoundary: boolean`

## Layout components / children()

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

## Portals

Use `portal(target, renderable)` to render a subtree into another DOM container while keeping it owned by the current Pepper component.

```js
import { portal } from '@pepper-js/pepper'

function Dialog({ getProps }) {
  return html => html`
    <section class="dialog">
      ${getProps().title}
    </section>
  `
}

function App() {
  return html => html`
    <div>${'page content'}</div>
    ${portal('#modal-root', html`<${Dialog} title=${'Settings'} />`)}
  `
}
```

Notes:

- `target` can be a DOM element or selector
- portal children still get normal Pepper lifecycle and context
- SSR omits portal output

## Error boundaries

Wrap a component with `component(..., { errorBoundary: true })` to let it catch descendant render/setup errors and render fallback UI.

```js
import { component } from '@pepper-js/pepper'

const ErrorBoundary = component(function ErrorBoundary({ getError, getProps, resetError }) {
  return {
    render(html) {
      const error = getError()
      if (error) {
        return html`<button @click=${resetError}>Retry</button>`
      }
      return getProps().children?.()
    },
  }
}, {
  errorBoundary: true,
})

function Buggy({ getProps }) {
  return html => {
    if (getProps().crash) throw new Error('boom')
    return html`<span>${'ok'}</span>`
  }
}

function App() {
  return html => html`
    <${ErrorBoundary}>
      <${Buggy} crash=${true} />
    </${ErrorBoundary}>
  `
}
```

Notes:

- boundaries catch descendant render/setup failures, not event-handler errors
- `getError()` returns `null` when healthy
- `resetError()` clears the boundary state and retries rendering

## Tooling

The repo now includes in-repo tooling packages:

- `tooling/pepper-template-analyzer`
- `tooling/pepper-typescript-plugin`
- `tooling/pepper-lint`
- `tooling/pepper-vscode`

VS Code extension:

- rebuild: `npm run vscode:package`
- install locally: `npm run vscode:install`
- repo bundle path: `tooling/pepper-vscode/pepper-vscode.vsix`

## Browser support

Pepper targets modern browsers:

- Safari 15.6+
- latest Chrome
- latest Edge
- latest Firefox
- latest Samsung Internet
