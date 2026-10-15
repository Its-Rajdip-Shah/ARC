import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-arc-bg px-6 text-arc-text">
      <div className="max-w-md rounded-xl border border-[#4a496b] bg-arc-panel p-8 text-center">
        <h1 className="font-display text-3xl">Page not found</h1>
        <p className="mt-3 text-sm text-arc-text-secondary">This ARC page doesn't exist or the link has changed.</p>
        <Link to="/planner" className="mt-5 inline-block rounded-lg bg-arc-blue px-5 py-2 font-semibold hover:brightness-110">Go to ARC</Link>
      </div>
    </main>
  )
}
