import { z } from 'zod';
import type { IncomingMessage, LlmClient, OutgoingMessage, UserState } from '../runtime/types.js';
import { adjustPlanMessage, buildPlanMessage } from './plan.js';
import {
  ensureWorkWeek,
  finishScheduleStep,
  hasSavedSchedule,
  openScheduleEditor,
  parseBotCommand,
  renderScheduleOpenText,
  scheduleOpenButtons
} from './workSchedule.js';

type Step = {
  id: string;
  render: (state: UserState) => OutgoingMessage;
  onButton?: (args: { state: UserState; buttonId: string; llm: LlmClient }) => Promise<UserState>;
  onText?: (args: { state: UserState; text: string; llm: LlmClient }) => Promise<UserState>;
};

const AgeSchema = z.coerce.number().int().min(14).max(90);
const HeightSchema = z.coerce.number().int().min(120).max(230);
const WeightSchema = z.coerce.number().min(30).max(250);
const DaysSchema = z.coerce.number().int().min(2).max(6);
const MinutesSchema = z.coerce.number().int().min(15).max(120);

function touch(state: UserState): UserState {
  return { ...state, profile: { ...state.profile, updatedAtMs: Date.now() } };
}

function buildGeneratingText(state: UserState): string {
  const p = state.profile;

  if (p.goal === 'lose_weight' && p.includeTraining === false) {
    return (
      'Собираю план питания на неделю (без тренировок). Это займёт немного времени.\n\n' +
      'Если выбран подсчёт КБЖУ — рекомендую кухонные весы: так порции будут точнее.'
    );
  }

  if (p.goal === 'gain_muscle' && p.dietStyle === 'counting') {
    return (
      'Собираю план тренировок и питания с подсчётом КБЖУ. Это займёт немного времени.\n\n' +
      'Рекомендую кухонные весы — без них подсчёт калорий будет менее точным.'
    );
  }

  return (
    'Собираю персональный план на неделю (тренировки + питание). Это займёт немного времени.\n\n' +
    'Если выбрали подсчёт КБЖУ — рекомендую кухонные весы: так порции будут точнее, а результат предсказуемее.'
  );
}

const RED_FLAG_MARKERS = ['груд', 'сердц', 'обморок', 'головокруж', 'давлен', 'воспален', 'остр'];

function parseHealthAnswer(text: string): {
  hasRedFlags: boolean;
  redFlagsNotes: string | null;
  injuriesNotes: string | null;
} {
  const trimmed = text.trim();
  if (trimmed.toLowerCase() === 'нет') {
    return { hasRedFlags: false, redFlagsNotes: null, injuriesNotes: null };
  }

  const lower = trimmed.toLowerCase();
  const hasRedFlags = RED_FLAG_MARKERS.some((marker) => lower.includes(marker));

  return {
    hasRedFlags,
    redFlagsNotes: hasRedFlags ? trimmed : null,
    injuriesNotes: trimmed
  };
}

