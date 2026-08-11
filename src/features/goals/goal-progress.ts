import { filterSales, netSalesYen } from "@/lib/sales";
import type {
  DateRange,
  GoalPeriodType,
  GoalTargetType,
  Sale,
  SalesGoal,
} from "@/lib/sales";

const JST_OFFSET_MS = 9 * 60 * 60 * 1_000;
const DAY_MS = 24 * 60 * 60 * 1_000;

interface CalendarMonth {
  year: number;
  month: number;
}

export interface OrganizationTargetResolution {
  targetYen: number;
  source: "monthly" | "yearly" | "prorated-monthly" | "none";
  description: string;
  coveredDays: number;
  totalDays: number;
}

function jstCalendarMonth(timestamp: number): CalendarMonth {
  const shifted = new Date(timestamp + JST_OFFSET_MS);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() };
}

function jstCalendarDay(timestamp: number): { year: number; month: number; day: number } {
  const shifted = new Date(timestamp + JST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
  };
}

function jstTimestamp(
  year: number,
  month: number,
  day: number,
  endOfDay = false,
): number {
  return Date.UTC(
    year,
    month,
    day,
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 999 : 0,
  ) - JST_OFFSET_MS;
}

function monthKey({ year, month }: CalendarMonth): string {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

function normalizedMonth(year: number, month: number): CalendarMonth {
  const normalized = new Date(Date.UTC(year, month, 1));
  return { year: normalized.getUTCFullYear(), month: normalized.getUTCMonth() };
}

function nextMonth(value: CalendarMonth): CalendarMonth {
  return normalizedMonth(value.year, value.month + 1);
}

function daySerial(timestamp: number): number {
  const parts = jstCalendarDay(timestamp);
  return Math.floor(Date.UTC(parts.year, parts.month, parts.day) / DAY_MS);
}

function validRange(range: DateRange): { start: number; end: number } | null {
  const start = new Date(range.start).getTime();
  const end = new Date(range.end).getTime();
  return Number.isFinite(start) && Number.isFinite(end) && start <= end
    ? { start, end }
    : null;
}

function latestMatchingGoal(
  goals: readonly SalesGoal[],
  organizationId: string,
  periodType: GoalPeriodType,
  periodKey: string,
): SalesGoal | undefined {
  return goals
    .filter((goal) => goal.isActive
      && goal.targetType === "organization"
      && goal.targetId === organizationId
      && goal.periodType === periodType
      && goal.periodKey === periodKey)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
}

export function rangeForGoal(
  periodType: GoalPeriodType,
  periodKey: string,
): DateRange | null {
  if (periodType === "monthly" && /^\d{4}-(0[1-9]|1[0-2])$/.test(periodKey)) {
    const [year, monthNumber] = periodKey.split("-").map(Number);
    const month = monthNumber - 1;
    const following = nextMonth({ year, month });
    return {
      start: new Date(jstTimestamp(year, month, 1)).toISOString(),
      end: new Date(jstTimestamp(following.year, following.month, 1) - 1).toISOString(),
    };
  }
  if (periodType === "yearly" && /^\d{4}$/.test(periodKey)) {
    const year = Number(periodKey);
    return {
      start: new Date(jstTimestamp(year, 0, 1)).toISOString(),
      end: new Date(jstTimestamp(year + 1, 0, 1) - 1).toISOString(),
    };
  }
  return null;
}

export function actualSalesYenForTarget(
  sales: readonly Sale[],
  targetType: GoalTargetType,
  targetId: string,
  range: DateRange,
): number {
  return filterSales(sales, { dateRange: range })
    .filter((sale) => targetType === "organization"
      || (targetType === "location" ? sale.locationId === targetId : sale.staffId === targetId))
    .reduce((sum, sale) => sum + netSalesYen(sale), 0);
}

export function actualSalesYenForGoal(sales: readonly Sale[], goal: SalesGoal): number {
  const range = rangeForGoal(goal.periodType, goal.periodKey);
  return range
    ? actualSalesYenForTarget(sales, goal.targetType, goal.targetId, range)
    : 0;
}

export function hasDuplicateGoal(
  goals: readonly SalesGoal[],
  candidate: Pick<SalesGoal, "targetType" | "targetId" | "periodType" | "periodKey">,
  excludedGoalId?: string,
): boolean {
  return goals.some((goal) => goal.id !== excludedGoalId
    && goal.targetType === candidate.targetType
    && goal.targetId === candidate.targetId
    && goal.periodType === candidate.periodType
    && goal.periodKey === candidate.periodKey);
}

export function resolveOrganizationTarget(
  goals: readonly SalesGoal[],
  organizationId: string,
  range: DateRange,
): OrganizationTargetResolution {
  const parsed = validRange(range);
  if (!parsed) {
    return {
      targetYen: 0,
      source: "none",
      description: "集計期間が不正なため、売上目標を算出できません。",
      coveredDays: 0,
      totalDays: 0,
    };
  }

  const startMonth = jstCalendarMonth(parsed.start);
  const endMonth = jstCalendarMonth(parsed.end);
  const startDay = daySerial(parsed.start);
  const endDay = daySerial(parsed.end);
  const totalDays = endDay - startDay + 1;
  const startOfMonth = jstTimestamp(startMonth.year, startMonth.month, 1);
  const followingMonth = nextMonth(startMonth);
  const endOfMonth = jstTimestamp(followingMonth.year, followingMonth.month, 1) - 1;
  const isFullMonth = startMonth.year === endMonth.year
    && startMonth.month === endMonth.month
    && parsed.start === startOfMonth
    && parsed.end === endOfMonth;

  if (isFullMonth) {
    const key = monthKey(startMonth);
    const goal = latestMatchingGoal(goals, organizationId, "monthly", key);
    return goal
      ? {
          targetYen: goal.targetYen,
          source: "monthly",
          description: `${key}の組織月間目標を使用しています。`,
          coveredDays: totalDays,
          totalDays,
        }
      : {
          targetYen: 0,
          source: "none",
          description: `${key}の組織月間目標は未設定です。`,
          coveredDays: 0,
          totalDays,
        };
  }

  const startOfYear = jstTimestamp(startMonth.year, 0, 1);
  const endOfYear = jstTimestamp(startMonth.year + 1, 0, 1) - 1;
  const isFullYear = startMonth.year === endMonth.year
    && parsed.start === startOfYear
    && parsed.end === endOfYear;

  if (isFullYear) {
    const key = String(startMonth.year);
    const goal = latestMatchingGoal(goals, organizationId, "yearly", key);
    return goal
      ? {
          targetYen: goal.targetYen,
          source: "yearly",
          description: `${key}年の組織年間目標を使用しています。`,
          coveredDays: totalDays,
          totalDays,
        }
      : {
          targetYen: 0,
          source: "none",
          description: `${key}年の組織年間目標は未設定です。`,
          coveredDays: 0,
          totalDays,
        };
  }

  let current = startMonth;
  let coveredDays = 0;
  let exactTarget = 0;
  while (current.year < endMonth.year
    || (current.year === endMonth.year && current.month <= endMonth.month)) {
    const following = nextMonth(current);
    const firstDay = Math.floor(Date.UTC(current.year, current.month, 1) / DAY_MS);
    const nextFirstDay = Math.floor(Date.UTC(following.year, following.month, 1) / DAY_MS);
    const lastDay = nextFirstDay - 1;
    const overlapDays = Math.max(0, Math.min(endDay, lastDay) - Math.max(startDay, firstDay) + 1);
    const goal = latestMatchingGoal(goals, organizationId, "monthly", monthKey(current));
    if (goal && overlapDays > 0) {
      const daysInMonth = nextFirstDay - firstDay;
      exactTarget += goal.targetYen * overlapDays / daysInMonth;
      coveredDays += overlapDays;
    }
    current = following;
  }

  if (coveredDays === 0) {
    return {
      targetYen: 0,
      source: "none",
      description: "対象期間に重なる組織月間目標は未設定です。",
      coveredDays,
      totalDays,
    };
  }

  const coverage = coveredDays === totalDays
    ? "対象期間の全日"
    : `${totalDays}日中${coveredDays}日`;
  return {
    targetYen: Math.round(exactTarget),
    source: "prorated-monthly",
    description: `重なる月の組織月間目標を「対象日数 ÷ 月の日数」で按分しています（${coverage}に目標設定あり）。`,
    coveredDays,
    totalDays,
  };
}
