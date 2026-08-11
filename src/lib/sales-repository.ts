import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  writeBatch,
  type DocumentData,
  type Firestore,
  type Query,
  type QueryConstraint,
  type QuerySnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import {
  ALL_LOCATIONS_ID,
  calculateSaleAmounts,
  canCancelSale,
  canCreateSale,
  canRefundSale,
  canTransitionSaleStatus,
  canUpdateSale,
  createSalesSampleData,
  hasPermission,
  type AuditAction,
  type AuditLog,
  type AuditedEntityType,
  type AuditableEntity,
  type Customer,
  type Location,
  type Permission,
  type Product,
  type Sale,
  type SalesDataSnapshot,
  type SalesDataset,
  type SalesGoal,
  type Staff,
  type UserRole,
} from "@/lib/sales";

export const DEMO_SALES_DATA_STORAGE_KEY =
  "sales-management:demo-data:v1";
export const DEMO_SALES_DATA_VERSION = 2;

export const FIRESTORE_SUBSCRIPTION_LIMITS = {
  locations: 50,
  staff: 100,
  customers: 1_000,
  categories: 200,
  products: 1_000,
  paymentMethods: 50,
  sales: 1_000,
  goals: 500,
  auditLogs: 500,
} as const;

// Each sale/audit pair performs bidirectional getAfter/exists checks in Rules.
// Four pairs leave headroom under Firestore's 20 document-access-call limit
// for the shared user and organization authorization reads.
export const FIRESTORE_AUDITED_SALES_PER_BATCH = 4;

export interface SalesMutationActor {
  userId: string;
  userName: string;
  role: UserRole;
  organizationId: string;
  allowedLocationIds?: readonly string[];
  staffId?: string;
}

export type ImportKind = "sales" | "products" | "customers";

export interface SalesRepository {
  subscribe(
    listener: (snapshot: SalesDataset) => void,
    errorListener?: (error: unknown) => void,
  ): Unsubscribe;
  getSnapshot(): Promise<SalesDataset>;
  saveSale(sale: Sale, actor: SalesMutationActor): Promise<Sale>;
  cancelSale(
    id: string,
    reason: string,
    actor: SalesMutationActor,
  ): Promise<Sale>;
  refundSale(
    id: string,
    amountYen: number,
    actor: SalesMutationActor,
  ): Promise<Sale>;
  duplicateSale(id: string, actor: SalesMutationActor): Promise<Sale>;
  saveProduct(product: Product, actor: SalesMutationActor): Promise<Product>;
  saveCustomer(
    customer: Customer,
    actor: SalesMutationActor,
  ): Promise<Customer>;
  saveStaff(staff: Staff, actor: SalesMutationActor): Promise<Staff>;
  saveLocation(
    location: Location,
    actor: SalesMutationActor,
  ): Promise<Location>;
  saveGoal(goal: SalesGoal, actor: SalesMutationActor): Promise<SalesGoal>;
  importData(
    kind: ImportKind,
    records: readonly unknown[],
    actor: SalesMutationActor,
  ): Promise<number>;
  reset?(): Promise<SalesDataset>;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface PersistedDemoEnvelope {
  version: number;
  data: SalesDataset;
}

type Listener = (snapshot: SalesDataset) => void;

function clone<T>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

function resolveStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isSalesDataset(value: unknown): value is SalesDataset {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SalesDataset>;
  return Boolean(candidate.organization) &&
    Array.isArray(candidate.locations) &&
    Array.isArray(candidate.staff) &&
    Array.isArray(candidate.customers) &&
    Array.isArray(candidate.categories) &&
    Array.isArray(candidate.products) &&
    Array.isArray(candidate.paymentMethods) &&
    Array.isArray(candidate.sales) &&
    Array.isArray(candidate.goals) &&
    Array.isArray(candidate.auditLogs);
}

function nowIso(): string {
  return new Date().toISOString();
}

function nextId(prefix: string): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}

function assertSameActor(
  configured: SalesMutationActor,
  requested: SalesMutationActor,
): void {
  if (
    configured.userId !== requested.userId ||
    configured.organizationId !== requested.organizationId
  ) {
    throw new Error("ログイン情報が変更されました。画面を再読み込みしてください。");
  }
}

function assertOrganization(
  actor: SalesMutationActor,
  organizationId: string,
): void {
  if (actor.organizationId !== organizationId) {
    throw new Error("他の組織のデータは操作できません。");
  }
}

function canAccessLocation(
  actor: SalesMutationActor,
  locationId: string,
): boolean {
  return actor.role === "admin" ||
    actor.allowedLocationIds === undefined ||
    actor.allowedLocationIds.includes(locationId) ||
    locationId === ALL_LOCATIONS_ID;
}

function assertLocation(actor: SalesMutationActor, locationId: string): void {
  if (!canAccessLocation(actor, locationId)) {
    throw new Error("この店舗のデータを操作する権限がありません。");
  }
}

function permissionActor(actor: SalesMutationActor) {
  return {
    userId: actor.userId,
    staffId: actor.staffId,
    role: actor.role,
    organizationId: actor.organizationId,
    allowedLocationIds:
      actor.role === "admin" ? undefined : actor.allowedLocationIds,
  };
}

