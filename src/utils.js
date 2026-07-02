const from = Array.from;

/**
 * @template T, U
 * @param {ArrayLike<T>} arrayLike
 * @param {(value: T, index: number) => U} fn
 * @returns {void}
 */
function each(arrayLike, fn) {
	return Array.prototype.forEach.call(arrayLike, fn);
}

/**
 * @param {Element} element
 * @returns {boolean}
 */
function isCustomElement(element) {
	if (element.tagName.indexOf('-') > 0) return true;
	const attr = element.getAttribute('is');
	return !!(attr && attr.indexOf('-') > 0);
}

/**
 * @param {object | null | undefined} obj
 * @returns {string[]}
 */
function keys(obj) {
  if (!obj) return [];
	return Object.keys(obj).filter(key => key !== 'constructor');
}
// Safer Object.assign
/**
 * @template T
 * @param {T} target
 * @param {...Array<Record<string, unknown> | null | undefined>} args
 * @returns {T & Record<string, unknown>}
 */
function objectAssign(target, ...args) {
	args.forEach((obj) => {
		keys(obj).forEach((key) => {
			/** @type {Record<string, unknown>} */ (target)[key] = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (obj))[key];
		});
	});
	return /** @type {T & Record<string, unknown>} */ (target);
}

/**
 * @param {unknown} value1
 * @param {unknown} value2
 * @returns {boolean}
 */
function isEqual(value1, value2) {
	if (Object.is(value1, value2)) return true;
	if (
		value1 === null
		|| value2 === null
		|| typeof value1 !== 'object'
		|| typeof value2 !== 'object'
	) {
		return value1 === value2;
	}

	const prototype = Object.getPrototypeOf(value1);
	if (prototype !== Object.getPrototypeOf(value2)) {
		return false;
	}
	if (Array.isArray(value1)) {
		const array2 = /** @type {unknown[]} */ (value2);
		return value1.length === array2.length && value1.every((item, index) => isEqual(item, array2[index]));
	}
	if (value1 instanceof Date) {
		return value1.getTime() === /** @type {Date} */ (value2).getTime();
	}
	if (value1 instanceof RegExp) {
		return value1.toString() === value2.toString();
	}
	if (prototype !== Object.prototype && prototype !== null) {
		return false;
	}

	const objectKeys = keys(value1);
	return objectKeys.length === keys(value2).length
		&& objectKeys.every((key) => key in /** @type {Record<string, unknown>} */ (value2) && isEqual(
			/** @type {Record<string, unknown>} */ (value1)[key],
			/** @type {Record<string, unknown>} */ (value2)[key],
		));
}

export {
  each,
  isCustomElement,
  from,
  keys,
  objectAssign,
  isEqual,
};
