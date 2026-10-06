/*
 * Timeline-specific drag semantics.
 *
 * Timeline does not perform list collision or hierarchy projection.
 * Its canonical meaning is simply:
 *
 *     horizontal board coordinate -> calendar date
 *
 * The scale remains owned by Timeline's date model.
 */
export function projectTimelineDrop({
  clientX,
  boardLeft,
  scale,
  dateAtPosition,
}) {
  const localX =
    clientX -
    boardLeft

  return {
    type:
      'timeline-anchor',

    date:
      dateAtPosition(
        localX,
        scale,
      ),
  }
}
