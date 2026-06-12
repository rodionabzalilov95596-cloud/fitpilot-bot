import type { UserProfile, UserState } from '../runtime/types.js';

export function newProfile(): UserProfile {
  const now = Date.now();
  return {
    createdAtMs: now,
    updatedAtMs: now,

    acceptedOffer: false,
    acceptedMedicalDisclaimer: false,

    age: null,
    sex: null,
    heightCm: null,
    weightKg: null,

    menstrualCycleInfo: null,
    menstrualCycleDeclined: null,

    workScheduleNotes: null,
    workWeekSchedule: null,

    goal: null,
    includeTraining: null,
    activityLevel: null,

    hasRedFlags: null,
    redFlagsNotes: null,
    injuriesNotes: null,

    availableDaysPerWeek: null,
    typicalSessionMinutes: null,
    equipment: null,

    dietStyle: null,
    allergiesNotes: null,
    dislikedFoodsNotes: null,
    mealsPerDay: null,
    cookingTime: null
  };
}

export function getInitialState(): UserState {
  return { flow: 'onboarding', stepId: 'welcome', profile: newProfile() };
}

