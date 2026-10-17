import {
  defineConfig,
} from 'vitest/config'

import react from '@vitejs/plugin-react'


export default defineConfig({
  plugins: [
    react(),
  ],

  test: {
    environment:
      'jsdom',

    globals:
      true,

    clearMocks:
      true,

    include: [
      'src/features/timeline/SchedulerMonk.test.jsx',
      'src/features/planner/PriorityNavigation.test.jsx',
      'src/features/planner/residualEstimatePrompt.test.js',
      'src/features/timeline/TimelineWorkflows.test.jsx',
      'src/features/planner/components/CreatePlanningItemPanel.test.jsx',
      'src/features/planner/components/PlannerSidebar.test.jsx',
      'src/features/planner/PlannerPage.overdueNavigation.test.jsx',
      'src/features/planner/components/PlannerTree.test.jsx',
      'src/hooks/usePriorityOrder.test.jsx',
      'src/hooks/useFocus.test.js',
      'src/components/SessionHydrator.test.jsx',
      'src/components/ArcDateCalendar.test.jsx',
      'src/pages/student/SettingsPage.timezone.test.jsx',
      'src/lib/calendarDates.test.js',
      'src/features/focus/FocusQueueManager.dnd.test.jsx',
      'src/features/focus/FocusQueueManager.race.test.jsx',
      'src/lib/plainText.test.js',
      'src/lib/subjectLabel.test.js',
    ],

    exclude: [
      'src/**/*.node.test.{js,jsx}',
      'e2e/**',
      'node_modules/**',
    ],
  },
})
