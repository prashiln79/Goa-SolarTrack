// ============================================================
// GOA SOLARTRACKER — Firebase + Local Storage Repository
// PRD §9 / §11 — Dual persistence: Firestore + AsyncStorage.
// No-login mode: Firestore rules must allow open read/write.
// ============================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  orderBy,
  getDoc,
} from 'firebase/firestore';
import { db } from '../config/firebase';
export type { SyncStatus } from '../types/solar';
import {
  SolarBill,
  CleaningEvent,
  SystemProfile,
} from '../types/solar';
import type { SyncStatus } from '../types/solar';
import { CANONICAL_AUGUST_2026_BILL } from '../domain/energyAccounting';

// ── AsyncStorage Keys ────────────────────────────────────────
const KEYS = {
  BILLS:    '@goa_solar_bills_v2',
  CLEANINGS:'@goa_solar_cleanings_v2',
  PROFILE:  '@goa_solar_profile_v2',
};

// ── Default System Profile ───────────────────────────────────
export const DEFAULT_SYSTEM_PROFILE: SystemProfile = {
  id: 'goa-solar-primary',
  systemName: 'My Rooftop Solar',
  capacityKw: 5.3,
  location: 'Panaji, North Goa',
  taluka: 'Tiswadi',
  tariffCategory: 'LTDS-II-SOLAR',
  installationDate: '2025-01-15',
  panelCount: 12,
  inverterMake: 'Growatt',
  inverterModel: 'Growatt 5kW Dual MPPT',
  lastCleanedDate: '2026-08-10',
  settlementRateInr: 3.50, // APPC benchmark — reconfigure per JERC announcement
};

// ── Sync Status Pub/Sub ──────────────────────────────────────
let _syncStatus: SyncStatus = {
  isFirestoreConnected: false,
  lastSyncedAt: null,
  message: 'Initialising…',
};
const _listeners: ((s: SyncStatus) => void)[] = [];

export function subscribeToSyncStatus(
  listener: (s: SyncStatus) => void
): () => void {
  _listeners.push(listener);
  listener(_syncStatus);
  return () => {
    const i = _listeners.indexOf(listener);
    if (i > -1) _listeners.splice(i, 1);
  };
}

function setSyncStatus(partial: Partial<SyncStatus>) {
  _syncStatus = { ..._syncStatus, ...partial };
  _listeners.forEach((l) => l(_syncStatus));
}

// ── Firestore Health Check ───────────────────────────────────
export async function testFirestoreConnection(): Promise<SyncStatus> {
  try {
    const ping = doc(db, 'system_health', 'ping');
    await setDoc(ping, { ts: Date.now(), platform: 'expo-rn' }, { merge: true });
    const status: SyncStatus = {
      isFirestoreConnected: true,
      lastSyncedAt: new Date(),
      message: `Connected to ${db.app.options.projectId}`,
    };
    setSyncStatus(status);
    return status;
  } catch (err: any) {
    const msg =
      err?.code === 'permission-denied'
        ? 'Firestore permission-denied — set rules to allow read/write for no-login mode (PRD §9)'
        : `Offline — using local cache: ${err?.message ?? 'unknown'}`;
    const status: SyncStatus = {
      isFirestoreConnected: false,
      lastSyncedAt: new Date(),
      message: msg,
    };
    setSyncStatus(status);
    return status;
  }
}

// ── Bills ─────────────────────────────────────────────────────

export async function getBills(): Promise<SolarBill[]> {
  // 1. Try Firestore
  try {
    const col = collection(db, 'solar_bills');
    const snap = await getDocs(query(col, orderBy('periodStart', 'desc')));
    if (!snap.empty) {
      const bills = snap.docs.map((d) => d.data() as SolarBill);
      await AsyncStorage.setItem(KEYS.BILLS, JSON.stringify(bills));
      setSyncStatus({ isFirestoreConnected: true, lastSyncedAt: new Date(), message: 'Bills synced from Firestore' });
      return bills;
    }
  } catch (_) {}

  // 2. Fallback: local cache
  try {
    const raw = await AsyncStorage.getItem(KEYS.BILLS);
    if (raw) return JSON.parse(raw) as SolarBill[];
  } catch (_) {}

  // 3. First-run seed with canonical fixture
  const seed = [{ ...CANONICAL_AUGUST_2026_BILL, createdAt: Date.now() }];
  await AsyncStorage.setItem(KEYS.BILLS, JSON.stringify(seed));
  _pushToFirestore('solar_bills', CANONICAL_AUGUST_2026_BILL.id, seed[0]);
  return seed;
}

