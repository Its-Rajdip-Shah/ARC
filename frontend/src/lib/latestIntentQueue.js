/*
 * Serialise expensive canonical mutations while keeping only the newest
 * not-yet-started intent.
 *
 * Example:
 *
 *   A starts
 *   B arrives
 *   C arrives
 *
 * Network execution becomes:
 *
 *   A -> C
 *
 * B never reaches the server.
 *
 * The promise returned by the first push resolves only after the entire
 * current chain has drained, so one React Query mutation can represent the
 * complete reconciliation period.
 */
export function createLatestIntentQueue(
  execute,
) {
  let running = false
  let queuedIntent = null
  let currentPromise = null

  async function drain(
    firstIntent,
  ) {
    let intent =
      firstIntent

    let lastResult

    try {
      while (
        intent !== null
      ) {
        /*
         * Clear the slot before execution. Any push that arrives while
         * execute() is awaiting replaces this slot with the newest intent.
         */
        queuedIntent =
          null

        lastResult =
          await execute(
            intent,
          )

        intent =
          queuedIntent
      }

      return lastResult

    } finally {
      running = false
      queuedIntent = null
      currentPromise = null
    }
  }

  return {
    push(intent) {
      if (running) {
        queuedIntent =
          intent

        return currentPromise
      }

      running =
        true

      currentPromise =
        drain(
          intent,
        )

      return currentPromise
    },

    isRunning() {
      return running
    },

    hasQueuedIntent() {
      return (
        queuedIntent !==
        null
      )
    },
  }
}



/*
 * FIFO serial queue for distinct canonical actions.
 *
 * Unlike createLatestIntentQueue(), this does not discard intermediate
 * actions. It is for cases such as:
 *
 *   unanchor A
 *   unanchor B
 *   unanchor C
 *
 * All three must reach Django, but never concurrently.
 */
export function createSerialActionQueue(
  execute,
) {
  let tail =
    Promise.resolve()

  let pending =
    0

  let idleResolvers =
    []

  function resolveIdle() {
    if (
      pending !== 0
    ) {
      return
    }

    const resolvers =
      idleResolvers

    idleResolvers =
      []

    for (
      const resolve
      of resolvers
    ) {
      resolve()
    }
  }

  return {
    push(intent) {
      pending += 1

      const run =
        () =>
          execute(
            intent,
          )

      const request =
        tail.then(
          run,
          run,
        )

      tail =
        request.catch(
          () => undefined,
        )

      return request.finally(
        () => {
          pending -= 1
          resolveIdle()
        },
      )
    },

    isRunning() {
      return pending > 0
    },

    whenIdle() {
      if (
        pending === 0
      ) {
        return Promise.resolve()
      }

      return new Promise(
        (resolve) => {
          idleResolvers.push(
            resolve,
          )
        },
      )
    },
  }
}
