/**
 * DEMO FIXTURES — fictional example data for presentations.
 *
 * One click builds the whole loop: profile → decision (A/B) → comparison →
 * chosen path B → plan started three weeks ago → three Reality Check entries
 * with real plan/actual differences → visibly updated timeline.
 *
 * Content is authored per locale and loaded in the current UI language; after
 * that it behaves like user content (it is not re-translated on language switch).
 * The UI shows a "demo data" badge while state.isDemo is true.
 */
import { compareLocally } from "@/domain/analysis";
import { buildPlan } from "@/domain/plan";
import type { CheckIn, CheckInKind, Decision, Profile, ScenarioInput } from "@/domain/types";
import type { Locale } from "@/i18n";
import { createId } from "@/lib/id";
import type { MirrorState } from "@/lib/store/mirror-store";

interface PathText {
  title: string;
  description: string;
  pros: string[];
  cons: string[];
  steps: string[];
}

interface DemoContent {
  name: string;
  goals: [string, string];
  skills: [string, string, string, string, string];
  constraintNote: string;
  question: string;
  A: PathText;
  B: PathText;
  notes: [string, string, string];
}

const CONTENT: Record<Locale, DemoContent> = {
  ru: {
    name: "Алия",
    goals: ["Получить оффер junior-аналитика данных к лету", "Подтянуть английский до B2"],
    skills: ["Excel", "Python", "Статистика", "SQL", "Английский"],
    constraintNote: "Сессия с 20 декабря по 25 января",
    question: "Как провести ближайшие три месяца, чтобы приблизиться к работе аналитиком?",
    A: {
      title: "Стажировка в продуктовой компании",
      description: "Part-time стажировка аналитиком, 20 часов в неделю, гибрид.",
      pros: ["Реальные задачи и наставник", "Строчка в резюме", "Шанс на оффер после стажировки"],
      cons: ["Нужно пройти отбор", "20 часов рядом с учёбой — тяжело"],
      steps: [
        "Обновить резюме под аналитику",
        "Откликнуться на 8 стажировок",
        "Решить 10 задач по SQL для собеседований",
        "Подготовить рассказ о своих проектах",
      ],
    },
    B: {
      title: "Курс по аналитике + пет-проект",
      description: "Онлайн-курс по SQL и визуализации, параллельно — свой дашборд на открытых данных.",
      pros: ["Свой темп, совместимо с сессией", "Проект для портфолио"],
      cons: ["Курс платный", "Нет обратной связи от команды"],
      steps: [
        "Выбрать курс и открытый датасет",
        "Пройти модуль по SQL: SELECT и JOIN",
        "Решить 15 задач по SQL",
        "Пройти модуль по визуализации",
        "Собрать первую версию дашборда",
        "Показать дашборд одногруппнику и собрать отзывы",
        "Доработать дашборд по отзывам",
        "Опубликовать проект на GitHub",
      ],
    },
    notes: [
      "Курс оказался понятнее, чем ожидала: модуль по SQL прошла быстрее.",
      "Неделя контрольных: получилось заниматься только два вечера.",
      "Перенесла оставшиеся задачи по SQL на эту неделю, визуализацию сдвинула.",
    ],
  },
  en: {
    name: "Alia",
    goals: ["Get a junior data analyst offer by summer", "Bring my English up to B2"],
    skills: ["Excel", "Python", "Statistics", "SQL", "English"],
    constraintNote: "Exam session from December 20 to January 25",
    question: "How should I spend the next three months to get closer to an analyst job?",
    A: {
      title: "Internship at a product company",
      description: "Part-time analyst internship, 20 hours a week, hybrid.",
      pros: ["Real tasks and a mentor", "A line on my CV", "A chance of an offer afterwards"],
      cons: ["Requires passing a selection process", "20 hours next to my studies is hard"],
      steps: [
        "Tailor my CV for analytics",
        "Apply to 8 internships",
        "Solve 10 SQL interview problems",
        "Prepare a short story about my projects",
      ],
    },
    B: {
      title: "Analytics course + pet project",
      description: "An online course on SQL and visualization, plus my own dashboard on open data.",
      pros: ["My own pace, compatible with exams", "A portfolio project"],
      cons: ["The course is paid", "No feedback from a team"],
      steps: [
        "Choose a course and an open dataset",
        "Complete the SQL module: SELECT and JOIN",
        "Solve 15 SQL problems",
        "Complete the visualization module",
        "Build the first version of the dashboard",
        "Show the dashboard to a classmate and collect feedback",
        "Improve the dashboard based on feedback",
        "Publish the project on GitHub",
      ],
    },
    notes: [
      "The course was clearer than I expected — I got through the SQL module faster.",
      "Test week at university: I could only study two evenings.",
      "Moved the remaining SQL tasks to this week and pushed visualization back.",
    ],
  },
  kk: {
    name: "Әлия",
    goals: ["Жазға қарай junior деректер талдаушысы лауазымына ұсыныс алу", "Ағылшын тілін B2 деңгейіне жеткізу"],
    skills: ["Excel", "Python", "Статистика", "SQL", "Ағылшын тілі"],
    constraintNote: "Сессия 20 желтоқсаннан 25 қаңтарға дейін",
    question: "Талдаушы болып жұмысқа орналасуға жақындау үшін алдағы үш айды қалай өткізген дұрыс?",
    A: {
      title: "Өнім компаниясында тағылымдама",
      description: "Аналитик ретінде толық емес күндік тағылымдама, аптасына 20 сағат, гибридті формат.",
      pros: ["Нақты тапсырмалар мен тәлімгер", "Түйіндемеге жазатын тәжірибе", "Тағылымдамадан кейін ұсыныс алу мүмкіндігі"],
      cons: ["Іріктеуден өту керек", "Оқумен қатар аптасына 20 сағат — ауыр"],
      steps: [
        "Түйіндемені аналитикаға бейімдеу",
        "8 тағылымдамаға өтінім жіберу",
        "Сұхбатқа арналған 10 SQL есебін шығару",
        "Өз жобаларым туралы қысқаша әңгіме дайындау",
      ],
    },
    B: {
      title: "Аналитика курсы + жеке жоба",
      description: "SQL және визуализация бойынша онлайн-курс, қатар ашық деректер негізінде өз дашбордымды жасау.",
      pros: ["Өз қарқыныммен, сессиямен үйлеседі", "Портфолиоға арналған жоба"],
      cons: ["Курс ақылы", "Командадан кері байланыс жоқ"],
      steps: [
        "Курс пен ашық деректер жиынын таңдау",
        "SQL модулін өту: SELECT және JOIN",
        "SQL бойынша 15 есеп шығару",
        "Визуализация модулін өту",
        "Дашбордтың алғашқы нұсқасын жасау",
        "Дашбордты курстасқа көрсетіп, пікір жинау",
        "Пікірлер бойынша дашбордты жетілдіру",
        "Жобаны GitHub-қа жариялау",
      ],
    },
    notes: [
      "Курс күткенімнен түсінікті болды: SQL модулін тезірек өттім.",
      "Бақылау жұмыстары аптасы: тек екі кеш қана айналыса алдым.",
      "Қалған SQL тапсырмаларын осы аптаға ауыстырып, визуализацияны кейінге қалдырдым.",
    ],
  },
};

