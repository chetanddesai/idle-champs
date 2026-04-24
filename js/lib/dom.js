/**
 * dom.js — tiny DOM helpers used by views. Not a framework; just a few
 * utilities so view code doesn't have to repeat `document.createElement`
 * boilerplate.
 *
 * These helpers are impure (they touch the DOM) so they are not exercised
 * by `node:test` — their "tests" are the views rendering correctly in the
 * browser.
 */

/**
 * Create an element with attributes, dataset, and children in a single
 * expression. `props` supports:
 *
 *   { class, text, html, on: { click: fn }, attrs: { role: 'foo' } }
 *
 * Children may be strings, numbers, Nodes, or nested arrays; null/undefined
 * children are ignored so conditional rendering reads naturally:
 *
 *   el('div', { class: 'card' }, [
 *     title && el('h3', { text: title }),
 *     body,
 *   ]);
 */
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);

  if (props.class) node.className = props.class;
  if (props.text != null) node.textContent = String(props.text);
  if (props.html != null) node.innerHTML = props.html;
  if (props.attrs) {
    for (const [k, v] of Object.entries(props.attrs)) {
      if (v == null || v === false) continue;
      if (v === true) node.setAttribute(k, '');
      else node.setAttribute(k, String(v));
    }
  }
  if (props.data) {
    for (const [k, v] of Object.entries(props.data)) {
      if (v == null) continue;
      node.dataset[k] = String(v);
    }
  }
  if (props.on) {
    for (const [evt, handler] of Object.entries(props.on)) {
      node.addEventListener(evt, handler);
    }
  }

  appendChildren(node, children);
  return node;
}

function appendChildren(parent, children) {
  if (children == null) return;
  if (Array.isArray(children)) {
    for (const c of children) appendChildren(parent, c);
    return;
  }
  if (children instanceof Node) {
    parent.appendChild(children);
    return;
  }
  if (typeof children === 'string' || typeof children === 'number') {
    parent.appendChild(document.createTextNode(String(children)));
  }
}

/**
 * Replace the contents of a node with a single child (or array of children).
 */
export function mount(host, contents) {
  if (!host) return;
  host.replaceChildren();
  appendChildren(host, contents);
}

/**
 * Query the nearest ancestor (inclusive) matching `selector`, starting
 * from `el`. Used by delegated click handlers.
 */
export function closest(el, selector) {
  if (!el) return null;
  return el.closest ? el.closest(selector) : null;
}
