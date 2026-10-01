import assert from 'node:assert/strict'
import {
  test,
} from 'node:test'

import {
  applyPlannerMove,
  flattenPlanningTree,
  plannerDescendantIds,
  projectPlannerGap,
} from './plannerProjection.js'

import {
  plannerVisualGapIndex,
} from './plannerVisualPlacement.js'


function simulateDrag({
  tree,
  activeId,
  beforeId,
  afterId,
  depthDelta = 0,
}) {
  const flat =
    flattenPlanningTree(
      tree,
    )

  const descendants =
    plannerDescendantIds(
      flat,
      activeId,
    )

  /*
   * Simulate the REAL Planner DOM geometry.
   *
   * Every flattened row remains mounted throughout the drag, regardless of
   * whether activeId is a leaf, parent, grandparent, or deeper ancestor.
   *
   * Descendants of the active item may be paint-hidden, but their row
   * geometry remains unchanged.
   */
  const rows =
    flat.map(
      (item, index) => ({
        id:
          item.id,

        centerY:
          100
          + index * 40,
      }),
    )

  const byId =
    new Map(
      rows.map(
        (row) => [
          row.id,
          row,
        ],
      ),
    )

  let activeCenterY

  if (
    beforeId == null
  ) {
    activeCenterY =
      rows[0].centerY
      - 20

  } else if (
    afterId == null
  ) {
    activeCenterY =
      rows.at(-1).centerY
      + 20

  } else {
    const before =
      byId.get(
        beforeId,
      )

    const after =
      byId.get(
        afterId,
      )

    assert.ok(
      before,
      `missing before row ${beforeId}`,
    )

    assert.ok(
      after,
      `missing after row ${afterId}`,
    )

    activeCenterY =
      (
        before.centerY
        + after.centerY
      )
      / 2
  }

  const rowsIncludingActive = [
    ...rows,
    {
      id:
        activeId,

      centerY:
        activeCenterY,
    },
  ]

  const gapIndex =
    plannerVisualGapIndex({
      rows:
        rowsIncludingActive,

      activeId,

      descendantIds:
        descendants,

      activeCenterY,
    })

  const intent =
    projectPlannerGap({
      items:
        flat,

      activeId,

      gapIndex,

      depthDelta,
    })

  assert.ok(
    intent,
    'drag must produce a move intent',
  )

  return {
    gapIndex,
    intent,

    tree:
      applyPlannerMove(
        tree,
        intent,
      ),
  }
}


function childIds(
  tree,
  parentId,
) {
  function find(
    nodes,
  ) {
    for (
      const node
      of nodes
    ) {
      if (
        node.id === parentId
      ) {
        return (
          node.children
          ?? []
        ).map(
          (child) =>
            child.id,
        )
      }

      const nested =
        find(
          node.children
          ?? [],
        )

      if (nested) {
        return nested
      }
    }

    return null
  }

  return find(tree)
}


function flatRootTree() {
  return [
    {
      id: 100,
      children: [
        2,
        3,
        1,
        4,
        7,
        6,
        5,
        8,
      ].map(
        (id) => ({
          id,
          children: [],
        }),
      ),
    },
  ]
}


test(
  'DRAG SCENARIO leaf 5 visually between 7 and 6 persists there',
  () => {
    const result =
      simulateDrag({
        tree:
          flatRootTree(),

        activeId: 5,
        beforeId: 7,
        afterId: 6,
      })

    assert.deepEqual(
      childIds(
        result.tree,
        100,
      ),
      [
        2,
        3,
        1,
        4,
        7,
        5,
        6,
        8,
      ],
    )
  },
)


test(
  'DRAG MATRIX every root child can be dragged into every root-child gap',
  () => {
    const ids = [
      2,
      3,
      1,
      4,
      7,
      6,
      5,
      8,
    ]

    for (
      const activeId
      of ids
    ) {
      const remaining =
        ids.filter(
          (id) =>
            id !== activeId,
        )

      for (
        let destination = 0;
        destination <=
          remaining.length;
        destination += 1
      ) {
        const beforeId =
          destination === 0
            ? 100
            : remaining[
                destination - 1
              ]

        const afterId =
          destination ===
          remaining.length
            ? null
            : remaining[
                destination
              ]

        const result =
          simulateDrag({
            tree:
              flatRootTree(),

            activeId,

            beforeId,

            afterId,
          })

        const expected =
          [...remaining]

        expected.splice(
          destination,
          0,
          activeId,
        )

        assert.deepEqual(
          childIds(
            result.tree,
            100,
          ),
          expected,
          `active=${activeId}, destination=${destination}`,
        )
      }
    }
  },
)