function transactionNumber(id: string, soldAt: string): string {
  const date = soldAt.slice(0, 10).replaceAll("-", "");
  return `SL-${date}-${id.replace(/[^a-z0-9]/gi, "").slice(-6).toUpperCase()}`;
}

function lineItemsUnchanged(input: Sale, existing: Sale): boolean {
  const businessValue = (item: Sale["items"][number]) =>
    Object.fromEntries(
      Object.entries(item).filter(
        ([key]) => key !== "updatedAt" && key !== "updatedBy",
      ),
    );
  return JSON.stringify(input.items.map(businessValue)) ===
    JSON.stringify(existing.items.map(businessValue));
}

function prepareSale(
  input: Sale,
  actor: SalesMutationActor,
  existing?: Sale,
  maximumItems = 2,
): Sale {
  assertOrganization(actor, input.organizationId || actor.organizationId);
  if (input.locationId === ALL_LOCATIONS_ID) {
    throw new Error("売上には実店舗を指定してください。");
  }
  assertLocation(actor, input.locationId);
  if (existing && input.locationId !== existing.locationId) {
    throw new Error("登録済み売上の店舗は変更できません。取消後に正しい店舗で複製してください。");
  }
  const preserveExistingItems = Boolean(
    existing && lineItemsUnchanged(input, existing),
  );
  if (
    input.items.length === 0 ||
    (
      input.items.length > maximumItems &&
      !preserveExistingItems
    )
  ) {
    throw new Error(`売上明細は1件以上${maximumItems}件以下で登録してください。`);
  }
  if (
    actor.role === "user" &&
    (!actor.staffId || input.staffId !== actor.staffId)
  ) {
    throw new Error("一般ユーザーは自分を担当者にした売上のみ登録・編集できます。");
  }

  const accessActor = permissionActor(actor);
  if (existing) {
    if (!canUpdateSale(accessActor, existing)) {
      throw new Error("この売上を編集する権限がありません。");
    }
    if (
      input.status !== existing.status &&
      !(
        existing.status === "pending" &&
        input.status === "confirmed" &&
        canTransitionSaleStatus(accessActor, existing, input.status)
      )
    ) {
      throw new Error("取消・返金は専用の操作から実行してください。");
    }
  } else {
    if (!canCreateSale(accessActor, actor.organizationId, input.locationId)) {
      throw new Error("売上を登録する権限がありません。");
    }
    if (input.status !== "pending" && input.status !== "confirmed") {
      throw new Error("新規売上は確定または未確定で登録してください。");
    }
  }

  const id = existing?.id || input.id || nextId("sale");
  const timestamp = nowIso();
  const items = preserveExistingItems
    ? clone(existing!.items)
    : input.items.map((item, index) => {
    const amounts = calculateSaleAmounts([
      {
        quantity: item.quantity,
        unitPriceYen: item.unitPriceYen,
        discountYen: item.discountYen,
        taxRateBps: item.taxRateBps,
      },
    ]);
    const itemId = item.id || `${id}-item-${String(index + 1).padStart(2, "0")}`;
    return {
      ...item,
      id: itemId,
      saleId: id,
      organizationId: actor.organizationId,
      locationId: input.locationId,
      subtotalYen: amounts.subtotalYen,
      discountYen: amounts.discountYen,
      taxableAmountYen: amounts.taxableAmountYen,
      taxYen: amounts.taxYen,
      totalYen: amounts.totalYen,
      createdAt: existing ? item.createdAt || existing.createdAt : timestamp,
      createdBy: existing ? item.createdBy || existing.createdBy : actor.userId,
      updatedAt: timestamp,
      updatedBy: actor.userId,
    };
      });
  const totals = calculateSaleAmounts(
    items.map((item) => ({
      quantity: item.quantity,
      unitPriceYen: item.unitPriceYen,
      discountYen: item.discountYen,
      taxRateBps: item.taxRateBps,
    })),
  );
  if (!Number.isSafeInteger(input.refundedAmountYen) || input.refundedAmountYen < 0) {
    throw new Error("返金額は0円以上の整数で指定してください。");
  }
  if (input.refundedAmountYen > totals.totalYen) {
    throw new Error("返金額は合計金額以下で指定してください。");
  }

  return {
    ...input,
    id,
    transactionNumber:
      existing?.transactionNumber ||
      input.transactionNumber ||
      transactionNumber(id, input.soldAt),
    organizationId: actor.organizationId,
    items,
    subtotalYen: totals.subtotalYen,
    discountYen: totals.discountYen,
    taxableAmountYen: totals.taxableAmountYen,
    taxYen: totals.taxYen,
    totalYen: totals.totalYen,
    refundedAmountYen:
      input.status === "confirmed" || input.status === "pending"
        ? 0
        : input.refundedAmountYen,
    createdAt: existing?.createdAt || timestamp,
    createdBy: existing?.createdBy || actor.userId,
    updatedAt: timestamp,
    updatedBy: actor.userId,
  };
}

function auditLog(
  actor: SalesMutationActor,
  entityType: AuditedEntityType,
  entityId: string,
  action: AuditAction,
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
  locationId: string,
  summary: string,
  id = nextId("audit"),
): AuditLog {
  const timestamp = nowIso();
  return {
    id,
    organizationId: actor.organizationId,
    locationId,
    createdAt: timestamp,
    createdBy: actor.userId,
    updatedAt: timestamp,
    updatedBy: actor.userId,
    action,
    entityType,
    entityId,
    actorName: actor.userName,
    summary,
    before,
    after,
  };
}

