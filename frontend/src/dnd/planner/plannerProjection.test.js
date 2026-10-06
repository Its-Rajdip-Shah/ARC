import assert from 'node:assert/strict'
import {
  test,
} from 'node:test'

import {
  applyPlannerMove,
  flattenPlanningTree,
  plannerDescendantIds,
  projectPlannerDrop,
  projectPlannerGap,
  removePlannerItem,
  stablePlannerDepthDelta,
} from './plannerProjection.js'


const flatRoots = [
  {
    id: 1,
    title: '1',
    children: [],
  },
  {
    id: 2,
    title: '2',
    children: [],
  },
  {
    id: 3,
    title: '3',
    children: [],
  },
  {
    id: 4,
    title: '4',
    children: [],
  },
]


test(
  'sortable over-id controls the exact visible root slot',
  () => {
    const intent =
      projectPlannerDrop({
        items:
          flattenPlanningTree(
            flatRoots,
          ),

        activeId: 1,
        overId: 4,
        horizontalOffset: 0,
      })

    const result =
      applyPlannerMove(
        flatRoots,
        intent,
      )

    assert.deepEqual(
      result.map(
        (item) =>
          item.id,
      ),
      [2, 3, 4, 1],
    )
  },
)


test(
  'moving fourth item over first produces 4 1 2 3',
  () => {
    const intent =
      projectPlannerDrop({
        items:
          flattenPlanningTree(
            flatRoots,
          ),

        activeId: 4,
        overId: 1,
        horizontalOffset: 0,
      })

    const result =
      applyPlannerMove(
        flatRoots,
        intent,
      )

    assert.deepEqual(
      result.map(
        (item) =>
          item.id,
      ),
      [4, 1, 2, 3],
    )
  },
)


