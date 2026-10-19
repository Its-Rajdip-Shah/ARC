import { Link, Navigate } from 'react-router-dom'
import {
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  GraduationCap,
  Layers3,
  ListChecks,
  Sparkles,
  Target,
} from 'lucide-react'

import arcLogo from '../assets/brand/arc-logo.svg'
import { useAuthStore } from '../stores/authStore'
import './LandingPage.css'

const previewTasks = [
  { label: 'Review lecture notes', course: 'INFO3616', time: 'Today', completed: true },
  { label: 'Finish assignment testing', course: 'ELEC3609', time: 'Tomorrow', completed: false },
  { label: 'Prepare project presentation', course: 'SOFT3888', time: 'Fri', completed: false },
]

const features = [
  {
    icon: Layers3,
    title: 'Everything in one place',
    description: 'Keep subjects, assignments and smaller tasks organised together. Bring in course work from Canvas when you choose.',
  },
  {
    icon: Target,
    title: 'Know what matters next',
    description: 'Arrange your priorities and focus on the work that needs your attention now.',
  },
  {
    icon: CalendarDays,
    title: 'Make time for the work',
    description: 'See upcoming deadlines on your timeline and build a more realistic study plan.',
  },
]

function ProductPreview() {
  return (
    <div className="arc-landing-preview" aria-label="Illustration of the ARC planner interface">
      <div className="arc-landing-preview-top">
        <div className="arc-landing-preview-brand">
          <span className="arc-landing-preview-mark" aria-hidden="true"><GraduationCap size={18} /></span>
          <span>My workspace</span>
        </div>
        <span className="arc-landing-preview-dots" aria-hidden="true"><i /><i /><i /></span>
      </div>
      <div className="arc-landing-preview-body">
        <aside className="arc-landing-preview-sidebar" aria-hidden="true">
          <span className="arc-landing-preview-sidebar-heading">VIEWS</span>
          <span className="arc-landing-preview-sidebar-link active"><ListChecks size={15} /> Planner</span>
          <span className="arc-landing-preview-sidebar-link"><Target size={15} /> Priority</span>
          <span className="arc-landing-preview-sidebar-link"><CalendarDays size={15} /> Timeline</span>
          <span className="arc-landing-preview-sidebar-rule" />
          <span className="arc-landing-preview-sidebar-heading">SUBJECTS</span>
          <span className="arc-landing-preview-subject"><i className="indigo" /> ELEC3609</span>
          <span className="arc-landing-preview-subject"><i className="sage" /> INFO3616</span>
          <span className="arc-landing-preview-subject"><i className="peach" /> SOFT3888</span>
        </aside>
        <div className="arc-landing-preview-content">
          <div className="arc-landing-preview-headline">
            <div>
              <span className="arc-landing-preview-eyebrow">YOUR WORK, ORGANISED</span>
              <h3>This week's plan</h3>
            </div>
            <span className="arc-landing-preview-counter">3 tasks</span>
          </div>
          <div className="arc-landing-preview-progress">
            <span>Making progress</span>
            <strong>1 of 3 done</strong>
            <div className="arc-landing-preview-track"><span /></div>
          </div>
          <div className="arc-landing-preview-list">
            {previewTasks.map((task) => (
              <div className="arc-landing-preview-task" key={task.label}>
                <span className={`arc-landing-preview-check ${task.completed ? 'checked' : ''}`} aria-hidden="true">
                  {task.completed && <Check size={12} strokeWidth={3} />}
                </span>
                <div className="arc-landing-preview-task-copy">
                  <span className={task.completed ? 'done' : ''}>{task.label}</span>
                  <small>{task.course}</small>
                </div>
                <span className="arc-landing-preview-date">{task.time}</span>
              </div>
            ))}
          </div>
          <div className="arc-landing-preview-footer"><Sparkles size={15} /> One small step at a time.</div>
        </div>
      </div>
      <div className="arc-landing-preview-caption">Illustrative ARC workspace preview</div>
    </div>
  )
}

export default function LandingPage() {
  const hasSession = useAuthStore((state) => Boolean(state.accessToken || state.refreshToken))

  // Existing users go straight to their workspace, not to the marketing page.
  if (hasSession) return <Navigate to="/planner" replace />

  return (
    <div className="arc-landing">
      <header className="arc-landing-header">
        <div className="arc-landing-shell arc-landing-header-inner">
          <Link className="arc-landing-logo-link" to="/" aria-label="ARC home">
            <span className="arc-landing-logo-bg"><img src={arcLogo} alt="ARC" /></span>
            <span className="arc-landing-logo-caption">STUDENT PLANNER</span>
          </Link>
          <nav className="arc-landing-nav" aria-label="Main navigation">
            <a href="#features">Features</a>
            <a href="#how-it-works">How it works</a>
          </nav>
          <div className="arc-landing-header-actions">
            <Link className="arc-landing-sign-in" to="/login">Log in</Link>
            <Link className="arc-landing-nav-cta" to="/register">Get started <ArrowRight size={15} /></Link>
          </div>
        </div>
      </header>

      <main>
        <section className="arc-landing-hero arc-landing-shell" aria-labelledby="arc-landing-title">
          <div className="arc-landing-hero-copy">
            <span className="arc-landing-kicker"><span className="arc-landing-kicker-dot" /> MADE FOR STUDENT LIFE</span>
            <h1 id="arc-landing-title">All your deadlines.<br /><span>One clear plan.</span></h1>
            <p>University gets busy. ARC brings your assignments, priorities and study schedule into one calm space — so you can spend less time organising and more time getting things done.</p>
            <div className="arc-landing-hero-actions">
              <Link className="arc-landing-primary" to="/register">Get started for free <ArrowRight size={19} /></Link>
              <Link className="arc-landing-secondary" to="/login">Open ARC <ArrowRight size={17} /></Link>
            </div>
            <div className="arc-landing-hero-footnote"><CheckCircle2 size={17} /> Built for assignments, not extra admin.</div>
          </div>
          <ProductPreview />
        </section>

        <section className="arc-landing-features" id="features" aria-labelledby="arc-landing-features-title">
          <div className="arc-landing-shell">
            <div className="arc-landing-section-heading">
              <span className="arc-landing-section-eyebrow">LESS CHAOS, MORE CLARITY</span>
              <h2 id="arc-landing-features-title">A better way to stay on top of uni.</h2>
              <p>The essentials you need to keep your semester moving.</p>
            </div>
            <div className="arc-landing-feature-grid">
              {features.map(({ icon: Icon, title, description }) => (
                <article className="arc-landing-feature-card" key={title}>
                  <span className="arc-landing-feature-icon"><Icon size={24} strokeWidth={1.8} /></span>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="arc-landing-bottom arc-landing-shell" id="how-it-works" aria-labelledby="arc-landing-bottom-title">
          <div>
            <span className="arc-landing-section-eyebrow"><Clock3 size={14} /> SIMPLE TO GET STARTED</span>
            <h2 id="arc-landing-bottom-title">Your next step starts here.</h2>
            <p>Create an account, add your tasks or connect Canvas, and start planning at your own pace.</p>
          </div>
          <Link className="arc-landing-primary" to="/register">Start planning <ArrowRight size={19} /></Link>
        </section>
      </main>

      <footer className="arc-landing-footer">
        <div className="arc-landing-shell arc-landing-footer-inner">
          <span>ARC <span aria-hidden="true">·</span> Make space for what matters.</span>
          <span>Made with students in mind.</span>
        </div>
      </footer>
    </div>
  )
}
