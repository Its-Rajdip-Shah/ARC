import { expect, test } from 'vitest'

import { plainText } from './plainText.js'

test('strips tags, decodes entities, and collapses whitespace', () => {
  expect(
    plainText(
      '<p>Read the <a class="instructure_file_link" href="/files/1">brief</a> &amp; submit&nbsp;today.</p>',
    ),
  ).toBe('Read the brief & submit today.')
})

test('decodes the common entities without treating them as markup', () => {
  expect(
    plainText('&lt;note&gt; &quot;quoted&quot; &#39;tick&#39;'),
  ).toBe('<note> "quoted" \'tick\'')
})

test('returns empty text when the input is blank or only tags', () => {
  expect(plainText(null)).toBe('')
  expect(plainText(undefined)).toBe('')
  expect(plainText('<p> </p>')).toBe('')
})
