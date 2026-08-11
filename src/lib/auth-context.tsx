"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  type User as FirebaseUser,
} from "firebase/auth";
import {
  doc,
  getDoc,
  serverTimestamp,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import {
  getFirebaseAuthServices,
  getFirebaseServices,
  isFirebaseConfigured,
  type FirebaseAuthServices,
  type FirebaseServices,
} from "@/lib/firebase";
import type { UserRole as SalesUserRole } from "@/lib/sales/types";

export type UserRole = SalesUserRole;

export interface AuthUser {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  organizationId: string;
  organizationName: string;
  locationId: string;
  locationName: string;
  allowedLocationIds: string[];
  staffId?: string;
  isDemo: boolean;
}

export interface RegistrationInput {
  name: string;
  companyName: string;
  email: string;
  password: string;
}

export interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  firebaseEnabled: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: RegistrationInput) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  startDemo: (role?: UserRole) => void;
  setDemoRole: (role: UserRole) => void;
  logout: () => Promise<void>;
}

interface DemoSessionEnvelope {
  version: 1;
  role: UserRole;
  sessionId: string;
}

const AuthContext = createContext<AuthContextValue | null>(null);
export const DEMO_SESSION_STORAGE_KEY = "sales-management:demo-session:v1";
const VALID_ROLES: readonly UserRole[] = [
  "admin",
  "manager",
  "user",
  "viewer",
];

const DEMO_PROFILES: Readonly<
  Record<UserRole, Pick<AuthUser, "name" | "email" | "staffId">>
> = {
  admin: {
    name: "佐倉 ひなた",
    email: "sales-admin@example.invalid",
    staffId: "staff-001",
  },
  manager: {
    name: "水野 颯太",
    email: "sales-manager@example.invalid",
    staffId: "staff-002",
  },
  user: {
    name: "小森 つばさ",
    email: "sales-user@example.invalid",
    staffId: "staff-003",
  },
  viewer: {
    name: "森川 凛",
    email: "sales-viewer@example.invalid",
  },
};

const DEMO_USER_IDS: Readonly<Record<UserRole, string>> = {
  admin: "demo-user-admin",
  manager: "demo-user-manager",
  user: "demo-user-user",
  viewer: "demo-user-viewer",
};

const DEMO_LOCATION_IDS: Readonly<Record<UserRole, string>> = {
  admin: "location-1",
  manager: "location-2",
  user: "location-3",
  viewer: "location-1",
};

const DEMO_LOCATION_NAMES: Readonly<Record<UserRole, string>> = {
  admin: "青葉中央店",
  manager: "海風駅前店",
  user: "月見ヶ丘店",
  viewer: "青葉中央店",
};

const INITIAL_PAYMENT_METHODS = [
  { code: "cash", name: "現金", sortOrder: 1 },
  { code: "credit_card", name: "クレジットカード", sortOrder: 2 },
  { code: "qr", name: "QRコード決済", sortOrder: 3 },
  { code: "electronic_money", name: "電子マネー", sortOrder: 4 },
  { code: "bank_transfer", name: "銀行振込", sortOrder: 5 },
  { code: "other", name: "その他", sortOrder: 6 },
] as const;

const INITIAL_CATEGORIES = [
  { code: "product", name: "商品", sortOrder: 1 },
  { code: "service", name: "サービス", sortOrder: 2 },
  { code: "other", name: "その他", sortOrder: 3 },
] as const;

function isRole(value: unknown): value is UserRole {
  return typeof value === "string" && VALID_ROLES.includes(value as UserRole);
}

function newSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `demo-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readDemoSession(): DemoSessionEnvelope | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DEMO_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DemoSessionEnvelope>;
    if (
      parsed.version !== 1 ||
      !isRole(parsed.role) ||
      typeof parsed.sessionId !== "string" ||
      parsed.sessionId.length < 8
    ) {
      window.localStorage.removeItem(DEMO_SESSION_STORAGE_KEY);
      return null;
    }
    return parsed as DemoSessionEnvelope;
  } catch {
    try {
      window.localStorage.removeItem(DEMO_SESSION_STORAGE_KEY);
    } catch {
      // An in-memory demo remains usable when browser storage is unavailable.
    }
    return null;
  }
}

function persistDemoSession(
  role: UserRole | null,
  existingSessionId?: string,
): DemoSessionEnvelope | null {
  if (!role) {
    try {
      window.localStorage.removeItem(DEMO_SESSION_STORAGE_KEY);
    } catch {
      // Clearing React state below is sufficient when storage is unavailable.
    }
    return null;
  }
  const envelope: DemoSessionEnvelope = {
    version: 1,
    role,
    sessionId: existingSessionId || newSessionId(),
  };
  try {
    window.localStorage.setItem(
      DEMO_SESSION_STORAGE_KEY,
      JSON.stringify(envelope),
    );
  } catch {
    // Private browsing can block storage; keep the in-memory session usable.
  }
  return envelope;
}

function demoUser(role: UserRole): AuthUser {
  const profile = DEMO_PROFILES[role];
  const allLocationIds = ["location-1", "location-2", "location-3"];
  return {
    uid: DEMO_USER_IDS[role],
    name: profile.name,
    email: profile.email,
    role,
    organizationId: "org-sales-demo",
    organizationName: "株式会社青空フィールド（デモ）",
    locationId: DEMO_LOCATION_IDS[role],
    locationName: DEMO_LOCATION_NAMES[role],
    allowedLocationIds: role === "user" ? ["location-3"] : allLocationIds,
    staffId: profile.staffId,
    isDemo: true,
  };
}

export function messageForAuthError(error: unknown): string {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : "";
  const messages: Readonly<Record<string, string>> = {
    "auth/invalid-credential":
      "メールアドレスまたはパスワードが正しくありません。",
    "auth/invalid-email": "メールアドレスの形式を確認してください。",
    "auth/email-already-in-use":
      "このメールアドレスはすでに登録されています。",
    "auth/weak-password": "パスワードは8文字以上で入力してください。",
    "auth/too-many-requests":
      "試行回数が多すぎます。時間をおいてもう一度お試しください。",
    "auth/network-request-failed":
      "通信に失敗しました。ネットワーク接続を確認してください。",
    "auth/user-disabled":
      "このアカウントは無効です。管理者へお問い合わせください。",
    "permission-denied": "この操作を行う権限がありません。",
  };
  if (messages[code]) return messages[code];
  if (error instanceof Error && error.message) return error.message;
  return "認証処理に失敗しました。時間をおいてもう一度お試しください。";
}

async function loadProfile(
  db: Firestore,
  firebaseUser: FirebaseUser,
): Promise<AuthUser> {
  const userSnapshot = await getDoc(doc(db, "users", firebaseUser.uid));
  if (!userSnapshot.exists()) {
    throw new Error(
      "ユーザー情報が見つかりません。管理者へお問い合わせください。",
    );
  }
  const profile = userSnapshot.data();
  const organizationId = String(profile.organizationId || "");
  const locationId = String(profile.locationId || "");
  if (
    !organizationId ||
    !locationId ||
    profile.isActive !== true ||
    !isRole(profile.role)
  ) {
    throw new Error("このアカウントでは売上データへアクセスできません。");
  }

  const [organizationSnapshot, locationSnapshot] = await Promise.all([
    getDoc(doc(db, "organizations", organizationId)),
    getDoc(doc(db, "locations", locationId)),
  ]);
  if (
    !organizationSnapshot.exists() ||
    organizationSnapshot.data().isActive !== true ||
    !locationSnapshot.exists() ||
    locationSnapshot.data().isActive !== true
  ) {
    throw new Error("所属組織または店舗が無効です。");
  }

  const allowedLocationIds = Array.isArray(profile.allowedLocationIds)
    ? [...new Set(profile.allowedLocationIds.filter(
        (value: unknown): value is string =>
          typeof value === "string" && value.length > 0,
      ))]
    : [locationId];
  if (
    profile.role !== "admin" &&
    (
      allowedLocationIds.length === 0 ||
      allowedLocationIds.length > 29 ||
      !allowedLocationIds.includes(locationId)
    )
  ) {
    throw new Error("閲覧できる店舗の設定が正しくありません。管理者へお問い合わせください。");
  }

  return {
    uid: firebaseUser.uid,
    name: String(profile.name || profile.displayName || "ユーザー"),
    email: firebaseUser.email || String(profile.email || ""),
    role: profile.role,
    organizationId,
    organizationName: String(organizationSnapshot.data().name || "所属組織"),
    locationId,
    locationName: String(locationSnapshot.data().name || "所属店舗"),
    allowedLocationIds,
    staffId:
      typeof profile.staffId === "string" ? profile.staffId : undefined,
    isDemo: false,
  };
}

async function createInitialTenant(
  services: FirebaseServices,
  firebaseUser: FirebaseUser,
  input: RegistrationInput,
): Promise<void> {
  const uid = firebaseUser.uid;
  const organizationId = `org-${uid}`;
  const locationId = `loc-${uid}`;
  const staffId = `staff-${uid}`;
  const batch = writeBatch(services.db);
  const audit = {
    createdAt: serverTimestamp(),
    createdBy: uid,
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  };

  batch.set(doc(services.db, "organizations", organizationId), {
    id: organizationId,
    organizationId,
    locationId: "all",
    name: input.companyName.trim(),
    ownerId: uid,
    timezone: "Asia/Tokyo",
    currency: "JPY",
    taxRoundingMode: "floor",
    isActive: true,
    isDemo: false,
    ...audit,
  });
  batch.set(doc(services.db, "locations", locationId), {
    id: locationId,
    organizationId,
    locationId,
    code: "MAIN",
    name: "本店",
    address: "",
    phone: "",
    timezone: "Asia/Tokyo",
    isActive: true,
    ...audit,
  });
  batch.set(doc(services.db, "users", uid), {
    id: uid,
    userId: uid,
    organizationId,
    locationId,
    allowedLocationIds: [locationId],
    staffId,
    name: input.name.trim(),
    displayName: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    role: "admin",
    isActive: true,
    ...audit,
  });
  batch.set(doc(services.db, "staff", staffId), {
    id: staffId,
    organizationId,
    locationId,
    linkedUserId: uid,
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    department: "管理部",
    title: "管理者",
    role: "admin",
    monthlySalesTargetYen: 0,
    isActive: true,
    ...audit,
  });
  batch.set(doc(services.db, "settings", organizationId), {
    id: organizationId,
    organizationId,
    locationId,
    systemName: "売上管理システム",
    locale: "ja-JP",
    timezone: "Asia/Tokyo",
    currency: "JPY",
    taxRoundingMode: "floor",
    defaultTaxRateBp: 1000,
    fiscalYearStartMonth: 1,
    ...audit,
  });

  for (const method of INITIAL_PAYMENT_METHODS) {
    const id = `${organizationId}-${method.code}`;
    batch.set(doc(services.db, "paymentMethods", id), {
      id,
      organizationId,
      locationId,
      ...method,
      isActive: true,
      ...audit,
    });
  }
  for (const category of INITIAL_CATEGORIES) {
    const id = `${organizationId}-category-${category.code}`;
    batch.set(doc(services.db, "categories", id), {
      id,
      organizationId,
      locationId: "all",
      ...category,
      isActive: true,
      ...audit,
    });
  }
  await batch.commit();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const servicesRef = useRef<FirebaseServices | null>(null);
  const authRef = useRef<ReturnType<typeof getFirebaseAuthServices>>(null);
  const authObserverRef = useRef<ReturnType<typeof onAuthStateChanged> | null>(
    null,
  );
  const registrationInProgress = useRef(false);
  const demoSessionIdRef = useRef<string | null>(null);

  const startFirebaseObserver = useCallback((authServices: FirebaseAuthServices) => {
    if (authObserverRef.current) return;
    authObserverRef.current = onAuthStateChanged(
      authServices.auth,
      (firebaseUser) => {
        if (demoSessionIdRef.current) return;
        if (registrationInProgress.current) return;
        if (!firebaseUser) {
          setUser(null);
          setLoading(false);
          return;
        }
        const services = getFirebaseServices();
        servicesRef.current = services;
        authRef.current = services;
        if (!services) {
          setUser(null);
          setLoading(false);
          return;
        }
        setLoading(true);
        void loadProfile(services.db, firebaseUser)
          .then((profile) => {
            if (!demoSessionIdRef.current) setUser(profile);
          })
          .catch(async () => {
            if (demoSessionIdRef.current) return;
            await signOut(authServices.auth).catch(() => undefined);
            setUser(null);
          })
          .finally(() => {
            if (!demoSessionIdRef.current) setLoading(false);
          });
      },
    );
  }, []);

  useEffect(() => {
    const stopObserver = () => {
      authObserverRef.current?.();
      authObserverRef.current = null;
    };
    const storedDemo = readDemoSession();
    const directDemo = typeof window !== "undefined" &&
      window.location.pathname.replace(/\/+$/, "") === "/demo";
    if (storedDemo || directDemo) {
      const session = storedDemo ?? persistDemoSession("admin");
      demoSessionIdRef.current = session?.sessionId ?? newSessionId();
      queueMicrotask(() => {
        setUser(demoUser(session?.role ?? "admin"));
        setLoading(false);
      });
      return stopObserver;
    }

    const authServices = getFirebaseAuthServices();
    authRef.current = authServices;
    if (!authServices) {
      queueMicrotask(() => setLoading(false));
      return stopObserver;
    }
    startFirebaseObserver(authServices);
    return stopObserver;
  }, [startFirebaseObserver]);

  const login = useCallback(async (email: string, password: string) => {
    persistDemoSession(null);
    demoSessionIdRef.current = null;
    const services = getFirebaseServices();
    servicesRef.current = services;
    authRef.current = services;
    if (!services) {
      throw new Error(
        "Firebaseが設定されていません。デモをお試しください。",
      );
    }
    try {
      const credential = await signInWithEmailAndPassword(
        services.auth,
        email.trim(),
        password,
      );
      setUser(await loadProfile(services.db, credential.user));
      startFirebaseObserver(services);
    } catch (error) {
      await signOut(services.auth).catch(() => undefined);
      setUser(null);
      throw new Error(messageForAuthError(error));
    }
  }, [startFirebaseObserver]);

  const register = useCallback(async (input: RegistrationInput) => {
    persistDemoSession(null);
    demoSessionIdRef.current = null;
    const services = getFirebaseServices();
    servicesRef.current = services;
    authRef.current = services;
    if (!services) {
      throw new Error("新規登録にはFirebaseの設定が必要です。");
    }
    if (input.name.trim().length < 2 || input.companyName.trim().length < 2) {
      throw new Error("お名前と会社・店舗名は2文字以上で入力してください。");
    }
    if (input.password.length < 8) {
      throw new Error("パスワードは8文字以上で入力してください。");
    }

    registrationInProgress.current = true;
    let createdUser: FirebaseUser | null = null;
    let bootstrapCommitted = false;
    try {
      const credential = await createUserWithEmailAndPassword(
        services.auth,
        input.email.trim(),
        input.password,
      );
      createdUser = credential.user;
      await createInitialTenant(services, credential.user, input);
      bootstrapCommitted = true;
      setUser(await loadProfile(services.db, credential.user));
      startFirebaseObserver(services);
    } catch (error) {
      if (createdUser && !bootstrapCommitted) {
        await deleteUser(createdUser).catch(() => undefined);
      }
      await signOut(services.auth).catch(() => undefined);
      setUser(null);
      if (bootstrapCommitted) {
        throw new Error(
          "初期設定は完了しましたが、ユーザー情報を読み込めませんでした。もう一度ログインしてください。",
        );
      }
      throw new Error(messageForAuthError(error));
    } finally {
      registrationInProgress.current = false;
    }
  }, [startFirebaseObserver]);

  const resetPassword = useCallback(async (email: string) => {
    const services = getFirebaseAuthServices();
    authRef.current = services;
    if (!services) {
      throw new Error("パスワード再設定にはFirebaseの設定が必要です。");
    }
    try {
      await sendPasswordResetEmail(services.auth, email.trim());
    } catch (error) {
      throw new Error(messageForAuthError(error));
    }
  }, []);

  const startDemo = useCallback((role: UserRole = "admin") => {
    const envelope = persistDemoSession(role);
    demoSessionIdRef.current = envelope?.sessionId ?? newSessionId();
    const auth = authRef.current?.auth ?? servicesRef.current?.auth;
    if (auth?.currentUser) {
      void signOut(auth).catch(() => undefined);
    }
    setUser(demoUser(role));
    setLoading(false);
  }, []);

  const setDemoRole = useCallback((role: UserRole) => {
    const envelope = persistDemoSession(
      role,
      demoSessionIdRef.current ?? undefined,
    );
    demoSessionIdRef.current = envelope?.sessionId ?? null;
    setUser(demoUser(role));
  }, []);

  const logout = useCallback(async () => {
    persistDemoSession(null);
    demoSessionIdRef.current = null;
    const auth = authRef.current?.auth ?? servicesRef.current?.auth;
    if (auth?.currentUser) {
      await signOut(auth);
    }
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      firebaseEnabled: isFirebaseConfigured,
      login,
      register,
      resetPassword,
      startDemo,
      setDemoRole,
      logout,
    }),
    [
      user,
      loading,
      login,
      register,
      resetPassword,
      startDemo,
      setDemoRole,
      logout,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