function snapshotRecord(entity: object | undefined): Record<string, unknown> | undefined {
  if (!entity) return undefined;
  return clone(entity) as Record<string, unknown>;
}

function recomputeCustomers(data: SalesDataset): void {
  for (const customer of data.customers) {
    const related = data.sales
      .filter(
        (sale) =>
          sale.customerId === customer.id &&
          (sale.status === "confirmed" || sale.status === "partially_refunded"),
      )
      .sort((left, right) => right.soldAt.localeCompare(left.soldAt));
    const totalSalesYen = related.reduce(
      (sum, sale) => sum + Math.max(0, sale.totalYen - sale.refundedAmountYen),
      0,
    );
    customer.purchaseCount = related.length;
    customer.totalSalesYen = totalSalesYen;
    customer.averagePurchaseYen = related.length > 0
      ? Math.floor(totalSalesYen / related.length)
      : 0;
    customer.lastPurchaseAt = related[0]?.soldAt;
  }
}

function upsert<T extends AuditableEntity>(items: T[], entity: T): void {
  const index = items.findIndex((item) => item.id === entity.id);
  if (index >= 0) items[index] = entity;
  else items.unshift(entity);
}

function prepareEntity<T extends AuditableEntity>(
  input: T,
  actor: SalesMutationActor,
  existing?: T,
): T {
  assertOrganization(actor, input.organizationId || actor.organizationId);
  assertLocation(actor, input.locationId);
  const timestamp = nowIso();
  return {
    ...input,
    id: existing?.id || input.id,
    organizationId: actor.organizationId,
    createdAt: existing?.createdAt || input.createdAt || timestamp,
    createdBy: existing?.createdBy || input.createdBy || actor.userId,
    updatedAt: timestamp,
    updatedBy: actor.userId,
  };
}

/** Browser-isolated, versioned repository. It never imports or calls Firebase. */
export class DemoSalesRepository implements SalesRepository {
  private readonly listeners = new Set<Listener>();
  private memoryData: SalesDataset | null = null;

  constructor(
    private readonly storage: StorageLike | null = null,
    private readonly storageKey = DEMO_SALES_DATA_STORAGE_KEY,
    private readonly seedFactory: () => SalesDataset = () =>
      createSalesSampleData(),
  ) {}

  private getStorage(): StorageLike | null {
    return this.storage ?? resolveStorage();
  }

