import { memo, useEffect, useRef } from 'react'
import { AURA_PARTICLES, particlePosition } from './schedulerAuraMotion'

const COLOURS = ['cyan', 'periwinkle', 'electric', 'ice']

function SchedulerAura({ state = 'idle' }) {
  const container = useRef(null)
  const positions = useRef(AURA_PARTICLES.map((particle) => particlePosition(particle, 'idle', 0)))

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    const nodes = container.current.children
    let frame
    let start
    let previous
    let settling = 0

    function paint(index, position) {
      nodes[index].style.transform = `translate(${position.x}px, ${position.y}px)`
    }

    function tick(now) {
      start ??= now
      const delta = Math.min((now - (previous ?? now)) / 1000, 0.05)
      previous = now
      const blend = 1 - Math.exp(-delta / 0.16)
      AURA_PARTICLES.forEach((particle, index) => {
        const target = particlePosition(particle, state, (now - start) / 1000)
        const current = positions.current[index]
        current.x += (target.x - current.x) * blend
        current.y += (target.y - current.y) * blend
        paint(index, current)
      })
      settling += delta
      // Idle settles once, then consumes no animation frames.
      if (state !== 'idle' || settling < 1.6) frame = requestAnimationFrame(tick)
    }

    function restart() {
      cancelAnimationFrame(frame)
      start = previous = undefined
      settling = 0
      if (media?.matches) {
        AURA_PARTICLES.forEach((particle, index) => {
          positions.current[index] = particlePosition(particle, 'idle', 0)
          paint(index, positions.current[index])
        })
      } else {
        frame = requestAnimationFrame(tick)
      }
    }
    restart()
    media?.addEventListener?.('change', restart)
    return () => {
      cancelAnimationFrame(frame)
      media?.removeEventListener?.('change', restart)
    }
  }, [state])

  return (
    <span ref={container} className={`scheduler-aura scheduler-aura-${state}`} aria-hidden="true">
      {AURA_PARTICLES.map((particle, index) => {
        const initial = particlePosition(particle, 'idle', 0)
        return <i key={index}
          className={`scheduler-aura-blob scheduler-aura-${COLOURS[index % COLOURS.length]} scheduler-aura-shard-${index % 6} ${particle.foreground ? 'scheduler-aura-front' : 'scheduler-aura-back'}`}
          style={{ '--s': `${particle.size}px`, transform: `translate(${initial.x}px, ${initial.y}px)` }} />
      })}
    </span>
  )
}

export default memo(SchedulerAura)
