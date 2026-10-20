import { ChevronDown } from 'lucide-react'
import { Link } from 'react-router-dom'

import { useAuthStore } from '../../stores/authStore'

const CANVAS_SETTINGS_URL = 'https://canvas.sydney.edu.au/profile/settings'
const linkClass =
  'font-semibold text-arc-accent underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-arc-accent'

const questions = [
  {
    question: 'What is ARC?',
    answer:
      'ARC is your workload planner. Planner holds subjects, tasks, and assignments. Priority sets the order. Timeline schedules the work and keeps Canvas deadlines separate from dates ARC suggests. Focus lists what to work on after Timeline has scheduled it. Marks shows assessment results and leaves unmarked work unmarked.',
  },
  {
    question: 'How do I add work without Canvas?',
    answer:
      'Open Planner and add a subject from the sidebar. You can nest tasks and assignments under it. An empty planner also points you at Canvas settings if you would rather import courses.',
  },
  {
    question: 'What does Sync import?',
    answer:
      'Sync imports the courses you tick, including a course you previously deleted in Planner, plus the assignments Canvas actually returns. Unchecked courses are skipped. ARC does not fill in dates, grades, or names that Canvas left blank.',
  },
  {
    question: 'What happens if I disconnect Canvas?',
    answer:
      'Disconnect removes the saved token. Subjects and assignments already in your planner stay, including tags, marks, and priority choices you added.',
  },
  {
    question: 'Why was my token rejected?',
    answer:
      'Save token stays off until the value is at least 20 characters. After that, ARC asks Canvas to confirm the token. A rejected token is expired, revoked, or copied incompletely. Generate a new one in Canvas and paste the full value.',
  },
  {
    question: 'Can I see my Canvas token again?',
    answer:
      'No. ARC stores the token encrypted and shows only the last four characters. To change it, paste a new token and choose Replace token.',
  },
  {
    question: 'How do I change my password?',
    answer:
      'Open the menu, choose Account, and use the password form. You need your current password. If you cannot sign in, use Forgot your password on the sign-in page. An administrator approves that request before you can choose a new password.',
  },
  {
    question: 'What are Locked-In and Monk?',
    answer:
      'They are the scheduler intensity. Locked-In pushes harder toward deadlines. Monk prefers a calmer day when the deadlines allow it. The Account page and Timeline share this setting, and changing it reschedules your plan.',
  },
  {
    question: 'Who can see my plan?',
    answer:
      'Only you. The staff overview shows counts and whether accounts are locked. It does not show planner titles, marks, or Canvas tokens.',
  },
]

export default function FaqPage() {
  const signedIn = useAuthStore((state) => Boolean(state.accessToken || state.refreshToken))

  return (
    <main className="min-h-screen bg-arc-bg px-6 pb-16 pt-16 text-arc-text">
      <div className="mx-auto max-w-2xl">
        <p className="text-sm">
          <Link to={signedIn ? '/planner' : '/login'} className={linkClass}>
            {signedIn ? 'Back to Planner' : 'Back to sign in'}
          </Link>
        </p>
        <h1 className="mt-6 font-display text-3xl">FAQ</h1>
        <p className="mt-2 text-sm text-arc-text-secondary">
          Short answers for planning in ARC, and the steps to create a Canvas access token and connect it.
        </p>

        <section className="mt-8 space-y-4 rounded-[15px] border border-[#4a496b] bg-arc-panel p-5" aria-labelledby="canvas-token-heading">
          <h2 id="canvas-token-heading" className="text-lg font-semibold">Find your Canvas API token and link it</h2>
          <p className="text-sm text-arc-text-secondary">
            ARC connects to the University of Sydney Canvas site with a personal access token. The token is a password for your Canvas account, so paste it only into ARC.
          </p>

          <h3 className="text-base font-semibold">Create the token in Canvas</h3>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-arc-text-secondary">
            <li>Sign in to Canvas.</li>
            <li>
              Open Account, then Settings. The same page is{' '}
              <a href={CANVAS_SETTINGS_URL} className={linkClass} target="_blank" rel="noreferrer">
                Canvas account settings
              </a>
              .
            </li>
            <li>Under Approved Integrations, choose New Access Token.</li>
            <li>Enter a purpose such as ARC. An expiry date is optional.</li>
            <li>Generate the token and copy it. Canvas shows the full token only once.</li>
            <li>If New Access Token is missing, the university has not enabled personal tokens, and ARC cannot connect.</li>
          </ol>

          <h3 className="text-base font-semibold">Link the token in ARC</h3>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-arc-text-secondary">
            <li>Sign in to ARC.</li>
            <li>
              Open the menu and choose Canvas settings, or go straight to{' '}
              <Link to="/settings?tab=integration" className={linkClass}>
                Canvas settings in ARC
              </Link>
              .
            </li>
            <li>Paste the token into API token. Save token stays off until it is at least 20 characters.</li>
            <li>Choose Save token. ARC checks it with Canvas, then stores it encrypted and shows only the last four characters.</li>
            <li>Tick the courses to import, choose Save selection, then Sync.</li>
            <li>To replace a token, paste the new one and choose Replace token. Test checks a token that is already saved.</li>
          </ol>
        </section>

        <section className="mt-8" aria-labelledby="faq-questions-heading">
          <h2 id="faq-questions-heading" className="text-lg font-semibold">Common questions</h2>
          <div className="mt-4 space-y-3">
            {questions.map((item) => (
              <details key={item.question} className="group rounded-[15px] border border-[#4a496b] bg-arc-panel px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center gap-3 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-arc-accent [&::-webkit-details-marker]:hidden">
                  <span className="flex-1">{item.question}</span>
                  <ChevronDown aria-hidden="true" size={18} className="shrink-0 text-arc-text-muted transition-transform group-open:rotate-180" />
                </summary>
                <p className="mt-3 text-sm text-arc-text-secondary">{item.answer}</p>
              </details>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}
