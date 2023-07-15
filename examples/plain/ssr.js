import initializePage from './page.js';

function renderPage() {
  // Each page can different initial state that maybe specific to the request
  // e.g. like user specific data - user's first name or last name etc.
  const initialState = { count: 1 };
  const page = initializePage(initialState);
  return /* html */ `
    <html>
        <head>
            <link rel="modulepreload" href="../../index.js" />
            <link rel="modulepreload" href="./page.js" />
        </head>
        <body>
            ${page.view1}
            ${page.view2}
            <script>window.initialState = ${JSON.stringify(page.store.data)};</script>
            <script type="module">
                import initializePage from './page.js';
                const page = initializePage(window.initialState);
                page.view1.hydrate();
                page.view2.hydrate();
                // update count
                window.setInterval(function () {
                    page.store.assign({
                        count: page.store.data.count + 1,
                    });
                }, 1000);
            </script>
        </body>
    </html>
  `
}

console.log(renderPage());