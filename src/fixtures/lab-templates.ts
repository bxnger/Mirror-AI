/**
 * Starting points for the What If Lab — NOT demo data and NOT analysis.
 * A template only pre-fills the question, path titles and rough time inputs;
 * the user edits everything before comparing. Authored per locale.
 */
import type { DemandTag } from "@/domain/types";
import type { Locale } from "@/i18n";

interface TemplatePath {
  hoursPerWeek: number;
  durationWeeks: number;
  demands: DemandTag[];
}

export interface LabTemplate {
  id: string;
  label: string;
  question: string;
  A: TemplatePath & { title: string };
  B: TemplatePath & { title: string };
}

const SHAPES: { id: string; A: TemplatePath; B: TemplatePath }[] = [
  {
    id: "intern-vs-course",
    A: { hoursPerWeek: 20, durationWeeks: 12, demands: ["selection"] },
    B: { hoursPerWeek: 8, durationWeeks: 12, demands: ["money"] },
  },
  {
    id: "master-vs-job",
    A: { hoursPerWeek: 30, durationWeeks: 96, demands: ["selection", "full_time"] },
    B: { hoursPerWeek: 40, durationWeeks: 52, demands: ["full_time", "selection"] },
  },
  {
    id: "abroad-vs-home",
    A: { hoursPerWeek: 25, durationWeeks: 20, demands: ["relocation", "language", "selection"] },
    B: { hoursPerWeek: 10, durationWeeks: 16, demands: [] },
  },
];

const TEXT: Record<Locale, { label: string; question: string; A: string; B: string }[]> = {
  ru: [
    {
      label: "Стажировка или курс",
      question: "Что выбрать на ближайший семестр: стажировку или курс с собственным проектом?",
      A: "Стажировка part-time",
      B: "Онлайн-курс + пет-проект",
    },
    {
      label: "Магистратура или работа",
      question: "После бакалавриата: поступать в магистратуру или сразу идти работать?",
      A: "Магистратура",
      B: "Работа junior-специалистом",
    },
    {
      label: "Учёба за рубежом или дома",
      question: "Подавать на программу обмена за рубежом или остаться и углубиться в профиль дома?",
      A: "Семестр по обмену",
      B: "Профильные курсы в своём вузе",
    },
  ],
  en: [
    {
      label: "Internship or course",
      question: "What should I choose for the next semester: an internship or a course with my own project?",
      A: "Part-time internship",
      B: "Online course + pet project",
    },
    {
      label: "Master's or job",
      question: "After my bachelor's: apply for a master's or start working right away?",
      A: "Master's programme",
      B: "Junior specialist job",
    },
    {
      label: "Study abroad or at home",
      question: "Apply for an exchange programme abroad, or stay and go deeper into my field at home?",
      A: "Exchange semester",
      B: "Specialised courses at my university",
    },
  ],
  kk: [
    {
      label: "Тағылымдама ма, курс па",
      question: "Келесі семестрде не таңдаған дұрыс: тағылымдама ма, әлде өз жобасы бар курс па?",
      A: "Толық емес күндік тағылымдама",
      B: "Онлайн-курс + жеке жоба",
    },
    {
      label: "Магистратура ма, жұмыс па",
      question: "Бакалавриаттан кейін магистратураға түскен дұрыс па, әлде бірден жұмысқа шыққан дұрыс па?",
      A: "Магистратура",
      B: "Junior маман ретінде жұмыс",
    },
    {
      label: "Шетелде ме, елде ме",
      question: "Шетелдегі алмасу бағдарламасына өтінім берейін бе, әлде қалып, өз мамандығымды тереңдетейін бе?",
      A: "Алмасу семестрі",
      B: "Өз университетімдегі мамандандырылған курстар",
    },
  ],
};

export function labTemplates(locale: Locale): LabTemplate[] {
  return SHAPES.map((shape, i) => {
    const tx = TEXT[locale][i];
    return {
      id: shape.id,
      label: tx.label,
      question: tx.question,
      A: { ...shape.A, demands: [...shape.A.demands], title: tx.A },
      B: { ...shape.B, demands: [...shape.B.demands], title: tx.B },
    };
  });
}
