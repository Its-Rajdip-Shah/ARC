import assert from 'node:assert/strict'
import {
  test,
} from 'node:test'

import {
  projectPlannerSidebarDrop,
  reorderPlannerSidebarRoots,
} from './plannerSidebarProjection.js'


function roots() {
  return [
    1,
    2,
    3,
    4,
    5,
    6,
  ].map(
    (id) => ({
      id,
      title:
        `Root ${id}`,
    }),
  )
}


test(
  'SIDEBAR every source over every target matches Priority-style ordering',
  () => {
    const initial =
      roots()

    for (
      let source = 0;
      source < initial.length;
      source += 1
    ) {
      for (
        let target = 0;
        target < initial.length;
        target += 1
      ) {
        const activeId =
          initial[source].id

        const overId =
          initial[target].id

        const intent =
          projectPlannerSidebarDrop(
            initial,
            activeId,
            overId,
          )

        if (source === target) {
          assert.equal(
            intent,
            null,
          )

          continue
        }

        assert.deepEqual(
          intent,
          {
            type:
              'planner-sidebar-root-reorder',

            itemId:
              activeId,

            position:
              target + 1,
          },
        )

        const expected = [
          ...initial,
        ]

        const [
          moved,
        ] =
          expected.splice(
            source,
            1,
          )

        expected.splice(
          target,
          0,
          moved,
        )

        assert.deepEqual(
          reorderPlannerSidebarRoots(
            initial,
            intent.itemId,
            intent.position,
          ).map(
            (root) =>
              root.id,
          ),
          expected.map(
            (root) =>
              root.id,
          ),
          (
            `source=${source}, `
            + `target=${target}`
          ),
        )
      }
    }
  },
)


test(
  'SIDEBAR repeated local reorder is deterministic',
  () => {
    const initial =
      roots()

    const expected =
      reorderPlannerSidebarRoots(
        initial,
        6,
        2,
      )

    for (
      let run = 0;
      run < 50;
      run += 1
    ) {
      assert.deepEqual(
        reorderPlannerSidebarRoots(
          initial,
          6,
          2,
        ),
        expected,
      )
    }
  },
)


test(
  'SIDEBAR clamps requested positions safely',
  () => {
    const initial =
      roots()

    assert.deepEqual(
      reorderPlannerSidebarRoots(
        initial,
        4,
        -100,
      ).map(
        (root) =>
          root.id,
      ),
      [
        4,
        1,
        2,
        3,
        5,
        6,
      ],
    )

    assert.deepEqual(
      reorderPlannerSidebarRoots(
        initial,
        2,
        999,
      ).map(
        (root) =>
          root.id,
      ),
      [
        1,
        3,
        4,
        5,
        6,
        2,
      ],
    )
  },
)
