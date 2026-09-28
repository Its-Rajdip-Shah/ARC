export default function DurationGlyph({
  level = 0,
  labelled = false,
}) {
  const safeLevel = Math.max(
    0,
    Math.min(
      6,
      Number(level) || 0,
    ),
  )

  return (
    <span
      className="timeline-duration-glyph"
      aria-hidden={labelled ? undefined : true}
      aria-label={
        labelled
          ? `Duration level ${safeLevel} of 6`
          : undefined
      }
    >
      {Array.from(
        { length: 6 },
        (_, index) => (
          <i
            key={index}
            className={
              index < safeLevel
                ? 'active'
                : ''
            }
          />
        ),
      )}
    </span>
  )
}
