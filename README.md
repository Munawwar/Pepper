## Pepper

NOTE: Project is still a work-in-progress

Build interactive [islands](https://jasonformat.com/islands-architecture/) with plain HTML and a touch of JS.

Bundle size - pepper.js is 2.2 KB gzipped

### Example

```html
<!DOCTYPE html>
<html>
    <body>
        <div id="node-to-sync">
            <button on-click="onClick">Test</button>
        </div>
        <script type="module">
            import { Pepper, html } from 'https://unpkg.com/@pepper-js/pepper';
            const view = new Pepper({
                getHtml(data) {
                    return html`<button on-click="onClick">${data.text}</button>`;
                    // or you can instead use a template library here
                },
                
                data: { text: 'Test' },
                target: '#node-to-sync',
                hydrate: true, // optional
                
                onClick() {
                    this.data = { text: 'Clicked!' }; // this automatically updates the DOM
                }
            });
            // or you can call view.hydrate() here.
            // or call view.mount(), to create new DOM nodes
        </script>
    </body>
</html>
```

You can find examples for several templating language in the [examples directory](./examples).

### Import from CDN

```html
<!-- Module import -->
<script type="module">
    import Pepper from 'https://unpkg.com/@pepper-js/pepper';
</script>

<!-- Global import -->
<script src="https://unpkg.com/@pepper-js/pepper/dist/browser/global/index.min.js"></script>
<script>const Pepper = PepperModule.default</script>
```

### Update data and view

```js
view.data = { text: 'Test 2' }; // uses setter to detect change
```
Or use `view.assign()` to not overwrite existing props

`view.assign`'s signature is exactly like `Object.assign()`.

**Note**: Updating states updates the DOM immediately (synchronous/blocking call). So it is generally a good idea to reduce state changes to a single call per user action.. for example a click action would call `view.assign()` only once. You can use temporary objects if needed to reduce calls.

### Refs to DOM nodes

```html
<button ref="btnEl" on-click="onClick">
    {{ text }}
</button>
```

Now you can use `this.btnEl` (inside a view method) or `view.btnEl` (from outside) to access the span element.

### Debug access

One can do `targetElement.pepperInstance` to get access to the view object from the developer tools. It is only for
debugging purposes. Never use it in code.

### Pepper Store - for managing cross-view states

Pepper comes with a simplified global state store, so that you can have multiple views with common states stored in it. Updating the store data will re-render connected views automatically.

```js
// initialize global store
const store = new Pepper.Store({
    counter: 1
});

// create some views that use the store data.
const view1 = new Pepper({
    // if you want to be able to access a property from the store, then
    // you need to explicitly "connect" to that property. This is a performance
    // optimization (like redux).
    connect: {
        store: store,
        props: ['counter']
    },
    getHtml: data => html`<span>Counter = ${ data.counter }</span>`,
    target: '#myview1',
    mount: true,
});
const view2 = new Pepper({
    getHtml: html`<span>Counter = ${ data.counter }</span>`,
    connect: {
        store: store,
        props: ['counter']
    },
    target: '#myview2',
    mount: true,
});

// demonstrating how updating one data source, re-renders multiple views
// so.. update counter
const incrementCounterAction = function () {
    store.assign({
        counter: store.data.counter + 1
    });
};
window.setInterval(incrementCounterAction, 1000);
```

Note that if you don't "connect" your view to specific properties from the Pepper store, then you cannot access those property at all.

Note that stores feature is meant for render performance improvement. You can naively put all your HTML within a single Pepper view and all the states within it. But that could take a hit on rendering performance.
So Pepper Store gives you an option to make smaller views / islands, while sharing some states, keeping the rest of the HTML static and refreshing only the views that needs a refresh (with some manual "connecting" from the developer's end).

#### Run side effects on store properties change

You can listen to store changes outside of Pepper views and run side effects.

```js
store.subscribe(['property1', 'property2'], function effect(propertiesThatChanged) {
    // if `property1` or `property2` (or both) changes this function is invoked
    // `propertiesThatChanged` gives you the exact properties that changed (array of strings).

    // do something here..
    // like lazy load your other views and hydrate them or whatever

    // optionally unsubscribe if you want to only run the effect once.
    store.unsubscribe(effect);
}, /* (optional param) context / this */);
```

### Server-side rendering

If you use a template engine then that's your server-side rendering :)

But if you used no template engine, but hand-wrote getHtml(), then you can import Pepper and your views with node.js

```js
// ESM
import { Pepper, Store, html } from '@pepper-js/pepper';
// CJS
const { Pepper, Store, html } = require('@pepper-js/pepper')

// const pepperView = new Pepper(...)
const html = pepperView.toString();
// or html = `${pepperView}`
```

### Browser compatibility

Supports every browser as GOV UK (2022) - https://www.gov.uk/service-manual/technology/designing-for-different-browsers-and-devices

(Safari 12+ and latest Chrome, Edge, Firefox, Samsung Internet)
