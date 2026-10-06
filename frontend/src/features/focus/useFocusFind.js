import {
  planningRowId,
  planningSearchText,
} from '../../shared/search/planningSearchText'
import useSearchNavigation from '../../shared/search/useSearchNavigation'

export default function useFocusFind(
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
      focusResult:
        false,
      rowId:
        planningRowId,
      searchableText:
        planningSearchText,
    },
  )
}
