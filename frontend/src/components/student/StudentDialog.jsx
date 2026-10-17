import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

/** Shared, accessible dialog for the student-level Account/Settings/Marks/Sync views. */
export default function StudentDialog({ title, onClose, children }) {
  const dialogRef = useRef(null)
  const closeRef = useRef(null)

  useEffect(() => {
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab') return

      // Keep keyboard focus in the dialog rather than in the obscured page.
      const focusable = Array.from(dialogRef.current?.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? []).filter((node) => node.getClientRects().length > 0)
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-6">
      <button
        type="button"
        aria-label={`Close ${title}`}
        className="absolute inset-0 bg-black/70"
        onClick={onClose}
      />
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="student-dialog-title"
        className="relative max-h-[min(90vh,900px)] w-full max-w-3xl overflow-y-auto rounded-[16px] border border-[#4a496b] bg-arc-bg p-5 text-arc-text shadow-2xl sm:p-7"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 id="student-dialog-title" className="font-display text-3xl">{title}</h2>
          <button
            ref={closeRef}
            type="button"
            aria-label={`Close ${title}`}
            onClick={onClose}
            className="rounded-lg p-2 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-arc-blue-light"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </section>
    </div>
  )
}
