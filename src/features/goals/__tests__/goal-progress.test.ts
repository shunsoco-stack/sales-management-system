import { describe, expect, it } from "vitest";
import { createSalesSampleData } from "@/lib/sales";
import type { SalesGoal } from "@/lib/sales";
import {
  actualSalesYenForGoal,
  hasDuplicateGoal,
  rangeForGoal,
  resolveOrganizationTarget,
} from "../goal-progress";

function goal(overrides: Partial<SalesGoal> = {}): SalesGoal {
  return {
    id: "goal-1",
    organizationId: "org-1",
    locationId: "all",
    targetType: "organization",
    targetId: "org-1",
    periodType: "monthly",
    periodKey: "2026-08",
    targetYen: 3_100_000,
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    createdBy: "user-1",
    updatedAt: "2026-01-01T00:00:00.000Z",
    updatedBy: "user-1",
    ...overrides,
  };
}

describe("goal progress", () => {
  it("uses the monthly organization goal for an exact month", () => {
    const range = rangeForGoal("monthly", "2026-08")!;
    const result = resolveOrganizationTarget([goal()], "org-1", range);

    expect(result).toMatchObject({
      targetYen: 3_100_000,
      source: "monthly",
      coveredDays: 31,
      totalDays: 31,
    });
  });

  it("uses the goal for the selected year instead of the current year", () => {
    const range = rangeForGoal("yearly", "2025")!;
    const result = resolveOrganizationTarget([
      goal({ id: "current", periodType: "yearly", periodKey: "2026", targetYen: 60_000_000 }),
      goal({ id: "previous", periodType: "yearly", periodKey: "2025", targetYen: 48_000_000 }),
    ], "org-1", range);

    expect(result).toMatchObject({ targetYen: 48_000_000, source: "yearly" });
  });

  it("prorates each overlapping monthly goal by calendar days", () => {
    const range = {
      start: "2026-07-30T15:00:00.000Z",
      end: "2026-08-01T14:59:59.999Z",
    };
    const result = resolveOrganizationTarget([
      goal({ id: "july", periodKey: "2026-07", targetYen: 3_100_000 }),
      goal({ id: "august", periodKey: "2026-08", targetYen: 3_100_000 }),
    ], "org-1", range);

    expect(result).toMatchObject({
      targetYen: 200_000,
      source: "prorated-monthly",
      coveredDays: 2,
      totalDays: 2,
    });
  });

  it("reports partial coverage when a crossing month has no goal", () => {
    const range = {
      start: "2026-07-30T15:00:00.000Z",
      end: "2026-08-01T14:59:59.999Z",
    };
    const result = resolveOrganizationTarget([goal()], "org-1", range);

    expect(result).toMatchObject({ targetYen: 100_000, coveredDays: 1, totalDays: 2 });
    expect(result.description).toContain("2日中1日");
  });

  it("prevents duplicate target and period while excluding the edited goal", () => {
    const existing = goal();
    const candidate = {
      targetType: existing.targetType,
      targetId: existing.targetId,
      periodType: existing.periodType,
      periodKey: existing.periodKey,
    };

    expect(hasDuplicateGoal([existing], candidate)).toBe(true);
    expect(hasDuplicateGoal([existing], candidate, existing.id)).toBe(false);
  });

  it("calculates goal actuals with the shared net-sales definition", () => {
    const data = createSalesSampleData();
    const organizationGoal = data.goals.find((item) => item.targetType === "organization" && item.periodType === "monthly")!;

    expect(actualSalesYenForGoal(data.sales, organizationGoal)).toBeGreaterThan(0);
  });
});