export async function saveBill(bill: SolarBill): Promise<void> {
  // Update local first (optimistic)
  const current = await getBills();
  const idx = current.findIndex((b) => b.id === bill.id);
  const updated = idx >= 0
    ? [...current.slice(0, idx), bill, ...current.slice(idx + 1)]
    : [bill, ...current];
  await AsyncStorage.setItem(KEYS.BILLS, JSON.stringify(updated));

  // Push to Firestore
  await _pushToFirestore('solar_bills', bill.id, bill);
}

export async function deleteBill(billId: string): Promise<void> {
  const current = await getBills();
  const updated = current.filter((b) => b.id !== billId);
  await AsyncStorage.setItem(KEYS.BILLS, JSON.stringify(updated));
  try {
    await deleteDoc(doc(db, 'solar_bills', billId));
    setSyncStatus({ lastSyncedAt: new Date(), message: 'Bill removed from Firestore' });
  } catch (_) {}
}

// ── Cleaning Events ───────────────────────────────────────────

export async function getCleaningEvents(): Promise<CleaningEvent[]> {
  try {
    const col = collection(db, 'solar_cleanings');
    const snap = await getDocs(query(col, orderBy('date', 'desc')));
    if (!snap.empty) {
      const evts = snap.docs.map((d) => d.data() as CleaningEvent);
      await AsyncStorage.setItem(KEYS.CLEANINGS, JSON.stringify(evts));
      return evts;
    }
  } catch (_) {}

  try {
    const raw = await AsyncStorage.getItem(KEYS.CLEANINGS);
    if (raw) return JSON.parse(raw) as CleaningEvent[];
  } catch (_) {}

  // Seed a default
  const seed: CleaningEvent[] = [
    {
      id: 'clean-seed-1',
      date: '2026-08-10',
      notes: 'Routine pre-monsoon-end wash. Dust layer cleared from all panels.',
      provider: 'Self-cleaned',
      createdAt: Date.now() - 30 * 86_400_000,
    },
  ];
  await AsyncStorage.setItem(KEYS.CLEANINGS, JSON.stringify(seed));
  return seed;
}

export async function saveCleaningEvent(event: CleaningEvent): Promise<void> {
  const current = await getCleaningEvents();
  const updated = [event, ...current];
  await AsyncStorage.setItem(KEYS.CLEANINGS, JSON.stringify(updated));

  // Also update lastCleanedDate on profile
  const profile = await getSystemProfile();
  if (!profile.lastCleanedDate || event.date > profile.lastCleanedDate) {
    await saveSystemProfile({ ...profile, lastCleanedDate: event.date });
  }

  await _pushToFirestore('solar_cleanings', event.id, event);
}

// ── System Profile ────────────────────────────────────────────

export async function getSystemProfile(): Promise<SystemProfile> {
  try {
    const d = await getDoc(doc(db, 'solar_system_profile', 'default'));
    if (d.exists()) {
      const p = d.data() as SystemProfile;
      await AsyncStorage.setItem(KEYS.PROFILE, JSON.stringify(p));
      return p;
    }
  } catch (_) {}

  try {
    const raw = await AsyncStorage.getItem(KEYS.PROFILE);
    if (raw) return JSON.parse(raw) as SystemProfile;
  } catch (_) {}

  await AsyncStorage.setItem(KEYS.PROFILE, JSON.stringify(DEFAULT_SYSTEM_PROFILE));
  return DEFAULT_SYSTEM_PROFILE;
}

export async function saveSystemProfile(profile: SystemProfile): Promise<void> {
  await AsyncStorage.setItem(KEYS.PROFILE, JSON.stringify(profile));
  await _pushToFirestore('solar_system_profile', 'default', profile);
}

// ── Canonical Data Seed ───────────────────────────────────────
export async function seedCanonicalData(): Promise<void> {
  await saveBill({ ...CANONICAL_AUGUST_2026_BILL, createdAt: Date.now() });
}

// ── Private Helpers ───────────────────────────────────────────
async function _pushToFirestore(
  collectionPath: string,
  docId: string,
  data: object
): Promise<void> {
  try {
    await setDoc(doc(db, collectionPath, docId), data);
    setSyncStatus({
      isFirestoreConnected: true,
      lastSyncedAt: new Date(),
      message: `Saved to Firestore (${collectionPath}/${docId})`,
    });
  } catch (err: any) {
    setSyncStatus({
      isFirestoreConnected: false,
      message:
        err?.code === 'permission-denied'
          ? 'Stored locally — Firestore rules block writes (open rules to enable cloud sync)'
          : `Stored locally — offline mode: ${err?.message ?? ''}`,
    });
  }
}
