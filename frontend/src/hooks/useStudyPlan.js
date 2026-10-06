import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getStudyPlan, requestStudyPlan, updateStudyPlan } from '../api/planning'

const STUDY_PLAN_KEY = ['planning', 'study-plan']

export function useStudyPlan() {
  const client = useQueryClient()
  const query = useQuery({
    queryKey: STUDY_PLAN_KEY,
    queryFn: getStudyPlan,
  })

  function remember(data) {
    client.setQueryData(STUDY_PLAN_KEY, data)
  }

  const generate = useMutation({
    mutationFn: requestStudyPlan,
    onSuccess: remember,
  })

  const save = useMutation({
    mutationFn: updateStudyPlan,
    onSuccess: remember,
  })

  return {
    result: query.data,
    loading: query.isLoading,
    generate,
    save,
  }
}
