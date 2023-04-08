import Pepper from '../../index.js';

export default function initializePage(initialState) {
  const store = new Pepper.Store(initialState);
  const view1 = new Pepper({
      getHtml: data => `<span>Counter = ${data.counter}</span>`,
      connect: {
          store: store,
          props: ['counter']
      },
      target: '#myview1'
  });
  const view2 = new Pepper({
      getHtml: data => `<span>Counter = ${data.counter}</span>`,
      connect: {
          store: store,
          props: ['counter']
      },
      target: '#myview2'
  });
  return {
    store,
    view1,
    view2,
  };
}