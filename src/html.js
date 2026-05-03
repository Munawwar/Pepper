const characterEntitiesMapping = {
  '<': '&lt;',
  '>': '&gt;',
  '&': '&amp;',
  "'": '&apos;',
  '"': '&quot;',
  // prevent attacks like html`<img src="x" onerror="html\`\${alert(1)}\`" />`
  '`': '&#x60;',
};
const findRegex = /[<>&'"]/g;
const eventAttrRegex = /(on-[^\s"'<>/=]+)=["']?$/;
const replaceFunc = character => characterEntitiesMapping[character];

/**
 * Creates an html tagged template literal with optional Pepper render context.
 * @param {{ handlerIndex: number, handlers: Function[]|null }|null} [renderContext=null]
 * @returns {(strings: string[], ...values: any[]) => string}
 */
function createHtml(renderContext = null) {
  return function html(strings, ...values) {
    let acc = strings[0];
    for (let index = 1; index < strings.length; index++) {
      const prevString = strings[index - 1];
      const value = values[index - 1];
      if (prevString.endsWith("$")) {
        acc = acc.slice(0, -1);
        acc += value + strings[index];
        continue;
      }

      if (eventAttrRegex.test(prevString)) {
        if (typeof value !== 'function') {
          throw new Error('Pepper event attributes only support function values, e.g. on-click=${handler}.');
        }
        if (!renderContext) {
          throw new Error('Pepper event handlers require the render-bound html passed to getHtml(html, data).');
        }
        acc += renderContext.handlerIndex++;
        if (renderContext.handlers) {
          renderContext.handlers.push(value);
        }
        acc += strings[index];
        continue;
      }

      let safeValue = String(value);
      if (safeValue) {
        safeValue = safeValue.replace(findRegex, replaceFunc);
      }
      acc += safeValue + strings[index];
    }
    return acc;
  };
}

const html = createHtml();

export { createHtml, html };
