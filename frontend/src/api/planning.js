import { apiClient } from '../lib/apiClient'

export function listItems(params) {
  return apiClient.get('planning/items/', { params }).then((res) => res.data)
}

export function getItem(id) {
  return apiClient.get(`planning/items/${id}/`).then((res) => res.data)
}

export function createItem(payload) {
  return apiClient.post('planning/items/', payload).then((res) => res.data)
}

export function updateItem(id, payload) {
  return apiClient.patch(`planning/items/${id}/`, payload).then((res) => res.data)
}

export function listPrerequisites(id) {
  return apiClient.get(`planning/items/${id}/prerequisites/`).then((res) => res.data)
}

export function getDependencyGraph(id) {
  return apiClient.get(`planning/items/${id}/dependency_graph/`).then((res) => res.data)
}

export function addPrerequisite(id, prerequisiteId) {
  return apiClient.post(`planning/items/${id}/prerequisites/`, { prerequisite_id: prerequisiteId }).then((res) => res.data)
}

export function removePrerequisite(id, prerequisiteId) {
  return apiClient.delete(`planning/items/${id}/prerequisites/`, { data: { prerequisite_id: prerequisiteId } }).then((res) => res.data)
}

export function deleteItem(id) {
  return apiClient.delete(`planning/items/${id}/`).then((res) => res.data)
}

export function getPlanningTree() {
  return apiClient.get('planning/items/tree/').then((res) => res.data)
}

export function moveItem(id, payload) {
  return apiClient.post(`planning/items/${id}/move/`, payload).then((res) => res.data)
}

export function completeItem(id, payload = {}) {
  return apiClient.post(`planning/items/${id}/complete/`, payload).then((res) => res.data)
}

export function listTags() {
  return apiClient.get('planning/tags/').then((res) => res.data)
}

export function createTag(payload) {
  return apiClient.post('planning/tags/', payload).then((res) => res.data)
}

export function updateTag(id, payload) {
  return apiClient.patch(`planning/tags/${id}/`, payload).then((res) => res.data)
}

export function deleteTag(id) {
  return apiClient.delete(`planning/tags/${id}/`).then((res) => res.data)
}

export function listTimezones() {
  return apiClient.get('planning/timezones/').then((res) => res.data)
}

export function createTimezone(payload) {
  return apiClient.post('planning/timezones/', payload).then((res) => res.data)
}

export function updateTimezone(id, payload) {
  return apiClient.patch(`planning/timezones/${id}/`, payload).then((res) => res.data)
}

export function deleteTimezone(id) {
  return apiClient.delete(`planning/timezones/${id}/`).then((res) => res.data)
}

export function getAssignmentDetail(id) {
  return apiClient.get(`planning/assignment-details/${id}/`).then((res) => res.data)
}

export function updateAssignmentDetail(id, payload) {
  return apiClient.patch(`planning/assignment-details/${id}/`, payload).then((res) => res.data)
}

export function getPriorityOrder() {
  return apiClient.get('planning/priority/').then((res) => res.data)
}

export function reorderPriority(payload) {
  return apiClient.post('planning/priority/reorder/', payload).then((res) => res.data)
}

export function getTimeline(params) {
  return apiClient.get('planning/timeline/', { params }).then((res) => res.data)
}

export function getFocus() {
  return apiClient.get('planning/focus/').then((res) => res.data)
}

export function setCurrentFocus(payload) {
  return apiClient
    .post('planning/focus/current/', payload)
    .then((res) => res.data)
}

export function doTodayFocus(payload) {
  return apiClient
    .post('planning/focus/do-today/', payload)
    .then((res) => res.data)
}

export function returnFocusToAutomatic(payload) {
  return apiClient
    .post('planning/focus/automatic/', payload)
    .then((res) => res.data)
}


export function anchorFocusBatch(payload) {
  return apiClient
    .post(
      'planning/focus/anchor/batch/',
      payload,
    )
    .then((res) => res.data)
}

export function reprioritiseFocus(payload) {
  return apiClient
    .post('planning/focus/reprioritise/', payload)
    .then((res) => res.data)
}

export function getOverdue() {
  return apiClient.get('planning/overdue/').then((res) => res.data)
}

export function getMarks() {
  return apiClient.get('planning/marks/').then((res) => res.data)
}

export function reorderMarks(payload) {
  return apiClient.post('planning/marks/reorder/', payload).then((res) => res.data)
}


export function getHistoryStatus() {
  return apiClient
    .get('planning/items/history-status/')
    .then((res) => res.data)
}

export function undoPlanningAction() {
  return apiClient
    .post('planning/items/undo/')
    .then((res) => res.data)
}

export function redoPlanningAction() {
  return apiClient
    .post('planning/items/redo/')
    .then((res) => res.data)
}

export function getSchedulerSettings() {
  return apiClient.get('planning/scheduler/settings/').then((res) => res.data)
}

export function updateSchedulerSettings(payload) {
  return apiClient.put('planning/scheduler/settings/', payload).then((res) => res.data)
}

export function getTimelineNavigation() {
  return apiClient
    .get('planning/timeline/navigation/')
    .then((res) => res.data)
}

export function anchorTimelineItem(payload) {
  return apiClient
    .post('planning/timeline/anchor/', payload)
    .then((res) => res.data)
}

export function updateTimelineOverload(payload) {
  return apiClient.post('planning/timeline/overload/', payload).then((res) => res.data)
}

export function rescheduleTimeline() {
  return apiClient.post('planning/timeline/reschedule/').then((res) => res.data)
}

export function getStudyPlan() {
  return apiClient.get('planning/study-plans/').then((res) => res.data)
}

export function requestStudyPlan(payload) {
  return apiClient.post('planning/study-plans/', payload).then((res) => res.data)
}

export function updateStudyPlan(payload) {
  return apiClient.patch('planning/study-plans/', payload).then((res) => res.data)
}
