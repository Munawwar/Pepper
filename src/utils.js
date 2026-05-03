const from = Array.from;

function each(arrayLike, fn) {
	return Array.prototype.forEach.call(arrayLike, fn);
}

function isCustomElement(element) {
	if (element.tagName.indexOf('-') > 0) return true;
	const attr = element.getAttribute('is');
	return (attr && attr.indexOf('-') > 0);
}

function keys(obj) {
  if (!obj) return [];
	return Object.keys(obj).filter(key => key !== 'constructor');
}
// Safer Object.assign
function objectAssign(target, ...args) {
	args.forEach((obj) => {
		keys(obj).forEach((key) => {
			target[key] = obj[key];
		});
	});
	return target;
}

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
		return value1.length === value2.length && value1.every((item, index) => isEqual(item, value2[index]));
	}
	if (value1 instanceof Date) {
		return value1.getTime() === value2.getTime();
	}
	if (value1 instanceof RegExp) {
		return value1.toString() === value2.toString();
	}
	if (prototype !== Object.prototype && prototype !== null) {
		return false;
	}

	const objectKeys = keys(value1);
	return objectKeys.length === keys(value2).length
		&& objectKeys.every((key) => key in value2 && isEqual(value1[key], value2[key]));
}

export {
  each,
  isCustomElement,
  from,
  keys,
  objectAssign,
  isEqual,
};
