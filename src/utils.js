/**
 * @param {object | null | undefined} obj
 * @returns {string[]}
 */
function keys(obj) {
  if (!obj) return [];
	return Object.keys(obj).filter(key => key !== 'constructor');
}
/**
 * @param {unknown} value1
 * @param {unknown} value2
 * @param {WeakSet<object>} [ancestors]
 * @returns {boolean}
 */
function isEqual(value1, value2, ancestors) {
	if (Object.is(value1, value2)) return true;
	if (
		value1 === null
		|| value2 === null
		|| typeof value1 !== 'object'
		|| typeof value2 !== 'object'
	) {
		return false;
	}

	const prototype = Object.getPrototypeOf(value1);
	if (prototype !== Object.getPrototypeOf(value2)) return false;
	const isArray = Array.isArray(value1);
	if (isArray !== Array.isArray(value2)) return false;
	if (value1 instanceof Date) {
		return value1.getTime() === /** @type {Date} */ (value2).getTime();
	}
	if (value1 instanceof RegExp) {
		return value1.toString() === value2.toString();
	}
	if (isArray) {
		if (value1.length !== /** @type {unknown[]} */ (value2).length) return false;
	} else if (prototype !== Object.prototype && prototype !== null) return false;

	ancestors ||= new WeakSet();
	if (ancestors.has(value1)) return false;
	ancestors.add(value1);
	const objectKeys = Object.keys(value1);
	const equal = objectKeys.length === Object.keys(value2).length
		&& objectKeys.every((key) => Object.hasOwn(value2, key) && isEqual(
			/** @type {Record<string, unknown>} */ (value1)[key],
			/** @type {Record<string, unknown>} */ (value2)[key],
			ancestors,
		));
	ancestors.delete(value1);
	return equal;
}

export {
  keys,
  isEqual,
};