test(
  'horizontal-only movement indents a non-root sibling',
  () => {
    const tree = [
      {
        id: 10,
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
    ]

    const intent =
      projectPlannerDrop({
        items:
          flattenPlanningTree(
            tree,
          ),

        activeId: 12,
        overId: 12,
        horizontalOffset: 42,
      })

    assert.equal(
      intent.parentId,
      11,
    )

    assert.equal(
      intent.depth,
      2,
    )

    assert.equal(
      intent.siblingOrder,
      1,
    )
  },
)


test(
  'horizontal-only movement outdents one level',
  () => {
    const tree = [
      {
        id: 10,
        children: [
          {
            id: 11,
            children: [
              {
                id: 12,
                children: [],
              },
            ],
          },
          {
            id: 13,
            children: [],
          },
        ],
      },
    ]

    const intent =
      projectPlannerDrop({
        items:
          flattenPlanningTree(
            tree,
          ),

        activeId: 12,
        overId: 12,
        horizontalOffset: -42,
      })

    assert.equal(
      intent.parentId,
      10,
    )

    assert.equal(
      intent.depth,
      1,
    )

    assert.equal(
      intent.siblingOrder,
      2,
    )
  },
)


test(
  'real top-level roots cannot be indented',
  () => {
    const intent =
      projectPlannerDrop({
        items:
          flattenPlanningTree(
            flatRoots,
          ),

        activeId: 2,
        overId: 2,
        horizontalOffset: 100,
      })

    assert.equal(
      intent.parentId,
      null,
    )

    assert.equal(
      intent.depth,
      0,
    )
  },
)


test(
  'moving a parent preserves its subtree',
  () => {
    const tree = [
      {
        id: 1,
        children: [
          {
            id: 2,
            children: [
              {
                id: 3,
                children: [],
              },
            ],
          },
          {
            id: 4,
            children: [],
          },
        ],
      },
      {
        id: 5,
        children: [],
      },
    ]

    const result =
      applyPlannerMove(
        tree,
        {
          type:
            'planner-move',

          itemId:
            2,

          parentId:
            5,

          siblingOrder:
            1,
        },
      )

    assert.equal(
      result[1]
        .children[0]
        .id,
      2,
    )

    assert.equal(
      result[1]
        .children[0]
        .children[0]
        .id,
      3,
    )
  },
)


test(
  'optimistic delete removes the entire selected subtree',
  () => {
    const tree = [
      {
        id: 1,
        children: [
          {
            id: 2,
            children: [
              {
                id: 3,
                children: [],
              },
            ],
          },
          {
            id: 4,
            children: [],
          },
        ],
      },
    ]

    const result =
      removePlannerItem(
        tree,
        2,
      )

    assert.deepEqual(
      result[0]
        .children
        .map(
          (item) =>
            item.id,
        ),
      [4],
    )
  },
)



test(
  'depth projection does not chatter near indent threshold',
  () => {
    let delta = 0

    delta =
      stablePlannerDepthDelta(
        20,
        delta,
      )

    assert.equal(
      delta,
      0,
    )

    delta =
      stablePlannerDepthDelta(
        28,
        delta,
      )

    assert.equal(
      delta,
      1,
    )

    /*
     * Moving slightly back left does not instantly collapse the hierarchy.
     */
    delta =
      stablePlannerDepthDelta(
        22,
        delta,
      )

    assert.equal(
      delta,
      1,
    )

    delta =
      stablePlannerDepthDelta(
        16,
        delta,
      )

    assert.equal(
      delta,
      1,
    )

    /*
     * Only after crossing the lower hysteresis boundary does it return.
     */
    delta =
      stablePlannerDepthDelta(
        14,
        delta,
      )

    assert.equal(
      delta,
      0,
    )
  },
)


test(
  'negative horizontal hierarchy movement has symmetric hysteresis',
  () => {
    let delta = 0

    delta =
      stablePlannerDepthDelta(
        -28,
        delta,
      )

    assert.equal(
      delta,
      -1,
    )

    delta =
      stablePlannerDepthDelta(
        -20,
        delta,
      )

    assert.equal(
      delta,
      -1,
    )

    delta =
      stablePlannerDepthDelta(
        -14,
        delta,
      )

    assert.equal(
      delta,
      0,
    )
  },
)


test(
  'multi-level outdent preserves vertical slot and adopts following branch',
  () => {
    const tree = [
      {
        id: 100,
        title: 'Research',
        children: [
          {
            id: 4,
            title: '4',
            children: [],
          },
          {
            id: 1,
            title: '1',
            children: [
              {
                id: 11,
                title: '1.1',
                children: [],
              },
              {
                id: 12,
                title: '1.2',
                children: [
                  {
                    id: 121,
                    title: '1.2.1',
                    children: [
                      {
                        id: 1211,
                        title: '1.2.1.1',
                        children: [],
                      },
                    ],
                  },
                  {
                    id: 122,
                    title: '1.2.2',
                    children: [],
                  },
                ],
              },
              {
                id: 13,
                title: '1.3',
                children: [],
              },
            ],
          },
          {
            id: 2,
            title: '2',
            children: [],
          },
        ],
      },
    ]

    const flat =
      flattenPlanningTree(
        tree,
      )

    const intent =
      projectPlannerDrop({
        items: flat,
        activeId: 122,
        overId: 122,
        depthDelta: -2,
      })

    assert.equal(
      intent.parentId,
      100,
    )

    assert.equal(
      intent.siblingOrder,
      3,
    )

    assert.equal(
      intent.depth,
      1,
    )

    assert.deepEqual(
      intent.adoptChildIds,
      [13],
    )

    const result =
      applyPlannerMove(
        tree,
        intent,
      )

    assert.deepEqual(
      result[0]
        .children
        .map(
          (item) =>
            item.id,
        ),
      [4, 1, 122, 2],
    )

    const moved =
      result[0]
        .children[2]

    assert.deepEqual(
      moved.children.map(
        (item) =>
          item.id,
      ),
      [13],
    )

    assert.deepEqual(
      result[0]
        .children[1]
        .children
        .map(
          (item) =>
            item.id,
        ),
      [11, 12],
    )
  },
)



test(
  'horizontal-only multi-level outdent preserves the active vertical slot',
  () => {
    const tree = [
      {
        id: 100,
        title: 'Research',
        children: [
          {
            id: 4,
            title: '4',
            children: [],
          },
          {
            id: 1,
            title: '1',
            children: [
              {
                id: 11,
                title: '1.1',
                children: [],
              },
              {
                id: 12,
                title: '1.2',
                children: [
                  {
                    id: 121,
                    title: '1.2.1',
                    children: [
                      {
                        id: 1211,
                        title: '1.2.1.1',
                        children: [],
                      },
                    ],
                  },
                  {
                    id: 122,
                    title: '1.2.2',
                    children: [],
                  },
                ],
              },
              {
                id: 13,
                title: '1.3',
                children: [],
              },
            ],
          },
          {
            id: 2,
            title: '2',
            children: [],
          },
        ],
      },
    ]

    const flat =
      flattenPlanningTree(
        tree,
      )

    /*
     * Horizontal-only means dnd-kit's vertical collision target remains the
     * active row itself. Only depth changes.
     */
    const intent =
      projectPlannerDrop({
        items: flat,
        activeId: 122,
        overId: 122,
        depthDelta: -2,
      })

    const result =
      applyPlannerMove(
        tree,
        intent,
      )

    const rootChildren =
      result[0].children

    assert.deepEqual(
      rootChildren.map(
        (item) =>
          item.id,
      ),
      [4, 1, 122, 2],
    )

    assert.deepEqual(
      rootChildren[2]
        .children
        .map(
          (item) =>
            item.id,
        ),
      [13],
    )

    /*
     * Crucially it must NOT become:
     *
     *   [122, 4, 1, 2]
     *
     * merely because the pointer moved left.
     */
    assert.equal(
      rootChildren[0].id,
      4,
    )
  },
)



test(
  'parent drag excludes exactly the rows projection excludes',
  () => {
    const tree = [
      {
        id: 100,
        children: [
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
                    children: [
                      {
                        id: 1211,
                        children: [],
                      },
                    ],
                  },
                  {
                    id: 122,
                    children: [],
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

    const flat =
      flattenPlanningTree(
        tree,
      )

    assert.deepEqual(
      plannerDescendantIds(
        flat,
        121,
      ),
      [1211],
    )

    assert.deepEqual(
      plannerDescendantIds(
        flat,
        12,
      ),
      [
        121,
        1211,
        122,
      ],
    )
  },
)



test(
  'MATRIX every flat sibling moves to every possible sibling position',
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
        const tree = [
          {
            id: 100,
            children:
              ids.map(
                (id) => ({
                  id,
                  children: [],
                }),
              ),
          },
        ]

        const intent =
          projectPlannerGap({
            items:
              flattenPlanningTree(
                tree,
              ),

            activeId,

            /*
             * Research is stationary flattened row zero.
             */
            gapIndex:
              destination + 1,

            depthDelta: 0,
          })

        const result =
          applyPlannerMove(
            tree,
            intent,
          )

        const expected =
          [...remaining]

        expected.splice(
          destination,
          0,
          activeId,
        )

        assert.deepEqual(
          result[0]
            .children
            .map(
              (item) =>
                item.id,
            ),
          expected,
          `active=${activeId}, destination=${destination}`,
        )
      }
    }
  },
)


test(
  'REGRESSION leaf 5 dropped between 7 and 6 stays exactly there',
  () => {
    const tree = [
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

    const flat =
      flattenPlanningTree(
        tree,
      )

    const stationary =
      flat.filter(
        (item) =>
          item.id !== 5,
      )

    const gapBeforeSix =
      stationary.findIndex(
        (item) =>
          item.id === 6,
      )

    const intent =
      projectPlannerGap({
        items: flat,
        activeId: 5,
        gapIndex:
          gapBeforeSix,
        depthDelta: 0,
      })

    const result =
      applyPlannerMove(
        tree,
        intent,
      )

    assert.deepEqual(
      result[0]
        .children
        .map(
          (item) =>
            item.id,
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
  'MATRIX parent subtree stays intact at every root-child destination',
  () => {
    const remaining = [
      2,
      3,
      4,
      7,
      6,
      5,
      8,
    ]

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

      const intent =
        projectPlannerGap({
          items:
            flattenPlanningTree(
              tree,
            ),

          activeId: 1,

          gapIndex:
            destination + 1,

          depthDelta: 0,
        })

      const result =
        applyPlannerMove(
          tree,
          intent,
        )

      const expected =
        [...remaining]

      expected.splice(
        destination,
        0,
        1,
      )

      assert.deepEqual(
        result[0]
          .children
          .map(
            (item) =>
              item.id,
          ),
        expected,
        `parent destination=${destination}`,
      )

      const moved =
        result[0]
          .children
          .find(
            (item) =>
              item.id === 1,
          )

      assert.deepEqual(
        moved.children.map(
          (item) =>
            item.id,
        ),
        [
          11,
          12,
        ],
      )

      assert.deepEqual(
        moved.children[0]
          .children
          .map(
            (item) =>
              item.id,
          ),
        [111],
      )
    }
  },
)


test(
  'REGRESSION nested 1.2.2 dropped between 7 and 6 becomes exact root sibling there',
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
                id: 12,
                children: [
                  {
                    id: 122,
                    children: [],
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

    const flat =
      flattenPlanningTree(
        tree,
      )

    const stationary =
      flat.filter(
        (item) =>
          item.id !== 122,
      )

    const gapBeforeSix =
      stationary.findIndex(
        (item) =>
          item.id === 6,
      )

    const intent =
      projectPlannerGap({
        items: flat,
        activeId: 122,
        gapIndex:
          gapBeforeSix,
        depthDelta: -2,
      })

    const result =
      applyPlannerMove(
        tree,
        intent,
      )

    assert.deepEqual(
      result[0]
        .children
        .map(
          (item) =>
            item.id,
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
  },
)


test(
  'same vertical gap survives every horizontal depth delta',
  () => {
    const tree = [
      {
        id: 100,
        children: [
          {
            id: 1,
            children: [
              {
                id: 11,
                children: [],
              },
              {
                id: 12,
                children: [],
              },
            ],
          },
          {
            id: 2,
            children: [],
          },
        ],
      },
    ]

    const flat =
      flattenPlanningTree(
        tree,
      )

    for (
      const depthDelta
      of [-3, -2, -1, 0, 1, 2, 3]
    ) {
      const intent =
        projectPlannerGap({
          items: flat,
          activeId: 12,
          gapIndex: 3,
          depthDelta,
        })

      assert.equal(
        intent.gapIndex,
        3,
        `depthDelta=${depthDelta}`,
      )
    }
  },
)
