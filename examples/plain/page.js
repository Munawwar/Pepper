import Pepper from '../../pepper.js';

export default function initializePage(initialState) {
  var store = new Pepper.Store(initialState);
  var view1 = new Pepper({
      getHtml: data => `<span>Counter = ${data.counter}</span>`,
      connect: {
          store: store,
          props: ['counter']
      },
      target: '#myview1'
  });
  var view2 = new Pepper({
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