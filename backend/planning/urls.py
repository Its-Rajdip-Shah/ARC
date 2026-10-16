"""Routes for the planning API, mounted at /api/planning/.

The literal paths come before the router so that /priority/ and /marks/ are
not shadowed by a router-generated detail route.
"""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from planning import views

router = DefaultRouter()
router.register('items', views.PlanningItemViewSet, basename='planning-item')
router.register('tags', views.TagViewSet, basename='tag')
router.register('timezones', views.TimezoneViewSet, basename='timezone')
router.register('assignment-details', views.AssignmentDetailViewSet, basename='assignment-detail')

urlpatterns = [
    path('priority/', views.PriorityView.as_view(), name='priority'),
    path('priority/reorder/', views.PriorityReorderView.as_view(), name='priority-reorder'),
    path('focus/', views.FocusView.as_view(), name='focus'),
    path('focus/current/', views.FocusCurrentView.as_view(), name='focus-current'),
    path('focus/anchor/', views.FocusAnchorView.as_view(), name='focus-anchor'),
    path('focus/anchor/batch/', views.FocusAnchorBatchView.as_view(), name='focus-anchor-batch'),
    path('focus/do-today/', views.FocusDoTodayView.as_view(), name='focus-do-today'),
    path('focus/automatic/', views.FocusAutomaticView.as_view(), name='focus-automatic'),
    path('focus/reprioritise/', views.FocusReprioritiseView.as_view(), name='focus-reprioritise'),
    path('study-plans/', views.StudyPlanView.as_view(), name='study-plans'),
    path('scheduler/settings/', views.SchedulerSettingsView.as_view(), name='scheduler-settings',),
    path('timeline/navigation/', views.TimelineNavigationView.as_view(), name='timeline-navigation',),
    path('timeline/anchor/', views.ScheduleAnchorView.as_view(), name='schedule-anchor'),
    path('timeline/reschedule/', views.ScheduleRescheduleView.as_view(), name='schedule-reschedule'),
    path('timeline/move/', views.ScheduleMoveView.as_view(), name='schedule-move'),
    path('timeline/replace/', views.ScheduleReplaceView.as_view(), name='schedule-replace'),
    path('timeline/overload/', views.ScheduleOverloadView.as_view(), name='schedule-overload'),
    path('timeline/', views.TimelineView.as_view(), name='timeline'),
    path('overdue/', views.OverdueView.as_view(), name='overdue'),
    path('marks/', views.MarksView.as_view(), name='marks'),
    path('marks/reorder/', views.MarksReorderView.as_view(), name='marks-reorder'),
    path('marks/weight/', views.MarksWeightUpdateView.as_view(), name='marks-weight-update',),
    path('marks/simulate/', views.MarksSimulationView.as_view(), name='marks-simulate'),
    path('', include(router.urls)),
]
