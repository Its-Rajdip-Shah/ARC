const SHAPES = [
  'shard-a',
  'shard-b',
  'shard-c',
  'shard-d',
  'shard-e',
  'shard-f',
]

function radians(degrees) {
  return (
    degrees *
    Math.PI /
    180
  )
}

function point(
  angle,
  radius,
) {
  const theta =
    radians(angle)

  return {
    x:
      Math.cos(theta) *
      radius,

    y:
      Math.sin(theta) *
      radius,
  }
}

const BLOBS =
  Array.from(
    {
      length: 56,
    },
    (_, index) => {
      /*
       * Deterministic pseudo-random field.
       *
       * Every fragment gets:
       * - a different base radius
       * - a different direction
       * - different angular progress at every control point
       * - different radial excursions
       *
       * This produces a roughly circular energy envelope without sharing one
       * literal orbit.
       */
      const startAngle =
        (
          index * 137 +
          index * index * 11
        ) % 360

      const baseRadius =
        36 +
        (
          (
            index * 7 +
            index * index
          ) % 6
        )

      const direction =
        (
          index % 2 === 0
            ? 1
            : -1
        )

      const angularScale =
        0.72 +
        (
          (
            index * 17
          ) % 37
        ) / 100

      const radialA =
        (
          (
            index * 11
          ) % 7
        ) - 3

      const radialB =
        (
          (
            index * 19
          ) % 9
        ) - 4

      const radialC =
        (
          (
            index * 23
          ) % 7
        ) - 3

      const radialD =
        (
          (
            index * 31
          ) % 9
        ) - 4

      const p0 =
        point(
          startAngle,
          baseRadius,
        )

      const p1 =
        point(
          startAngle +
            direction *
            (
              71 *
              angularScale
            ),
          baseRadius +
            radialA,
        )

      const p2 =
        point(
          startAngle +
            direction *
            (
              158 *
              angularScale
            ) +
            (
              (
                index * 13
              ) % 27
            ) -
            13,
          baseRadius +
            radialB,
        )

      const p3 =
        point(
          startAngle +
            direction *
            (
              236 *
              angularScale
            ) -
            (
              (
                index * 5
              ) % 23
            ) +
            11,
          baseRadius +
            radialC,
        )

      const p4 =
        point(
          startAngle +
            direction *
            (
              309 *
              angularScale
            ) +
            (
              (
                index * 3
              ) % 19
            ) -
            9,
          baseRadius +
            radialD,
        )

      const size =
        1.45 +
        (
          (
            index * 13
          ) % 21
        ) / 10

      const calm =
        6.8 +
        (
          (
            index * 17
          ) % 54
        ) / 10

      const chaos =
        1.35 +
        (
          (
            index * 19
          ) % 20
        ) / 10

      const delay =
        -(
          (
            index * 23
          ) % 47
        ) / 10

      return {
        points: [
          p0,
          p1,
          p2,
          p3,
          p4,
        ],

        size,
        calm,
        chaos,
        delay,

        colour:
          index % 5 === 1 ||
          index % 7 === 3
            ? 'blue'
            : 'accent',

        /*
         * 22 / 56 = 39.3% foreground fragments.
         *
         * Multiplication by 13 permutes 0..55 because 13 and 56
         * are coprime, so the foreground particles are distributed
         * through the whole field rather than clustered by index.
         */
        foreground:
          (
            (
              index * 13
            ) % 56
          ) < 22,

        shape:
          SHAPES[
            index %
            SHAPES.length
          ],

        stretchX:
          0.68 +
          (
            (
              index * 29
            ) % 54
          ) / 100,

        stretchY:
          0.64 +
          (
            (
              index * 31
            ) % 60
          ) / 100,
      }
    },
  )

export default function SchedulerAura({
  state,
}) {
  return (
    <span
      className={
        `scheduler-aura scheduler-aura-${state}`
      }
      aria-hidden="true"
    >
      {BLOBS.map(
        (
          blob,
          index,
        ) => (
          <i
            key={index}
            className={
              'scheduler-aura-blob ' +
              `scheduler-aura-${blob.colour} ` +
              `scheduler-aura-${blob.shape} ` +
              (
                blob.foreground
                  ? 'scheduler-aura-front'
                  : 'scheduler-aura-back'
              )
            }
            style={{
              '--x0':
                `${blob.points[0].x}px`,
              '--y0':
                `${blob.points[0].y}px`,

              '--x1':
                `${blob.points[1].x}px`,
              '--y1':
                `${blob.points[1].y}px`,

              '--x2':
                `${blob.points[2].x}px`,
              '--y2':
                `${blob.points[2].y}px`,

              '--x3':
                `${blob.points[3].x}px`,
              '--y3':
                `${blob.points[3].y}px`,

              '--x4':
                `${blob.points[4].x}px`,
              '--y4':
                `${blob.points[4].y}px`,

              '--s':
                `${blob.size}px`,

              '--calm':
                `${blob.calm}s`,

              '--chaos':
                `${blob.chaos}s`,

              '--delay':
                `${blob.delay}s`,

              '--sx':
                blob.stretchX,

              '--sy':
                blob.stretchY,
            }}
          />
        ),
      )}
    </span>
  )
}
