const characterEntitiesMapping = {
  '<': '&lt;',
  '>': '&gt;',
  '&': '&amp;',
  "'": '&apos;',
  '"': '&quot;',
};
const findRegex = /[<>&'"]/g;
const replaceFunc = character => characterEntitiesMapping[character];

// Utility for users not using a template library
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