test(
  'DRAG MATRIX nested siblings behave across every local sibling gap',
  () => {
    const ids = [
      11,
      12,
      13,
    ]

    for (
      const activeId
      of ids
    ) {
      const remaining =
        ids.filter(
          (id) =>
            id !== activeId,
        )

      for (
        let destination = 0;
        destination <=
          remaining.length;
        destination += 1
      ) {
        const tree = [
          {
            id: 100,
            children: [
              {
                id: 1,
                children: ids.map(
                  (id) => ({
                    id,
                    children: [],
                  }),
                ),
              },
            ],
          },
        ]

        /*
         * The first child gap is immediately after parent 1.
         */
        const beforeId =
          destination === 0
            ? 1
            : remaining[
                destination - 1
              ]

        const afterId =
          destination ===
          remaining.length
            ? null
            : remaining[
                destination
              ]

        const result =
          simulateDrag({
            tree,
            activeId,
            beforeId,
            afterId,
          })

        const expected =
          [...remaining]

        expected.splice(
          destination,
          0,
          activeId,
        )

        assert.deepEqual(
          childIds(
            result.tree,
            1,
          ),
          expected,
          `nested active=${activeId}, destination=${destination}`,
        )
      }
    }
  },
)


test(
  'DRAG SCENARIO nested 1.2.2 can outdent to between root children 7 and 6',
  () => {
    const tree = [
      {
        id: 100,
        children: [
          {
            id: 2,
            children: [],
          },
          {
            id: 3,
            children: [],
          },
          {
            id: 1,
            children: [
              {
                id: 11,
                children: [],
              },
              {
                id: 12,
                children: [
                  {
                    id: 121,
                    children: [],
                  },
                  {
                    id: 122,
                    children: [
                      {
                        id: 1221,
                        children: [],
                      },
                    ],
                  },
                ],
              },
              {
                id: 13,
                children: [],
              },
            ],
          },
          {
            id: 4,
            children: [],
          },
          {
            id: 7,
            children: [],
          },
          {
            id: 6,
            children: [],
          },
          {
            id: 5,
            children: [],
          },
          {
            id: 8,
            children: [],
          },
        ],
      },
    ]

    const result =
      simulateDrag({
        tree,
        activeId: 122,
        beforeId: 7,
        afterId: 6,
        depthDelta: -2,
      })

    assert.deepEqual(
      childIds(
        result.tree,
        100,
      ),
      [
        2,
        3,
        1,
        4,
        7,
        122,
        6,
        5,
        8,
      ],
    )

    /*
     * Existing child travels structurally with 1.2.2 even though it is hidden
     * from the drag preview.
     */
    assert.deepEqual(
      childIds(
        result.tree,
        122,
      ),
      [1221],
    )
  },
)


test(
  'DRAG SCENARIO deep parent moves as one subtree to a root sibling gap',
  () => {
    const tree = [
      {
        id: 100,
        children: [
          {
            id: 2,
            children: [],
          },
          {
            id: 1,
            children: [
              {
                id: 11,
                children: [
                  {
                    id: 111,
                    children: [],
                  },
                ],
              },
              {
                id: 12,
                children: [],
              },
            ],
          },
          {
            id: 4,
            children: [],
          },
          {
            id: 7,
            children: [],
          },
          {
            id: 6,
            children: [],
          },
          {
            id: 8,
            children: [],
          },
        ],
      },
    ]

    const result =
      simulateDrag({
        tree,
        activeId: 1,
        beforeId: 7,
        afterId: 6,
      })

    assert.deepEqual(
      childIds(
        result.tree,
        100,
      ),
      [
        2,
        4,
        7,
        1,
        6,
        8,
      ],
    )

    assert.deepEqual(
      childIds(
        result.tree,
        1,
      ),
      [
        11,
        12,
      ],
    )

    assert.deepEqual(
      childIds(
        result.tree,
        11,
      ),
      [111],
    )
  },
)


