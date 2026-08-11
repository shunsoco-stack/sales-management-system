import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, type DocumentData } from "firebase-admin/firestore";
import {
  ALL_LOCATIONS_ID,
  createSalesSampleData,
  netSalesYen,
  validateSalesDatasetReferences,
  type SalesDataset,
  type UserRole,
} from "../src/lib/sales";

interface SeedOptions {
  projectId: string;
  confirmProjectId?: string;
  emulator: boolean;
  dryRun: boolean;
  allowProduction: boolean;
  referenceDate?: Date;
}

interface PlannedWrite {
  collectionName: string;
  documentId: string;
  data: DocumentData;
}

const MAX_BATCH_WRITES = 400;
const SAFE_PROJECT_PREFIX = "demo-";

function stripUndefined(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => stripUndefined(item));
  }
  if (
    value &&
    typeof value === "object" &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, stripUndefined(item)]),
    );
  }
  return value;
}

function assertNoUndefined(value: unknown, path = "document"): void {
  if (value === undefined) {
    throw new Error(`seedに未定義値が残っています: ${path}`);
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertNoUndefined(item, `${path}[${index}]`)
    );
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      assertNoUndefined(item, `${path}.${key}`);
    }
  }
}

function usage(): string {
  return [
    "売上管理システム seed",
    "",
    "Dry run:",
    "  npm run seed -- --project demo-sales-management-local --dry-run",
    "",
    "Emulator write:",
    "  npm run seed -- --project demo-sales-management-local --emulator --confirm demo-sales-management-local",
    "",
    "Production/staging write (explicit opt-in required):",
    "  npm run seed -- --project your-project --confirm your-project --allow-production",
    "",
    "Options:",
    "  --reference-date 2026-08-08T12:00:00+09:00",
    "  --emulator       Firestore 127.0.0.1:8081 / Auth 127.0.0.1:9098",
    "  --dry-run        Validate and print counts without initializing Admin SDK",
  ].join("\n");
}

