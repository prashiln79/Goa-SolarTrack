// ============================================================
// GOA SOLARTRACKER — Firebase + Local Storage Repository
// Proper nested Firestore hierarchy:
//   solar/{consumerNumber}               -> Profile document
//   solar/{consumerNumber}/bills/{id}    -> Monthly bills subcollection
//   solar/{consumerNumber}/cleanings/{id}-> Maintenance subcollection
// ============================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  getDoc,
} from 'firebase/firestore';
import { db } from '../config/firebase';
export type { SyncStatus } from '../types/solar';
import {
  SolarBill,
  CleaningEvent,
  SystemProfile,
  SyncStatus,
} from '../types/solar';
import { CANONICAL_AUGUST_2026_BILL } from '../domain/energyAccounting';

// ── Active Consumer Number State ─────────────────────────────
const STORAGE_KEY_ACTIVE_CONSUMER = '@goa_solar_active_consumer_number';

let _activeConsumerNumber: string | null = null;

export function setActiveConsumerNumber(consumerNumber: string | null) {
  _activeConsumerNumber = consumerNumber ? consumerNumber.trim() : null;
}

export function getActiveConsumerNumber(): string | null {
  return _activeConsumerNumber;
}

export async function loadStoredConsumerNumber(): Promise<string | null> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY_ACTIVE_CONSUMER);
    if (stored && stored.trim().length > 0) {
      _activeConsumerNumber = stored.trim();
      return _activeConsumerNumber;
    }
  } catch (e) {
    console.error('Error loading stored consumer number:', e);
  }
  return null;
}

export async function saveActiveConsumerNumber(consumerNumber: string): Promise<void> {
  const clean = consumerNumber.trim();
  _activeConsumerNumber = clean;
  await AsyncStorage.setItem(STORAGE_KEY_ACTIVE_CONSUMER, clean);
}

export async function clearActiveConsumerNumber(): Promise<void> {
  _activeConsumerNumber = null;
  await AsyncStorage.removeItem(STORAGE_KEY_ACTIVE_CONSUMER);
}

// ── Keys helper ──────────────────────────────────────────────
function getKeys(consumerNumber: string) {
  const clean = consumerNumber.trim();
  return {
    BILLS: `@goa_solar_bills_${clean}`,
    CLEANINGS: `@goa_solar_cleanings_${clean}`,
    PROFILE: `@goa_solar_profile_${clean}`,
  };
}

// ── Firestore Sanitizer ──────────────────────────────────────
export function cleanForFirestore<T extends Record<string, any>>(obj: T): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        result[key] = cleanForFirestore(value);
      } else {
        result[key] = value;
      }
    }
  }
  return result;
}

// ── Profile Factory ──────────────────────────────────────────
export function createDefaultProfile(
  consumerNumber: string,
  initialData?: Partial<SystemProfile>
): SystemProfile {
  const clean = consumerNumber.trim();
  return {
    id: clean,
    consumerNumber: clean,
    systemName: initialData?.systemName || `Consumer ${clean}`,
    capacityKw: initialData?.capacityKw ?? 5.0,
    location: initialData?.location || 'Goa, India',
    taluka: initialData?.taluka || '',
    tariffCategory: initialData?.tariffCategory || 'LTDS-II-SOLAR',
    installationDate: initialData?.installationDate || new Date().toISOString().split('T')[0],
    panelCount: initialData?.panelCount,
    inverterMake: initialData?.inverterMake,
    inverterModel: initialData?.inverterModel,
    lastCleanedDate: initialData?.lastCleanedDate,
    settlementRateInr: initialData?.settlementRateInr ?? 3.50,
  };
}

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
    const ping = doc(db, 'solar', 'ping');
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
        ? 'Firestore permission-denied — please allow solar subcollections in rules'
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

// ── Bills (Subcollection: solar/{consumerNumber}/bills) ───────

