import { describe, expect, it } from 'vitest';
import { jsonLdText } from './PageHead';

/*
 * Structured data goes into the page inside a script tag (security review, m5.5). The old escape
 * replaced `<` with the JavaScript string '\u003c', which is `<` itself, so it did nothing, and a
 * `</script>` in the data would have closed the tag. Every `<` must become the six characters
 * \u003c, which JSON reads back as `<`.
 */
describe('structured data in a script tag', () => {
  it('turns every < into the six characters \\u003c, and reads back the same', () => {
    const data = { name: '</script><img src=x onerror=alert(1)>', a: 'x<y' };
    const text = jsonLdText(data);
    expect(text).not.toContain('<');
    expect(text).toContain('\\u003c/script>');
    expect(JSON.parse(text)).toEqual(data);
  });
});