function optionValue(args: readonly string[], option: string): string | undefined {
  const index = args.indexOf(option);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${option} の値を指定してください。`);
  }
  return value;
}

function parseOptions(args: readonly string[]): SeedOptions {
  if (args.includes("--help") || args.includes("-h")) {
    console.info(usage());
    process.exit(0);
  }
  const projectId = optionValue(args, "--project")?.trim() || "";
  if (!projectId) {
    throw new Error("--project でFirebase Project IDを明示してください。\n\n" + usage());
  }
  const referenceValue = optionValue(args, "--reference-date");
  const referenceDate = referenceValue ? new Date(referenceValue) : undefined;
  if (referenceDate && !Number.isFinite(referenceDate.getTime())) {
    throw new Error("--reference-date は有効なISO日時で指定してください。");
  }
  const confirmProjectId = optionValue(args, "--confirm");
  return {
    projectId,
    confirmProjectId,
    emulator: args.includes("--emulator"),
    dryRun: args.includes("--dry-run") || !confirmProjectId,
    allowProduction: args.includes("--allow-production"),
    referenceDate,
  };
}

function assertWriteSafety(options: SeedOptions): void {
  if (options.dryRun) return;
  if (options.confirmProjectId !== options.projectId) {
    throw new Error(
      `書込には --confirm ${options.projectId} が必要です。Project IDを完全一致させてください。`,
    );
  }
  if (
    !options.projectId.startsWith(SAFE_PROJECT_PREFIX) &&
    !options.allowProduction
  ) {
    throw new Error(
      `${SAFE_PROJECT_PREFIX} で始まらないProjectへ投入するには --allow-production が必要です。`,
    );
  }
}

function validateDataset(dataset: SalesDataset): void {
  const referenceErrors = validateSalesDatasetReferences(dataset);
  if (referenceErrors.length > 0) {
    throw new Error(`参照整合性エラー:\n${referenceErrors.join("\n")}`);
  }
  if (dataset.sales.length <= 100) {
    throw new Error("売上seedは100件を超える必要があります。");
  }
  if (dataset.customers.length < 30) {
    throw new Error("顧客seedは30件以上必要です。");
  }
  if (dataset.products.length < 20) {
    throw new Error("商品・サービスseedは20件以上必要です。");
  }
  if (dataset.staff.length < 5 || dataset.locations.length < 3) {
    throw new Error("担当者5名以上・店舗3件以上が必要です。");
  }
}

const USER_SEEDS: ReadonlyArray<{
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  staffId?: string;
  locationId: string;
  allowedLocationIds: string[];
}> = [
  {
    uid: "demo-user-admin",
    name: "佐倉 ひなた",
    email: "sales-admin@example.invalid",
    role: "admin",
    staffId: "staff-001",
    locationId: "location-1",
    allowedLocationIds: ["location-1", "location-2", "location-3"],
  },
  {
    uid: "demo-user-manager",
    name: "水野 颯太",
    email: "sales-manager@example.invalid",
    role: "manager",
    staffId: "staff-002",
    locationId: "location-2",
    allowedLocationIds: ["location-1", "location-2", "location-3"],
  },
  {
    uid: "demo-user-user",
    name: "小森 つばさ",
    email: "sales-user@example.invalid",
    role: "user",
    staffId: "staff-003",
    locationId: "location-3",
    allowedLocationIds: ["location-3"],
  },
  {
    uid: "demo-user-viewer",
    name: "閲覧担当者",
    email: "sales-viewer@example.invalid",
    role: "viewer",
    locationId: "location-1",
    allowedLocationIds: ["location-1", "location-2", "location-3"],
  },
];

function userDocuments(dataset: SalesDataset): PlannedWrite[] {
  return USER_SEEDS.map((user) => ({
    collectionName: "users",
    documentId: user.uid,
    data: {
      id: user.uid,
      userId: user.uid,
      organizationId: dataset.organization.id,
      locationId: user.locationId,
      allowedLocationIds: user.allowedLocationIds,
      staffId: user.staffId,
      name: user.name,
      displayName: user.name,
      email: user.email,
      role: user.role,
      isActive: true,
      createdAt: dataset.generatedAt,
      createdBy: "demo-user-admin",
      updatedAt: dataset.generatedAt,
      updatedBy: "demo-user-admin",
    },
  }));
}

function settingsDocument(dataset: SalesDataset): PlannedWrite {
  return {
    collectionName: "settings",
    documentId: dataset.organization.id,
    data: {
      id: dataset.organization.id,
      organizationId: dataset.organization.id,
      locationId: ALL_LOCATIONS_ID,
      systemName: "売上管理システム",
      locale: "ja-JP",
      timezone: "Asia/Tokyo",
      currency: "JPY",
      taxRoundingMode: "floor",
      defaultTaxRateBp: 1000,
      fiscalYearStartMonth: 1,
      createdAt: dataset.generatedAt,
      createdBy: "demo-user-admin",
      updatedAt: dataset.generatedAt,
      updatedBy: "demo-user-admin",
    },
  };
}

interface SummaryAccumulator {
  organizationId: string;
  locationId: string;
  key: string;
  grossSalesYen: number;
  netSalesYen: number;
  refundYen: number;
  transactionCount: number;
}

function buildSummaries(
  dataset: SalesDataset,
  period: "daily" | "monthly",
): PlannedWrite[] {
  const summaries = new Map<string, SummaryAccumulator>();
  for (const sale of dataset.sales) {
    const key = period === "daily" ? sale.soldAt.slice(0, 10) : sale.soldAt.slice(0, 7);
    const id = `${sale.organizationId}__${sale.locationId}__${key}`;
    const current = summaries.get(id) ?? {
      organizationId: sale.organizationId,
      locationId: sale.locationId,
      key,
      grossSalesYen: 0,
      netSalesYen: 0,
      refundYen: 0,
      transactionCount: 0,
    };
    const recognized = netSalesYen(sale);
    current.grossSalesYen += sale.status === "confirmed" || sale.status === "partially_refunded"
      ? sale.totalYen
      : 0;
    current.netSalesYen += recognized;
    current.refundYen += sale.refundedAmountYen;
    current.transactionCount += recognized > 0 ? 1 : 0;
    summaries.set(id, current);
  }
  return [...summaries.entries()].map(([id, summary]) => ({
    collectionName: period === "daily" ? "dailySummaries" : "monthlySummaries",
    documentId: id,
    data: {
      id,
      organizationId: summary.organizationId,
      locationId: summary.locationId,
      [period === "daily" ? "date" : "month"]: summary.key,
      grossSalesYen: summary.grossSalesYen,
      netSalesYen: summary.netSalesYen,
      refundYen: summary.refundYen,
      transactionCount: summary.transactionCount,
      createdAt: dataset.generatedAt,
      createdBy: "demo-user-admin",
      updatedAt: dataset.generatedAt,
      updatedBy: "demo-user-admin",
    },
  }));
}

function plannedWrites(dataset: SalesDataset): PlannedWrite[] {
  const writes: PlannedWrite[] = [];
  const add = (collectionName: string, documentId: string, data: DocumentData) => {
    writes.push({ collectionName, documentId, data });
  };
  add("organizations", dataset.organization.id, {
    ...dataset.organization,
    ownerId: "demo-user-admin",
    currency: "JPY",
    taxRoundingMode: "floor",
  });
  for (const location of dataset.locations) add("locations", location.id, location);
  for (const staff of dataset.staff) add("staff", staff.id, staff);
  for (const customer of dataset.customers) add("customers", customer.id, customer);
  for (const category of dataset.categories) add("categories", category.id, category);
  for (const product of dataset.products) add("products", product.id, product);
  for (const method of dataset.paymentMethods) add("paymentMethods", method.id, method);
  for (const sale of dataset.sales) {
    add("sales", sale.id, sale);
    for (const item of sale.items) add("saleItems", item.id, item);
  }
  for (const goal of dataset.goals) add("goals", goal.id, goal);
  for (const audit of dataset.auditLogs) add("auditLogs", audit.id, audit);
  writes.push(...userDocuments(dataset));
  writes.push(settingsDocument(dataset));
  writes.push(...buildSummaries(dataset, "daily"));
  writes.push(...buildSummaries(dataset, "monthly"));
  return writes.map((write) => {
    const data = stripUndefined(write.data) as DocumentData;
    assertNoUndefined(data, `${write.collectionName}/${write.documentId}`);
    return { ...write, data };
  });
}

function collectionCounts(writes: readonly PlannedWrite[]): Record<string, number> {
  return writes.reduce<Record<string, number>>((counts, write) => {
    counts[write.collectionName] = (counts[write.collectionName] ?? 0) + 1;
    return counts;
  }, {});
}

function configureEmulators(options: SeedOptions): void {
  if (!options.emulator) return;
  process.env.FIRESTORE_EMULATOR_HOST =
    process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8081";
  process.env.FIREBASE_AUTH_EMULATOR_HOST =
    process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9098";
}

function initializeAdmin(projectId: string) {
  if (getApps().length > 0) return getApps()[0];
  const credentialJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  return initializeApp({
    projectId,
    credential: credentialJson
      ? cert(JSON.parse(credentialJson) as Parameters<typeof cert>[0])
      : applicationDefault(),
  });
}

async function upsertAuthUsers(
  projectId: string,
): Promise<void> {
  const auth = getAuth();
  const password = process.env.DEMO_SEED_PASSWORD?.trim() ?? "";
  if (password.length < 12) {
    throw new Error(
      `Project ${projectId} のAuthユーザー作成には12文字以上の DEMO_SEED_PASSWORD が必要です。`,
    );
  }
  for (const user of USER_SEEDS) {
    try {
      const existing = await auth.getUser(user.uid);
      if (existing.email && existing.email !== user.email) {
        throw new Error(
          `固定UID ${user.uid} は別のメールアドレス ${existing.email} に使用されています。`,
        );
      }
      await auth.updateUser(user.uid, {
        email: user.email,
        password,
        displayName: user.name,
        disabled: false,
      });
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error
        ? String(error.code)
        : "";
      if (code !== "auth/user-not-found") throw error;
      await auth.createUser({
        uid: user.uid,
        email: user.email,
        password,
        displayName: user.name,
        emailVerified: true,
      });
    }
  }
}

async function commitWrites(writes: readonly PlannedWrite[]): Promise<void> {
  const db = getFirestore();
  for (let offset = 0; offset < writes.length; offset += MAX_BATCH_WRITES) {
    const batch = db.batch();
    for (const write of writes.slice(offset, offset + MAX_BATCH_WRITES)) {
      batch.set(
        db.collection(write.collectionName).doc(write.documentId),
        write.data,
      );
    }
    await batch.commit();
    console.info(
      `Committed ${Math.min(offset + MAX_BATCH_WRITES, writes.length)}/${writes.length} documents.`,
    );
  }
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  assertWriteSafety(options);
  const dataset = createSalesSampleData(options.referenceDate);
  validateDataset(dataset);
  const writes = plannedWrites(dataset);
  console.info("Sales seed validation passed.");
  console.table(collectionCounts(writes));
  console.info(`Total planned documents: ${writes.length}`);
  console.info(`Project: ${options.projectId}`);
  if (options.dryRun) {
    console.info(
      `Dry run only. To write, add --confirm ${options.projectId}${
        options.projectId.startsWith(SAFE_PROJECT_PREFIX)
          ? ""
          : " --allow-production"
      }.`,
    );
    return;
  }

  configureEmulators(options);
  initializeAdmin(options.projectId);
  await upsertAuthUsers(options.projectId);
  await commitWrites(writes);
  console.info(
    `Seeded ${writes.length} fixed-ID documents and ${USER_SEEDS.length} Auth users into ${options.projectId}.`,
  );
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
