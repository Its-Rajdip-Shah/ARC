/*
 * Shared geometric modifiers only.
 *
 * These primitives know nothing about Planner, Priority, Focus or Timeline
 * semantics.
 */

export function verticalOnly({
  transform,
}) {
  return {
    ...transform,
    x: 0,

    /*
     * dnd-kit may derive scaleX from source/target rect differences while
     * sorting. Priority cards should translate vertically without visually
     * stretching across the horizontal axis.
     */
    scaleX: 1,
  }
}


export function horizontalOnly({
  transform,
}) {
  return {
    ...transform,
    y: 0,
  }
}