  private read(): SalesDataset {
    const storage = this.getStorage();
    if (storage) {
      try {
        const raw = storage.getItem(this.storageKey);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<PersistedDemoEnvelope>;
          if (
            parsed.version === DEMO_SALES_DATA_VERSION &&
            isSalesDataset(parsed.data)
          ) {
            this.memoryData = parsed.data;
            return clone(parsed.data);
          }
          storage.removeItem(this.storageKey);
        }
      } catch {
        try {
          storage.removeItem(this.storageKey);
        } catch {
          // Use the in-memory fallback below.
        }
      }
    }
    if (!this.memoryData) this.memoryData = this.seedFactory();
    this.write(this.memoryData, false);
    return clone(this.memoryData);
  }

  private write(data: SalesDataset, notify = true): void {
    data.generatedAt = nowIso();
    this.memoryData = clone(data);
    const storage = this.getStorage();
    if (storage) {
      try {
        const envelope: PersistedDemoEnvelope = {
          version: DEMO_SALES_DATA_VERSION,
          data: this.memoryData,
        };
        storage.setItem(this.storageKey, JSON.stringify(envelope));
      } catch {
        // localStorage can be full or disabled; memory remains authoritative.
      }
    }
    if (notify) {
      const published = clone(this.memoryData);
      for (const listener of this.listeners) listener(published);
    }
  }

  private mutate<T>(operation: (data: SalesDataset) => T): T {
    const data = this.read();
    const result = operation(data);
    recomputeCustomers(data);
    this.write(data);
    return clone(result);
  }

  subscribe(listener: Listener): Unsubscribe {
    this.listeners.add(listener);
    queueMicrotask(() => listener(this.read()));
    return () => this.listeners.delete(listener);
  }

  async getSnapshot(): Promise<SalesDataset> {
    return this.read();
  }

  async saveSale(input: Sale, actor: SalesMutationActor): Promise<Sale> {
    return this.mutate((data) => {
      const existing = data.sales.find((sale) => sale.id === input.id);
      const sale = prepareSale(input, actor, existing);
      upsert(data.sales, sale);
      data.auditLogs.unshift(
        auditLog(
          actor,
          "sale",
          sale.id,
          existing ? "update" : "create",
          snapshotRecord(existing),
          snapshotRecord(sale),
          sale.locationId,
          existing
            ? `売上 ${sale.transactionNumber} を編集しました。`
            : `売上 ${sale.transactionNumber} を登録しました。`,
        ),
      );
      return sale;
    });
  }

  async cancelSale(
    id: string,
    reason: string,
    actor: SalesMutationActor,
  ): Promise<Sale> {
    return this.mutate((data) => {
      const existing = data.sales.find((sale) => sale.id === id);
      if (!existing) throw new Error("取消対象の売上が見つかりません。");
      if (!canCancelSale(permissionActor(actor), existing)) {
        throw new Error("この売上を取り消す権限がありません。");
      }
      if (!reason.trim()) throw new Error("取消理由を入力してください。");
      const timestamp = nowIso();
      const sale: Sale = {
        ...existing,
        status: "cancelled",
        refundedAmountYen: 0,
        cancelledAt: timestamp,
        cancelledBy: actor.userId,
        cancellationReason: reason.trim(),
        updatedAt: timestamp,
        updatedBy: actor.userId,
      };
      upsert(data.sales, sale);
      data.auditLogs.unshift(
        auditLog(
          actor,
          "sale",
          sale.id,
          "cancel",
          snapshotRecord(existing),
          snapshotRecord(sale),
          sale.locationId,
          `売上 ${sale.transactionNumber} を取り消しました。`,
        ),
      );
      return sale;
    });
  }

  async refundSale(
    id: string,
    amountYen: number,
    actor: SalesMutationActor,
  ): Promise<Sale> {
    return this.mutate((data) => {
      const existing = data.sales.find((sale) => sale.id === id);
      if (!existing) throw new Error("返金対象の売上が見つかりません。");
      if (!canRefundSale(permissionActor(actor), existing)) {
        throw new Error("この売上を返金する権限がありません。");
      }
      if (
        !Number.isSafeInteger(amountYen) ||
        amountYen <= existing.refundedAmountYen ||
        amountYen > existing.totalYen
      ) {
        throw new Error("累計返金額は現在の返金額を超え、合計金額以下で入力してください。");
      }
      const timestamp = nowIso();
      const sale: Sale = {
        ...existing,
        status:
          amountYen === existing.totalYen
            ? "refunded"
            : "partially_refunded",
        refundedAmountYen: amountYen,
        updatedAt: timestamp,
        updatedBy: actor.userId,
      };
      upsert(data.sales, sale);
      data.auditLogs.unshift(
        auditLog(
          actor,
          "sale",
          sale.id,
          "refund",
          snapshotRecord(existing),
          snapshotRecord(sale),
          sale.locationId,
          `売上 ${sale.transactionNumber} に ${amountYen.toLocaleString("ja-JP")}円を返金しました。`,
        ),
      );
      return sale;
    });
  }

  async duplicateSale(id: string, actor: SalesMutationActor): Promise<Sale> {
    const source = this.read().sales.find((sale) => sale.id === id);
    if (!source) throw new Error("複製元の売上が見つかりません。");
    const timestamp = nowIso();
    const copiedId = nextId("sale");
    return this.saveSale(
      {
        ...clone(source),
        id: copiedId,
        transactionNumber: "",
        soldAt: timestamp,
        status: "pending",
        refundedAmountYen: 0,
        cancelledAt: undefined,
        cancelledBy: undefined,
        cancellationReason: undefined,
        memo: source.memo ? `${source.memo}（複製）` : "複製した取引",
        items: source.items.map((item, index) => ({
          ...item,
          id: `${copiedId}-item-${String(index + 1).padStart(2, "0")}`,
          saleId: copiedId,
        })),
        createdAt: timestamp,
        createdBy: actor.userId,
        updatedAt: timestamp,
        updatedBy: actor.userId,
      },
      actor,
    );
  }

  private saveMaster<T extends AuditableEntity>(params: {
    data: SalesDataset;
    array: T[];
    input: T;
    actor: SalesMutationActor;
    permission: Permission;
    entityType: AuditedEntityType;
    label: string;
  }): T {
    const { data, array, input, actor, permission, entityType, label } = params;
    if (!hasPermission(actor.role, permission)) {
      throw new Error(`${label}を変更する権限がありません。`);
    }
    const existing = array.find((item) => item.id === input.id);
    const entity = prepareEntity(input, actor, existing);
    upsert(array, entity);
    data.auditLogs.unshift(
      auditLog(
        actor,
        entityType,
        entity.id,
        existing ? "update" : "create",
        snapshotRecord(existing),
        snapshotRecord(entity),
        entity.locationId,
        `${label}「${String((entity as T & { name?: string }).name || entity.id)}」を${existing ? "更新" : "登録"}しました。`,
      ),
    );
    return entity;
  }

  async saveProduct(input: Product, actor: SalesMutationActor): Promise<Product> {
    return this.mutate((data) =>
      this.saveMaster({
        data,
        array: data.products,
        input,
        actor,
        permission: "products:manage",
        entityType: "product",
        label: "商品・サービス",
      }),
    );
  }

  async saveCustomer(input: Customer, actor: SalesMutationActor): Promise<Customer> {
    return this.mutate((data) =>
      this.saveMaster({
        data,
        array: data.customers,
        input,
        actor,
        permission: "customers:manage",
        entityType: "customer",
        label: "顧客",
      }),
    );
  }

  async saveStaff(input: Staff, actor: SalesMutationActor): Promise<Staff> {
    return this.mutate((data) =>
      this.saveMaster({
        data,
        array: data.staff,
        input,
        actor,
        permission: "staff:manage",
        entityType: "staff",
        label: "担当者",
      }),
    );
  }

  async saveLocation(input: Location, actor: SalesMutationActor): Promise<Location> {
    return this.mutate((data) =>
      this.saveMaster({
        data,
        array: data.locations,
        input,
        actor,
        permission: "locations:manage",
        entityType: "location",
        label: "店舗",
      }),
    );
  }

  async saveGoal(input: SalesGoal, actor: SalesMutationActor): Promise<SalesGoal> {
    return this.mutate((data) =>
      this.saveMaster({
        data,
        array: data.goals,
        input,
        actor,
        permission: "goals:manage",
        entityType: "goal",
        label: "売上目標",
      }),
    );
  }

  async importData(
    kind: ImportKind,
    records: readonly unknown[],
    actor: SalesMutationActor,
  ): Promise<number> {
    if (!hasPermission(actor.role, "csv:import")) {
      throw new Error("CSVを取り込む権限がありません。");
    }
    if (kind === "sales") {
      const sales = records as readonly Sale[];
      const existing = this.read();
      const prepared = sales.map((sale) =>
        prepareSale(
          sale,
          actor,
          existing.sales.find((candidate) => candidate.id === sale.id),
        ),
      );
      this.mutate((data) => {
        for (const sale of prepared) {
          const before = data.sales.find((candidate) => candidate.id === sale.id);
          upsert(data.sales, sale);
          data.auditLogs.unshift(
            auditLog(
              actor,
              "sale",
              sale.id,
              before ? "update" : "create",
              snapshotRecord(before),
              snapshotRecord(sale),
              sale.locationId,
              `CSVから売上 ${sale.transactionNumber} を取り込みました。`,
            ),
          );
        }
        return prepared.length;
      });
      return prepared.length;
    }
    if (kind === "products") {
      for (const product of records as readonly Product[]) {
        await this.saveProduct(product, actor);
      }
      return records.length;
    }
    for (const customer of records as readonly Customer[]) {
      await this.saveCustomer(customer, actor);
    }
    return records.length;
  }

  async reset(): Promise<SalesDataset> {
    this.memoryData = this.seedFactory();
    try {
      this.getStorage()?.removeItem(this.storageKey);
    } catch {
      // The in-memory reset is still complete.
    }
    this.write(this.memoryData);
    return clone(this.memoryData);
  }
}

