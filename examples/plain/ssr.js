/* global require */
const initializePage = require('./page.js');

function renderPage() {
  // Each page can different initial state that maybe specific to the request
  // e.g. like user specific data - user's first name or last name etc.
  const initialState = { counter: 1 };
  const page = initializePage(initialState);
  return `
    <html>
      <head>
          <script src="../../pepper.js"></script>
          <script src="./page.js"></script>
      </head>
      <body>
          ${page.view1}
          ${page.view2}
          <script>window.initialState = ${JSON.stringify(page.store.data)};</script>
          <script>
              var page = initializePage(window.initialState);
              page.view1.hydrate();
              page.view2.hydrate();
              // update counter
              window.setInterval(function () {
                  page.store.assign({
                      counter: page.store.data.counter + 1,
                  });
              }, 1000);
          </script>
      </body>
    </html>
  `
}

console.log(renderPage());