export async function getBills(consumerNumber?: string): Promise<SolarBill[]> {
  const cNum = consumerNumber ?? _activeConsumerNumber ?? 'primary';
  const keys = getKeys(cNum);

  // 1. Try Firestore subcollection: solar/{cNum}/bills
  try {
    const billsCol = collection(db, 'solar', cNum, 'bills');
    const snap = await getDocs(billsCol);
    let bills = snap.docs
      .map((d) => d.data() as SolarBill)
      .sort((a, b) => new Date(b.periodStart).getTime() - new Date(a.periodStart).getTime());

    // Fallback: check legacy flat doc names if subcollection is empty
    if (bills.length === 0) {
      try {
        const flatSnap = await getDocs(collection(db, 'solar'));
        const legacy = flatSnap.docs
          .filter(
            (d) =>
              d.id.startsWith(`${cNum}_bill_`) ||
              (d.id.startsWith('bill_') && (!d.data().consumerNumber || d.data().consumerNumber === cNum))
          )
          .map((d) => d.data() as SolarBill);

        if (legacy.length > 0) {
          bills = legacy.sort((a, b) => new Date(b.periodStart).getTime() - new Date(a.periodStart).getTime());
          // Auto-migrate legacy into subcollection
          for (const b of legacy) {
            await setDoc(doc(db, 'solar', cNum, 'bills', b.id), cleanForFirestore(b));
          }
        }
      } catch (_) {}
    }

    if (bills.length > 0) {
      await AsyncStorage.setItem(keys.BILLS, JSON.stringify(bills));
      setSyncStatus({
        isFirestoreConnected: true,
        lastSyncedAt: new Date(),
        message: `Synced ${bills.length} bills for ${cNum}`,
      });
      return bills;
    }
  } catch (err: any) {
    console.warn('[Firestore getBills]', err);
  }

  // 2. Fallback: local cache for this consumer
  try {
    const raw = await AsyncStorage.getItem(keys.BILLS);
    if (raw) return JSON.parse(raw) as SolarBill[];
  } catch (_) {}

  // 3. Fallback: legacy cache
  try {
    const legacy = await AsyncStorage.getItem('@goa_solar_bills_v2');
    if (legacy) {
      const arr = JSON.parse(legacy);
      if (Array.isArray(arr) && arr.length > 0) return arr as SolarBill[];
    }
  } catch (_) {}

  return [];
}

export async function saveBill(bill: SolarBill, consumerNumber?: string): Promise<void> {
  const cNum = consumerNumber ?? bill.consumerNumber ?? _activeConsumerNumber ?? 'primary';

  const billWithConsumer: SolarBill = {
    ...bill,
    consumerNumber: cNum,
  };

  // Update local cache
  const keys = getKeys(cNum);
  const current = await getBills(cNum);
  const idx = current.findIndex((b) => b.id === bill.id);
  const updated = idx >= 0
    ? [...current.slice(0, idx), billWithConsumer, ...current.slice(idx + 1)]
    : [billWithConsumer, ...current];
  await AsyncStorage.setItem(keys.BILLS, JSON.stringify(updated));

  // Push to Firestore subcollection: solar/{consumerNumber}/bills/{bill.id}
  try {
    const cleaned = cleanForFirestore(billWithConsumer);
    await setDoc(doc(db, 'solar', cNum, 'bills', bill.id), cleaned);
    setSyncStatus({
      isFirestoreConnected: true,
      lastSyncedAt: new Date(),
      message: `Saved to solar/${cNum}/bills/${bill.id}`,
    });
  } catch (err: any) {
    console.error(`[Firestore saveBill error]:`, err);
    const isPermission = err?.code === 'permission-denied';
    setSyncStatus({
      isFirestoreConnected: false,
      message: isPermission
        ? 'Firestore rules block subcollections. Add: match /solar/{document=**}'
        : `Sync error: ${err?.message ?? 'unknown'}`,
    });
    if (isPermission) {
      throw new Error(
        'Firebase Permission Denied: Your Firestore rule in Firebase Console only allows single documents. Please update the rule to allow subcollections: match /solar/{document=**} { allow read, write: if true; }'
      );
    }
    throw err;
  }
}

export async function deleteBill(billId: string, consumerNumber?: string): Promise<void> {
  const cNum = consumerNumber ?? _activeConsumerNumber ?? 'primary';

  // 1. Remove from local cache
  const keys = getKeys(cNum);
  const current = await getBills(cNum);
  const updated = current.filter((b) => b.id !== billId);
  await AsyncStorage.setItem(keys.BILLS, JSON.stringify(updated));

  try {
    const legacy = await AsyncStorage.getItem('@goa_solar_bills_v2');
    if (legacy) {
      const arr = JSON.parse(legacy);
      if (Array.isArray(arr)) {
        await AsyncStorage.setItem(
          '@goa_solar_bills_v2',
          JSON.stringify(arr.filter((b: any) => b.id !== billId))
        );
      }
    }
  } catch (_) {}

  // 2. Delete from Firestore subcollection: solar/{consumerNumber}/bills/{billId}
  try {
    await deleteDoc(doc(db, 'solar', cNum, 'bills', billId));

    // Also delete any legacy flat docs
    await deleteDoc(doc(db, 'solar', `${cNum}_bill_${billId}`));
    await deleteDoc(doc(db, 'solar', `bill_${billId}`));
    await deleteDoc(doc(db, 'solar', billId));

    setSyncStatus({ lastSyncedAt: new Date(), message: `Removed bill ${billId}` });
  } catch (err: any) {
    console.error('Delete error from Firestore:', err);
  }
}

