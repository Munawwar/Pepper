/**
 * A simple base class for custom elements that makes it simple to write custom
 * elements with declarative templates using the `html` template tag function.
 */
export class Base extends HTMLElement {
    /**
     * Call this method to update the element's DOM based on its template.
     */
    update(): void;
    /**
     * Subclasses can override this to specify their own template.
     * @returns {ReturnType<typeof html>}
     */
    template(): ReturnType<typeof html>;
}
import { html } from '../../src/html.js';
//# sourceMappingURL=Base.d.ts.map
