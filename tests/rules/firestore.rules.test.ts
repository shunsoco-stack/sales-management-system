// @vitest-environment node

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const emulatorAddress = process.env.FIRESTORE_EMULATOR_HOST;
const [emulatorHost = "127.0.0.1", emulatorPort = "8081"] =
  emulatorAddress?.split(":") ?? [];
const projectId = "demo-sales-management-rules-test";
const describeWithEmulator = emulatorAddress ? describe : describe.skip;
const timestamp = "2026-08-08T03:00:00.000Z";

function auditFields(
  id: string,
  organizationId: string,
  locationId: string,
  actor: string,
) {
  return {
    id,
    organizationId,
    locationId,
    createdAt: timestamp,
    createdBy: actor,
    updatedAt: timestamp,
    updatedBy: actor,
  };
}

function organization(id: string, ownerId: string) {
  return {
    ...auditFields(id, id, "all", ownerId),
    name: `${id}事業所`,
    ownerId,
    timezone: "Asia/Tokyo",
    currency: "JPY",
    taxRoundingMode: "floor",
    isActive: true,
    isDemo: false,
  };
}

function location(id: string, organizationId: string, actor: string) {
  return {
    ...auditFields(id, organizationId, id, actor),
    code: id.toUpperCase(),
    name: `${id}店`,
    address: "",
    phone: "",
    timezone: "Asia/Tokyo",
    isActive: true,
  };
}

function user(
  id: string,
  organizationId: string,
  role: "admin" | "manager" | "user" | "viewer",
  locationIds: string[],
  staffId?: string,
) {
  const profile: Record<string, unknown> = {
    ...auditFields(id, organizationId, locationIds[0], "admin-a"),
    userId: id,
    name: id,
    displayName: id,
    email: `${id}@example.invalid`,
    role,
    allowedLocationIds: locationIds,
    isActive: true,
  };
  if (staffId) profile.staffId = staffId;
  return profile;
}

function saleItem(
  saleId: string,
  organizationId: string,
  locationId: string,
  actor: string,
) {
  return {
    ...auditFields(`${saleId}-item-1`, organizationId, locationId, actor),
    saleId,
    productId: "product-1",
    productName: "テスト商品",
    productCode: "TEST-1",
    categoryId: "category-1",
    productType: "product",
    quantity: 2,
    unitPriceYen: 1000,
    unitCostYen: 400,
    subtotalYen: 2000,
    discountYen: 0,
    taxableAmountYen: 2000,
    taxRateBps: 1000,
    taxYen: 200,
    totalYen: 2200,
  };
}

function sale(
  id: string,
  actor = "admin-a",
  organizationId = "org-a",
  locationId = organizationId === "org-a" ? "loc-a" : "loc-b",
  status: "confirmed" | "pending" | "cancelled" = "confirmed",
  staffId = "staff-a",
) {
  return {
    ...auditFields(id, organizationId, locationId, actor),
    transactionNumber: `SL-20260808-${id}`,
    soldAt: timestamp,
    customerId: "customer-1",
    customerName: "架空 顧客",
    staffId,
    staffName: "架空 担当",
    items: [saleItem(id, organizationId, locationId, actor)],
    subtotalYen: 2000,
    discountYen: 0,
    taxableAmountYen: 2000,
    taxYen: 200,
    totalYen: 2200,
    refundedAmountYen: 0,
    paymentMethodId: "payment-cash",
    paymentMethodName: "現金",
    saleType: "retail",
    status,
    memo: "",
    lastAuditId: `seed-audit-${id}`,
    ...(status === "cancelled"
      ? {
          cancelledAt: timestamp,
          cancelledBy: actor,
          cancellationReason: "登録内容の訂正",
        }
      : {}),
  };
}

function auditLog(
  id: string,
  saleId: string,
  actor: string,
  action: "create" | "update" | "cancel" | "refund" = "create",
) {
  return {
    ...auditFields(id, "org-a", "loc-a", actor),
    action,
    entityType: "sale",
    entityId: saleId,
    actorName: actor,
    summary: `${saleId}を操作しました。`,
    ...(action === "create" ? {} : { before: { updatedAt: timestamp } }),
    after: { status: action === "cancel" ? "cancelled" : "confirmed" },
  };
}