function pathInput(text: PathText, base: Omit<ScenarioInput, keyof PathText>): ScenarioInput {
  return { ...base, ...text, pros: [...text.pros], cons: [...text.cons], steps: [...text.steps] };
}

/** The full A/B example (used by the Lab's "fill complete example" button too). */
export function exampleDecisionInput(locale: Locale): { question: string; paths: { A: ScenarioInput; B: ScenarioInput } } {
  const c = CONTENT[locale];
  return {
    question: c.question,
    paths: {
      A: pathInput(c.A, { hoursPerWeek: 20, durationWeeks: 12, demands: ["selection"], goalFit: "direct" }),
      B: pathInput(c.B, { hoursPerWeek: 10, durationWeeks: 16, demands: ["money"], goalFit: "partial" }),
    },
  };
}

export function demoProfile(locale: Locale, now = new Date()): Profile {
  const c = CONTENT[locale];
  const iso = now.toISOString();
  return {
    name: c.name,
    stage: "university",
    goals: [
      { id: "g-main", title: c.goals[0], priority: "high", horizonMonths: 6 },
      { id: "g-eng", title: c.goals[1], priority: "medium", horizonMonths: 12 },
    ],
    skills: [
      { id: "s1", name: c.skills[0], level: 3 },
      { id: "s2", name: c.skills[1], level: 2 },
      { id: "s3", name: c.skills[2], level: 2 },
      { id: "s4", name: c.skills[3], level: 1 },
      { id: "s5", name: c.skills[4], level: 2 },
    ],
    hoursPerWeek: 12,
    constraints: ["study_load", "budget"],
    constraintNote: c.constraintNote,
    createdAt: iso,
    updatedAt: iso,
  };
}

/** Actual hours and kinds for the three past weeks. Planned ≈ 10.5 h/week. */
const HISTORY: { actual: number; kind: CheckInKind; doneTasks: number }[] = [
  { actual: 9, kind: "observation", doneTasks: 3 },
  { actual: 5.5, kind: "obstacle", doneTasks: 2 },
  { actual: 7, kind: "change", doneTasks: 2 },
];

/** Complete fictional journey, three weeks into the plan. */
export function demoState(locale: Locale, now = new Date()): MirrorState {
  const c = CONTENT[locale];
  const profile = demoProfile(locale, now);
  const input = exampleDecisionInput(locale);
  const decision: Decision = {
    id: createId(),
    question: input.question,
    paths: input.paths,
    createdAt: new Date(now.getTime() - 22 * 86_400_000).toISOString(),
  };
  const comparison = compareLocally(decision, profile);

  // Plan created 3 weeks ago → week 4 is the current week.
  const planDate = new Date(now.getTime() - 21 * 86_400_000);
  const plan = buildPlan(decision, "B", profile, planDate);

  const checkIns: CheckIn[] = [];
  HISTORY.forEach((h, i) => {
    const week = i + 1;
    const weekTasks = plan.tasks.filter((t) => t.week === week);
    // Mark the first N tasks of the week as done (review task last).
    const ordered = [...weekTasks.filter((t) => t.source !== "system"), ...weekTasks.filter((t) => t.source === "system")];
    const doneIds = new Set([...ordered.slice(0, h.doneTasks - 1), ordered[ordered.length - 1]].map((t) => t.id));
    plan.tasks = plan.tasks.map((t) => (doneIds.has(t.id) ? { ...t, done: true, doneAt: planDate.toISOString() } : t));
    const stamp = new Date(planDate.getTime() + (week * 7 - 1) * 86_400_000).toISOString();
    checkIns.push({
      id: createId(),
      planId: plan.id,
      week,
      plannedHours: weekTasks.reduce((s, t) => s + t.estimateHours, 0),
      actualHours: h.actual,
      tasksDone: doneIds.size,
      tasksTotal: weekTasks.length,
      kind: h.kind,
      note: c.notes[i],
      createdAt: stamp,
      updatedAt: stamp,
    });
  });

  return {
    version: 2,
    isDemo: true,
    profile,
    decision,
    comparison,
    selectedPath: "B",
    plan,
    checkIns,
  };
}
