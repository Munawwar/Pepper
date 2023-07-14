import { from, each, isCustomElement } from './utils.js';

/**
 * @param {Element} newNode
 * @param {Element} liveNode
 */
function syncAttributes(newNode, liveNode) {
	// Remove any attributes from live node that is not in new node
	each(liveNode.attributes, (attr) => {
		if (!newNode.attributes.getNamedItem(attr.name)) {
			liveNode.attributes.removeNamedItem(attr.name);
		}
	});

	// update the rest
	each(newNode.attributes, (attr) => {
		if (liveNode.getAttribute(attr.name) !== attr.value) {
			liveNode.setAttribute(attr.name, attr.value);
		}
	});
}

function getCustomElementOuterHtml(el) {
	return el.outerHTML.slice(0, -(el.innerHTML.length + el.tagName.length + 4)) + '/>';
}
/**
 * 
 * @param {Node} node 
 * @param {Map<Node, string>} cache 
 * @returns {string}
 */
function hashNode(node, cache) {
	var hash = cache.get(node);
	if (!hash) {
		hash = node.nodeType + ':' + (
			(node.nodeType === 1 ?
				(
					isCustomElement(node) ?
					getCustomElementOuterHtml(node) :
					/** @type {Element} */ (node).outerHTML
				) :
				// comment, text, cdata node
				node.nodeValue
			)
		);
		cache.set(node, hash);
	}
	return hash;
}

/**
 * Assumptions:
 * 1. liveNodes are child nodes of parentNode
 * 2. no duplicates allowed within newNodes
 * 3. no duplicates allowed within liveNodes
 * 4. neither list should contain `after` node or any node before `after` node
 * @param {Node[]} newNodes
 * @param {Node[]} liveNodes
 * @param {Node} parentNode
 * @param {Node} [after] sync nodes after a specified node, so that the nodes before it doesn't get touched
 */
function patchDom(newNodes, liveNodes, parentNode, after) {

	// fast path: case if newNodes.length is zero. means remove all
	if (!newNodes.length) {
		liveNodes.forEach(node => parentNode.removeChild(node));
		return;
	}

	/** @type {Map<Node, string>} */
	var nodeHashCache = new Map();

	/**
	 * @typedef DomInfo
	 * @property {Node[]} u unmatched
	 * @property {Map<Node, Node>} n2l new node to live lookup
	 */
	/**
	 * Map from new nodes to old and back if available
	 * @type {Record<string, DomInfo>}
	 */
	var domLookup = {};
	newNodes.forEach((newNode) => {
		var hash = hashNode(newNode, nodeHashCache);
		domLookup[hash] = domLookup[hash] || {
			u: [],
			n2l: new Map(),
		};
		domLookup[hash].u.push(newNode);
	});
	/**
	 * we later want to re-use elements that don't have exact match if we can
	 * @type {Record<string, Element[]>}
	 */
	var salvagableElements = {};
	liveNodes.forEach((liveNode) => {
		var hash = hashNode(liveNode, nodeHashCache);
		var entry = domLookup[hash];
		var matched = false;
		if (entry) {
			var newNode = entry.u.shift(); // pick first match
			if (newNode) {
				entry.n2l.set(newNode, liveNode);
				matched = true;
			}
		}
		if (!matched && liveNode.nodeType === 1) {
			salvagableElements[liveNode.nodeName] = salvagableElements[liveNode.nodeName] || [];
			salvagableElements[liveNode.nodeName].push(/** @type {Element} */ (liveNode));
		}
	});

	// figure out where to start syncing from
	var insertAt = from(parentNode.childNodes).indexOf(after) + 1;
	var newLiveNodes = new Set();

	// re-ordering
	// we now look at new nodes top-to-bottom and order them exactly at it's final index
	newNodes.forEach((newNode, index) => {
		// check for exact match live node
		var hash = hashNode(newNode, nodeHashCache);
		var existingLiveNode = domLookup[hash].n2l.get(newNode);
		var nodeAtPosition = parentNode.childNodes[insertAt + index];
		if (existingLiveNode) {
			newLiveNodes.add(existingLiveNode);
			// place it at the position. If nodeAtPosition is undefined, then inserts to end
			if (nodeAtPosition !== existingLiveNode) {
				parentNode.insertBefore(existingLiveNode, nodeAtPosition);
			}
			// else nothing to do if exact match is already at the right position
			return;
		}
		
		// at this point we don't have an exact match node.
		// So for text, comment nodes just use the new nodes.
		// But for elements we can potentially re-use an existing element
		//
		// why? because there is a likely hood the node to be updated is a
		// "similar looking" element.
		// e.g. if the only update was an attribute update, and that node
		// happens to be a input element, it is worth keeping it so that
		// user doesn't potentially lose focus

		var newNodeName = newNode.nodeName;
		if (
			newNode.nodeType === 1
			&& (salvagableElements[newNodeName] && salvagableElements[newNodeName].length)
		) {
			// at this point we have an element that doesn't have an exact matching node.
			// but we do have an existing element of same nodeType that can be re-used
			var newEl = /** @type {Element} */ (newNode); // gah, typescript!
			var aLiveNode = salvagableElements[newNode.nodeName].shift(); // pick first one
			newLiveNodes.add(aLiveNode);
			// place it at where the new node should be
			if (nodeAtPosition !== aLiveNode) {
				parentNode.insertBefore(aLiveNode, nodeAtPosition);
			}
			syncAttributes(newEl, aLiveNode);
			// recursively sync children if innerHTML is different, except
			// custom elements (because encapsulation. reactivity with CE is via attributes only)
			if (!isCustomElement(newEl) && newEl.innerHTML != aLiveNode.innerHTML) {
				patchDom(
					from(newEl.childNodes),
					from(aLiveNode.childNodes),
					aLiveNode,
				);
			}
			return;
		}
		
		// At this point the node is either a text node, comment node or
		// an element that cant re-use another element.
		newLiveNodes.add(newNode);
		parentNode.insertBefore(newNode, nodeAtPosition);
	});

	// now remove any element not in newLiveNodes
	liveNodes.forEach((node) => {
		if (!newLiveNodes.has(node)) {
			parentNode.removeChild(node);
		}
	});
}

export { patchDom };