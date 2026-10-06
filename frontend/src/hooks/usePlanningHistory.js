import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import {
  getHistoryStatus,
  redoPlanningAction,
  undoPlanningAction,
} from '../api/planning'

const historyKey = [
  'planning',
  'history',
]

async function invalidatePlanning(
  queryClient,
) {
  await queryClient.invalidateQueries({
    queryKey: [
      'planning',
    ],
  })
}

export default function usePlanningHistory() {
  const queryClient =
    useQueryClient()

  const history =
    useQuery({
      queryKey:
        historyKey,
      queryFn:
        getHistoryStatus,
      staleTime:
        Infinity,
    })

  function handleSuccess(result) {
    queryClient.setQueryData(
      historyKey,
      {
        can_undo:
          result.can_undo,
        can_redo:
          result.can_redo,
      },
    )

    if (result.changed) {
      return invalidatePlanning(
        queryClient,
      )
    }

    return undefined
  }

  const undo =
    useMutation({
      mutationFn:
        undoPlanningAction,
      onSuccess:
        handleSuccess,
    })

  const redo =
    useMutation({
      mutationFn:
        redoPlanningAction,
      onSuccess:
        handleSuccess,
    })

  const busy =
    undo.isPending
    || redo.isPending

  return {
    canUndo:
      Boolean(
        history.data
          ?.can_undo,
      )
      && !busy,

    canRedo:
      Boolean(
        history.data
          ?.can_redo,
      )
      && !busy,

    busy,

    undo() {
      if (!busy) {
        undo.mutate()
      }
    },

    redo() {
      if (!busy) {
        redo.mutate()
      }
    },
  }
}
