import assert from 'node:assert/strict'
import {
  test,
} from 'node:test'

import {
  projectTimelineDrop,
} from './timelineProjection.js'


test(
  'projects browser x coordinate into board-local timeline position',
  () => {
    const calls = []

    const dateAtPosition =
      (
        position,
        scale,
      ) => {
        calls.push({
          position,
          scale,
        })

        return '2026-10-04'
      }

    const scale = {
      width: 900,
    }

    const result =
      projectTimelineDrop({
        clientX: 425,
        boardLeft: 125,
        scale,
        dateAtPosition,
      })

    assert.deepEqual(
      calls,
      [
        {
          position: 300,
          scale,
        },
      ],
    )

    assert.deepEqual(
      result,
      {
        type:
          'timeline-anchor',

        date:
          '2026-10-04',
      },
    )
  },
)
