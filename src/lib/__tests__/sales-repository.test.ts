import { beforeEach, describe, expect, it } from "vitest";
import {
  createSalesSampleData,
  type Sale,
  type SalesDataset,
} from "@/lib/sales";
import {
  DEMO_SALES_DATA_STORAGE_KEY,
  DEMO_SALES_DATA_VERSION,
  DemoSalesRepository,
  type SalesMutationActor,
} from "@/lib/sales-repository";
import { projectSalesDataset } from "@/lib/sales-data-context";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

function adminActor(data: SalesDataset): SalesMutationActor {
  return {
    userId: "demo-user-admin",
    userName: "佐倉 ひなた",
    role: "admin",
    organizationId: data.organization.id,
    staffId: data.staff[0].id,
  };
}

describe("DemoSalesRepository", () => {
  let seed: SalesDataset;
  let storage: MemoryStorage;
  let repository: DemoSalesRepository;
  let actor: SalesMutationActor;

  beforeEach(() => {
    seed = createSalesSampleData();
    storage = new MemoryStorage();
    repository = new DemoSalesRepository(storage, undefined, () => seed);
    actor = adminActor(seed);
  });

  it("stores a versioned, browser-local dataset without modifying the seed", async () => {
    const snapshot = await repository.getSnapshot();
    const persisted = JSON.parse(
      storage.getItem(DEMO_SALES_DATA_STORAGE_KEY) ?? "null",
    ) as { version: number; data: SalesDataset };

    expect(snapshot.sales).toHaveLength(194);
    expect(persisted.version).toBe(DEMO_SALES_DATA_VERSION);
    expect(persisted.data.organization.id).toBe(seed.organization.id);

    snapshot.organization.name = "呼び出し元による変更";
    expect((await repository.getSnapshot()).organization.name).toBe(
      seed.organization.name,
    );
  });

  it("recalculates money, persists edits, and records the audit atomically in local data", async () => {
    const original = seed.sales.find((sale) => sale.status === "confirmed");
    expect(original).toBeDefined();
    const firstItem = original!.items[0];
    const input: Sale = {
      ...original!,
      memo: "デモ編集の確認",
      items: original!.items.map((item, index) =>
        index === 0
          ? {
              ...item,
              quantity: item.quantity + 1,
              subtotalYen: 0,
              taxableAmountYen: 0,
              taxYen: 0,
              totalYen: 0,
            }
          : item,
      ),
      subtotalYen: 0,
      taxableAmountYen: 0,
      taxYen: 0,
      totalYen: 0,
    };

    const saved = await repository.saveSale(input, actor);

    expect(saved.items[0].subtotalYen).toBe(
      (firstItem.quantity + 1) * firstItem.unitPriceYen,
    );
    expect(saved.totalYen).toBe(
      saved.items.reduce((sum, item) => sum + item.totalYen, 0),
    );
    const reopened = new DemoSalesRepository(storage);
    const persisted = await reopened.getSnapshot();
    expect(persisted.sales.find((sale) => sale.id === saved.id)?.memo).toBe(
      "デモ編集の確認",
    );
    expect(persisted.auditLogs[0]).toMatchObject({
      action: "update",
      entityType: "sale",
      entityId: saved.id,
    });
  });

  it("keeps cancellation history and creates an independent pending duplicate", async () => {
    const original = seed.sales.find((sale) => sale.status === "confirmed")!;
    const cancelled = await repository.cancelSale(
      original.id,
      "入力誤りのため",
      actor,
    );
    const duplicate = await repository.duplicateSale(cancelled.id, actor);
    const snapshot = await repository.getSnapshot();

    expect(cancelled).toMatchObject({
      status: "cancelled",
      cancellationReason: "入力誤りのため",
      cancelledBy: actor.userId,
    });
    expect(duplicate.id).not.toBe(original.id);
    expect(duplicate.status).toBe("pending");
    expect(duplicate.refundedAmountYen).toBe(0);
    expect(duplicate.items.every((item) => item.saleId === duplicate.id)).toBe(
      true,
    );
    expect(snapshot.auditLogs.some((log) => log.action === "cancel")).toBe(
      true,
    );
  });

  it("allows the normal pending-to-confirmed transition and rejects other inline transitions", async () => {
    const pending = seed.sales.find((sale) => sale.status === "pending")!;
    const confirmed = await repository.saveSale(
      { ...pending, status: "confirmed" },
      actor,
    );
    expect(confirmed.status).toBe("confirmed");

    await expect(
      repository.saveSale(
        { ...confirmed, status: "cancelled", cancellationReason: "不正な経路" },
        actor,
      ),
    ).rejects.toThrow("専用の操作");
  });

  it("keeps a registered transaction in its original store scope", async () => {
    const original = seed.sales.find((sale) =>
      sale.status === "confirmed" && sale.items.length <= 2
    )!;
    const destination = seed.locations.find((item) =>
      item.id !== original.locationId
    )!;

    await expect(
      repository.saveSale({ ...original, locationId: destination.id }, actor),
    ).rejects.toThrow("店舗は変更できません");
    await expect(
      repository.saveSale({ ...original, locationId: "all" }, actor),
    ).rejects.toThrow("実店舗");
  });

  it("rejects viewer mutations and restores the deterministic demo seed", async () => {
    const viewer: SalesMutationActor = {
      ...actor,
      userId: "demo-user-viewer",
      userName: "森川 凛",
      role: "viewer",
      staffId: undefined,
    };
    const product = { ...seed.products[0], name: "変更不可" };

    await expect(repository.saveProduct(product, viewer)).rejects.toThrow(
      "権限がありません",
    );

    await repository.saveProduct(
      { ...seed.products[0], name: "一時的な変更" },
      actor,
    );
    expect((await repository.getSnapshot()).products[0].name).toBe(
      "一時的な変更",
    );

    const restored = await repository.reset();
    expect(restored.products.find((item) => item.id === seed.products[0].id)?.name)
      .toBe(seed.products[0].name);
  });

  it("projects demo data to the same row-level scope as Firestore", () => {
    const generalUser: SalesMutationActor = {
      userId: "demo-user-user",
      userName: "小森 つばさ",
      role: "user",
      organizationId: seed.organization.id,
      allowedLocationIds: ["location-3"],
      staffId: "staff-003",
    };
    const visible = projectSalesDataset(seed, generalUser);

    expect(visible.sales.length).toBeGreaterThan(0);
    expect(
      visible.sales.every(
        (sale) =>
          sale.organizationId === seed.organization.id &&
          sale.locationId === "location-3" &&
          sale.staffId === "staff-003",
      ),
    ).toBe(true);
    expect(visible.auditLogs).toEqual([]);
    expect(visible.goals).toEqual([]);

    for (const customer of visible.customers) {
      const customerSales = visible.sales.filter(
        (sale) =>
          sale.customerId === customer.id &&
          (sale.status === "confirmed" || sale.status === "partially_refunded"),
      );
      const total = customerSales.reduce(
        (sum, sale) => sum + sale.totalYen - sale.refundedAmountYen,
        0,
      );
      expect(customer.purchaseCount).toBe(customerSales.length);
      expect(customer.totalSalesYen).toBe(total);
    }
  });

  it("redacts the previous tenant while authentication scope is changing", () => {
    const otherTenantActor: SalesMutationActor = {
      ...actor,
      userId: "other-user",
      organizationId: "org-other",
    };

    const visible = projectSalesDataset(seed, otherTenantActor);

    expect(visible.organization).toMatchObject({
      id: "org-other",
      organizationId: "org-other",
      name: "読み込み中",
      isActive: false,
    });
    expect(visible.organization.name).not.toBe(seed.organization.name);
    expect(visible.sales).toEqual([]);
    expect(visible.customers).toEqual([]);
  });
});