function normalizeFirestoreValue(value: unknown): unknown {
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    return value.toDate().toISOString();
  }
  if (Array.isArray(value)) return value.map(normalizeFirestoreValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        normalizeFirestoreValue(nested),
      ]),
    );
  }
  return value;
}

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripUndefined) as T;
  if (
    value &&
    typeof value === "object" &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, nested]) => nested !== undefined)
        .map(([key, nested]) => [key, stripUndefined(nested)]),
    ) as T;
  }
  return value;
}

function entitiesFromSnapshot<T>(snapshot: QuerySnapshot<DocumentData>): T[] {
  return snapshot.docs.map(
    (entry) =>
      ({
        ...(normalizeFirestoreValue(entry.data()) as object),
        id: entry.id,
      }) as T,
  );
}

type DatasetArrayKey = Exclude<
  keyof SalesDataset,
  "version" | "generatedAt" | "organization"
>;

const COLLECTION_BINDINGS: readonly [
  DatasetArrayKey,
  keyof typeof FIRESTORE_SUBSCRIPTION_LIMITS,
][] = [
  ["locations", "locations"],
  ["staff", "staff"],
  ["customers", "customers"],
  ["categories", "categories"],
  ["products", "products"],
  ["paymentMethods", "paymentMethods"],
  ["sales", "sales"],
  ["goals", "goals"],
  ["auditLogs", "auditLogs"],
];

function emptySnapshot(actor: SalesMutationActor): SalesDataSnapshot {
  const timestamp = nowIso();
  return {
    version: 1,
    generatedAt: timestamp,
    organization: {
      id: actor.organizationId,
      organizationId: actor.organizationId,
      locationId: ALL_LOCATIONS_ID,
      name: "所属組織",
      isActive: true,
      isDemo: false,
      timezone: "Asia/Tokyo",
      createdAt: timestamp,
      createdBy: actor.userId,
      updatedAt: timestamp,
      updatedBy: actor.userId,
    },
    locations: [],
    staff: [],
    customers: [],
    categories: [],
    products: [],
    paymentMethods: [],
    sales: [],
    goals: [],
    auditLogs: [],
  };
}

export class FirebaseSalesRepository implements SalesRepository {
  constructor(
    private readonly db: Firestore,
    private readonly configuredActor: SalesMutationActor,
  ) {}

  private scopedQuery(
    collectionName: keyof typeof FIRESTORE_SUBSCRIPTION_LIMITS,
  ): Query<DocumentData> {
    const constraints: QueryConstraint[] = [
      where("organizationId", "==", this.configuredActor.organizationId),
    ];
    const allowed = this.configuredActor.role === "admin"
      ? undefined
      : this.configuredActor.allowedLocationIds;
    if (allowed !== undefined) {
      const locationIds = [...new Set([...allowed, ALL_LOCATIONS_ID])];
      if (locationIds.length === 0) {
        throw new Error("閲覧できる店舗が設定されていません。");
      }
      if (locationIds.length > 30) {
        throw new Error("閲覧対象店舗は29件以内で設定してください。");
      }
      constraints.push(where("locationId", "in", locationIds));
    }
    if (collectionName === "auditLogs") {
      constraints.push(orderBy("createdAt", "desc"));
    }
    constraints.push(limit(FIRESTORE_SUBSCRIPTION_LIMITS[collectionName]));
    return query(collection(this.db, collectionName), ...constraints);
  }