const steps: Step[] = [
  {
    id: 'welcome',
    render: () => ({
      text:
        'Привет! Я ФитПилот — помогу составить персональные тренировки и питание.\n\n' +
        'Перед стартом примите оферту и медицинский дисклеймер:\n' +
        '• сервис не заменяет врача и не ставит диагнозов\n' +
        '• рекомендации общие — учитывайте своё самочувствие и не перегружайтесь\n' +
        '• при боли, травмах или плохом самочувствии — к специалисту',
      buttons: [{ id: 'accept_terms', title: 'Принимаю оферту и дисклеймер' }]
    }),
    onButton: async ({ state, buttonId }) => {
      if (buttonId !== 'accept_terms') return state;

      return touch({
        ...state,
        profile: {
          ...state.profile,
          acceptedOffer: true,
          acceptedMedicalDisclaimer: true
        },
        stepId: 'intro'
      });
    }
  },
  {
    id: 'intro',
    render: () => ({
      text:
        'Дорогой пользователь, спасибо, что хочешь воспользоваться моим сервисом персональных тренировок и питания😊 ' +
        'Для того, чтобы я смог подобрать питание и тренировки максимально правильно, тебе нужно ответить на мои вопросы и потратить какое-то время⏱️ ' +
        'Мы сделаем это с тобой один раз и настроим меня на всю дальнейшую работу✨',
      buttons: [{ id: 'intro_continue', title: 'Продолжить' }]
    }),
    onButton: async ({ state, buttonId }) => {
      if (buttonId !== 'intro_continue') return state;
      return touch({ ...state, stepId: 'age' });
    }
  },
  {
    id: 'age',
    render: () => ({ text: 'Сколько вам лет? (числом)' }),
    onText: async ({ state, text }) => {
      const parsed = AgeSchema.safeParse(text);
      if (!parsed.success) return state;
      return touch({ ...state, profile: { ...state.profile, age: parsed.data }, stepId: 'height' });
    }
  },
  {
    id: 'height',
    render: () => ({ text: 'Рост в см? (например 175)' }),
    onText: async ({ state, text }) => {
      const parsed = HeightSchema.safeParse(text);
      if (!parsed.success) return state;
      return touch({ ...state, profile: { ...state.profile, heightCm: parsed.data }, stepId: 'weight' });
    }
  },
  {
    id: 'weight',
    render: () => ({ text: 'Вес в кг? (например 72.5)' }),
    onText: async ({ state, text }) => {
      const parsed = WeightSchema.safeParse(text);
      if (!parsed.success) return state;
      return touch({ ...state, profile: { ...state.profile, weightKg: parsed.data }, stepId: 'sex' });
    }
  },
  {
    id: 'sex',
    render: () => ({
      text: 'Пол?',
      buttons: [
        { id: 'sex_m', title: 'Мужской' },
        { id: 'sex_f', title: 'Женский' }
      ]
    }),
    onButton: async ({ state, buttonId }) => {
      if (buttonId === 'sex_m') {
        return {
          ...touch({
            ...state,
            profile: {
              ...state.profile,
              sex: 'male',
              menstrualCycleInfo: null,
              menstrualCycleDeclined: null,
              workWeekSchedule: ensureWorkWeek(state.profile)
            }
          }),
          stepId: 'schedule_open',
          scheduleReturnTo: 'activity'
        };
      }
      if (buttonId === 'sex_f') {
        return touch({
          ...state,
          profile: { ...state.profile, sex: 'female' },
          stepId: 'menstrual_info'
        });
      }
      return state;
    }
  },
  {
    id: 'menstrual_info',
    render: () => ({
      text:
        'В период менструации организм испытывает дополнительный стресс — мы учитываем это в плане: ' +
        'в эти дни тренировки сводятся к минимуму или убираются, диета смягчается, и я поддерживаю тебя словами 💛\n\n' +
        'Если укажешь обычные даты или длительность цикла — я точнее подстрою план под тебя. ' +
        'Это необязательно — можешь пропустить.',
      buttons: [
        { id: 'menses_specify', title: 'Указать период менструации' },
        { id: 'menses_skip', title: 'Не хочу указывать' }
      ]
    }),
    onButton: async ({ state, buttonId }) => {
      if (buttonId === 'menses_specify') {
        return touch({ ...state, stepId: 'menstrual_dates' });
      }
      if (buttonId === 'menses_skip') {
        return {
          ...touch({
            ...state,
            profile: {
              ...state.profile,
              menstrualCycleInfo: null,
              menstrualCycleDeclined: true,
              workWeekSchedule: ensureWorkWeek(state.profile)
            }
          }),
          stepId: 'schedule_open',
          scheduleReturnTo: 'activity'
        };
      }
      return state;
    }
  },
  {
    id: 'menstrual_dates',
    render: () => ({
      text:
        'Напиши, когда обычно начинается и сколько длится менструация.\n\n' +
        'Например: «с 3 по 7 число каждого месяца» или «цикл 28 дней, последние начались 12 мая».'
    }),
    onText: async ({ state, text }) => {
      return {
        ...touch({
          ...state,
          profile: {
            ...state.profile,
            menstrualCycleInfo: text.trim(),
            menstrualCycleDeclined: false,
            workWeekSchedule: ensureWorkWeek(state.profile)
          }
        }),
        stepId: 'schedule_open',
        scheduleReturnTo: 'activity'
      };
    }
  },
  {
    id: 'schedule_open',
    render: () => ({
      text: renderScheduleOpenText(),
      buttons: scheduleOpenButtons()
    }),
    onButton: async ({ state, buttonId }) => {
      if (buttonId === 'schedule_continue') {
        if (hasSavedSchedule(state.profile)) {
          return finishScheduleStep(touch(state));
        }
        return touch({ ...state, stepId: 'schedule_open_remind' });
      }
      if (buttonId === 'schedule_text') {
        return touch({ ...state, stepId: 'work_schedule' });
      }
      return state;
    }
  },
  {
    id: 'schedule_open_remind',
    render: () => ({
      text:
        'График ещё не сохранён 📅\n\n' +
        'Открой календарь, отметь рабочие дни и нажми «Сохранить» внутри календаря. ' +
        'Затем вернись сюда и нажми «Продолжить».\n\n' +
        'Или напиши график текстом.',
      buttons: scheduleOpenButtons()
    }),
    onButton: async ({ state, buttonId }) => {
      if (buttonId === 'schedule_continue') {
        if (hasSavedSchedule(state.profile)) {
          return finishScheduleStep(touch(state));
        }
        return state;
      }
      if (buttonId === 'schedule_text') {
        return touch({ ...state, stepId: 'work_schedule' });
      }
      return state;
    }
  },
  {
    id: 'work_schedule',
    render: () => ({
      text:
        'Расскажи про график работы: в какие дни ты работаешь и примерное время смены.\n\n' +
        'Можно свободным текстом, например: «Пн–Пт 9:00–18:00» или «2/2, ночные смены 22:00–06:00».'
    }),
    onText: async ({ state, text }) => {
      return finishScheduleStep(
        touch({
          ...state,
          profile: { ...state.profile, workScheduleNotes: text.trim() },
          stepId: 'work_schedule'
        })
      );
    }
  },
  {
    id: 'activity',
    render: () => ({
      text: 'Какой у вас сейчас уровень повседневной активности?',
      buttons: [
        { id: 'act_low', title: 'Низкий (мало хожу)' },
        { id: 'act_med', title: 'Средний' },
        { id: 'act_high', title: 'Высокий (много движ.)' }
      ]
    }),
    onButton: async ({ state, buttonId }) => {
      const activityLevel = buttonId === 'act_low' ? 'low' : buttonId === 'act_med' ? 'medium' : 'high';
      return touch({ ...state, profile: { ...state.profile, activityLevel }, stepId: 'health_safety' });
    }
  },
  {
    id: 'health_safety',
    render: () => ({
      text:
        'Вопрос безопасности и о здоровье.\n\n' +
        'Ответь одним сообщением:\n' +
        '1) Есть ли сейчас что-то из списка?\n' +
        '   — боль или сдавление в груди при нагрузке\n' +
        '   — обмороки или сильное головокружение\n' +
        '   — острые травмы или воспаления\n' +
        '   — неконтролируемое давление\n' +
        '2) Есть ли травмы или хроническая боль (колени, спина, плечи и т.д.)?\n\n' +
        'Если ничего из перечисленного — напиши «нет».'
    }),
    onText: async ({ state, text }) => {
      const health = parseHealthAnswer(text);
      return touch({
        ...state,
        profile: {
          ...state.profile,
          hasRedFlags: health.hasRedFlags,
          redFlagsNotes: health.redFlagsNotes,
          injuriesNotes: health.injuriesNotes
        },
        stepId: 'days'
      });
    }
  },
  {
    id: 'days',
    render: () => ({ text: 'Сколько тренировок в неделю реально делать? (2–6, числом)' }),
    onText: async ({ state, text }) => {
      const parsed = DaysSchema.safeParse(text);
      if (!parsed.success) return state;
      return touch({
        ...state,
        profile: { ...state.profile, availableDaysPerWeek: parsed.data },
        stepId: 'minutes'
      });
    }
  },
  {
    id: 'minutes',
    render: () => ({ text: 'Сколько минут обычно есть на одну тренировку? (например 40)' }),
    onText: async ({ state, text }) => {
      const parsed = MinutesSchema.safeParse(text);
      if (!parsed.success) return state;
      return touch({
        ...state,
        profile: { ...state.profile, typicalSessionMinutes: parsed.data },
        stepId: 'equipment'
      });
    }
  },
  {
    id: 'equipment',
    render: () => ({
      text: 'Где и с чем будете тренироваться?',
      buttons: [
        { id: 'eq_gym', title: 'Зал' },
        { id: 'eq_home', title: 'Дом (гантели)' },
        { id: 'eq_bands', title: 'Дом (резинки)' },
        { id: 'eq_none', title: 'Только вес тела' },
        { id: 'eq_mixed', title: 'Смешанно' }
      ]
    }),
    onButton: async ({ state, buttonId }) => {
      const equipment =
        buttonId === 'eq_gym'
          ? 'gym'
          : buttonId === 'eq_home'
            ? 'home_dumbbells'
            : buttonId === 'eq_bands'
              ? 'bands'
              : buttonId === 'eq_mixed'
                ? 'mixed'
                : 'none';
      return touch({ ...state, profile: { ...state.profile, equipment }, stepId: 'diet_style' });
    }
  },
  {
    id: 'diet_style',
    render: () => ({
      text: 'Питание: как удобнее?',
      buttons: [
        { id: 'diet_count', title: 'Подсчёт КБЖУ (лучше результат)' },
        { id: 'diet_plate', title: 'Без подсчёта (метод тарелки)' }
      ]
    }),
    onButton: async ({ state, buttonId }) => {
      const dietStyle = buttonId === 'diet_count' ? 'counting' : 'plate_method';
      return touch({ ...state, profile: { ...state.profile, dietStyle }, stepId: 'allergies' });
    }
  },
  {
    id: 'allergies',
    render: () => ({
      text:
        'Есть ли аллергии/непереносимости или запреты (например “без молочки/глютена”, “вегетарианство”)?\n' +
        'Если нет — напишите “нет”.'
    }),
    onText: async ({ state, text }) => {
      const allergiesNotes = text.trim().toLowerCase() === 'нет' ? null : text;
      return touch({ ...state, profile: { ...state.profile, allergiesNotes }, stepId: 'dislikes' });
    }
  },
  {
    id: 'dislikes',
    render: () => ({
      text:
        'Какие продукты/блюда точно НЕ хотите? (Можно списком. Если нет — “нет”).\n' +
        'Потом я предложу замены.'
    }),
    onText: async ({ state, text }) => {
      const dislikedFoodsNotes = text.trim().toLowerCase() === 'нет' ? null : text;
      return touch({ ...state, profile: { ...state.profile, dislikedFoodsNotes }, stepId: 'meals' });
    }
  },
  {
    id: 'meals',
    render: () => ({
      text: 'Сколько приёмов пищи в день удобно? (2–5, числом)'
    }),
    onText: async ({ state, text }) => {
      const parsed = z.coerce.number().int().min(2).max(5).safeParse(text);
      if (!parsed.success) return state;
      return touch({ ...state, profile: { ...state.profile, mealsPerDay: parsed.data }, stepId: 'cook_time' });
    }
  },
  {
    id: 'cook_time',
    render: () => ({
      text: 'Сколько времени готовы тратить на готовку?',
      buttons: [
        { id: 'cook_low', title: 'Минимум (до 15 мин)' },
        { id: 'cook_med', title: 'Средне' },
        { id: 'cook_high', title: 'Люблю готовить' }
      ]
    }),
    onButton: async ({ state, buttonId }) => {
      const cookingTime = buttonId === 'cook_low' ? 'low' : buttonId === 'cook_med' ? 'medium' : 'high';
      return touch({ ...state, profile: { ...state.profile, cookingTime }, stepId: 'goal' });
    }
  },
  {
    id: 'goal',
    render: () => ({
      text: 'Главная цель на ближайшие 8–12 недель?',
      buttons: [
        { id: 'goal_lose', title: 'Снижение веса' },
        { id: 'goal_gain', title: 'Набор мышечной массы' }
      ]
    }),
    onButton: async ({ state, buttonId }) => {
      if (buttonId === 'goal_lose') {
        return touch({ ...state, profile: { ...state.profile, goal: 'lose_weight' }, stepId: 'goal_lose_info' });
      }
      if (buttonId === 'goal_gain') {
        return touch({ ...state, profile: { ...state.profile, goal: 'gain_muscle' }, stepId: 'goal_gain_info' });
      }
      return state;
    }
  },
  {
    id: 'goal_lose_info',
    render: () => ({
      text:
        'Снижать вес можно с тренировками и без.\n\n' +
        'Если следовать только диете и не тренироваться — результат придёт, но для желаемого эффекта понадобится больше времени.\n\n' +
        'Если следовать диете и тренироваться — результат будет значительно быстрее, качество тела и кожи будет лучше. ' +
        'Но этот путь тяжелее, чем первый.\n\n' +
        'Какой вариант выбираешь?',
      buttons: [
        { id: 'lose_with_training', title: 'С тренировками' },
        { id: 'lose_without_training', title: 'Без тренировок' }
      ]
    }),
    onButton: async ({ state, buttonId, llm }) => {
      if (buttonId === 'lose_with_training') {
        const filled = touch({
          ...state,
          profile: { ...state.profile, goal: 'lose_weight', includeTraining: true },
          stepId: 'generating'
        });
        return buildPlanMessage({ state: filled, llm });
      }
      if (buttonId === 'lose_without_training') {
        const filled = touch({
          ...state,
          profile: { ...state.profile, goal: 'lose_weight', includeTraining: false },
          stepId: 'generating'
        });
        return buildPlanMessage({ state: filled, llm });
      }
      return state;
    }
  },
  {
    id: 'goal_gain_info',
    render: () => ({
      text:
        'Набирать мышечную массу можно с контролем потребления жиров и углеводов и без.\n\n' +
        'С контролем подойдёт метод с подсчётом КБЖУ: труднее — нужно считать калории и держать более строгое питание, ' +
        'но набор массы будет преимущественно за счёт роста мышц.\n\n' +
        'Без контроля подойдёт метод тарелки: проще в быту, но набор массы тела будет ещё и за счёт набора жира.\n\n' +
        'Какой вариант выбираешь?',
      buttons: [
        { id: 'gain_with_control', title: 'С контролем КБЖУ' },
        { id: 'gain_without_control', title: 'Без контроля (тарелка)' }
      ]
    }),
    onButton: async ({ state, buttonId, llm }) => {
      if (buttonId === 'gain_with_control') {
        const filled = touch({
          ...state,
          profile: { ...state.profile, goal: 'gain_muscle', dietStyle: 'counting' },
          stepId: 'generating'
        });
        return buildPlanMessage({ state: filled, llm });
      }
      if (buttonId === 'gain_without_control') {
        const filled = touch({
          ...state,
          profile: { ...state.profile, goal: 'gain_muscle', dietStyle: 'plate_method' },
          stepId: 'generating'
        });
        return buildPlanMessage({ state: filled, llm });
      }
      return state;
    }
  },
  {
    id: 'generating',
    render: (state) => ({
      text: buildGeneratingText(state)
    })
  },
  {
    id: 'show_plan',
    render: (state) => ({
      text: state.planText ?? 'План ещё не сгенерирован. Пройдите анкету до конца.',
      buttons: [
        { id: 'menu_plan', title: 'Показать план снова' },
        { id: 'menu_schedule', title: '📅 График работы' },
        { id: 'menu_checkin', title: 'Чек‑ин за сегодня' },
        { id: 'menu_adjust', title: 'Скорректировать план' }
      ]
    }),
    onButton: async ({ state, buttonId, llm }) => {
      if (buttonId === 'menu_plan') {
        return buildPlanMessage({ state, llm, onlyShow: true });
      }
      if (buttonId === 'menu_schedule') {
        return openScheduleEditor(state, 'show_plan');
      }
      if (buttonId === 'menu_checkin') return touch({ ...state, stepId: 'checkin_energy' });
      if (buttonId === 'menu_adjust') return touch({ ...state, stepId: 'adjust_notes' });
      return state;
    }
  },
  {
    id: 'main_menu',
    render: () => ({
      text: 'Готово. Что делаем дальше?',
      buttons: [
        { id: 'menu_plan', title: 'Показать план недели' },
        { id: 'menu_checkin', title: 'Чек‑ин за сегодня' },
        { id: 'menu_adjust', title: 'Скорректировать план' }
      ]
    }),
    onButton: async ({ state, buttonId, llm }) => {
      if (buttonId === 'menu_plan') {
        if (state.planText) return { ...state, stepId: 'show_plan' };
        return buildPlanMessage({ state, llm });
      }
      if (buttonId === 'menu_checkin') return touch({ ...state, stepId: 'checkin_energy' });
      if (buttonId === 'menu_adjust') return touch({ ...state, stepId: 'adjust_notes' });
      return state;
    }
  },
  {
    id: 'checkin_energy',
    render: () => ({
      text: 'Чек‑ин. Как энергия сегодня по шкале 1–10? (числом)'
    }),
    onText: async ({ state, text }) => {
      const parsed = z.coerce.number().int().min(1).max(10).safeParse(text);
      if (!parsed.success) return state;
      return touch({ ...state, stepId: 'show_plan' });
    }
  },
  {
    id: 'adjust_notes',
    render: () => ({
      text:
        'Что именно нужно скорректировать? Например:\n' +
        '- “нет времени, только 20 минут”\n' +
        '- “болит колено на выпадах”\n' +
        '- “хочу больше упражнений на спину”'
    }),
    onText: async ({ state, text, llm }) => {
      return adjustPlanMessage({ state, llm, adjustment: text });
    }
  }
];

