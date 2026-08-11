"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/lib/auth-context";
import { getFirebaseServices } from "@/lib/firebase";
import {
  canReadSale,
  createSalesSampleData,
  hasPermission as roleHasPermission,
  netSalesYen,
  type Customer,
  type Location,
  type Permission,
  type Product,
  type Sale,
  type SalesDataset,
  type SalesGoal,
  type Staff,
} from "@/lib/sales";
import {
  DemoSalesRepository,
  createFirebaseSalesRepository,
  type ImportKind,
  type SalesMutationActor,
  type SalesRepository,
} from "@/lib/sales-repository";

export interface SalesDataContextValue {
  data: SalesDataset;
  loading: boolean;
  saving: boolean;
  error: string | null;
  saveSale(sale: Sale): Promise<Sale>;
  cancelSale(id: string, reason: string): Promise<Sale>;
  refundSale(id: string, amountYen: number): Promise<Sale>;
  duplicateSale(id: string): Promise<Sale>;
  saveProduct(product: Product): Promise<Product>;
  saveCustomer(customer: Customer): Promise<Customer>;
  saveStaff(staff: Staff): Promise<Staff>;
  saveLocation(location: Location): Promise<Location>;
  saveGoal(goal: SalesGoal): Promise<SalesGoal>;
  importData(kind: ImportKind, records: readonly unknown[]): Promise<number>;
  resetDemo(): Promise<void>;
  hasPermission(permission: Permission): boolean;
}

export interface SalesDataProviderProps {
  children: ReactNode;
  repository?: SalesRepository;
}

const SalesDataContext = createContext<SalesDataContextValue | null>(null);
const sharedDemoRepository = new DemoSalesRepository();

function isEntityVisible(
  entity: { organizationId: string; locationId: string },
  actor: SalesMutationActor,
): boolean {
  return entity.organizationId === actor.organizationId && (
    entity.locationId === "all" ||
    actor.allowedLocationIds === undefined ||
    actor.allowedLocationIds.includes(entity.locationId)
  );
}

function customersWithDerivedMetrics(
  customers: SalesDataset["customers"],
  sales: SalesDataset["sales"],
): SalesDataset["customers"] {
  return customers.map((customer) => {
    const recognized = sales
      .filter(
        (sale) => sale.customerId === customer.id && netSalesYen(sale) > 0,
      )
      .sort((left, right) => right.soldAt.localeCompare(left.soldAt));
    const totalSalesYen = recognized.reduce(
      (total, sale) => total + netSalesYen(sale),
      0,
    );
    return {
      ...customer,
      purchaseCount: recognized.length,
      totalSalesYen,
      averagePurchaseYen: recognized.length > 0
        ? Math.floor(totalSalesYen / recognized.length)
        : 0,
      lastPurchaseAt: recognized[0]?.soldAt,
    };
  });
}

/**
 * Produces the client-visible snapshot without mutating repository data.
 * Customer aggregates always derive from the sales visible to the actor, so
 * stored denormalized values can never leak or become the KPI source of truth.
 */
