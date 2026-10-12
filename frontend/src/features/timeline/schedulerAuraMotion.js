const TAU = Math.PI * 2

export const AURA_PARTICLES = Array.from({ length: 56 }, (_, index) => ({
  angle: ((index * 137 + index * index * 11) % 360) * Math.PI / 180,
  radius: 36 + index % 6,
  excursion: 24 + index % 6,
  phase: ((index * 23) % 56) / 56 * TAU,
  period: 3.6 + (index % 11) * 0.23,
  idlePeriod: 5 + (index % 17) * 0.25,
  idleRadialDrift: 3 + (index % 9) * 0.25,
  idleAngularDrift: (4 + (index % 7) * 0.5) * Math.PI / 180,
  direction: index % 2 ? -1 : 1,
  speed: 0.8 + (index % 9) * 0.055,
  size: 1.6 + (index % 7) * 0.3,
  foreground: (index * 13) % 56 < 22,
}))

// Integral of a bounded speed ramp: 0.35 -> 2.1 radians/sec.
// This is elapsed animation time, unrelated to scheduler completion.
export function orbitalTravel(seconds) {
  return 2.1 * seconds - 1.75 * 2 * (1 - Math.exp(-seconds / 2))
}

export function particlePosition(particle, state, seconds) {
  let angle = particle.angle
  let radius = particle.radius
  if (state === 'idle') {
    const phase = seconds * TAU / particle.idlePeriod + particle.phase
    radius += particle.idleRadialDrift * Math.sin(phase)
    angle += particle.idleAngularDrift * Math.sin(phase + Math.PI / 2)
  } else if (state === 'hover') {
    radius += particle.excursion * (1 - Math.cos(seconds * TAU / particle.period + particle.phase)) / 2
  } else if (state === 'scheduling') {
    angle += particle.direction * particle.speed * orbitalTravel(seconds)
    radius += 7 * Math.sin(seconds * 1.4 + particle.phase)
  }
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius }
}