// ── Cleaning Events (Subcollection: solar/{consumerNumber}/cleanings) ─

export async function getCleaningEvents(consumerNumber?: string): Promise<CleaningEvent[]> {
  const cNum = consumerNumber ?? _activeConsumerNumber ?? 'primary';
  const keys = getKeys(cNum);

  try {
    const col = collection(db, 'solar', cNum, 'cleanings');
    const snap = await getDocs(col);
    const evts = snap.docs
      .map((d) => d.data() as CleaningEvent)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    if (evts.length > 0) {
      await AsyncStorage.setItem(keys.CLEANINGS, JSON.stringify(evts));
      return evts;
    }
  } catch (_) {}

  try {
    const raw = await AsyncStorage.getItem(keys.CLEANINGS);
    if (raw) return JSON.parse(raw) as CleaningEvent[];
  } catch (_) {}

  return [];
}

export async function saveCleaningEvent(event: CleaningEvent, consumerNumber?: string): Promise<void> {
  const cNum = consumerNumber ?? event.consumerNumber ?? _activeConsumerNumber ?? 'primary';

  const eventWithConsumer: CleaningEvent = {
    ...event,
    consumerNumber: cNum,
  };

  const keys = getKeys(cNum);
  const current = await getCleaningEvents(cNum);
  const updated = [eventWithConsumer, ...current];
  await AsyncStorage.setItem(keys.CLEANINGS, JSON.stringify(updated));

  // Also update lastCleanedDate on profile
  const profile = await getSystemProfile(cNum);
  if (profile && (!profile.lastCleanedDate || event.date > profile.lastCleanedDate)) {
    await saveSystemProfile({ ...profile, lastCleanedDate: event.date }, cNum);
  }

  try {
    await setDoc(doc(db, 'solar', cNum, 'cleanings', event.id), cleanForFirestore(eventWithConsumer));
  } catch (err) {
    console.error('Save cleaning error:', err);
  }
}

// ── System Profile (Document: solar/{consumerNumber}) ─────────

export async function getSystemProfile(consumerNumber?: string): Promise<SystemProfile | null> {
  const cNum = consumerNumber ?? _activeConsumerNumber ?? 'primary';
  const keys = getKeys(cNum);

  // 1. Try Firestore: solar/{cNum}
  try {
    const d = await getDoc(doc(db, 'solar', cNum));
    if (d.exists()) {
      const p = d.data() as SystemProfile;
      await AsyncStorage.setItem(keys.PROFILE, JSON.stringify(p));
      return p;
    }
  } catch (_) {}

  // Also check legacy doc solar/{cNum}_profile
  try {
    const legacyDoc = await getDoc(doc(db, 'solar', `${cNum}_profile`));
    if (legacyDoc.exists()) {
      const p = legacyDoc.data() as SystemProfile;
      await setDoc(doc(db, 'solar', cNum), cleanForFirestore(p));
      await AsyncStorage.setItem(keys.PROFILE, JSON.stringify(p));
      return p;
    }
  } catch (_) {}

  // 2. Try AsyncStorage
  try {
    const raw = await AsyncStorage.getItem(keys.PROFILE);
    if (raw) return JSON.parse(raw) as SystemProfile;
  } catch (_) {}

  return null;
}

export async function saveSystemProfile(profile: SystemProfile, consumerNumber?: string): Promise<void> {
  const cNum = consumerNumber ?? profile.consumerNumber ?? _activeConsumerNumber ?? 'primary';

  const profileWithConsumer: SystemProfile = {
    ...profile,
    id: cNum,
    consumerNumber: cNum,
  };

  const keys = getKeys(cNum);
  await AsyncStorage.setItem(keys.PROFILE, JSON.stringify(profileWithConsumer));

  try {
    await setDoc(doc(db, 'solar', cNum), cleanForFirestore(profileWithConsumer));
    setSyncStatus({
      isFirestoreConnected: true,
      lastSyncedAt: new Date(),
      message: `Profile saved to solar/${cNum}`,
    });
  } catch (err: any) {
    console.error('Profile save error:', err);
  }
}

// ── Developer / Test Fixture Seed ─────────────────────────────
export async function seedCanonicalData(consumerNumber?: string): Promise<void> {
  const cNum = consumerNumber ?? _activeConsumerNumber ?? 'primary';
  await saveBill({ ...CANONICAL_AUGUST_2026_BILL, consumerNumber: cNum, createdAt: Date.now() }, cNum);
}
