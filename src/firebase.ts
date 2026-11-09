import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getAuth, Auth } from 'firebase/auth';
import * as firestoreModule from 'firebase/firestore';
import * as authModule from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';

export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Initialize Firestore with the project's default database
export const firestore: Firestore = getFirestore(app);

// Initialize Firebase Auth
export const auth: Auth = getAuth(app);

// End-to-end tests run against the local Firebase emulators. This is opt-in via
// an env var so production and normal development always talk to the real
// project; the emulator is never reached unless the flag is explicitly set.
//
// The connect helpers are read off the module namespace rather than imported by
// name because the tsx test runner resolves `firebase/auth` differently from
// Vite and does not always expose the named export. `import.meta.env` is likewise
// Vite-only, hence the guard.
const emulatorEnv =
  typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : ({} as Record<string, string>);

if (emulatorEnv.VITE_USE_FIREBASE_EMULATORS === 'true') {
  const host = emulatorEnv.VITE_FIREBASE_EMULATOR_HOST || '127.0.0.1';
  const connectFirestore = (firestoreModule as Record<string, unknown>).connectFirestoreEmulator;
  const connectAuth = (authModule as Record<string, unknown>).connectAuthEmulator;
  if (typeof connectFirestore === 'function') connectFirestore(firestore, host, 8080);
  if (typeof connectAuth === 'function') connectAuth(auth, `http://${host}:9099`, { disableWarnings: true });
}

export default firestore;
