import { useMemo, useState } from 'react'
import { useLockUser, useUnlockUser, useAdminUsers } from '../../hooks/useAdmin'
import { errorMessage, formatInstant } from '../../lib/errors'
import { useAuthStore } from '../../stores/authStore'

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'locked', label: 'Locked' },
  { id: 'staff', label: 'Staff' },
]

export default function AdminUsersPage() {
  const selfId = useAuthStore((state) => state.user?.id)
  const [search, setSearch] = useState('')
  const [submitted, setSubmitted] = useState('')
  const [filter, setFilter] = useState('all')
  const [pendingId, setPendingId] = useState(null)
  const [banner, setBanner] = useState(null)

  const users = useAdminUsers({
    search: submitted || undefined,
    page_size: 200,
  })
  const lockUser = useLockUser()
  const unlockUser = useUnlockUser()

  const rows = useMemo(() => {
    const list = users.data?.results || []
    if (filter === 'locked') return list.filter((row) => row.is_locked)
    if (filter === 'staff') return list.filter((row) => row.is_admin)
    return list
  }, [users.data, filter])

  async function toggleLock(row) {
    setBanner(null)
    setPendingId(row.id)
    try {
      if (row.is_locked) {
        await unlockUser.mutateAsync(row.id)
        setBanner({ tone: 'ok', text: `${row.email} can sign in again.` })
      } else {
        await lockUser.mutateAsync(row.id)
        setBanner({ tone: 'ok', text: `${row.email} is locked. Their next request will fail.` })
      }
    } catch (error) {
      setBanner({ tone: 'error', text: errorMessage(error) })
    } finally {
      setPendingId(null)
    }
  }

  function onSearch(event) {
    event.preventDefault()
    setSubmitted(search.trim())
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Accounts</h1>
        <p className="mt-1 text-sm text-slate-400">
          Search by email and suspend or restore access. You cannot open a
          student&apos;s planner from here, and you cannot lock your own account.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <form onSubmit={onSearch} className="flex min-w-[16rem] flex-1 gap-2">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search email"
            className="w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
          />
          <button
            type="submit"
            className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
          >
            Search
          </button>
        </form>
        <div className="flex gap-1 rounded-md border border-slate-700 p-1">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={`rounded px-3 py-1 text-sm ${
                filter === item.id
                  ? 'bg-slate-700 text-slate-100'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {banner && (
        <p
          className={`rounded-lg border px-4 py-3 text-sm ${
            banner.tone === 'error'
              ? 'border-rose-900 bg-rose-950/40 text-rose-300'
              : 'border-emerald-900 bg-emerald-950/30 text-emerald-300'
          }`}
        >
          {banner.text}
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-700 bg-slate-800 shadow-md">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="border-b border-slate-700 text-xs tracking-wide text-slate-500 uppercase">
            <tr>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Access</th>
              <th className="px-4 py-3 font-medium">MFA</th>
              <th className="px-4 py-3 font-medium">Items</th>
              <th className="px-4 py-3 font-medium">Last sign-in</th>
              <th className="px-4 py-3 font-medium"> </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            {users.isPending && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  Loading accounts…
                </td>
              </tr>
            )}
            {users.isError && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-rose-300">
                  {errorMessage(users.error)}
                </td>
              </tr>
            )}
            {users.isSuccess && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  No accounts match.
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const isSelf = row.id === selfId
              const busy = pendingId === row.id
              return (
                <tr key={row.id} className="text-slate-200">
                  <td className="px-4 py-3 font-mono">{row.email}</td>
                  <td className="px-4 py-3 text-slate-400">
                    {row.is_admin ? 'Staff' : 'Student'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs tracking-wide uppercase ${
                        row.is_locked
                          ? 'bg-rose-950 text-rose-300'
                          : 'bg-emerald-950 text-emerald-300'
                      }`}
                    >
                      {row.is_locked ? 'Locked' : 'Active'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    {row.mfa_enabled ? 'On' : 'Off'}
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-400">
                    {row.planning_item_count}
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    {formatInstant(row.last_login)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      disabled={busy || (isSelf && !row.is_locked)}
                      title={
                        isSelf && !row.is_locked
                          ? 'You cannot lock your own account'
                          : undefined
                      }
                      onClick={() => toggleLock(row)}
                      className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                        row.is_locked
                          ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
                          : 'border border-rose-800 text-rose-300 hover:bg-rose-950'
                      } disabled:cursor-not-allowed disabled:opacity-40`}
                    >
                      {busy ? 'Saving…' : row.is_locked ? 'Restore' : 'Lock'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">
        {users.data?.count ?? 0} accounts · item counts only, never item titles
      </p>
    </div>
  )
}
