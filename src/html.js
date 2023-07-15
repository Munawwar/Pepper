const characterEntitiesMapping = {
  '<': '&lt;',
  '>': '&gt;',
  '&': '&amp;',
  "'": '&apos;',
  '"': '&quot;',
};
function escape(text) {
  if (!text) return text;
  return text.replace(/[<>&'"]/g, character => characterEntitiesMapping[character]);
}
// Utility for users not using a template library
function html(strings, ...values) {
  return strings.reduce((acc, string, index) => {
    let value = String(values[index - 1]);
    if ((strings[index - 1] || '').endsWith("$")) {
      // If $ sign precedes the interpolation, then its considered safe to
      // add the unescaped / raw HTML
      acc = acc.slice(0, -1);
    } else {
      value = escape(value);
    }
    return acc + value + string;
  });
}

export { html };