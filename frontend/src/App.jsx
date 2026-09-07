import { useEffect, useState } from 'react'

export default function App() {
  const [message, setMessage] = useState('Connecting to backend...')

  useEffect(() => {
    fetch('http://127.0.0.1:8000/api/health/')
      .then(res => res.json())
      .then(data => setMessage(data.message))
      .catch(err => setMessage('Backend connection failed'))
  }, [])

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 text-white p-4">
      <h1 className="text-3xl font-bold mb-4">ARC Goals Tracker Skeleton</h1>
      <div className="p-4 bg-slate-800 rounded-lg border border-slate-700 shadow-md">
        <p className="text-emerald-400 font-mono">{message}</p>
      </div>
    </div>
  )
}