function makeParentEquivalenceTree(
  descendantShape,
) {
  return [
    {
      id: 100,

      children: [
        {
          id: 2,
          children: [],
        },

        {
          id: 3,
          children: [],
        },

        {
          id: 1,
          children:
            descendantShape,
        },

        {
          id: 4,
          children: [],
        },

        {
          id: 7,
          children: [],
        },

        {
          id: 6,
          children: [],
        },

        {
          id: 5,
          children: [],
        },

        {
          id: 8,
          children: [],
        },
      ],
    },
  ]
}


test(
  'PARENT EQUIVALENCE destination is invariant to subtree size',
  () => {
    const variants = [
      {
        name:
          'leaf',

        children: [],
      },

      {
        name:
          'one child',

        children: [
          {
            id: 11,
            children: [],
          },
        ],
      },

      {
        name:
          'several children',

        children: [
          {
            id: 11,
            children: [],
          },
          {
            id: 12,
            children: [],
          },
          {
            id: 13,
            children: [],
          },
        ],
      },

      {
        name:
          'deep subtree',

        children: [
          {
            id: 11,

            children: [
              {
                id: 111,

                children: [
                  {
                    id: 1111,

                    children: [
                      {
                        id: 11111,
                        children: [],
                      },
                    ],
                  },
                ],
              },
            ],
          },

          {
            id: 12,

            children: [
              {
                id: 121,
                children: [],
              },
              {
                id: 122,
                children: [],
              },
            ],
          },
        ],
      },
    ]

    for (
      const variant
      of variants
    ) {
      const result =
        simulateDrag({
          tree:
            makeParentEquivalenceTree(
              variant.children,
            ),

          activeId: 1,

          beforeId: 7,
          afterId: 6,
        })

      assert.deepEqual(
        childIds(
          result.tree,
          100,
        ),
        [
          2,
          3,
          4,
          7,
          1,
          6,
          5,
          8,
        ],
        variant.name,
      )
    }
  },
)


test(
  'PARENT EQUIVALENCE all root destinations ignore descendant count',
  () => {
    const variants = [
      [],

      [
        {
          id: 11,
          children: [],
        },
      ],

      [
        {
          id: 11,

          children: [
            {
              id: 111,

              children: [
                {
                  id: 1111,
                  children: [],
                },
              ],
            },
          ],
        },

        {
          id: 12,
          children: [],
        },

        {
          id: 13,

          children: [
            {
              id: 131,
              children: [],
            },
          ],
        },
      ],
    ]

    const rootSiblingIds = [
      2,
      3,
      4,
      7,
      6,
      5,
      8,
    ]

    for (
      const descendants
      of variants
    ) {
      for (
        let destination = 0;
        destination <=
          rootSiblingIds.length;
        destination += 1
      ) {
        const beforeId =
          destination === 0
            ? 100
            : rootSiblingIds[
                destination - 1
              ]

        const afterId =
          destination ===
          rootSiblingIds.length
            ? null
            : rootSiblingIds[
                destination
              ]

        const result =
          simulateDrag({
            tree:
              makeParentEquivalenceTree(
                descendants,
              ),

            activeId: 1,

            beforeId,

            afterId,
          })

        const expected =
          [...rootSiblingIds]

        expected.splice(
          destination,
          0,
          1,
        )

        assert.deepEqual(
          childIds(
            result.tree,
            100,
          ),
          expected,
          (
            `descendants=${
              JSON.stringify(
                descendants,
              )
            }, destination=${
              destination
            }`
          ),
        )
      }
    }
  },
)


test(
  'PARENT EQUIVALENCE repeated same drag is deterministic',
  () => {
    const tree =
      makeParentEquivalenceTree([
        {
          id: 11,

          children: [
            {
              id: 111,

              children: [
                {
                  id: 1111,
                  children: [],
                },
              ],
            },
          ],
        },

        {
          id: 12,
          children: [],
        },
      ])

    const results = []

    for (
      let iteration = 0;
      iteration < 25;
      iteration += 1
    ) {
      results.push(
        simulateDrag({
          tree:
            structuredClone(
              tree,
            ),

          activeId: 1,

          beforeId: 7,
          afterId: 6,
        }).intent,
      )
    }

    const first =
      results[0]

    for (
      const result
      of results
    ) {
      assert.deepEqual(
        result,
        first,
      )
    }
  },
)
