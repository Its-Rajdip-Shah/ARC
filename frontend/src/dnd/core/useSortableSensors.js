import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'

import {
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'


/*
 * Shared sensor mechanics for ordinary sortable collections.
 *
 * View adapters choose whether this configuration is appropriate.
 * The core does not know what a drag means.
 */
export function useSortableSensors({
  pointerDistance = 6,
} = {}) {
  return useSensors(
    useSensor(
      PointerSensor,
      {
        activationConstraint: {
          distance:
            pointerDistance,
        },
      },
    ),

    useSensor(
      KeyboardSensor,
      {
        coordinateGetter:
          sortableKeyboardCoordinates,
      },
    ),
  )
}