export function projectSalesDataset(
  source: SalesDataset,
  actor: SalesMutationActor | null,
): SalesDataset {
  if (!actor || source.organization.id !== actor.organizationId) {
    const organizationId = actor?.organizationId ?? "";
    const actorId = actor?.userId ?? "";
    return {
      ...source,
      organization: {
        id: organizationId,
        organizationId,
        locationId: "all",
        name: actor ? "読み込み中" : "売上管理システム",
        isActive: false,
        isDemo: false,
        timezone: "Asia/Tokyo",
        createdAt: source.generatedAt,
        createdBy: actorId,
        updatedAt: source.generatedAt,
        updatedBy: actorId,
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

  const sales = source.sales.filter((sale) =>
    canReadSale(actor, sale)
  );
  const customers = source.customers.filter((customer) =>
    isEntityVisible(customer, actor)
  );
  const canReadAudit = roleHasPermission(actor.role, "audit:read");
  return {
    ...source,
    organization: { ...source.organization },
    locations: source.locations.filter((entity) => isEntityVisible(entity, actor)),
    staff: source.staff.filter((entity) => isEntityVisible(entity, actor)),
    customers: customersWithDerivedMetrics(customers, sales),
    categories: source.categories.filter((entity) => isEntityVisible(entity, actor)),
    products: source.products.filter((entity) => isEntityVisible(entity, actor)),
    paymentMethods: source.paymentMethods.filter((entity) =>
      isEntityVisible(entity, actor)
    ),
    sales,
    goals: roleHasPermission(actor.role, "analytics:read")
      ? source.goals.filter((entity) => isEntityVisible(entity, actor))
      : [],
    auditLogs: canReadAudit
      ? source.auditLogs.filter((entity) => isEntityVisible(entity, actor))
      : [],
  };
}

function errorMessage(error: unknown): string {
  const rawCode = typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : "";
  const code = rawCode.replace(/^firestore\//, "");
  const firebaseMessages: Readonly<Record<string, string>> = {
    "permission-denied": "このデータを閲覧・変更する権限がありません。",
    unauthenticated: "ログインの有効期限が切れました。もう一度ログインしてください。",
    unavailable: "データベースへ接続できません。通信環境を確認してください。",
    "deadline-exceeded": "データの取得に時間がかかっています。もう一度お試しください。",
    "resource-exhausted": "処理件数が上限を超えました。条件を絞ってお試しください。",
    "failed-precondition": "データ取得に必要なFirestore Indexまたは設定が不足しています。",
    "not-found": "対象のデータが見つかりません。",
    aborted: "同時更新を検出しました。最新データを確認してもう一度お試しください。",
  };
  if (firebaseMessages[code]) return firebaseMessages[code];
  if (
    error instanceof Error &&
    error.message &&
    /[ぁ-んァ-ヶ一-龠]/u.test(error.message)
  ) return error.message;
  return "データ処理に失敗しました。もう一度お試しください。";
}

export function SalesDataProvider({
  children,
  repository,
}: SalesDataProviderProps) {
  const { user } = useAuth();
  const [rawData, setRawData] = useState<SalesDataset>(() =>
    createSalesSampleData(),
  );
  const [loading, setLoading] = useState(true);
  const [pendingMutations, setPendingMutations] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const actor = useMemo<SalesMutationActor | null>(() => {
    if (!user) return null;
    return {
      userId: user.uid,
      userName: user.name,
      role: user.role,
      organizationId: user.organizationId,
      allowedLocationIds:
        user.role === "admin" ? undefined : user.allowedLocationIds,
      staffId: user.staffId,
    };
  }, [user]);

  const activeRepository = useMemo<SalesRepository | null>(() => {
    if (repository) return repository;
    if (!user) return null;
    // This branch must stay ahead of getFirebaseServices: the demo repository
    // never constructs Firestore and all mutations remain in localStorage.
    if (user.isDemo) return sharedDemoRepository;
    const services = getFirebaseServices();
    if (!services || !actor) return null;
    return createFirebaseSalesRepository(services.db, actor);
  }, [actor, repository, user]);

  const data = useMemo(
    () => projectSalesDataset(rawData, actor),
    [actor, rawData],
  );

  useEffect(() => {
    if (!activeRepository) {
      queueMicrotask(() => setLoading(false));
      return;
    }
    let active = true;
    queueMicrotask(() => {
      if (active) setLoading(true);
    });
    const unsubscribe = activeRepository.subscribe(
      (snapshot) => {
        if (!active) return;
        setRawData(snapshot);
        setError(null);
        setLoading(false);
      },
      (reason) => {
        if (!active) return;
        setError(errorMessage(reason));
        setLoading(false);
      },
    );
    void activeRepository
      .getSnapshot()
      .then((snapshot) => {
        if (!active) return;
        setRawData(snapshot);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (active) setError(errorMessage(reason));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [activeRepository]);

  const requireRepository = useCallback((): {
    repository: SalesRepository;
    actor: SalesMutationActor;
  } => {
    if (!activeRepository || !actor) {
      throw new Error("ログインが必要です。");
    }
    return { repository: activeRepository, actor };
  }, [activeRepository, actor]);

  const runMutation = useCallback(async <T,>(
    operation: () => Promise<T>,
  ): Promise<T> => {
    setPendingMutations((count) => count + 1);
    setError(null);
    try {
      return await operation();
    } catch (reason) {
      const message = errorMessage(reason);
      setError(message);
      throw new Error(message);
    } finally {
      setPendingMutations((count) => Math.max(0, count - 1));
    }
  }, []);

  const saveSale = useCallback(
    (sale: Sale) => {
      const current = requireRepository();
      return runMutation(() =>
        current.repository.saveSale(sale, current.actor),
      );
    },
    [requireRepository, runMutation],
  );

  const cancelSale = useCallback(
    (id: string, reason: string) => {
      const current = requireRepository();
      return runMutation(() =>
        current.repository.cancelSale(id, reason, current.actor),
      );
    },
    [requireRepository, runMutation],
  );

  const refundSale = useCallback(
    (id: string, amountYen: number) => {
      const current = requireRepository();
      return runMutation(() =>
        current.repository.refundSale(id, amountYen, current.actor),
      );
    },
    [requireRepository, runMutation],
  );

  const duplicateSale = useCallback(
    (id: string) => {
      const current = requireRepository();
      return runMutation(() =>
        current.repository.duplicateSale(id, current.actor),
      );
    },
    [requireRepository, runMutation],
  );

  const saveProduct = useCallback(
    (product: Product) => {
      const current = requireRepository();
      return runMutation(() =>
        current.repository.saveProduct(product, current.actor),
      );
    },
    [requireRepository, runMutation],
  );

  const saveCustomer = useCallback(
    (customer: Customer) => {
      const current = requireRepository();
      return runMutation(() =>
        current.repository.saveCustomer(customer, current.actor),
      );
    },
    [requireRepository, runMutation],
  );

  const saveStaff = useCallback(
    (staff: Staff) => {
      const current = requireRepository();
      return runMutation(() =>
        current.repository.saveStaff(staff, current.actor),
      );
    },
    [requireRepository, runMutation],
  );

  const saveLocation = useCallback(
    (location: Location) => {
      const current = requireRepository();
      return runMutation(() =>
        current.repository.saveLocation(location, current.actor),
      );
    },
    [requireRepository, runMutation],
  );

  const saveGoal = useCallback(
    (goal: SalesGoal) => {
      const current = requireRepository();
      return runMutation(() =>
        current.repository.saveGoal(goal, current.actor),
      );
    },
    [requireRepository, runMutation],
  );

  const importData = useCallback(
    (kind: ImportKind, records: readonly unknown[]) => {
      const current = requireRepository();
      return runMutation(() =>
        current.repository.importData(kind, records, current.actor),
      );
    },
    [requireRepository, runMutation],
  );

  const resetDemo = useCallback(async () => {
    const current = requireRepository();
    if (!user?.isDemo || !current.repository.reset) {
      throw new Error("デモデータのみ初期状態に戻せます。");
    }
    await runMutation(async () => {
      setRawData(await current.repository.reset!());
    });
  }, [requireRepository, runMutation, user?.isDemo]);

  const checkPermission = useCallback(
    (permission: Permission) =>
      user ? roleHasPermission(user.role, permission) : false,
    [user],
  );

  const value = useMemo<SalesDataContextValue>(
    () => ({
      data,
      loading,
      saving: pendingMutations > 0,
      error,
      saveSale,
      cancelSale,
      refundSale,
      duplicateSale,
      saveProduct,
      saveCustomer,
      saveStaff,
      saveLocation,
      saveGoal,
      importData,
      resetDemo,
      hasPermission: checkPermission,
    }),
    [
      data,
      loading,
      pendingMutations,
      error,
      saveSale,
      cancelSale,
      refundSale,
      duplicateSale,
      saveProduct,
      saveCustomer,
      saveStaff,
      saveLocation,
      saveGoal,
      importData,
      resetDemo,
      checkPermission,
    ],
  );

  return (
    <SalesDataContext.Provider value={value}>
      {children}
    </SalesDataContext.Provider>
  );
}

export const SalesProvider = SalesDataProvider;

export function useSalesData(): SalesDataContextValue {
  const context = useContext(SalesDataContext);
  if (!context) {
    throw new Error("useSalesData must be used within SalesDataProvider");
  }
  return context;
}
