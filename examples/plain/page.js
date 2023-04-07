(function (initializer) {
	// eslint-disable-next-line no-undef
	if (typeof module === 'object' && module.exports) {
		// eslint-disable-next-line no-undef
		module.exports = initializer.bind(null, require('../../pepper'));
	} else {
		window.initializePage = initializer.bind(null, window.Pepper);
	}
})(function (Pepper, initialState) {
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
});