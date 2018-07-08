## SahteReact

A client-side library to keep UI in sync.

Uses template libraries (like nunjucks, doT or swig) and dom diff.

( "Sahte" means "fake" in Turkish ;) )

### Why?

I am working on a project that is using swig & jquery and is difficult to refactor to React or Vue.
So.. improvising... this library can reduce the amount of jquery needed to update the view, by
reusing the server-side swig templates on the browser wherever possible.

### Example

mytemplate.html (precompile it to mytemplate.js using nunjucks  `precompile` tool or swig `compile` CLI)
```html
<div on-click="onClick">
    {{ text }}
</div>
```

index.html:
```html
<!DOCTYPE html>
<html>
    <head>
        <script src="jquery.js"></script>

        <script src="template-library/nunjucks-slim.min.js"></script>
        <script src="dom-diff.js"></script>
        <script src="sahte-react.js"></script>

        <script src="mytemplate.js"></script>
    </head>
    <body>
        <div id="node-to-sync"></div>
        <script>
            var view = new SahteReact({
                template: 'mytemplate',
                data: { text: 'Test' },
                target: '#node-to-sync',

                onClick: function () {
                    console.log('Clicked!');
                }
            });
            view.mount();
        </script>
    </body>
</html>
```

**Note**: An assumption made by Sahte is that the template used, is always wrapped inside a single HTML tag. In other words, a SahteReact instance assumes the template has a single root element. If not, then Sahte would take the first element (as root) and ignore the rest.

**Note 2**: `view.mount()` will update DOM immediately (synchronous/blocking call).

### Template precompiling command

nunjucks example:
```
nunjucks/bin/precompile --name mytemplate mytemplate.html > mytemplate.js
```

swig example:
```
swig/bin/swig.js compile mytemplate.html --wrap-start="swig._precompiled = swig._precompiled || {};
swig._precompiled['mytemplate'] = " > mytemplate.js
```

**Note**: If you don't want to use any template engine, then declare `getHTML()` method and return HTML using state object from `this.data` (and also don't set `template` property on the instance of course).

### How to update the view?

```
view.data = { text: 'Test 2'}; //uses setter to detect change
```
Or use view.assign() to not overwrite existing props

view.assign's signature is exactly like Object.assign().

**Note**: Updating states updates the DOM immediately (synchronous/blocking call). So it is generally a good idea to reduce state changes to a single call per user action.. for example a single call for a click action. You can use temporary objects if needed to reduce calls. 

### Quick access to DOM nodes

```html
<div on-click="onClick">
    <span ref="spanEl">{{ text }}</span>
</div>
```

Now you can use `this.spanEl` (inside a view method) or 'view.spanEl` (from outside) to access the span element.

### Debug access

One can do `rootElement.sahteReactInstance` to get access to the view object from the developer tools. It is only for
debugging purposes. Never use it in code.
