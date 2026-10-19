import { expect, it } from 'vitest'

import { connectionPingRegistration } from './ConnectionStatus'

it('includes a scheduler flavour when the connection check creates an account', () => {
  expect(connectionPingRegistration('ping@example.com')).toEqual({
    email: 'ping@example.com',
    password: 'ArcPing-pass-1234',
    scheduler_flavour: 'monk',
  })
})
