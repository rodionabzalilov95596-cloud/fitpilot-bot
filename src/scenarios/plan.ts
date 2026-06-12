import type { LlmClient, UserState } from '../runtime/types.js';
import { formatWorkScheduleNotes, formatWorkScheduleSummary } from './workSchedule.js';

function safe(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v);
}

function goalLabel(goal: UserState['profile']['goal']): string {
  if (goal === 'lose_weight') return 'снижение веса';
  if (goal === 'gain_muscle') return 'набор мышечной массы';
  return safe(goal);
}

function dietLabel(style: UserState['profile']['dietStyle']): string {
  if (style === 'counting') return 'подсчёт КБЖУ';
  if (style === 'plate_method') return 'метод тарелки';
  return safe(style);
}

function buildPrompt(state: UserState): { system: string; user: string } {
  const p = state.profile;
  const dietOnly = p.goal === 'lose_weight' && p.includeTraining === false;
  const muscleWithControl = p.goal === 'gain_muscle' && p.dietStyle === 'counting';
  const muscleWithoutControl = p.goal === 'gain_muscle' && p.dietStyle === 'plate_method';

  const system =
    'Ты — фитнес-тренер и нутрициолог. Составь безопасный реалистичный недельный план для новичка. ' +
    'Не ставь медицинских диагнозов. Если есть красные флаги — предложи только максимально щадящую активность и посоветуй консультацию врача. ' +
    'Пиши по-русски, кратко и структурно, без воды.';

  let planInstructions =
    'Сделай ответ в формате:\n' +
    '1) Коротко: фокус недели (2–4 пункта)\n' +
    '2) Тренировки на 7 дней (дни, упражнения, подходы/повторы, RPE, альтернативы для дома/зала)\n' +
    '3) Питание: суточные калории и БЖУ (если выбран подсчёт), иначе метод тарелки + примеры блюд\n' +
    '4) Список покупок (10–20 позиций)\n' +
    '5) Правила корректировки на следующей неделе (3–5 правил)\n';

  let approachNote = '';

  if (dietOnly) {
    approachNote =
      'ВАЖНО: пользователь выбрал снижение веса БЕЗ тренировок. Составь ТОЛЬКО план питания на неделю. ' +
      'Раздел с тренировками не включай. Можно кратко упомянуть бытовую активность (ходьба), но без программы тренировок.\n';
    planInstructions =
      'Сделай ответ в формате:\n' +
      '1) Коротко: фокус недели на питании (2–4 пункта)\n' +
      '2) Питание на 7 дней: меню/приёмы пищи, калории и БЖУ (если подсчёт) или метод тарелки + примеры блюд\n' +
      '3) Список покупок (10–20 позиций)\n' +
      '4) Правила корректировки на следующей неделе (3–5 правил)\n';
  } else if (muscleWithControl) {
    approachNote =
      'ВАЖНО: пользователь набирает мышечную массу С контролем КБЖУ. План: тренировки + строгое питание с подсчётом калорий и БЖУ. ' +
      'Акцент на набор массы преимущественно за счёт мышц, не жира.\n';
  } else if (muscleWithoutControl) {
    approachNote =
      'ВАЖНО: пользователь набирает мышечную массу БЕЗ контроля КБЖУ (метод тарелки). План: тренировки + питание по методу тарелки. ' +
      'Честно учти, что при таком подходе возможен набор и жира — не обещай только «сухой» набор.\n';
  } else if (p.goal === 'lose_weight' && p.includeTraining === true) {
    approachNote =
      'ВАЖНО: пользователь выбрал снижение веса С тренировками. План: программа тренировок + питание для ускоренного результата.\n';
  }

  if (p.sex === 'female') {
    if (p.menstrualCycleInfo) {
      approachNote +=
        `ВАЖНО (менструальный цикл): пользователь указала период — «${p.menstrualCycleInfo}». ` +
        'В дни менструации: тренировки свести к минимуму или убрать, диету смягчить, добавить поддерживающие слова. ' +
        'Учти это в понедельном плане по дням.\n';
    } else if (p.menstrualCycleDeclined) {
      approachNote +=
        'Пользовательница не указала даты цикла — дай общую рекомендацию: в дни менструации снижать нагрузку, смягчать диету и поддерживать.\n';
    }
  }

  const scheduleText = p.workWeekSchedule
    ? formatWorkScheduleSummary(p.workWeekSchedule)
    : p.workScheduleNotes;

  if (scheduleText) {
    const notes = p.workWeekSchedule ? formatWorkScheduleNotes(p.workWeekSchedule) : p.workScheduleNotes;
    approachNote +=
      `ВАЖНО (график работы):\n${scheduleText}\n` +
      'Ставь тренировки на выходные и дни без смены. В рабочие дни — акцент на питании. ' +
      'Учитывай ночные смены. Накануне рабочего дня — блок «С собой на завтра».\n';
    if (notes) approachNote += `Сводка: ${notes}\n`;
    if (!dietOnly) {
      planInstructions = planInstructions.replace(
        '2) Тренировки на 7 дней',
        '2) План на 7 дней по дням (тренировки + питание; в рабочие дни — питание и «с собой на завтра»)'
      );
    }
  }

  const user =
    approachNote +
    'Данные пользователя:\n' +
    `- возраст: ${safe(p.age)}\n` +
    `- пол: ${safe(p.sex)}\n` +
    `- рост (см): ${safe(p.heightCm)}\n` +
    `- вес (кг): ${safe(p.weightKg)}\n` +
    (p.sex === 'female'
      ? `- менструальный цикл: ${p.menstrualCycleInfo ?? (p.menstrualCycleDeclined ? 'не указан (по желанию)' : 'не указан')}\n`
      : '') +
    `- график работы: ${scheduleText ? scheduleText.replace(/\n/g, '; ') : safe(p.workScheduleNotes)}\n` +
    `- цель: ${goalLabel(p.goal)}\n` +
    `- подход: ${dietOnly ? 'только питание, без тренировок' : p.includeTraining === true ? 'питание + тренировки' : safe(p.includeTraining)}\n` +
    `- активность: ${safe(p.activityLevel)}\n` +
    `- красные флаги: ${safe(p.hasRedFlags)}\n` +
    `- примечания по красным флагам: ${safe(p.redFlagsNotes)}\n` +
    `- травмы/боль: ${safe(p.injuriesNotes)}\n` +
    `- тренировок в неделю: ${safe(p.availableDaysPerWeek)}\n` +
    `- минут на тренировку: ${safe(p.typicalSessionMinutes)}\n` +
    `- оборудование: ${safe(p.equipment)}\n` +
    `- стиль питания: ${dietLabel(p.dietStyle)}\n` +
    `- аллергии/ограничения: ${safe(p.allergiesNotes)}\n` +
    `- нелюбимые продукты: ${safe(p.dislikedFoodsNotes)}\n` +
    `- приёмов пищи в день: ${safe(p.mealsPerDay)}\n` +
    `- готовка: ${safe(p.cookingTime)}\n\n` +
    planInstructions;

  return { system, user };
}

export async function buildPlanMessage(args: {
  state: UserState;
  llm: LlmClient;
  onlyShow?: boolean;
}): Promise<UserState> {
  const { state, llm, onlyShow } = args;

  if (onlyShow && state.planText) {
    return { ...state, stepId: 'show_plan' };
  }

  const prompt = buildPrompt(state);
  const planText = await llm.generateText(prompt);

  return {
    ...state,
    flow: 'main',
    stepId: 'show_plan',
    planText
  };
}

export async function adjustPlanMessage(args: {
  state: UserState;
  llm: LlmClient;
  adjustment: string;
}): Promise<UserState> {
  const { state, llm, adjustment } = args;

  const system =
    'Ты — фитнес-тренер и нутрициолог. Скорректируй недельный план с учётом пожелания пользователя. ' +
    'Сохрани структуру ответа. Пиши по-русски, кратко и по делу.';

  const user =
    `Текущий план:\n${state.planText ?? '(план отсутствует)'}\n\n` +
    `Пожелание пользователя: ${adjustment}\n\n` +
    'Верни обновлённый полный план.';

  const planText = await llm.generateText({ system, user });

  return {
    ...state,
    stepId: 'show_plan',
    planText
  };
}
