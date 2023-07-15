import { from, each, isCustomElement } from './utils.js';

/**
 * @param {Element} newNode
 * @param {Element} liveNode
 */
function syncNode(newNode, liveNode) {
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

  // recursively sync children if innerHTML is different, except
  // custom elements (because encapsulation. reactivity with CE is via attributes only)
  if (!isCustomElement(newNode) && newNode.innerHTML != liveNode.innerHTML) {
    patchDom(
      liveNode,
      from(newNode.childNodes),
    );
  }
}

function getCustomElementOuterHtml(el) {
	return el.outerHTML.slice(0, -(el.innerHTML.length + el.tagName.length + 4)) + '/>';
}

/**
 * @param {Node} node
 * @returns {string}
 */
function hashNode(node) {
	return node.nodeType + ':' + (
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
}

/**
 * @param {NodeList} a 'a' is live childNodes of parentNode
 * @param {number} aStart 
 * @param {number} aEnd 
 * @param {Node[]} b 'b' is an array of new nodes
 * @param {number} bStart 
 * @param {number} bEnd
 * @returns 
 */
function matchNodes(a, aStart, aEnd, b, bStart, bEnd) {
  /**
   * Group elements with same hash
   * @type {Record<string, Node[]>}
   */
  var domLookup = {};
  /** @type {Map<Node, Node>} */
  var newNodeToLiveNodeMatch = new Map(); // 'n' (new) node to 'l' (live) node map
 
  var i, hash;
  for (i = bStart; i < bEnd; i++) {
    hash = hashNode(b[i]);
    if (!domLookup[hash]) domLookup[hash] = [];
    domLookup[hash].push(b[i]);
  }
  
  /**
   * For unmatched elements, we later want to re-use them if we can
   * @type {Record<string, Element[]>}
   */
  var salvagableElements = {};
  var salvagableElementsById = {};
  var newNode;
  for (i = aStart; i < aEnd; i++) {
    var liveNode = a[i];
    hash = hashNode(liveNode);
    var entry = domLookup[hash];
    var matched = false;
    if (entry) {
      newNode = entry.shift(); // pick first match
      if (newNode) {
        newNodeToLiveNodeMatch.set(newNode, liveNode);
        matched = true;
      }
    }
    if (!matched && liveNode.nodeType === 1) {
      if (liveNode.id) salvagableElementsById[liveNode.id] = liveNode;
      if (!salvagableElements[liveNode.nodeName]) salvagableElements[liveNode.nodeName] = [];
      salvagableElements[liveNode.nodeName].push(/** @type {Element} */ (liveNode));
    }
  }

  var aLiveNode;
  // match by id to reuse existing elements which gives a better
  // chance to preserve DOM states like input focus.
  for (i = bStart; i < bEnd; i++) {
    newNode = b[i];
    if (newNodeToLiveNodeMatch.get(newNode)) continue;

    var id = newNode.id;
    aLiveNode = id && salvagableElementsById[id];
    if (aLiveNode) {
      syncNode(newNode, aLiveNode);
      newNodeToLiveNodeMatch.set(newNode, aLiveNode);
      salvagableElements[newNode.nodeName].splice(
        salvagableElements[newNode.nodeName].indexOf(aLiveNode), 
        1,
      )
      salvagableElementsById[id] = null;
    }
  }

  // match by tag name to reuse existing elements which gives a better
  // chance to preserve DOM states like input focus.
  for (i = bStart; i < bEnd; i++) {
    newNode = b[i];
    if (newNodeToLiveNodeMatch.get(newNode)) continue;

    if (newNode.nodeType === 1 && (aLiveNode = salvagableElements[newNode.nodeName]?.shift())) {
      syncNode(newNode, aLiveNode);
      newNodeToLiveNodeMatch.set(newNode, aLiveNode);
    }
  }

  return newNodeToLiveNodeMatch;
}

/**
 * @param {Element} parentNode
 * @param {Node[]} newNodes
 */
function patchDom(parentNode, newNodes) {
  var a = parentNode.childNodes;
  var aStart = 0;
  var aEnd = a.length;
  var b = newNodes;
  var bStart = 0;
  var bEnd = b.length;

  while (aStart < aEnd || bStart < bEnd) {
    // fast path to append head or tail
    if (aEnd === aStart) {
      var insertBefore = parentNode.childNodes[aEnd];
      while (bStart < bEnd) {
        parentNode.insertBefore(b[bStart++], insertBefore);
      }
    } // fast path to remove head or tail 
    else if (bEnd === bStart) {
      // fast path to remove all nodes
      if (!b.length) {
        parentNode.replaceChildren();
      } else {
        while (aStart < aEnd) {
          a[--aEnd].remove();
        }
      }
    } // fast path for same head 
    else if (a[aStart].isEqualNode(b[bStart])) {
      aStart++;
      bStart++;
    } // fast path for same tail
    else if (a[aEnd - 1].isEqualNode(b[bEnd - 1])) {
      aEnd--;
      bEnd--;
    } // fast path for swaps 
    else if (
      aStart < (aEnd - 1)
      && bStart < (bEnd - 1)
      && a[aStart].isEqualNode(b[bEnd - 1])
      && b[bStart].isEqualNode(a[aEnd - 1])
    ) {
      // swap operation that could happen also in this case:
      // [1, 2, 3, 4, 5]
      // [1, 4, 3, 2, 5]
      --aEnd;
      bStart++;
      --bEnd;
      var oldStartNode = a[aStart++];
      var oldEndNode = a[aEnd];
      var startInsertBefore = oldStartNode.nextSibling;
      parentNode.insertBefore(oldStartNode, oldEndNode.nextSibling);
      // if the two nodes were adjacent siblings then they are already swapped now, so ignore that case.
      if (startInsertBefore !== oldEndNode) {
        parentNode.insertBefore(oldEndNode, startInsertBefore);
      }
    } // diff, "slow" path
    else {
      var newNodeToLiveNodeMatch = matchNodes(a, aStart, aEnd, b, bStart, bEnd);
    
      // insert the future nodes into position
      var i, newNode;
      for (i = bStart; i < bEnd; i++) {
        newNode = b[i];
        // check for exact match live node
        var existingLiveNode = newNodeToLiveNodeMatch.get(newNode);
        var nodeAtPosition = parentNode.childNodes[i];
        if (existingLiveNode) {
          // place it at the position. If nodeAtPosition is undefined, then inserts to end
          if (nodeAtPosition !== existingLiveNode) {
            parentNode.insertBefore(existingLiveNode, nodeAtPosition);
          }
          // else nothing to do if exact match is already at the right position
        } else {
          // At this point the node is either a text node, comment node or
          // an element that cant re-use another element.
          parentNode.insertBefore(newNode, nodeAtPosition);
        }
      }
    
      // now if live nodes length > new nodes length, keep discarding node from bEnd position
      while (a.length > b.length) {
        a[bEnd].remove();
      }
      break;
    }
  }
}

export { patchDom };