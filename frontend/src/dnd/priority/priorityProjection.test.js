import assert from 'node:assert/strict'
import {
  test,
} from 'node:test'

import {
  projectPriorityDrop,
} from './priorityProjection.js'


const rows = [
  {
    item_id: 11,
    position: 1,
  },
  {
    item_id: 22,
    position: 2,
  },
  {
    item_id: 33,
    position: 3,
  },
]


test(
  'projects active item onto target priority position',
  () => {
    assert.deepEqual(
      projectPriorityDrop(
        rows,
        11,
        33,
      ),
      {
        type:
          'priority-reorder',

        itemId:
          11,

        position:
          3,
      },
    )
  },
)


test(
  'returns null when dropping onto itself',
  () => {
    assert.equal(
      projectPriorityDrop(
        rows,
        22,
        22,
      ),
      null,
    )
  },
)


test(
  'returns null when collision target is missing',
  () => {
    assert.equal(
      projectPriorityDrop(
        rows,
        11,
        999,
      ),
      null,
    )
  },
)
