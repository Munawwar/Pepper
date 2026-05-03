## Pepper

NOTE: Project is still a work-in-progress.

Build interactive [islands](https://jasonformat.com/islands-architecture/) with plain function components, server-rendered HTML, and client hydration.

Bundle size - pepper.js is about 2.4 KB gzipped

### Root API

```js
import { hydrate, render, renderToString } from '@pepper-js/pepper';

render(Component, container, props);
hydrate(Component, container, props);
renderToString(Component, props);
```

- `render()` mounts or updates a component into a DOM container.
- `hydrate()` attaches a component to matching server-rendered HTML already in the container.
- `renderToString()` returns an HTML string for SSR.

### Example

```html
<!DOCTYPE html>
<html>
    <body>
        <div id="app"><button on-click=0>Increase</button><span>Count = 1</span></div>
        <script>
            window.initialProps = { initialCount: 1 };
        </script>
        <script type="module">
            import { hydrate, state } from 'https://unpkg.com/@pepper-js/pepper/dist/index.js';

            function Counter({ getProps }) {
                const [getCount, setCount] = state(getProps().initialCount);
                const onClick = () => setCount(getCount() + 1);

                return function render(html) {
                    return html`
                        <button on-click=${onClick}>Increase</button>
                        <span>Count = ${getCount()}</span>
                    `;
                };
            }

            hydrate(Counter, '#app', window.initialProps);
        </script>
    </body>
</html>
```

### Component Model

Pepper components are plain functions.

The setup function receives:

- `getProps()`
- `onProps(handler)`
- `onMount(handler)`
- `update(callback?)`

State and refs are direct imports:

```js
import { ref, state } from '@pepper-js/pepper';
```

`state(initialValue, comparator?)` returns a getter/setter pair:

```js
const [getCount, setCount] = state(0);
const [getValue, setValue] = state(initialValue, Object.is);
```

- the default comparator is deep equality
- state and `update()` rerenders are batched into a single microtask flush
- `setState(nextValueOrUpdater, false)` updates without scheduling a rerender
- `setState(nextValueOrUpdater, callback)` runs `callback` after the render flush

`ref()` returns an object ref:

```js
const buttonRef = ref();
```

Use it from render:

```js
function Counter() {
    const buttonRef = ref();

    return function render(html) {
        return html`<button ref=${buttonRef}>Click me</button>`;
    };
}
```

The component setup may return either:

- a render function
- an object with a `render(html)` method

Both are supported:

```js
function Counter({ getProps }) {
    const [getCount, setCount] = state(0);
    const onClick = () => setCount(getCount() + 1);

    return function render(html) {
        return html`
            <button on-click=${onClick}>
                ${getProps().label}: ${getCount()}
            </button>
        `;
    };
}
```

```js
function Counter({ getProps }) {
    const [getCount, setCount] = state(0);

    return {
        increment() {
            setCount(getCount() + 1);
        },

        render(html) {
            return html`
                <button on-click=${this.increment.bind(this)}>
                    ${getProps().label}: ${getCount()}
                </button>
            `;
        },
    };
}
```

Event handlers are invoked as plain functions. If a handler depends on model `this`, bind it explicitly.

### Props And Effects

`getProps()` always returns the latest props, which avoids stale closures.

```js
function Counter({ getProps, onMount, onProps }) {
    const [getCount, setCount] = state(getProps().initialCount);

    onProps((changedProps, oldProps) => {
        if (changedProps.includes('resetKey')) {
            setCount(getProps().initialCount, false);
        }
    });

    onMount(() => {
        console.log('mounted with', getProps());
        return () => {
            console.log('cleanup');
        };
    });

    return function render(html) {
        return html`<span>${getCount()}</span>`;
    };
}
```

### Pepper Store

`Store` is still available, but it is no longer wired into component render data automatically. Pass store instances in through props.

```js
import { Store, render } from '@pepper-js/pepper';

const store = new Store({ count: 1 });

function Counter({ getProps, onMount, update }) {
    onMount(() => {
        const rerender = () => update();
        getProps().store.subscribe(['count'], rerender);
        return () => getProps().store.unsubscribe(rerender);
    });

    return function render(html) {
        return html`<span>Count = ${getProps().store.data.count}</span>`;
    };
}

render(Counter, '#app', { store });
```

For SSR, create the store per request and pass it through `props` on both `renderToString()` and `hydrate()`.

### Server-side Rendering

```js
import { renderToString, state } from '@pepper-js/pepper';

function Counter({ getProps }) {
    const [getCount] = state(getProps().initialCount);
    return function render(html) {
        return html`<span>Count = ${getCount()}</span>`;
    };
}

const html = renderToString(Counter, { initialCount: 1 });
```

Pepper only hydrates event handlers and refs produced by its render-bound `html` tag. External string template engines are not supported for interactive hydration.

### Current Limitation

Nested Pepper components are not supported yet. Today the root APIs work with a single component tree rendered as HTML strings.

### Browser compatibility

Supports every browser as GOV UK (2024) - https://www.gov.uk/service-manual/technology/designing-for-different-browsers-and-devices

(Safari 15.6+ and latest Chrome, Edge, Firefox, Samsung Internet)

### Credits

To <a href="https://github.com/WebReflection/udomdiff">udomdiff</a> for dom diff fast path inspiration.
