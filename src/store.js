import { keys } from './utils.js';

// A store for Pepper views
// it only does a shallow (i.e level 1) equality check of the store data properties
// for notifying relevant connected views to re-render
class Store {
	/** @type {Record<string, unknown>} */
	#data;
	/** @type {Array<{ props: string[], callback: (changedProps: string[]) => void, context: unknown }>} */
	#subscribers;

	/**
	 * @param {Record<string, unknown>} [initialData]
	 */
	constructor(initialData) {
		this.#data = initialData || {};
		this.#subscribers = [];
	}

	/**
	 * Read the current store data object.
	 *
	 * @returns {Record<string, unknown>}
	 */
	get data() {
		return this.#data;
	}

	/**
	 * Replace the entire store data object and notify subscribers for changed keys.
	 *
	 * @param {Record<string, unknown>} newData
	 */
	set data(newData) {
		if (!newData || typeof newData !== 'object') {
			return;
		}
		const changedProps = [
			...keys(newData).filter((prop) => this.#data[prop] !== newData[prop]),
			...keys(this.#data).filter((prop) => !(prop in newData)),
		];
		this.#data = newData;
		this.#notify(changedProps);
	}

	/**
	 * @param {string[]} changedProps
	 */
	#notify(changedProps) {
		const changedPropsLookup = new Set(changedProps);
		this.#subscribers.forEach((subscriber) => {
			const changesPropsSubset = subscriber.props.filter((prop) => changedPropsLookup.has(prop));
			if (changesPropsSubset.length) {
				subscriber.callback.call(subscriber.context, changesPropsSubset);
			}
		});
	}

	/**
	 * Subscribe to changes in global store properties
	 * @param {string[]} propsToListenFor
	 * @param {(changedProps: string[]) => void} func
	 * @param {unknown} [context]
	 */
	subscribe(propsToListenFor, func, context) {
		if (typeof func !== 'function' || !Array.isArray(propsToListenFor)) {
			return;
		}
		const alreadyAdded = this.#subscribers.some((subscriber) => (
			subscriber.callback === func && (context === undefined || context === subscriber.context)
		));
		if (!alreadyAdded) {
			this.#subscribers.push({
				props: propsToListenFor,
				callback: func,
				context,
			});
		}
	}

	/**
	 * @param {(changedProps: string[]) => void} func
	 * @param {unknown} [context]
	 * @returns {void}
	 */
	unsubscribe(func, context) {
		this.#subscribers = this.#subscribers.filter((subscriber) => !(
			subscriber.callback === func && (context === undefined || context === subscriber.context)
		));
	}

	/**
	 * Shallow-merge partial data into the store and notify subscribers for changed keys.
	 *
	 * @param {Record<string, unknown>} newData
	 */
	assign(newData) {
		if (!newData || typeof newData !== 'object') {
			return;
		}
		const changedProps = keys(newData).filter((prop) => this.#data[prop] !== newData[prop]);
		Object.assign(this.#data, newData);
		this.#notify(changedProps);
	}
}

export { Store };
