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
const replaceFunc = character => characterEntitiesMapping[character];

/**
 * Utility for users not using a template library
 * @params {string[]} strings
 * @params {any[]} values
 * @returns {string}
 */
function html(strings, ...values) {
  let acc = strings[0];
  for (let index = 1; index < strings.length; index++) {
    let value = String(values[index - 1]);
    if (strings[index - 1].endsWith("$")) {
      // If $ sign precedes the interpolation, then its considered safe to
      // add the unescaped / raw HTML
      acc = acc.slice(0, -1);
    } else if (value) {
      value = value.replace(findRegex, replaceFunc);
    }
    acc += value + strings[index];
  }
  return acc;
}

export { html };