import assert from 'node:assert/strict'
import {
  test,
} from 'node:test'

import {
  createLatestIntentQueue,
  createSerialActionQueue,
} from './latestIntentQueue.js'


function deferred() {
  let resolve
  let reject

  const promise =
    new Promise(
      (
        resolveValue,
        rejectValue,
      ) => {
        resolve =
          resolveValue

        reject =
          rejectValue
      },
    )

  return {
    promise,
    resolve,
    reject,
  }
}


test(
  'latest intent queue skips superseded pending work',
  async () => {
    const gate =
      deferred()

    const executed = []

    const queue =
      createLatestIntentQueue(
        async (intent) => {
          executed.push(
            intent,
          )

          if (
            intent === 'first'
          ) {
            await gate.promise
          }

          return (
            'result:' +
            intent
          )
        },
      )

    const promise =
      queue.push(
        'first',
      )

    queue.push(
      'middle',
    )

    queue.push(
      'latest',
    )

    assert.deepEqual(
      executed,
      [
        'first',
      ],
    )

    assert.equal(
      queue.isRunning(),
      true,
    )

    assert.equal(
      queue.hasQueuedIntent(),
      true,
    )

    gate.resolve()

    assert.equal(
      await promise,
      'result:latest',
    )

    assert.deepEqual(
      executed,
      [
        'first',
        'latest',
      ],
    )

    assert.equal(
      queue.isRunning(),
      false,
    )
  },
)


test(
  'queue can be used again after a failed execution',
  async () => {
    let fail =
      true

    const executed = []

    const queue =
      createLatestIntentQueue(
        async (intent) => {
          executed.push(
            intent,
          )

          if (fail) {
            fail = false

            throw new Error(
              'boom',
            )
          }

          return intent
        },
      )

    await assert.rejects(
      queue.push(
        'bad',
      ),
      /boom/,
    )

    assert.equal(
      queue.isRunning(),
      false,
    )

    assert.equal(
      await queue.push(
        'good',
      ),
      'good',
    )

    assert.deepEqual(
      executed,
      [
        'bad',
        'good',
      ],
    )
  },
)



test(
  'serial action queue preserves every action and order',
  async () => {
    const firstGate =
      deferred()

    const executed = []

    const queue =
      createSerialActionQueue(
        async (intent) => {
          executed.push(
            `start:${intent}`,
          )

          if (
            intent === 'first'
          ) {
            await firstGate.promise
          }

          executed.push(
            `end:${intent}`,
          )

          return intent
        },
      )

    const first =
      queue.push(
        'first',
      )

    const second =
      queue.push(
        'second',
      )

    const third =
      queue.push(
        'third',
      )

    await Promise.resolve()

    assert.deepEqual(
      executed,
      [
        'start:first',
      ],
    )

    assert.equal(
      queue.isRunning(),
      true,
    )

    firstGate.resolve()

    assert.deepEqual(
      await Promise.all([
        first,
        second,
        third,
      ]),
      [
        'first',
        'second',
        'third',
      ],
    )

    await queue.whenIdle()

    assert.deepEqual(
      executed,
      [
        'start:first',
        'end:first',
        'start:second',
        'end:second',
        'start:third',
        'end:third',
      ],
    )

    assert.equal(
      queue.isRunning(),
      false,
    )
  },
)
