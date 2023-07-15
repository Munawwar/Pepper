import { keys, objectAssign } from './utils.js'

// A store for Pepper views
// it only does a shallow (i.e level 1) equality check of the store data properties
// for notifying relevant connected views to re-render
/**
 * @constructor
 * @param {Object} initialData
 */
function Store(initialData) {
	var self = this;
	/** @private */
	self._data = initialData || {};
	/** @private */
	self._subscribers = [];

	Object.defineProperty(this, 'data', {
		configurable: false,
		set(newData) {
			if (typeof newData !== 'object') {
				return;
			}
			var changedProps = [].concat(
				// find props that were changed
				keys(newData).filter((prop) => self._data[prop] !== newData[prop]),
				// find props that got removed (i.e. not in new data)
				keys(self._data).filter((prop) => !(prop in newData))
			);
			self._data = newData;
			self.notify(changedProps);
		},
		get() {
			return self._data;
		}
	});
}

Store.prototype = {
	/**
	 * Reactive data - Getter/Setter
	 */
	data: {},
	/**
	 * @private
	 */
	notify(changedProps) {
		var changedPropsLookup = changedProps.reduce((acc, prop) => {
			acc[prop] = 1;
			return acc;
		}, {});
		this._subscribers.forEach((subscriber) => {
			var changesPropsSubset = subscriber.props.filter((prop) => changedPropsLookup[prop]);
			if (changesPropsSubset.length) {
				subscriber.callback.call(subscriber.context, changesPropsSubset);
			}
		});
	},
	/**
	 * Subscribe to changes in global store properties
	 * @param {string[]} propsToListenFor
	 * @param {() => undefined} func
	 * @param {any} [context]
	 * @returns 
	 */
	subscribe(propsToListenFor, func, context) {
		if (typeof func !== 'function' || !Array.isArray(propsToListenFor)) {
			return;
		}
		var self = this;
		var alreadyAdded = self._subscribers.some((subscriber) => (
			subscriber.callback === func && (context === undefined || context === subscriber.context)
		));
		if (!alreadyAdded) {
			self._subscribers.push({
				props: propsToListenFor,
				callback: func,
				context: context
			});
		}
	},
	unsubscribe(func, context) {
		this._subscribers = this._subscribers.filter((subscriber) => !(
			subscriber.callback === func && (context === undefined || context === subscriber.context)
		));
	},
	assign(newData) {
		var self = this;
		if (typeof newData !== 'object') {
			return;
		}
		var changedProps = keys(newData).filter((prop) => self._data[prop] !== newData[prop]);
		objectAssign(self._data, newData);
		self.notify(changedProps);
	}
};

export { Store };