  private salesQuery(): Query<DocumentData> {
    const constraints: QueryConstraint[] = [
      where("organizationId", "==", this.configuredActor.organizationId),
    ];
    const allowed = this.configuredActor.role === "admin"
      ? undefined
      : this.configuredActor.allowedLocationIds;
    if (allowed !== undefined) {
      if (allowed.length === 0) {
        throw new Error("閲覧できる店舗が設定されていません。");
      }
      constraints.push(where("locationId", "in", [...new Set(allowed)]));
    }
    if (this.configuredActor.role === "user") {
      constraints.push(
        where(
          "staffId",
          "==",
          this.configuredActor.staffId || this.configuredActor.userId,
        ),
      );
    }
    constraints.push(orderBy("soldAt", "desc"));
    constraints.push(limit(FIRESTORE_SUBSCRIPTION_LIMITS.sales));
    return query(collection(this.db, "sales"), ...constraints);
  }

  private queryFor(key: DatasetArrayKey): Query<DocumentData> {
    return key === "sales" ? this.salesQuery() : this.scopedQuery(key);
  }

  private collectionBindings(): typeof COLLECTION_BINDINGS {
    return COLLECTION_BINDINGS.filter(
      ([key]) => (
        key !== "auditLogs" ||
        hasPermission(this.configuredActor.role, "audit:read")
      ) && (
        key !== "goals" ||
        hasPermission(this.configuredActor.role, "analytics:read")
      ),
    ) as typeof COLLECTION_BINDINGS;
  }

  subscribe(
    listener: Listener,
    errorListener: (error: unknown) => void = () => undefined,
  ): Unsubscribe {
    const state = emptySnapshot(this.configuredActor);
    const bindings = this.collectionBindings();
    let bindingQueries: ReadonlyArray<Query<DocumentData>>;
    try {
      bindingQueries = bindings.map(([key]) => this.queryFor(key));
    } catch (reason) {
      queueMicrotask(() => errorListener(reason));
      return () => undefined;
    }
    let organizationReady = false;
    let terminalError = false;
    const readyBindings = new Set<DatasetArrayKey>();
    const publish = () => {
      if (
        terminalError ||
        !organizationReady ||
        readyBindings.size !== bindings.length
      ) return;
      state.generatedAt = nowIso();
      listener(clone(state));
    };
    const fail = (reason: unknown) => {
      terminalError = true;
      errorListener(reason);
    };
    const unsubscribers: Unsubscribe[] = [];
    unsubscribers.push(
      onSnapshot(
        doc(this.db, "organizations", this.configuredActor.organizationId),
        (snapshot) => {
          if (!snapshot.exists()) {
            fail(new Error("所属組織が見つかりません。"));
            return;
          }
          state.organization = {
            ...(normalizeFirestoreValue(snapshot.data()) as object),
            id: snapshot.id,
          } as SalesDataset["organization"];
          organizationReady = true;
          publish();
        },
        fail,
      ),
    );
    bindings.forEach(([key], index) => {
      unsubscribers.push(
        onSnapshot(
          bindingQueries[index],
          (snapshot) => {
            (state as unknown as Record<string, unknown>)[key] =
              entitiesFromSnapshot(snapshot);
            readyBindings.add(key);
            publish();
          },
          fail,
        ),
      );
    });
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }

  async getSnapshot(): Promise<SalesDataset> {
    const bindings = this.collectionBindings();
    const [organizationSnapshot, ...collectionSnapshots] = await Promise.all([
      getDoc(
        doc(this.db, "organizations", this.configuredActor.organizationId),
      ),
      ...bindings.map(([key]) => getDocs(this.queryFor(key))),
    ]);
    if (!organizationSnapshot.exists()) {
      throw new Error("所属組織が見つかりません。");
    }
    const state = emptySnapshot(this.configuredActor);
    state.organization = {
      ...(normalizeFirestoreValue(organizationSnapshot.data()) as object),
      id: organizationSnapshot.id,
    } as SalesDataset["organization"];
    bindings.forEach(([key], index) => {
      (state as unknown as Record<string, unknown>)[key] =
        entitiesFromSnapshot(collectionSnapshots[index]);
    });
    state.generatedAt = nowIso();
    return state;
  }

  private ensureActor(actor: SalesMutationActor): void {
    assertSameActor(this.configuredActor, actor);
  }

  private async writeSaleWithAudit(
    sale: Sale,
    audit: AuditLog,
  ): Promise<void> {
    const batch = writeBatch(this.db);
    const saleReference = doc(this.db, "sales", sale.id);
    const saleData = stripUndefined({ ...sale, lastAuditId: audit.id });
    batch.set(saleReference, saleData);
    batch.set(doc(this.db, "auditLogs", audit.id), stripUndefined(audit));
    try {
      await batch.commit();
    } catch (reason) {
      const beforeUpdatedAt = audit.before?.updatedAt;
      if (typeof beforeUpdatedAt === "string") {
        try {
          const latest = await getDoc(saleReference);
          const latestUpdatedAt = latest.exists()
            ? normalizeFirestoreValue(latest.data().updatedAt)
            : undefined;
          if (
            typeof latestUpdatedAt === "string" &&
            latestUpdatedAt !== beforeUpdatedAt
          ) {
            throw new Error(
              "他のユーザーが先にこの売上を更新しました。最新の内容を確認してもう一度お試しください。",
            );
          }
        } catch (concurrencyCheckError) {
          if (
            concurrencyCheckError instanceof Error &&
            concurrencyCheckError.message.includes("先にこの売上を更新")
          ) {
            throw concurrencyCheckError;
          }
        }
      }
      throw reason;
    }
  }

