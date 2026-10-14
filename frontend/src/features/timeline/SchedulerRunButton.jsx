import {
  useState,
} from 'react'

import {
  useIsMutating,
} from '@tanstack/react-query'

import {
  RefreshCw,
} from 'lucide-react'

import lockInIcon from '../../assets/icons/locked-in_monk-mode/locked-in-hands-down-Dark.png'
import monkIcon from '../../assets/icons/locked-in_monk-mode/monk-mode-hands-down-dark.png'
import activeIcon from '../../assets/icons/locked-in_monk-mode/locked-in-hands-up-dark.png'

import SchedulerAura from './SchedulerAura'
import './SchedulerAura.css'
import useHoverIntent from './useHoverIntent'

export default function SchedulerRunButton({
  runtime,
  actions,
}) {
  const [
    hovered,
    setHovered,
  ] = useState(false)

  const [focused, setFocused] = useState(false)

  const hover =
    useHoverIntent({
      delay: 145,

      onEnter:
        () =>
          setHovered(true),

      onLeave:
        () =>
          setHovered(false),
    })

  const schedulerSettingsBusy =
    useIsMutating({
      mutationKey: [
        'planning',
        'scheduler-settings',
        'update',
      ],
    }) > 0

  const schedulerBusy =
    schedulerSettingsBusy ||
    (
      actions.schedulerBusy ??
      actions.busy ??
      false
    )

  const flavour =
    runtime?.flavour ??
    null

  const configured =
    runtime?.configured ===
    true

  const auraState =
    schedulerBusy
      ? 'scheduling'
      : (hovered || focused)
        ? 'hover'
        : 'idle'

  const activePose =
    auraState !==
    'idle'

  const icon =
    activePose
      ? activeIcon
      : flavour ===
          'lock-in'
        ? lockInIcon
        : flavour ===
            'monk'
          ? monkIcon
          : null

  return (
    <button
      type="button"
      className={
        `timeline-scheduler-run timeline-scheduler-${auraState}`
      }
      aria-label={
        configured
          ? (
              'Reschedule Timeline using ' +
              (
                flavour ===
                'lock-in'
                  ? 'Lock-in'
                  : 'Monk'
              )
            )
          : 'Reschedule Timeline'
      }
      title={
        configured
          ? (
              'Reschedule · ' +
              (
                flavour ===
                'lock-in'
                  ? 'Lock-in'
                  : 'Monk'
              )
            )
          : 'Reschedule'
      }
      aria-busy={schedulerBusy}
      disabled={
        schedulerBusy
      }
      onMouseEnter={() =>
        hover.enter()
      }
      onMouseLeave={() =>
        hover.leave()
      }
      onFocus={() =>
        setFocused(true)
      }
      onBlur={() =>
        setFocused(false)
      }
      onClick={() =>
        actions
          .run(
            'reschedule',
          )
          .catch(
            () => {},
          )
      }
    >
      <span className="scheduler-visual" aria-hidden="true">
        <SchedulerAura
          state={
            auraState
          }
        />

        <span className="timeline-scheduler-art">
          {
            configured &&
            icon
              ? (
                  <img
                    src={icon}
                    alt=""
                  />
                )
              : (
                  <RefreshCw
                    size={36}
                  />
                )
          }
        </span>
      </span>
    </button>
  )
}
