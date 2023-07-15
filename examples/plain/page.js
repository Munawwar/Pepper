import { Pepper, Store, html } from '../../src/index.js';

export default function initializePage(initialState) {
  const store = new Store(initialState);
  const view1 = new Pepper({
    getHtml: data => html`<span>Counter = ${data.stores.counter.count}</span>`,
    stores: {
      counter: {
        store: store,
        props: ['count']
      }
    },
    target: '#myview1'
  });
  const view2 = new Pepper({
    getHtml: data => html`<span>Counter = ${data.stores.counter.count}</span>`,
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