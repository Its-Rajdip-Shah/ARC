import ArcDateField from '../../components/ArcDateField'
import {
  useState,
} from 'react'

import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import {
  Plus,
  Trash2,
  X,
} from 'lucide-react'

import {
  createTimezone,
  deleteTimezone,
  listTimezones,
  updateTimezone,
} from '../../api/planning'

function ZoneRow({
  zone,
  onChanged,
}) {
  const [
    title,
    setTitle,
  ] = useState(
    zone.title,
  )

  const [
    startDate,
    setStartDate,
  ] = useState(
    zone.start_date,
  )

  const [
    endDate,
    setEndDate,
  ] = useState(
    zone.end_date,
  )

  const invalidRange = Boolean(startDate && endDate && endDate < startDate)

  const save =
    useMutation({
      mutationFn: () =>
        updateTimezone(
          zone.id,
          {
            title:
              title.trim(),

            start_date:
              startDate,

            end_date:
              endDate,
          },
        ),

      onSuccess:
        onChanged,
    })

  const remove =
    useMutation({
      mutationFn: () =>
        deleteTimezone(
          zone.id,
        ),

      onSuccess:
        onChanged,
    })

  return (
    <div className="timezone-row">
      <input
        value={title}
        onChange={(event) =>
          setTitle(
            event.target.value,
          )
        }
        aria-label="Timezone title"
      />

      <ArcDateField monthFormat="short" cardMode
        type="date"
        value={startDate}
        onChange={(event) =>
          setStartDate(
            event.target.value,
          )
        }
        aria-label={
          `Start ${zone.title}`
        }
      />

      <ArcDateField monthFormat="short" cardMode
        type="date"
        value={endDate}
        onChange={(event) =>
          setEndDate(
            event.target.value,
          )
        }
        aria-label={
          `End ${zone.title}`
        }
      />

      <button
        type="button"
        disabled={
          save.isPending ||
          !title.trim() ||
          !startDate ||
          !endDate ||
          invalidRange
        }
        onClick={() =>
          save.mutate()
        }
      >
        Save
      </button>

      <button
        type="button"
        className="timezone-delete"
        aria-label={
          `Delete ${zone.title}`
        }
        disabled={
          remove.isPending
        }
        onClick={() =>
          remove.mutate()
        }
      >
        <Trash2 size={15} />
      </button>

      {invalidRange && (
        <p role="alert">End date cannot be earlier than start date.</p>
      )}
      {save.isError && (
        <p role="alert">Could not save timezone. Please try again.</p>
      )}
      {remove.isError && (
        <p role="alert">Could not delete timezone. Please try again.</p>
      )}
    </div>
  )
}

export default function TimezonePanel({
  onClose,
}) {
  const client =
    useQueryClient()

  const query =
    useQuery({
      queryKey: [
        'planning',
        'timezones',
      ],

      queryFn:
        listTimezones,
    })

  const [
    draft,
    setDraft,
  ] = useState({
    title: '',
    start_date: '',
    end_date: '',
  })

  async function refresh() {
    await Promise.all([
      client.invalidateQueries({
        queryKey: [
          'planning',
          'timezones',
        ],
      }),

      client.invalidateQueries({
        queryKey: [
          'planning',
          'timeline',
        ],
      }),
    ])
  }

  const create =
    useMutation({
      mutationFn: () =>
        createTimezone(
          draft,
        ),

      onSuccess:
        async () => {
          setDraft({
            title: '',
            start_date: '',
            end_date: '',
          })

          await refresh()
        },
    })

  const invalidDraftRange = Boolean(
    draft.start_date &&
    draft.end_date &&
    draft.end_date < draft.start_date
  )

  const zones =
    Array.isArray(
      query.data,
    )
      ? query.data
      : (
          query.data
            ?.results ??
          []
        )

  return (
    <section
      className="timezone-panel"
      aria-label="Timezone management"
    >
      <div className="timezone-panel-heading">
        <div>
          <strong>
            Timezones
          </strong>

          <p>
            Edit semester, week, break, and other context ranges.
          </p>
        </div>

        <button
          type="button"
          aria-label="Close timezone management"
          onClick={
            onClose
          }
        >
          <X size={17} />
        </button>
      </div>

      {query.isPending ? (
        <p role="status">
          Loading timezones…
        </p>
      ) : query.isError ? (
        <p className="timeline-error">
          Timezones could not load.
        </p>
      ) : (
        <div className="timezone-list">
          {zones.map(
            (zone) => (
              <ZoneRow
                key={zone.id}
                zone={zone}
                onChanged={
                  refresh
                }
              />
            ),
          )}
        </div>
      )}

      <div className="timezone-row timezone-new">
        <input
          placeholder="New timezone"
          value={
            draft.title
          }
          onChange={(event) =>
            setDraft(
              (value) => ({
                ...value,

                title:
                  event.target
                    .value,
              }),
            )
          }
        />

        <ArcDateField monthFormat="short" cardMode
          type="date"
          value={
            draft.start_date
          }
          onChange={(event) =>
            setDraft(
              (value) => ({
                ...value,

                start_date:
                  event.target
                    .value,
              }),
            )
          }
        />

        <ArcDateField monthFormat="short" cardMode
          type="date"
          value={
            draft.end_date
          }
          onChange={(event) =>
            setDraft(
              (value) => ({
                ...value,

                end_date:
                  event.target
                    .value,
              }),
            )
          }
        />

        <button
          type="button"
          disabled={
            create.isPending ||
            !draft.title.trim() ||
            !draft.start_date ||
            !draft.end_date ||
            invalidDraftRange
          }
          onClick={() =>
            create.mutate()
          }
        >
          <Plus size={14} />
          Add
        </button>
      </div>

      {invalidDraftRange && (
        <p role="alert">End date cannot be earlier than start date.</p>
      )}
      {create.isError && (
        <p role="alert">Could not create timezone. Please try again.</p>
      )}
    </section>
  )
}
