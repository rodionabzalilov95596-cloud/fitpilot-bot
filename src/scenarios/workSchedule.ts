import type { Button, DayShift, UserProfile, UserState, Weekday, WorkWeekSchedule } from '../runtime/types.js';
import { getPublicUrl } from '../config/env.js';

export const WEEKDAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  mon: 'Понедельник',
  tue: 'Вторник',
  wed: 'Среда',
  thu: 'Четверг',
  fri: 'Пятница',
  sat: 'Суббота',
  sun: 'Воскресенье'
};

export const WEEKDAY_SHORT: Record<Weekday, string> = {
  mon: 'Пн',
  tue: 'Вт',
  wed: 'Ср',
  thu: 'Чт',
  fri: 'Пт',
  sat: 'Сб',
  sun: 'Вс'
};

function emptyDay(): DayShift {
  return { isWorkDay: false, shiftStart: null, shiftEnd: null };
}

export function createEmptyWeek(): WorkWeekSchedule {
  return {
    mon: emptyDay(),
    tue: emptyDay(),
    wed: emptyDay(),
    thu: emptyDay(),
    fri: emptyDay(),
    sat: emptyDay(),
    sun: emptyDay()
  };
}

export function ensureWorkWeek(profile: Pick<UserProfile, 'workWeekSchedule'>): WorkWeekSchedule {
  return profile.workWeekSchedule ?? createEmptyWeek();
}

function formatDayShift(day: DayShift): string {
  if (!day.isWorkDay) return 'выходной';
  if (day.shiftStart && day.shiftEnd) return `смена ${day.shiftStart}–${day.shiftEnd}`;
  if (day.shiftStart) return `смена с ${day.shiftStart}`;
  return 'рабочий день';
}

export function formatWorkScheduleSummary(schedule: WorkWeekSchedule): string {
  return WEEKDAYS.map((day) => `${WEEKDAY_SHORT[day]}: ${formatDayShift(schedule[day])}`).join('\n');
}

export function formatWorkScheduleNotes(schedule: WorkWeekSchedule): string {
  return WEEKDAYS.map((day) => {
    const d = schedule[day];
    if (!d.isWorkDay) return `${WEEKDAY_SHORT[day]} — выходной`;
    if (d.shiftStart && d.shiftEnd) return `${WEEKDAY_SHORT[day]} — смена ${d.shiftStart}-${d.shiftEnd}`;
    return `${WEEKDAY_SHORT[day]} — рабочий`;
  }).join('; ');
}

export function hasSavedSchedule(profile: UserProfile): boolean {
  if (profile.workScheduleNotes?.trim()) return true;
  const week = profile.workWeekSchedule;
  if (!week) return false;
  return WEEKDAYS.some((day) => week[day].isWorkDay);
}

export function getMiniappUrl(): string | undefined {
  const base = getPublicUrl();
  if (!base) return undefined;
  return `${base.replace(/\/$/, '')}/miniapp/schedule/`;
}

export function renderScheduleOpenText(): string {
  return (
    'Настрой график работы в календаре 📅\n\n' +
    'Отметь рабочие дни и время смен (можно ночные, например 22:00–06:00). ' +
    'После сохранения в календаре нажми «Продолжить».\n\n' +
    'Или напиши график текстом — кнопка ниже.'
  );
}

export function scheduleOpenButtons(): Button[] {
  const url = getMiniappUrl();
  const openButton: Button = url
    ? { id: 'open_schedule', title: '📅 Открыть календарь', kind: 'link', url }
    : { id: 'open_schedule', title: '📅 Открыть календарь', kind: 'open_app' };

  return [
    openButton,
    { id: 'schedule_continue', title: 'Продолжить' },
    { id: 'schedule_text', title: 'Написать текстом' }
  ];
}

export function openScheduleEditor(state: UserState, returnTo: string): UserState {
  return {
    ...state,
    profile: {
      ...state.profile,
      updatedAtMs: Date.now(),
      workWeekSchedule: ensureWorkWeek(state.profile)
    },
    stepId: 'schedule_open',
    scheduleReturnTo: returnTo
  };
}

export function finishScheduleStep(state: UserState): UserState {
  const returnTo = state.scheduleReturnTo ?? 'activity';
  return {
    ...state,
    stepId: returnTo,
    scheduleReturnTo: undefined
  };
}

export function parseBotCommand(text: string | null): 'start' | 'grafik' | null {
  const normalized = text?.trim().toLowerCase().replace(/^\/+/, '') ?? '';
  if (normalized === 'start' || normalized === 'старт') return 'start';
  if (normalized === 'grafik' || normalized === 'график' || normalized === 'календарь') return 'grafik';
  return null;
}

export function isWorkWeekSchedule(value: unknown): value is WorkWeekSchedule {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return WEEKDAYS.every((day) => {
    const d = obj[day];
    if (!d || typeof d !== 'object') return false;
    const shift = d as Record<string, unknown>;
    return (
      typeof shift.isWorkDay === 'boolean' &&
      (shift.shiftStart === null || typeof shift.shiftStart === 'string') &&
      (shift.shiftEnd === null || typeof shift.shiftEnd === 'string')
    );
  });
}
