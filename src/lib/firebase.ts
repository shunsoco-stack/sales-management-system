import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  connectAuthEmulator,
  getAuth,
  type Auth,
} from "firebase/auth";
import {
  connectFirestoreEmulator,
  getFirestore,
  type Firestore,
} from "firebase/firestore";

export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/**
 * Keep Firebase lazy. A portfolio visitor can enter the browser-isolated demo
 * without constructing an Auth or Firestore instance, even when production
 * credentials were embedded at build time.
 */
export const isFirebaseConfigured = [
  firebaseConfig.apiKey,
  firebaseConfig.authDomain,
  firebaseConfig.projectId,
  firebaseConfig.appId,
].every((value) => typeof value === "string" && value.trim().length > 0);

export interface FirebaseServices {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
}

export interface FirebaseAuthServices {
  app: FirebaseApp;
  auth: Auth;
}

let authServices: FirebaseAuthServices | null = null;
let firestoreInstance: Firestore | null = null;

interface FirebaseGlobalState {
  __SALES_MANAGEMENT_AUTH_EMULATOR__?: boolean;
  __SALES_MANAGEMENT_FIRESTORE_EMULATOR__?: boolean;
}

function configureAuthEmulator(auth: Auth): void {
  if (
    typeof window === "undefined" ||
    process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS !== "true"
  ) {
    return;
  }

  const shared = globalThis as typeof globalThis & FirebaseGlobalState;
  const host = process.env.NEXT_PUBLIC_FIREBASE_EMULATOR_HOST || "127.0.0.1";

  if (!shared.__SALES_MANAGEMENT_AUTH_EMULATOR__) {
    connectAuthEmulator(auth, `http://${host}:9098`, {
      disableWarnings: true,
    });
    shared.__SALES_MANAGEMENT_AUTH_EMULATOR__ = true;
  }

}

function configureFirestoreEmulator(db: Firestore): void {
  if (
    typeof window === "undefined" ||
    process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS !== "true"
  ) {
    return;
  }
  const shared = globalThis as typeof globalThis & FirebaseGlobalState;
  const host = process.env.NEXT_PUBLIC_FIREBASE_EMULATOR_HOST || "127.0.0.1";
  if (!shared.__SALES_MANAGEMENT_FIRESTORE_EMULATOR__) {
    connectFirestoreEmulator(db, host, 8081);
    shared.__SALES_MANAGEMENT_FIRESTORE_EMULATOR__ = true;
  }
}

/** Initializes only Firebase App/Auth. The demo login page never needs Firestore. */
export function getFirebaseAuthServices(): FirebaseAuthServices | null {
  if (!isFirebaseConfigured) return null;
  if (authServices) return authServices;

  const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  const auth = getAuth(app);
  configureAuthEmulator(auth);
  authServices = { app, auth };
  return authServices;
}

/** Returns null when Firebase has not been configured for this build. */
export function getFirebaseServices(): FirebaseServices | null {
  const base = getFirebaseAuthServices();
  if (!base) return null;
  if (!firestoreInstance) {
    firestoreInstance = getFirestore(base.app);
    configureFirestoreEmulator(firestoreInstance);
  }
  return { ...base, db: firestoreInstance };
}

/** Test-only hook used to prove that demo mode never initializes Firebase. */
export function firebaseServicesWereInitialized(): boolean {
  return firestoreInstance !== null;
}