describeWithEmulator("sales-management Firestore rules", () => {
  let environment: RulesTestEnvironment;

  beforeAll(async () => {
    environment = await initializeTestEnvironment({
      projectId,
      firestore: {
        host: emulatorHost,
        port: Number(emulatorPort),
        rules: readFileSync(join(process.cwd(), "firestore.rules"), "utf8"),
      },
    });
  });

  beforeEach(async () => {
    await environment.clearFirestore();
    await environment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await Promise.all([
        setDoc(doc(db, "organizations", "org-a"), organization("org-a", "admin-a")),
        setDoc(doc(db, "organizations", "org-b"), organization("org-b", "admin-b")),
        setDoc(doc(db, "locations", "loc-a"), location("loc-a", "org-a", "admin-a")),
        setDoc(doc(db, "locations", "loc-b"), location("loc-b", "org-b", "admin-b")),
        setDoc(doc(db, "users", "admin-a"), user("admin-a", "org-a", "admin", ["loc-a"], "staff-a")),
        setDoc(doc(db, "users", "manager-a"), user("manager-a", "org-a", "manager", ["loc-a"], "staff-manager")),
        setDoc(doc(db, "users", "user-a"), user("user-a", "org-a", "user", ["loc-a"], "staff-a")),
        setDoc(doc(db, "users", "viewer-a"), user("viewer-a", "org-a", "viewer", ["loc-a"])),
        setDoc(doc(db, "users", "admin-b"), user("admin-b", "org-b", "admin", ["loc-b"], "staff-b")),
        setDoc(doc(db, "sales", "sale-active"), sale("sale-active")),
        setDoc(doc(db, "sales", "sale-other-staff"), sale("sale-other-staff", "admin-a", "org-a", "loc-a", "confirmed", "staff-other")),
        setDoc(doc(db, "sales", "sale-cancelled"), sale("sale-cancelled", "admin-a", "org-a", "loc-a", "cancelled")),
        setDoc(doc(db, "sales", "sale-b"), sale("sale-b", "admin-b", "org-b", "loc-b", "confirmed", "staff-b")),
      ]);
    });
  });

  afterAll(async () => {
    await environment?.cleanup();
  });

  it("denies unauthenticated and cross-organization reads", async () => {
    await assertFails(
      getDoc(doc(environment.unauthenticatedContext().firestore(), "sales", "sale-active")),
    );
    await assertFails(
      getDoc(doc(environment.authenticatedContext("admin-b").firestore(), "sales", "sale-active")),
    );
  });

  it("keeps viewers read-only", async () => {
    const db = environment.authenticatedContext("viewer-a").firestore();
    await assertSucceeds(getDoc(doc(db, "sales", "sale-active")));
    await assertFails(
      updateDoc(doc(db, "sales", "sale-active"), {
        memo: "変更",
        updatedAt: "2026-08-08T04:00:00.000Z",
        updatedBy: "viewer-a",
      }),
    );
  });

  it("authorizes the repository-shaped own-sales query but rejects a broad user query", async () => {
    const db = environment.authenticatedContext("user-a").firestore();
    const ownSales = query(
      collection(db, "sales"),
      where("organizationId", "==", "org-a"),
      where("locationId", "in", ["loc-a"]),
      where("staffId", "==", "staff-a"),
      orderBy("soldAt", "desc"),
      limit(1000),
    );
    const snapshot = await assertSucceeds(getDocs(ownSales));
    expect(snapshot.docs.every((entry) => entry.data().staffId === "staff-a"))
      .toBe(true);

    const broadSales = query(
      collection(db, "sales"),
      where("organizationId", "==", "org-a"),
      where("locationId", "in", ["loc-a"]),
      orderBy("soldAt", "desc"),
      limit(1000),
    );
    await assertFails(getDocs(broadSales));
  });

  it("lets a general user create and edit only assigned-staff sales", async () => {
    const db = environment.authenticatedContext("user-a").firestore();
    const ownSaleId = "sale-user-created";
    const ownAuditId = "audit-user-created";
    const createBatch = writeBatch(db);
    createBatch.set(doc(db, "sales", ownSaleId), {
      ...sale(ownSaleId, "user-a", "org-a", "loc-a", "confirmed", "staff-a"),
      lastAuditId: ownAuditId,
    });
    createBatch.set(
      doc(db, "auditLogs", ownAuditId),
      auditLog(ownAuditId, ownSaleId, "user-a"),
    );
    await assertSucceeds(createBatch.commit());

    const editAuditId = "audit-user-edit";
    const editBatch = writeBatch(db);
    editBatch.set(doc(db, "sales", "sale-active"), {
      ...sale("sale-active"),
      memo: "本人担当のメモ更新",
      updatedAt: "2026-08-08T04:00:00.000Z",
      updatedBy: "user-a",
      lastAuditId: editAuditId,
    });
    editBatch.set(
      doc(db, "auditLogs", editAuditId),
      auditLog(editAuditId, "sale-active", "user-a", "update"),
    );
    await assertSucceeds(editBatch.commit());

    const otherSaleId = "sale-user-other-staff";
    const otherAuditId = "audit-user-other-staff";
    const otherBatch = writeBatch(db);
    otherBatch.set(doc(db, "sales", otherSaleId), {
      ...sale(otherSaleId, "user-a", "org-a", "loc-a", "confirmed", "staff-other"),
      lastAuditId: otherAuditId,
    });
    otherBatch.set(
      doc(db, "auditLogs", otherAuditId),
      auditLog(otherAuditId, otherSaleId, "user-a"),
    );
    await assertFails(otherBatch.commit());
  });

  it("allows a valid sale and its audit log only in the same batch", async () => {
    const db = environment.authenticatedContext("admin-a").firestore();
    const saleId = "sale-new";
    const auditId = "audit-sale-new";
    const value = {
      ...sale(saleId),
      lastAuditId: auditId,
    };
    const batch = writeBatch(db);
    batch.set(doc(db, "sales", saleId), value);
    batch.set(doc(db, "auditLogs", auditId), auditLog(auditId, saleId, "admin-a"));
    await assertSucceeds(batch.commit());
    expect((await getDoc(doc(db, "sales", saleId))).exists()).toBe(true);
  });

  it("rejects the global location sentinel for sales", async () => {
    const db = environment.authenticatedContext("admin-a").firestore();
    const saleId = "sale-global-location";
    const auditId = "audit-global-location";
    const value = sale(saleId);
    const batch = writeBatch(db);
    batch.set(doc(db, "sales", saleId), {
      ...value,
      locationId: "all",
      items: value.items.map((item) => ({ ...item, locationId: "all" })),
      lastAuditId: auditId,
    });
    batch.set(doc(db, "auditLogs", auditId), {
      ...auditLog(auditId, saleId, "admin-a"),
      locationId: "all",
    });
    await assertFails(batch.commit());
  });

  it("rejects sale writes without the bound audit record", async () => {
    const db = environment.authenticatedContext("admin-a").firestore();
    await assertFails(
      setDoc(doc(db, "sales", "sale-no-audit"), {
        ...sale("sale-no-audit"),
        lastAuditId: "missing-audit",
      }),
    );
  });

  it("rejects an audit record bound to a different target", async () => {
    const db = environment.authenticatedContext("admin-a").firestore();
    const saleId = "sale-wrong-audit-target";
    const auditId = "audit-wrong-target";
    const batch = writeBatch(db);
    batch.set(doc(db, "sales", saleId), {
      ...sale(saleId),
      lastAuditId: auditId,
    });
    batch.set(
      doc(db, "auditLogs", auditId),
      auditLog(auditId, "another-sale", "admin-a"),
    );
    await assertFails(batch.commit());
  });

  it("can safely add the first audit binding to a legacy seeded sale", async () => {
    const legacyId = "sale-legacy-seed";
    const legacy = { ...sale(legacyId) } as Record<string, unknown>;
    delete legacy.lastAuditId;
    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "sales", legacyId), legacy);
    });

    const db = environment.authenticatedContext("admin-a").firestore();
    const auditId = "audit-legacy-update";
    const batch = writeBatch(db);
    batch.set(doc(db, "sales", legacyId), {
      ...legacy,
      memo: "初回更新",
      updatedAt: "2026-08-08T04:00:00.000Z",
      updatedBy: "admin-a",
      lastAuditId: auditId,
    });
    batch.set(
      doc(db, "auditLogs", auditId),
      auditLog(auditId, legacyId, "admin-a", "update"),
    );
    await assertSucceeds(batch.commit());
  });

  it("allows a legitimate audited quantity and amount edit", async () => {
    const db = environment.authenticatedContext("manager-a").firestore();
    const auditId = "audit-valid-money-edit";
    const editedItem = {
      ...saleItem("sale-active", "org-a", "loc-a", "admin-a"),
      quantity: 3,
      subtotalYen: 3000,
      taxableAmountYen: 3000,
      taxYen: 300,
      totalYen: 3300,
      updatedAt: "2026-08-08T04:00:00.000Z",
      updatedBy: "manager-a",
    };
    const batch = writeBatch(db);
    batch.set(doc(db, "sales", "sale-active"), {
      ...sale("sale-active"),
      items: [editedItem],
      subtotalYen: 3000,
      taxableAmountYen: 3000,
      taxYen: 300,
      totalYen: 3300,
      updatedAt: "2026-08-08T04:00:00.000Z",
      updatedBy: "manager-a",
      lastAuditId: auditId,
    });
    batch.set(
      doc(db, "auditLogs", auditId),
      auditLog(auditId, "sale-active", "manager-a", "update"),
    );
    await assertSucceeds(batch.commit());

    const staleAuditId = "audit-stale-edit";
    const staleBatch = writeBatch(db);
    staleBatch.set(doc(db, "sales", "sale-active"), {
      ...sale("sale-active"),
      items: [editedItem],
      subtotalYen: 3000,
      taxableAmountYen: 3000,
      taxYen: 300,
      totalYen: 3300,
      memo: "古い版からの上書き",
      updatedAt: "2026-08-08T05:00:00.000Z",
      updatedBy: "manager-a",
      lastAuditId: staleAuditId,
    });
    staleBatch.set(
      doc(db, "auditLogs", staleAuditId),
      auditLog(staleAuditId, "sale-active", "manager-a", "update"),
    );
    await assertFails(staleBatch.commit());
  });

  it("keeps a registered transaction in its original location", async () => {
    const db = environment.authenticatedContext("admin-a").firestore();

    const invalidAuditId = "audit-invalid-location-move";
    const invalidBatch = writeBatch(db);
    invalidBatch.set(doc(db, "sales", "sale-active"), {
      ...sale("sale-active"),
      locationId: "loc-a-2",
      updatedAt: "2026-08-08T04:00:00.000Z",
      updatedBy: "admin-a",
      lastAuditId: invalidAuditId,
    });
    invalidBatch.set(
      doc(db, "auditLogs", invalidAuditId),
      {
        ...auditLog(invalidAuditId, "sale-active", "admin-a", "update"),
        locationId: "loc-a-2",
      },
    );
    await assertFails(invalidBatch.commit());

  });

  it("allows four independently audited sales in one import-sized batch", async () => {
    const db = environment.authenticatedContext("admin-a").firestore();
    const batch = writeBatch(db);

    for (let index = 1; index <= 4; index += 1) {
      const saleId = `sale-import-${index}`;
      const auditId = `audit-import-${index}`;
      batch.set(doc(db, "sales", saleId), {
        ...sale(saleId),
        lastAuditId: auditId,
      });
      batch.set(
        doc(db, "auditLogs", auditId),
        auditLog(auditId, saleId, "admin-a"),
      );
    }

    await assertSucceeds(batch.commit());
  });

  it("rejects invalid and internally inconsistent monetary values", async () => {
    const db = environment.authenticatedContext("admin-a").firestore();
    const saleId = "sale-invalid-money";
    const auditId = "audit-invalid-money";
    const invalidSale = {
      ...sale(saleId),
      taxYen: 300,
      totalYen: 2300,
      lastAuditId: auditId,
    };
    const batch = writeBatch(db);
    batch.set(doc(db, "sales", saleId), invalidSale);
    batch.set(doc(db, "auditLogs", auditId), auditLog(auditId, saleId, "admin-a"));
    await assertFails(batch.commit());
  });

  it("rejects a line whose multiplication or floor-tax result is forged", async () => {
    const db = environment.authenticatedContext("admin-a").firestore();

    for (const [suffix, forgedItem] of [
      [
        "subtotal",
        {
          ...saleItem("sale-forged-subtotal", "org-a", "loc-a", "admin-a"),
          unitPriceYen: 900,
        },
      ],
      [
        "tax",
        {
          ...saleItem("sale-forged-tax", "org-a", "loc-a", "admin-a"),
          quantity: 1,
          unitPriceYen: 1001,
          subtotalYen: 1001,
          taxableAmountYen: 1001,
          taxYen: 101,
          totalYen: 1102,
        },
      ],
    ] as const) {
      const saleId = `sale-forged-${suffix}`;
      const auditId = `audit-forged-${suffix}`;
      const value = {
        ...sale(saleId),
        items: [forgedItem],
        subtotalYen: forgedItem.subtotalYen,
        discountYen: forgedItem.discountYen,
        taxableAmountYen: forgedItem.taxableAmountYen,
        taxYen: forgedItem.taxYen,
        totalYen: forgedItem.totalYen,
        lastAuditId: auditId,
      };
      const batch = writeBatch(db);
      batch.set(doc(db, "sales", saleId), value);
      batch.set(
        doc(db, "auditLogs", auditId),
        auditLog(auditId, saleId, "admin-a"),
      );
      await assertFails(batch.commit());
    }
  });

  it("allows a lifecycle-only cancellation but rejects simultaneous money changes", async () => {
    const db = environment.authenticatedContext("admin-a").firestore();
    const validAuditId = "audit-valid-cancel";
    const validCancellation = {
      ...sale("sale-active"),
      status: "cancelled",
      cancelledAt: "2026-08-08T04:00:00.000Z",
      cancelledBy: "admin-a",
      cancellationReason: "登録内容の訂正",
      updatedAt: "2026-08-08T04:00:00.000Z",
      lastAuditId: validAuditId,
    };
    const validBatch = writeBatch(db);
    validBatch.set(doc(db, "sales", "sale-active"), validCancellation);
    validBatch.set(
      doc(db, "auditLogs", validAuditId),
      auditLog(validAuditId, "sale-active", "admin-a", "cancel"),
    );
    await assertSucceeds(validBatch.commit());

    const tamperSaleId = "sale-cancel-tamper";
    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), "sales", tamperSaleId),
        sale(tamperSaleId),
      );
    });
    const tamperAuditId = "audit-cancel-tamper";
    const changedItem = {
      ...saleItem(tamperSaleId, "org-a", "loc-a", "admin-a"),
      quantity: 3,
      subtotalYen: 3000,
      taxableAmountYen: 3000,
      taxYen: 300,
      totalYen: 3300,
    };
    const tamperedCancellation = {
      ...sale(tamperSaleId),
      items: [changedItem],
      subtotalYen: 3000,
      taxableAmountYen: 3000,
      taxYen: 300,
      totalYen: 3300,
      status: "cancelled",
      cancelledAt: "2026-08-08T04:00:00.000Z",
      cancelledBy: "admin-a",
      cancellationReason: "金額も変更",
      updatedAt: "2026-08-08T04:00:00.000Z",
      lastAuditId: tamperAuditId,
    };
    const tamperBatch = writeBatch(db);
    tamperBatch.set(doc(db, "sales", tamperSaleId), tamperedCancellation);
    tamperBatch.set(
      doc(db, "auditLogs", tamperAuditId),
      auditLog(tamperAuditId, tamperSaleId, "admin-a", "cancel"),
    );
    await assertFails(tamperBatch.commit());
  });

  it("allows only increasing cumulative refunds through partial to full refund", async () => {
    const db = environment.authenticatedContext("admin-a").firestore();
    const partialAuditId = "audit-partial-refund";
    const partial = {
      ...sale("sale-active"),
      status: "partially_refunded" as const,
      refundedAmountYen: 1000,
      updatedAt: "2026-08-08T04:00:00.000Z",
      updatedBy: "admin-a",
      lastAuditId: partialAuditId,
    };
    const partialBatch = writeBatch(db);
    partialBatch.set(doc(db, "sales", "sale-active"), partial);
    partialBatch.set(
      doc(db, "auditLogs", partialAuditId),
      auditLog(partialAuditId, "sale-active", "admin-a", "refund"),
    );
    await assertSucceeds(partialBatch.commit());

    const lowerAuditId = "audit-lower-refund";
    const lowerBatch = writeBatch(db);
    lowerBatch.set(doc(db, "sales", "sale-active"), {
      ...partial,
      refundedAmountYen: 500,
      updatedAt: "2026-08-08T05:00:00.000Z",
      lastAuditId: lowerAuditId,
    });
    lowerBatch.set(
      doc(db, "auditLogs", lowerAuditId),
      {
        ...auditLog(lowerAuditId, "sale-active", "admin-a", "refund"),
        before: { updatedAt: partial.updatedAt },
      },
    );
    await assertFails(lowerBatch.commit());

    const fullAuditId = "audit-full-refund";
    const fullBatch = writeBatch(db);
    fullBatch.set(doc(db, "sales", "sale-active"), {
      ...partial,
      status: "refunded",
      refundedAmountYen: partial.totalYen,
      updatedAt: "2026-08-08T06:00:00.000Z",
      lastAuditId: fullAuditId,
    });
    fullBatch.set(
      doc(db, "auditLogs", fullAuditId),
      {
        ...auditLog(fullAuditId, "sale-active", "admin-a", "refund"),
        before: { updatedAt: partial.updatedAt },
      },
    );
    await assertSucceeds(fullBatch.commit());
  });

  it("prevents organizationId tampering", async () => {
    const db = environment.authenticatedContext("admin-a").firestore();
    await assertFails(
      updateDoc(doc(db, "sales", "sale-active"), {
        organizationId: "org-b",
        updatedAt: "2026-08-08T04:00:00.000Z",
        updatedBy: "admin-a",
      }),
    );
  });

  it("does not allow a cancelled sale to be edited or reopened", async () => {
    const db = environment.authenticatedContext("admin-a").firestore();
    const auditId = "audit-reopen";
    const cancelled = sale(
      "sale-cancelled",
      "admin-a",
      "org-a",
      "loc-a",
      "cancelled",
    );
    const activeFields = { ...cancelled } as Record<string, unknown>;
    delete activeFields.cancelledAt;
    delete activeFields.cancelledBy;
    delete activeFields.cancellationReason;
    const reopened = {
      ...activeFields,
      status: "confirmed",
      lastAuditId: auditId,
      updatedAt: "2026-08-08T04:00:00.000Z",
    };
    const batch = writeBatch(db);
    batch.set(doc(db, "sales", "sale-cancelled"), reopened);
    batch.set(doc(db, "auditLogs", auditId), auditLog(auditId, "sale-cancelled", "admin-a", "update"));
    await assertFails(batch.commit());
  });

  it("prevents a user from escalating its own role", async () => {
    const db = environment.authenticatedContext("user-a").firestore();
    await assertFails(
      updateDoc(doc(db, "users", "user-a"), {
        role: "admin",
        updatedAt: "2026-08-08T04:00:00.000Z",
        updatedBy: "user-a",
      }),
    );
  });

  it("allows a manager to create a product only with its bound audit", async () => {
    const db = environment.authenticatedContext("manager-a").firestore();
    const productId = "product-audited";
    const auditId = "audit-product-audited";
    const batch = writeBatch(db);
    batch.set(doc(db, "products", productId), {
      ...auditFields(productId, "org-a", "loc-a", "manager-a"),
      code: "P-AUDIT",
      name: "監査対象商品",
      productType: "product",
      categoryId: "category-1",
      description: "",
      priceYen: 1200,
      costYen: 400,
      taxRateBps: 1000,
      isActive: true,
      lastAuditId: auditId,
    });
    batch.set(doc(db, "auditLogs", auditId), {
      ...auditFields(auditId, "org-a", "loc-a", "manager-a"),
      action: "create",
      entityType: "product",
      entityId: productId,
      actorName: "manager-a",
      summary: "商品を登録しました。",
    });
    await assertSucceeds(batch.commit());
  });

  it("requires an audit-bound batch for settings changes", async () => {
    const settingsId = "org-a";
    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "settings", settingsId), {
        ...auditFields(settingsId, "org-a", "all", "admin-a"),
        systemName: "売上管理システム",
        currency: "JPY",
        defaultTaxRateBp: 1000,
      });
    });
    const db = environment.authenticatedContext("admin-a").firestore();
    await assertFails(
      updateDoc(doc(db, "settings", settingsId), {
        defaultTaxRateBp: 800,
        updatedAt: "2026-08-08T04:00:00.000Z",
        updatedBy: "admin-a",
      }),
    );

    const auditId = "audit-settings-update";
    const batch = writeBatch(db);
    batch.set(doc(db, "settings", settingsId), {
      ...auditFields(settingsId, "org-a", "all", "admin-a"),
      systemName: "売上管理システム",
      currency: "JPY",
      defaultTaxRateBp: 800,
      updatedAt: "2026-08-08T04:00:00.000Z",
      updatedBy: "admin-a",
      lastAuditId: auditId,
    });
    batch.set(doc(db, "auditLogs", auditId), {
      ...auditFields(auditId, "org-a", "all", "admin-a"),
      action: "settings_change",
      entityType: "settings",
      entityId: settingsId,
      actorName: "admin-a",
      summary: "設定を変更しました。",
    });
    await assertSucceeds(batch.commit());
  });

  it("allows an atomic first organization bootstrap", async () => {
    const uid = "first-owner";
    const organizationId = `org-${uid}`;
    const locationId = `loc-${uid}`;
    const staffId = `staff-${uid}`;
    const db = environment.authenticatedContext(uid).firestore();
    const fields = auditFields("unused", organizationId, locationId, uid);
    const batch = writeBatch(db);
    batch.set(doc(db, "organizations", organizationId), {
      ...organization(organizationId, uid),
      id: organizationId,
      organizationId,
      locationId: "all",
    });
    batch.set(doc(db, "users", uid), {
      ...fields,
      id: uid,
      userId: uid,
      locationId,
      allowedLocationIds: [locationId],
      staffId,
      name: "初期 管理者",
      displayName: "初期 管理者",
      email: "first-owner@example.invalid",
      role: "admin",
      isActive: true,
    });
    batch.set(doc(db, "locations", locationId), {
      ...location(locationId, organizationId, uid),
      id: locationId,
    });
    batch.set(doc(db, "staff", staffId), {
      ...auditFields(staffId, organizationId, locationId, uid),
      name: "初期 管理者",
      email: "first-owner@example.invalid",
      department: "管理部",
      title: "管理者",
      role: "admin",
      monthlySalesTargetYen: 0,
      isActive: true,
    });
    batch.set(doc(db, "settings", organizationId), {
      ...auditFields(organizationId, organizationId, locationId, uid),
      systemName: "売上管理システム",
      locale: "ja-JP",
      timezone: "Asia/Tokyo",
      currency: "JPY",
      taxRoundingMode: "floor",
      defaultTaxRateBp: 1000,
      fiscalYearStartMonth: 1,
    });
    [
      ["cash", "現金"],
      ["credit_card", "クレジットカード"],
      ["qr", "QRコード決済"],
      ["electronic_money", "電子マネー"],
      ["bank_transfer", "銀行振込"],
      ["other", "その他"],
    ].forEach(([code, name], index) => {
      const id = `${organizationId}-${code}`;
      batch.set(doc(db, "paymentMethods", id), {
        ...auditFields(id, organizationId, locationId, uid),
        code,
        name,
        sortOrder: index + 1,
        isActive: true,
      });
    });
    [
      ["product", "商品"],
      ["service", "サービス"],
      ["other", "その他"],
    ].forEach(([code, name], index) => {
      const id = `${organizationId}-category-${code}`;
      batch.set(doc(db, "categories", id), {
        ...auditFields(id, organizationId, "all", uid),
        code,
        name,
        sortOrder: index + 1,
        isActive: true,
      });
    });
    await assertSucceeds(batch.commit());
  });
});
