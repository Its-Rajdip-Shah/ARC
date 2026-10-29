import {
  defineConfig,
} from 'vitest/config'

import react from '@vitejs/plugin-react'


export default defineConfig({
  // Keep Vitest's transform/dependency cache separate from dev/build Vite
  // and the embedded Vite servers used by node:test files.  Those runners
  // may start concurrently in CI and Vite's cache rename is not shared-safe.
  cacheDir: 'node_modules/.vite-unit',

  plugins: [
    react(),
  ],

  test: {
    // Serial execution avoids resource-contention timeouts in the
    // integration-heavy UI tests while preserving per-file isolation.
    maxWorkers: 1,

    environment:
      'jsdom',

    globals:
      true,

    clearMocks:
      true,

    include: [
      'src/features/timeline/SchedulerMonk.test.jsx',
      'src/features/timeline/timelineOverdue.test.js',
      'src/features/planner/PriorityNavigation.test.jsx',
      'src/features/planner/residualEstimatePrompt.test.js',
      'src/features/timeline/TimelineWorkflows.test.jsx',
      'src/features/planner/components/CreatePlanningItemPanel.test.jsx',
      'src/features/planner/components/DependencyDialog.test.jsx',
      'src/features/planner/components/DependencyGraphModal.test.jsx',
      'src/features/planner/components/PlannerSidebar.test.jsx',
      'src/features/planner/components/PriorityNumber.test.jsx',
      'src/features/marks/MarksPage.test.jsx',
      'src/lib/durationLabel.test.js',
      'src/features/planner/PlannerPage.overdueNavigation.test.jsx',
      'src/features/planner/components/PlannerTree.test.jsx',
      'src/hooks/usePriorityOrder.test.jsx',
      'src/hooks/useFocus.test.js',
      'src/components/SessionHydrator.test.jsx',
      'src/components/RouteGuards.test.jsx',
      'src/components/ArcDateCalendar.test.jsx',
      'src/components/ArcDateField.test.jsx',
      'src/pages/student/SettingsPage.timezone.test.jsx',
      'src/lib/calendarDates.test.js',
      'src/features/focus/FocusTaskRow.test.jsx',
      'src/features/focus/FocusQueueManager.dnd.test.jsx',
      'src/features/focus/FocusQueueManager.race.test.jsx',
      'src/lib/plainText.test.js',
      'src/lib/errors.test.js',
      'src/pages/student/FaqPage.test.jsx',
      'src/pages/student/StudentAuthForms.test.jsx',
      'src/pages/student/ForgotPasswordPage.test.jsx',
      'src/pages/NotFoundPage.test.jsx',
      'src/pages/admin/AdminDashboardPage.test.jsx',
      'src/components/PasswordChangeForm.test.jsx',
      'src/pages/ConnectionStatus.test.jsx',
      'src/lib/subjectLabel.test.js',
      'src/components/student/NavigationDrawer.test.jsx',
      'src/components/student/MarksPanel.test.jsx',
      'src/components/student/StudentDialog.test.jsx',
    ],

    exclude: [
      'src/**/*.node.test.{js,jsx}',
      'e2e/**',
      'node_modules/**',
    ],
  },
})