const LEGACY_STEP_REDIRECT: Record<string, string> = {
  red_flags: 'intro',
  red_flags_notes: 'age',
  injuries: 'health_safety',
  work_schedule: 'schedule_open',
  schedule_hub: 'schedule_open',
  schedule_day_type: 'schedule_open',
  schedule_shift_start: 'schedule_open',
  schedule_shift_end: 'schedule_open'
};

function resolveStepId(stepId: string): string {
  return LEGACY_STEP_REDIRECT[stepId] ?? stepId;
}

function getStep(stepId: string): Step {
  const step = steps.find((s) => s.id === resolveStepId(stepId));
  if (!step) throw new Error(`Unknown stepId: ${stepId}`);
  return step;
}

export async function runScenarioTurn(args: {
  state: UserState;
  incoming: IncomingMessage;
  llm: LlmClient;
}): Promise<{ nextState: UserState; outgoing: OutgoingMessage }> {
  let { state, incoming, llm } = args;

  const command = parseBotCommand(incoming.text);
  if (command === 'grafik') {
    const returnTo = state.planText ? 'show_plan' : state.stepId;
    state = openScheduleEditor(state, returnTo);
    incoming = { ...incoming, text: null, buttonId: null };
  }

  const step = getStep(state.stepId);

  let nextState = state;
  if (incoming.buttonId && step.onButton) nextState = await step.onButton({ state, buttonId: incoming.buttonId, llm });
  else if (incoming.text && step.onText) nextState = await step.onText({ state, text: incoming.text, llm });

  const outgoing = getStep(nextState.stepId).render(nextState);
  return { nextState, outgoing };
}

