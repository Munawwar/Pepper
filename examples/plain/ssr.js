import { renderComponentToString } from '../../src/pepper-ssr.js';
import CounterDemo from './page.js';

function renderPage() {
  const initialProps = { initialCount: 1 };
  return /* html */ `
    <html>
        <head>
            <link rel="modulepreload" href="../../src/index.js" />
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
                <div id="app">${renderComponentToString(CounterDemo, initialProps)}</div>
            </main>
            <script>window.initialProps = ${JSON.stringify(initialProps)};</script>
            <script type="module">
                import { hydrate } from '../../src/index.js';
                import CounterDemo from './page.js';
                hydrate(CounterDemo, '#app', window.initialProps);
            </script>
        </body>
    </html>
  `
}

console.log(renderPage());
