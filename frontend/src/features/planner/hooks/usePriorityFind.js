import {
  planningRowId,
  planningSearchText,
} from '../../../shared/search/planningSearchText'
import useSearchNavigation from '../../../shared/search/useSearchNavigation'

export default function usePriorityFind(
  rows,
  paths,
  {
    onNavigate,
    includePath = true,
  } = {},
) {
  return useSearchNavigation(
    rows,
    paths,
    {
      onNavigate,
      includePath,
      // Keep typing and Enter navigation in the search field.
      focusResult:
        false,
      rowId:
        planningRowId,
      searchableText:
        planningSearchText,
    },
  )
}
