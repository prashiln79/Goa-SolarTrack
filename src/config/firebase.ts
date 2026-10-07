import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';

// User-provided Firebase Configuration
export const firebaseConfig = {
  apiKey: 'AIzaSyCbi9w0M2U4jtO6tkf78SHvXrgvL4TbyqI',
  authDomain: 'money-manager-b394e.firebaseapp.com',
  projectId: 'money-manager-b394e',
  storageBucket: 'money-manager-b394e.firebasestorage.app',
  messagingSenderId: '844099376199',
  appId: '1:844099376199:web:d778d53279e65258b48d62',
  measurementId: 'G-G75KP504VD',
};

// Initialize Firebase App singleton
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Cloud Firestore
export const db: Firestore = getFirestore(app);

export default app;
