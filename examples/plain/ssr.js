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
            <style>
                body {
                    font-family: sans-serif;
                    line-height: 1.4;
                    margin: 24px;
                }

                h1 {
                    font-size: 20px;
                    margin: 0 0 8px;
                }

                p {
                    margin: 0 0 16px;
                }

                .demo {
                    display: grid;
                    gap: 12px;
                }

                .counter-block {
                    display: grid;
                    gap: 6px;
                }

                .counter-row {
                    display: flex;
                    gap: 12px;
                    align-items: center;
                    flex-wrap: wrap;
                }
            </style>
        </head>
        <body>
            <main class="demo">
                <h1>Pepper Hydration Demo</h1>
                <p>Click the button to confirm the server-rendered event handler hydrates correctly.</p>
                <div id="myview1">${page.view1}</div>
                <div id="myview2">${page.view2}</div>
            </main>
            <script>window.initialState = ${JSON.stringify(page.store.data)};</script>
            <script type="module">
                import initializePage from './page.js';
                const page = initializePage(window.initialState);
                page.view1.hydrate();
                page.view2.hydrate();
            </script>
        </body>
    </html>
  `
}

console.log(renderPage());
