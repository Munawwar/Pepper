var from = Array.from;

function each(arrayLike, fn) {
	return Array.prototype.forEach.call(arrayLike, fn);
}

function isCustomElement(element) {
	if (element.tagName.indexOf('-') > 0) return true;
	var attr = element.getAttribute('is');
	return (attr && attr.indexOf('-') > 0);
}

function keys(obj) {
	return Object.keys(obj).filter(key => key !== 'constructor');
}
// Safer Object.assign
function objectAssign(target) {
	from(arguments).forEach((obj, index) => {
		if (!index) return;
		keys(obj).forEach((key) => {
			target[key] = obj[key];
		});
	});
	return target;
}

export {
  each,
  isCustomElement,
  from,
  keys,
  objectAssign,
};