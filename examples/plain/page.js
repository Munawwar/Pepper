import { Pepper, Store } from '../../src/index.js';

export default function initializePage(initialState) {
  const store = new Store(initialState);
  const view1 = new Pepper({
    getHtml(html, data) {
      return html`
        <div class="counter-block">
          <div>Interactive counter</div>
          <div class="counter-row">
            <button on-click=${this.onIncrementClick}>Increase</button>
            <span>Counter = ${data.stores.counter.count}</span>
          </div>
        </div>
      `;
    },
    onIncrementClick: () => store.assign({
      count: store.data.count + 1,
    }),
    stores: {
      counter: {
        store: store,
        props: ['count']
      }
    },
    target: '#myview1'
  });
  const view2 = new Pepper({
    getHtml: (html, data) => html`
      <div class="counter-block">
        <div>Mirrored counter</div>
        <span>Counter = ${data.stores.counter.count}</span>
      </div>
    `,
    stores: {
      counter: {
        store: store,
        props: ['count']
      }
    },
    target: '#myview2'
  });
  return {
    store,
    view1,
    view2,
  };
}
