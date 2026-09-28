/*
 * Timeline explicit-decision policy.
 *
 * The frontend NEVER silently repairs canonical planning state.
 *
 * after_deadline
 *   -> user may explicitly move deadline or cancel.
 *
 * before_release
 *   -> user may explicitly move release or cancel.
 *
 * capacity_exceeded
 *   -> user may explicitly allow overload or cancel.
 *
 * blocked_dependency
 *   -> dependency remains hard; acknowledgement only permits storing future
 *      anchor intent. It does NOT override precedence.
 *
 * past_date / not_eligible / duration_required
 *   -> no override exists. Resolve the underlying state first.
 */

export const TIMELINE_CONFLICT_POLICY = {
  after_deadline: {
    title:
      'Anchor is after the deadline',

    detail:
      'ARC will not silently weaken a deadline. ' +
      'You may explicitly move the deadline to the ' +
      'anchor date, or cancel.',

    decision:
      'change_deadline',
  },

  before_release: {
    title:
      'Anchor is before the release date',

    detail:
      'ARC will not silently move a release constraint. ' +
      'You may explicitly move the release date to the ' +
      'anchor date, or cancel.',

    decision:
      'change_release',
  },

  capacity_exceeded: {
    title:
      'This date is overloaded',

    detail:
      'You may explicitly allow overload on this date, ' +
      'or cancel the anchor.',

    decision:
      'allow_overload',
  },

  blocked_dependency: {
    title:
      'This task is dependency-blocked',

    detail:
      'The prerequisite remains hard. The anchor can only ' +
      'be kept as future date intent; it does not override ' +
      'the dependency.',

    decision:
      'acknowledge_dependency_block',
  },

  past_date: {
    title:
      'Past dates cannot be scheduled',

    detail:
      'Choose today or a future date.',
  },

  not_eligible: {
    title:
      'This item cannot own an execution date',

    detail:
      'Resolve its structural or dependency state first.',
  },

  duration_required: {
    title:
      'Estimated duration is required',

    detail:
      'Set an estimated duration before scheduling this task.',
  },
}

export function conflictCopy(code) {
  return (
    TIMELINE_CONFLICT_POLICY[
      code
    ] ?? {
      title:
        code.replaceAll(
          '_',
          ' ',
        ),

      detail:
        'ARC rejected this transition. Cancel and resolve ' +
        'the underlying planning conflict first.',
    }
  )
}
