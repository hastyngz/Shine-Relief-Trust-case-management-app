import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getAuth, Auth } from 'firebase/auth';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import firebaseConfig from '../firebase-applet-config.json';

export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Initialize Firestore with the project's provisioned database ID
export const firestore: Firestore = getFirestore(
  app,
  firebaseConfig.firestoreDatabaseId || '(default)'
);

// Initialize Firebase Auth
export const auth: Auth = getAuth(app);

// Initialize Firebase Storage
export const storage: FirebaseStorage = getStorage(app);

export default firestore;
