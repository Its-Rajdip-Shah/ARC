const DURATION_ESTIMATE_LABELS = {
  UNDER_20_MINUTES: 'Under 20 minutes',
  UNDER_1_HOUR: 'Under 1 hour',
  UNDER_4_HOURS: 'Under 4 hours',
  UNDER_8_HOURS: 'Under 8 hours',
  UNDER_16_HOURS: 'Under 16 hours',
  OVER_16_HOURS: 'Over 16 hours',
}

export function durationEstimateLabel(category) {
  if (!category) return ''
  return DURATION_ESTIMATE_LABELS[category] ?? ''
}
