import { expect, test } from 'vitest'

import { subjectLabel } from './subjectLabel.js'

test('subject label uses the name after a dash', () => {
  expect(subjectLabel(
    'COMP3888 COMP3988 ISYS3888 CSE (ND) \u2014 CS Capstone Projects',
  )).toBe('CS Capstone Projects')

  expect(subjectLabel('COMP2123 - Data Structures')).toBe('Data Structures')
  expect(subjectLabel('Personal root')).toBe('Personal root')
  expect(subjectLabel('Code \u2014')).toBe('Code \u2014')
})
