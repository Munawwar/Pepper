import { each, isCustomElement } from './utils.js';

// This implementation is faster than Array.from(el.childNodes)
function getChildNodes(el) {
  const nodes = [];
  for (let node = el.firstChild; node; node = node.nextSibling) {
    nodes.push(node);
  }
  return nodes;
}

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
  if (!isCustomElement(newNode) && newNode.innerHTML !== liveNode.innerHTML) {
    patchDom(
      liveNode,
      getChildNodes(newNode),
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
 * @param {Node[]} a live nodes
 * @param {number} aStart 
 * @param {number} aEnd 
 * @param {Node[]} b new nodes
 * @param {number} bStart 
 * @param {number} bEnd
 * @returns 
 */
function matchNodes(a, aStart, aEnd, b, bStart, bEnd) {
  /**
   * Group elements with same hash
   * @type {Record<string, Node[]>}
   */
  const domLookup = Object.create(null);
  /** @type {Map<Node, Node>} */
  const newNodeToLiveNodeMatch = new Map(); // 'n' (new) node to 'l' (live) node map
 
  let hash;
  for (let i = bStart; i < bEnd; i++) {
    hash = hashNode(b[i]);
    if (!domLookup[hash]) domLookup[hash] = [];
    domLookup[hash].push(b[i]);
  }
  
  /**
   * For unmatched elements, we later want to re-use them if we can
   * @type {Record<string, Element[]>}
   */
  const salvageableElements = Object.create(null);
  const salvageableElementsById = Object.create(null);
  let newNode;
  for (let i = aStart; i < aEnd; i++) {
    const liveNode = a[i];
    hash = hashNode(liveNode);
    const entry = domLookup[hash];
    let matched = false;
    if (entry) {
      newNode = entry.shift(); // pick first match
      if (newNode) {
        newNodeToLiveNodeMatch.set(newNode, liveNode);
        matched = true;
      }
    }
    if (!matched && liveNode.nodeType === 1) {
      if (liveNode.id) salvageableElementsById[liveNode.id] = liveNode;
      if (!salvageableElements[liveNode.nodeName]) salvageableElements[liveNode.nodeName] = [];
      salvageableElements[liveNode.nodeName].push(/** @type {Element} */ (liveNode));
    }
  }

  let aLiveNode;
  // match by id to reuse existing elements which gives a better
  // chance to preserve DOM states like input focus.
  for (let i = bStart; i < bEnd; i++) {
    newNode = b[i];
    if (newNodeToLiveNodeMatch.get(newNode)) continue;

    const id = newNode.id;
    aLiveNode = id && salvageableElementsById[id];
    if (aLiveNode) {
      syncNode(newNode, aLiveNode);
      newNodeToLiveNodeMatch.set(newNode, aLiveNode);
      salvageableElements[newNode.nodeName].splice(
        salvageableElements[newNode.nodeName].indexOf(aLiveNode),
        1,
      );
      salvageableElementsById[id] = null;
    }
  }

  // match by tag name to reuse existing elements which gives a better
  // chance to preserve DOM states like input focus.
  for (let i = bStart; i < bEnd; i++) {
    newNode = b[i];
    if (newNodeToLiveNodeMatch.get(newNode)) continue;

    if (newNode.nodeType === 1 && (aLiveNode = (salvageableElements[newNode.nodeName] || []).shift())) {
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
  const a = getChildNodes(parentNode);
  let aLen = a.length;
  let aStart = 0;
  let aEnd = aLen;
  const b = newNodes;
  let bStart = 0;
  let bEnd = b.length;

  // Thanks to https://github.com/WebReflection/udomdiff for the fast path inspiration.
  while (aStart < aEnd || bStart < bEnd) {
    // fast path to append head or tail
    if (aEnd === aStart) {
      const insertBefore = a[aEnd];
      while (bStart < bEnd) {
        parentNode.insertBefore(b[bStart++], insertBefore);
      }
    } // fast path to remove head or tail 
    else if (bEnd === bStart) {
      // fast path to remove all nodes
      if (!b.length) {
        parentNode.replaceChildren();
        aEnd = aStart;
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
      const oldStartNode = a[aStart++];
      const oldEndNode = a[aEnd];
      const startInsertBefore = oldStartNode.nextSibling;
      parentNode.insertBefore(oldStartNode, oldEndNode.nextSibling);
      // if the two nodes were adjacent siblings then they are already swapped now, so ignore that case.
      if (startInsertBefore !== oldEndNode) {
        parentNode.insertBefore(oldEndNode, startInsertBefore);
      }
    } // diff, "slow" path
    else {
      const newNodeToLiveNodeMatch = matchNodes(a, aStart, aEnd, b, bStart, bEnd);
    
      // insert the future nodes into position
      let nodeAtPosition;
      for (let i = bStart; i < bEnd; i++) {
        const newNode = b[i];
        // check for exact match live node
        const existingLiveNode = newNodeToLiveNodeMatch.get(newNode);
        nodeAtPosition = nodeAtPosition ? nodeAtPosition.nextSibling : a[i];
        if (existingLiveNode) {
          // place it at the position. If nodeAtPosition is undefined, then inserts to end
          if (nodeAtPosition !== existingLiveNode) {
            parentNode.insertBefore(existingLiveNode, nodeAtPosition);
            nodeAtPosition = existingLiveNode;
          }
          // else nothing to do if exact match is already at the right position
        } else {
          // At this point the node is either a text node, comment node or
          // an element that cant re-use another element.
          parentNode.insertBefore(newNode, nodeAtPosition);
          nodeAtPosition = newNode;
          aLen++; // keep track of actual child nodes length (to be used in removal loop later)
        }
      }
    
      // now if live nodes length > new nodes length, keep discarding node
      // from bEnd position (newNode.nextSibling)
      while (aLen-- > b.length) {
        nodeAtPosition.nextSibling.remove();
      }
      break;
    }
  }
}

export { patchDom };
