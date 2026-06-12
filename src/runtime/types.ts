export type Button = {
  id: string;
  title: string;
  kind?: 'callback' | 'open_app' | 'link';
  url?: string;
};

export type OutgoingMessage = {
  text: string;
  buttons?: Button[];
};

export type IncomingMessage = {
  userId: string;
  text: string | null;
  buttonId: string | null;
  timestampMs: number;
  /** true при «Старт» / bot_started — начать анкету заново */
  restart?: boolean;
};

export type UserGoal = 'lose_weight' | 'gain_muscle' | 'health' | 'strength' | 'endurance' | 'mobility';

export type ActivityLevel = 'low' | 'medium' | 'high';

export type Equipment = 'gym' | 'home_dumbbells' | 'bands' | 'pullup_bar' | 'none' | 'mixed';

export type DietStyle = 'counting' | 'plate_method';

export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export type DayShift = {
  isWorkDay: boolean;
  shiftStart: string | null;
  shiftEnd: string | null;
};

export type WorkWeekSchedule = Record<Weekday, DayShift>;

export type UserProfile = {
  createdAtMs: number;
  updatedAtMs: number;

  // Consent
  acceptedOffer: boolean;
  acceptedMedicalDisclaimer: boolean;

  // Basics
  age: number | null;
  sex: 'male' | 'female' | 'other' | null;
  heightCm: number | null;
  weightKg: number | null;

  // Только для женщин (по желанию)
  menstrualCycleInfo: string | null;
  menstrualCycleDeclined: boolean | null;

  // График работы
  workScheduleNotes: string | null;
  workWeekSchedule: WorkWeekSchedule | null;

  goal: UserGoal | null;
  /** Снижение веса: true — диета + тренировки, false — только диета */
  includeTraining: boolean | null;
  activityLevel: ActivityLevel | null;

  // Constraints / risks
  hasRedFlags: boolean | null;
  redFlagsNotes: string | null;
  injuriesNotes: string | null;

  // Schedule / resources
  availableDaysPerWeek: number | null; // 2..6
  typicalSessionMinutes: number | null; // 20..90
  equipment: Equipment | null;

  // Nutrition
  dietStyle: DietStyle | null;
  allergiesNotes: string | null;
  dislikedFoodsNotes: string | null;
  mealsPerDay: number | null; // 2..5
  cookingTime: 'low' | 'medium' | 'high' | null;
};

export type UserState = {
  flow: 'onboarding' | 'main';
  stepId: string; // points to flow step
  profile: UserProfile;
  planText?: string | null;
  /** Куда вернуться после настройки графика (анкета или меню плана) */
  scheduleReturnTo?: string;
};

export type UserStore = {
  get(userId: string): Promise<UserState | null>;
  set(userId: string, state: UserState): Promise<void>;
};

export type LlmClient = {
  generateText(args: { system: string; user: string }): Promise<string>;
};

