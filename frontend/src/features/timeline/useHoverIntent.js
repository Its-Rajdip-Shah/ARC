import {
  useEffect,
  useRef,
} from 'react'

export default function useHoverIntent({
  delay = 160,
  onEnter,
  onLeave,
}) {
  const timer =
    useRef(null)

  useEffect(
    () => () => {
      if (
        timer.current
      ) {
        clearTimeout(
          timer.current,
        )
      }
    },
    [],
  )

  function clear() {
    if (
      timer.current
    ) {
      clearTimeout(
        timer.current,
      )

      timer.current =
        null
    }
  }

  function enter(value) {
    clear()

    timer.current =
      setTimeout(
        () => {
          timer.current =
            null

          onEnter?.(
            value,
          )
        },
        delay,
      )
  }

  function leave(value) {
    clear()

    onLeave?.(
      value,
    )
  }

  return {
    enter,
    leave,
    cancel:
      clear,
  }
}
