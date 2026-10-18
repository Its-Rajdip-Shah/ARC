import { useState } from 'react'
import { Link } from 'react-router-dom'
import PasswordChangeForm from '../../components/PasswordChangeForm'
import { useAdminStats, useAdminUsers, useApprovePasswordReset, usePasswordResets } from '../../hooks/useAdmin'
import { errorMessage, formatInstant } from '../../lib/errors'

function StatCard({ label, value, hint, tone = 'default' }) {
  const valueClass =
    tone === 'alert' ? 'text-amber-300' : tone === 'danger' ? 'text-rose-300' : 'text-emerald-400'
  return (
    <article className="rounded-lg border border-slate-700 bg-slate-800 p-4 shadow-md">
      <p className="text-xs tracking-wide text-slate-500 uppercase">{label}</p>
      <p className={`mt-2 font-mono text-3xl font-semibold ${valueClass}`}>{value ?? '—'}</p>
      {hint && <p className="mt-2 text-xs text-slate-500">{hint}</p>}
    </article>
  )
}

export default function AdminDashboardPage() {
  const stats = useAdminStats()
  const users = useAdminUsers({ page_size: 200 })
  const resets = usePasswordResets()
  const approveReset = useApprovePasswordReset()
  const [resetError, setResetError] = useState(null)

  const data = stats.data
  const accounts = users.data?.results || []
  const resetRows = resets.data || []

  async function approve(row) {
    setResetError(null)
    try {
      await approveReset.mutateAsync(row.id)
    } catch (error) {
      setResetError(errorMessage(error, 'Could not approve that reset.'))
    }
  }
  const locked = accounts.filter((row) => row.is_locked)
  const missingMfa = accounts.filter((row) => !row.mfa_enabled && !row.is_admin)

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold">Overview</h1>
        <p className="mt-1 text-sm text-slate-400">
          Counts and access state only. Planner titles, marks and Canvas tokens
          are not shown here.
        </p>
      </header>

      {stats.isError && (
        <p className="rounded-lg border border-rose-900 bg-rose-950/40 px-4 py-3 text-sm text-rose-300">
          Could not load platform health.
        </p>
      )}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="People"
          value={data?.users?.total}
          hint={`${data?.users?.active_last_7_days ?? '—'} signed in this week`}
        />
        <StatCard
          label="Locked accounts"
          value={data?.users?.locked}
          hint="Suspended until an operator restores access"
          tone={data?.users?.locked ? 'danger' : 'default'}
        />
        <StatCard
          label="Overdue work"
          value={data?.planning_items?.overdue}
          hint="Incomplete items past a real due date"
          tone={data?.planning_items?.overdue ? 'alert' : 'default'}
        />
        <StatCard
          label="Failed Canvas syncs"
          value={data?.canvas?.syncs_failed}
          hint={`${data?.canvas?.connections ?? 0} connected accounts`}
          tone={data?.canvas?.syncs_failed ? 'alert' : 'default'}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <article className="rounded-lg border border-slate-700 bg-slate-800 p-4">
          <h2 className="text-sm font-semibold text-slate-200">Account mix</h2>
          <dl className="mt-3 space-y-2 font-mono text-sm">
            <div className="flex justify-between text-slate-400">
              <dt>Staff</dt>
              <dd className="text-slate-100">{data?.users?.admins ?? '—'}</dd>
            </div>
            <div className="flex justify-between text-slate-400">
              <dt>MFA enrolled</dt>
              <dd className="text-slate-100">{data?.users?.mfa_enrolled ?? '—'}</dd>
            </div>
            <div className="flex justify-between text-slate-400">
              <dt>Last Canvas success</dt>
              <dd className="text-slate-100">
                {formatInstant(data?.canvas?.last_successful_sync)}
              </dd>
            </div>
          </dl>
        </article>
        <article className="rounded-lg border border-slate-700 bg-slate-800 p-4">
          <h2 className="text-sm font-semibold text-slate-200">Planning load</h2>
          <dl className="mt-3 space-y-2 font-mono text-sm">
            <div className="flex justify-between text-slate-400">
              <dt>Items</dt>
              <dd className="text-slate-100">{data?.planning_items?.total ?? '—'}</dd>
            </div>
            <div className="flex justify-between text-slate-400">
              <dt>Completed</dt>
              <dd className="text-slate-100">{data?.planning_items?.completed ?? '—'}</dd>
            </div>
            <div className="flex justify-between text-slate-400">
              <dt>No deadline</dt>
              <dd className="text-slate-100">{data?.planning_items?.without_deadline ?? '—'}</dd>
            </div>
          </dl>
        </article>
        <article className="rounded-lg border border-slate-700 bg-slate-800 p-4">
          <h2 className="text-sm font-semibold text-slate-200">Needs attention</h2>
          <p className="mt-1 text-xs text-slate-500">
            Flagged for operators: locked people, missing MFA, and sync failures.
            Not a queue of student work.
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            <li className="flex justify-between text-slate-400">
              <span>Locked now</span>
              <span className="font-mono text-rose-300">{locked.length}</span>
            </li>
            <li className="flex justify-between text-slate-400">
              <span>Students without MFA</span>
              <span className="font-mono text-amber-300">{missingMfa.length}</span>
            </li>
            <li className="flex justify-between text-slate-400">
              <span>Failed syncs</span>
              <span className="font-mono text-amber-300">
                {data?.canvas?.syncs_failed ?? '—'}
              </span>
            </li>
          </ul>
          <Link
            to="/admin/users"
            className="mt-4 inline-block text-sm text-emerald-400 hover:text-emerald-300"
          >
            Review accounts →
          </Link>
        </article>
      </section>

      <section className="rounded-lg border border-slate-700 bg-slate-800 p-4">
        <h2 className="text-sm font-semibold text-slate-200">Password resets</h2>
        <p className="mt-1 text-xs text-slate-500">
          Every staff Overview page shows this queue. Approve a request only when that person has asked you. You do not choose or see the new password.
        </p>
        {resets.isError && (
          <p role="alert" className="mt-3 text-sm text-rose-300">Could not load reset requests.</p>
        )}
        {resetError && (
          <p role="alert" className="mt-3 text-sm text-rose-300">{resetError}</p>
        )}
        {resetRows.length === 0 && !resets.isError && (
          <p className="mt-3 text-sm text-slate-400">No open reset requests.</p>
        )}
        {resetRows.length > 0 && (
          <ul className="mt-3 divide-y divide-slate-700">
            {resetRows.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
                <span>
                  <span className="font-mono text-slate-200">{row.email}</span>
                  <span className="mt-1 block text-xs text-slate-500">{formatInstant(row.created_at)}</span>
                </span>
                {row.status === 'approved' ? (
                  <span className="text-xs tracking-wide text-amber-300 uppercase">Waiting for the student</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => approve(row)}
                    disabled={approveReset.isPending}
                    className="rounded-md bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-slate-950 disabled:opacity-60"
                  >
                    Approve
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-slate-700 bg-slate-800 p-4">
        <h2 className="text-sm font-semibold text-slate-200">Your password</h2>
        <p className="mt-1 mb-3 text-xs text-slate-500">
          Change the password for the staff account you are signed in with.
        </p>
        <PasswordChangeForm variant="staff" />
      </section>

      {locked.length > 0 && (
        <section className="rounded-lg border border-slate-700 bg-slate-800 p-4">
          <h2 className="text-sm font-semibold text-slate-200">Currently locked</h2>
          <ul className="mt-3 divide-y divide-slate-700">
            {locked.map((row) => (
              <li key={row.id} className="flex items-center justify-between py-2 text-sm">
                <span className="font-mono text-slate-200">{row.email}</span>
                <span className="text-xs tracking-wide text-rose-300 uppercase">Locked</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
