import { expect, test } from 'vitest'

import { errorMessage } from './errors.js'

test('prefers the field error over the generic API sentence', () => {
  const error = {
    message: 'Request failed with status code 400',
    response: {
      data: {
        error: {
          message: 'The submitted data is invalid.',
          fields: {
            password: ['This password is too short. It must contain at least 8 characters.'],
          },
        },
      },
    },
  }

  expect(errorMessage(error)).toBe(
    'This password is too short. It must contain at least 8 characters.',
  )
})

test('uses the caller fallback when the API has no message', () => {
  const error = { message: 'Request failed with status code 500' }

  expect(errorMessage(error, 'Unable to create an account.')).toBe(
    'Unable to create an account.',
  )
})

test('keeps a specific API message when there are no field errors', () => {
  const error = {
    message: 'Request failed with status code 401',
    response: {
      data: {
        error: { message: 'Incorrect email address or password.', fields: {} },
      },
    },
  }

  expect(errorMessage(error)).toBe('Incorrect email address or password.')
})