  async saveSale(input: Sale, actor: SalesMutationActor): Promise<Sale> {
    this.ensureActor(actor);
    const reference = input.id ? doc(this.db, "sales", input.id) : null;
    const existingSnapshot = reference ? await getDoc(reference) : null;
    const existing = existingSnapshot?.exists()
      ? ({
          ...(normalizeFirestoreValue(existingSnapshot.data()) as object),
          id: existingSnapshot.id,
        } as Sale)
      : undefined;
    const sale = prepareSale(input, actor, existing, 2);
    const audit = auditLog(
      actor,
      "sale",
      sale.id,
      existing ? "update" : "create",
      snapshotRecord(existing),
      snapshotRecord(sale),
      sale.locationId,
      existing
        ? `売上 ${sale.transactionNumber} を編集しました。`
        : `売上 ${sale.transactionNumber} を登録しました。`,
    );
    await this.writeSaleWithAudit(sale, audit);
    return sale;
  }

  private async readSale(id: string): Promise<Sale> {
    const snapshot = await getDoc(doc(this.db, "sales", id));
    if (!snapshot.exists()) throw new Error("売上が見つかりません。");
    return {
      ...(normalizeFirestoreValue(snapshot.data()) as object),
      id: snapshot.id,
    } as Sale;
  }

  async cancelSale(
    id: string,
    reason: string,
    actor: SalesMutationActor,
  ): Promise<Sale> {
    this.ensureActor(actor);
    const existing = await this.readSale(id);
    if (!canCancelSale(permissionActor(actor), existing)) {
      throw new Error("この売上を取り消す権限がありません。");
    }
    if (!reason.trim()) throw new Error("取消理由を入力してください。");
    const timestamp = nowIso();
    const sale: Sale = {
      ...existing,
      status: "cancelled",
      refundedAmountYen: 0,
      cancelledAt: timestamp,
      cancelledBy: actor.userId,
      cancellationReason: reason.trim(),
      updatedAt: timestamp,
      updatedBy: actor.userId,
    };
    const audit = auditLog(
      actor,
      "sale",
      sale.id,
      "cancel",
      snapshotRecord(existing),
      snapshotRecord(sale),
      sale.locationId,
      `売上 ${sale.transactionNumber} を取り消しました。`,
    );
    await this.writeSaleWithAudit(sale, audit);
    return sale;
  }

  async refundSale(
    id: string,
    amountYen: number,
    actor: SalesMutationActor,
  ): Promise<Sale> {
    this.ensureActor(actor);
    const existing = await this.readSale(id);
    if (!canRefundSale(permissionActor(actor), existing)) {
      throw new Error("この売上を返金する権限がありません。");
    }
    if (
      !Number.isSafeInteger(amountYen) ||
      amountYen <= existing.refundedAmountYen ||
      amountYen > existing.totalYen
    ) {
      throw new Error("累計返金額は現在の返金額を超え、合計金額以下で入力してください。");
    }
    const sale: Sale = {
      ...existing,
      status:
        amountYen === existing.totalYen
          ? "refunded"
          : "partially_refunded",
      refundedAmountYen: amountYen,
      updatedAt: nowIso(),
      updatedBy: actor.userId,
    };
    const audit = auditLog(
      actor,
      "sale",
      sale.id,
      "refund",
      snapshotRecord(existing),
      snapshotRecord(sale),
      sale.locationId,
      `売上 ${sale.transactionNumber} に ${amountYen.toLocaleString("ja-JP")}円を返金しました。`,
    );
    await this.writeSaleWithAudit(sale, audit);
    return sale;
  }

  async duplicateSale(id: string, actor: SalesMutationActor): Promise<Sale> {
    this.ensureActor(actor);
    const source = await this.readSale(id);
    const timestamp = nowIso();
    const copiedId = nextId("sale");
    return this.saveSale(
      {
        ...source,
        id: copiedId,
        transactionNumber: "",
        soldAt: timestamp,
        status: "pending",
        refundedAmountYen: 0,
        cancelledAt: undefined,
        cancelledBy: undefined,
        cancellationReason: undefined,
        memo: source.memo ? `${source.memo}（複製）` : "複製した取引",
        items: source.items.map((item, index) => ({
          ...item,
          id: `${copiedId}-item-${String(index + 1).padStart(2, "0")}`,
          saleId: copiedId,
        })),
        createdAt: timestamp,
        createdBy: actor.userId,
        updatedAt: timestamp,
        updatedBy: actor.userId,
      },
      actor,
    );
  }

