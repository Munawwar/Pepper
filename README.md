## Pepper

NOTE: Project is still a work-in-progress

Reuse your server side templates on the client side. Pepper some client-side JS after serving the HTML.

Use template libraries like mustache, handlebars, jade.. (any that can compile to JS)

Benefit of mustache/handlebars is that it runs on several server-side languages, making SSR more possible if you don't want to or cannot use JS on server-side.

Bundle size - pepper.js is 2.3 KB gzipped

### Example

```html
<!DOCTYPE html>
<html>
    <head>
        <script src="pepper.js"></script>
    </head>
    <body>
        <button id="node-to-sync" on-click="onClick">Test</button>
        <script>
            var view = new Pepper({
                getHtml: (data) => `<button id="node-to-sync" on-click="onClick">${data.text}</button>`,
                // or you can instead use a template library here
                
                data: { text: 'Test' },
                target: '#node-to-sync', // optional
                hydrate: true, // optional
                
                onClick: function () {
                    console.log('Clicked!');
                }
            });
            // or you can call view.hydrate() here.
            // or call view.mount(), to create new DOM nodes
            // or view.append(document.body), if no target specified
        </script>
    </body>
</html>
```

You can find examples for several templating language in the [examples directory](./examples).

**Important note**: The template HTML should be wrapped inside a single HTML tag. In other words, Pepper assumes the template has a single root element. If not, then Pepper would take the first element (as root) and ignore the rest.

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

One can do `rootElement.pepperInstance` to get access to the view object from the developer tools. It is only for
debugging purposes. Never use it in code.

### Pepper State Store - AKA performance improvement for large views

Pepper comes with a simplified global state store, so that you can have multiple views with common states stored in it. Updating the store data will re-render connected views automatically.

```js
// initialize global store
Pepper.store.assign({
    counter: 1
});

// create some views that use the store data.
var view1 = new Pepper({
    // if you want to be able to access a property from the store, then
    // you need to explicitly "connect" to that property. This is a performance
    // optimization (like redux).
    connect: ['counter'],
    getHtml: data => `<div><span>Counter = ${ data.counter }</span></div>`,
    target: '#myview1',
    mount: true,
});
var view2 = new Pepper({
    getHtml: `<div><span>Counter = ${ data.counter }</span></div>`,
    connect: ['counter'],
    target: '#myview2',
    mount: true,
});

// demonstrating how updating one data source, re-renders multiple views
// so.. update counter
var incrementCounterAction = function () {
    Pepper.store.assign({
        counter: Pepper.store.data.counter + 1
    });
};
window.setInterval(incrementCounterAction, 1000);
```

Note that if you don't "connect" your view to specific properties from the Pepper store, then you cannot access those property at all.

Also note; I have moved the code that manipulates the central store (data side effects) to separate function(s) (i.e action). Even though this is completely optional, I would recommended always doing it that way, since it is later easier to find out what's manipulating the central store. If you put this code in the view it would be harder to find later.

Important note: This is a performance optimization in disguise. You can naively put all your HTML within a single Pepper view and all the states within it.
But that could take a hit on rendering performance. So Pepper Store gives you an option to make smaller views, while keeping the rest of the HTML static, and refresh only the views that needs a refresh (with some manual "connecting" from the developer's end).

### Server-side rendering

If you use a template engine then that's your server-side rendering :)

But if you used no template engine, but hand-wrote getHtml(), then you can import Pepper and your views with node.js

```js
// CJS
const Pepper = require('@pepper-js/pepper')
// ESM
import Pepper from '@pepper-js/pepper';
```

### Browser compatibility

Supports every browser as GOV UK (2021) - https://www.gov.uk/service-manual/technology/designing-for-different-browsers-and-devices

(currently includes IE 11, Safari 12 and Samsung Internet)

*But* for IE 11, you either need to include jquery or [parseHtml() function](./parseHTML.js) (extracted out from jquery).