  private async writeMaster<T extends AuditableEntity>(params: {
    collectionName: "products" | "customers" | "staff" | "locations" | "goals";
    input: T;
    actor: SalesMutationActor;
    permission: Permission;
    entityType: AuditedEntityType;
    label: string;
  }): Promise<T> {
    const { collectionName, input, actor, permission, entityType, label } = params;
    this.ensureActor(actor);
    if (!hasPermission(actor.role, permission)) {
      throw new Error(`${label}を変更する権限がありません。`);
    }
    const reference = doc(this.db, collectionName, input.id);
    const snapshot = await getDoc(reference);
    const existing = snapshot.exists()
      ? ({
          ...(normalizeFirestoreValue(snapshot.data()) as object),
          id: snapshot.id,
        } as T)
      : undefined;
    const safeInput = collectionName === "customers"
      ? ({
          ...input,
          purchaseCount: (existing as Customer | undefined)?.purchaseCount ?? 0,
          totalSalesYen: (existing as Customer | undefined)?.totalSalesYen ?? 0,
          averagePurchaseYen:
            (existing as Customer | undefined)?.averagePurchaseYen ?? 0,
          lastPurchaseAt:
            (existing as Customer | undefined)?.lastPurchaseAt,
        } as T)
      : input;
    const entity = prepareEntity(safeInput, actor, existing);
    const audit = auditLog(
      actor,
      entityType,
      entity.id,
      existing ? "update" : "create",
      snapshotRecord(existing),
      snapshotRecord(entity),
      entity.locationId,
      `${label}を${existing ? "更新" : "登録"}しました。`,
    );
    const batch = writeBatch(this.db);
    batch.set(reference, stripUndefined({ ...entity, lastAuditId: audit.id }));
    batch.set(doc(this.db, "auditLogs", audit.id), stripUndefined(audit));
    await batch.commit();
    return entity;
  }

  saveProduct(input: Product, actor: SalesMutationActor): Promise<Product> {
    return this.writeMaster({
      collectionName: "products",
      input,
      actor,
      permission: "products:manage",
      entityType: "product",
      label: "商品・サービス",
    });
  }

  saveCustomer(input: Customer, actor: SalesMutationActor): Promise<Customer> {
    return this.writeMaster({
      collectionName: "customers",
      input,
      actor,
      permission: "customers:manage",
      entityType: "customer",
      label: "顧客",
    });
  }

  saveStaff(input: Staff, actor: SalesMutationActor): Promise<Staff> {
    return this.writeMaster({
      collectionName: "staff",
      input,
      actor,
      permission: "staff:manage",
      entityType: "staff",
      label: "担当者",
    });
  }

  saveLocation(input: Location, actor: SalesMutationActor): Promise<Location> {
    return this.writeMaster({
      collectionName: "locations",
      input,
      actor,
      permission: "locations:manage",
      entityType: "location",
      label: "店舗",
    });
  }

  saveGoal(input: SalesGoal, actor: SalesMutationActor): Promise<SalesGoal> {
    return this.writeMaster({
      collectionName: "goals",
      input,
      actor,
      permission: "goals:manage",
      entityType: "goal",
      label: "売上目標",
    });
  }

  async importData(
    kind: ImportKind,
    records: readonly unknown[],
    actor: SalesMutationActor,
  ): Promise<number> {
    this.ensureActor(actor);
    if (!hasPermission(actor.role, "csv:import")) {
      throw new Error("CSVを取り込む権限がありません。");
    }
    if (kind === "products") {
      for (const product of records as readonly Product[]) {
        await this.saveProduct(product, actor);
      }
      return records.length;
    }
    if (kind === "customers") {
      for (const customer of records as readonly Customer[]) {
        await this.saveCustomer(customer, actor);
      }
      return records.length;
    }

    const prepared: Array<{ sale: Sale; audit: AuditLog }> = [];
    for (const input of records as readonly Sale[]) {
      const existingSnapshot = input.id
        ? await getDoc(doc(this.db, "sales", input.id))
        : null;
      const existing = existingSnapshot?.exists()
        ? ({
            ...(normalizeFirestoreValue(existingSnapshot.data()) as object),
            id: existingSnapshot.id,
          } as Sale)
        : undefined;
      const sale = prepareSale(input, actor, existing, 2);
      prepared.push({
        sale,
        audit: auditLog(
          actor,
          "sale",
          sale.id,
          existing ? "update" : "create",
          snapshotRecord(existing),
          snapshotRecord(sale),
          sale.locationId,
          `CSVから売上 ${sale.transactionNumber} を取り込みました。`,
        ),
      });
    }

    for (
      let offset = 0;
      offset < prepared.length;
      offset += FIRESTORE_AUDITED_SALES_PER_BATCH
    ) {
      const batch = writeBatch(this.db);
      for (
        const { sale, audit } of prepared.slice(
          offset,
          offset + FIRESTORE_AUDITED_SALES_PER_BATCH,
        )
      ) {
        batch.set(
          doc(this.db, "sales", sale.id),
          stripUndefined({ ...sale, lastAuditId: audit.id }),
        );
        batch.set(doc(this.db, "auditLogs", audit.id), stripUndefined(audit));
      }
      await batch.commit();
    }
    return prepared.length;
  }
}

export function createFirebaseSalesRepository(
  db: Firestore,
  actor: SalesMutationActor,
): FirebaseSalesRepository {
  return new FirebaseSalesRepository(db, actor);
}
