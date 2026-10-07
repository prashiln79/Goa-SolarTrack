// ============================================================
// GOA SOLARTRACKER — Root Application
// PRD §4 navigation: Home | Analytics | Care | Settings
// (Bills accessible from header and Home screen)
// ============================================================
import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  SafeAreaView,
  TouchableOpacity,
  Text,
  StatusBar as RNStatusBar,
  Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';

// ── Screens ──────────────────────────────────────────────────
import { HomeScreen }      from './src/screens/HomeScreen';
import { BillsScreen }     from './src/screens/BillsScreen';
import { AnalyticsScreen } from './src/screens/AnalyticsScreen';
import { CareScreen }      from './src/screens/CareScreen';
import { SettingsScreen }  from './src/screens/SettingsScreen';

// ── Components ────────────────────────────────────────────────
import { AppHeader }         from './src/components/AppHeader';
import { AddBillModal }      from './src/components/AddBillModal';
import { AddCleaningModal }  from './src/components/AddCleaningModal';

// ── Services & Domain ─────────────────────────────────────────
import {
  getBills,
  saveBill,
  deleteBill,
  getCleaningEvents,
  saveCleaningEvent,
  getSystemProfile,
  saveSystemProfile,
  subscribeToSyncStatus,
  testFirestoreConnection,
  seedCanonicalData,
  SyncStatus,
  DEFAULT_SYSTEM_PROFILE,
} from './src/services/solarStorage';
import { calculateCleaningScore } from './src/domain/cleaningIntelligence';

// ── Types ─────────────────────────────────────────────────────
import {
  SolarBill,
  CleaningEvent,
  SystemProfile,
  CareAssessment,
} from './src/types/solar';

// ── Theme ─────────────────────────────────────────────────────
import { COLORS, RADIUS, FONT, SPACING } from './src/constants/theme';

// ── Tab Config ────────────────────────────────────────────────
type Tab = 'home' | 'bills' | 'analytics' | 'care' | 'settings';

interface NavTab {
  key: Tab;
  label: string;
  icon: string;
  iconActive: string;
  color?: string;
}

const TABS: NavTab[] = [
  { key: 'home',      label: 'Home',      icon: 'sunny-outline',       iconActive: 'sunny',         color: COLORS.gold },
  { key: 'bills',     label: 'Bills',     icon: 'document-text-outline', iconActive: 'document-text', color: COLORS.gold },
  { key: 'analytics', label: 'Analytics', icon: 'bar-chart-outline',   iconActive: 'bar-chart',     color: COLORS.gold },
  { key: 'care',      label: 'Care',      icon: 'water-outline',       iconActive: 'water',         color: COLORS.info },
  { key: 'settings',  label: 'Settings',  icon: 'settings-outline',    iconActive: 'settings',      color: COLORS.gold },
];

// ── Default Care Assessment ───────────────────────────────────
const DEFAULT_CARE: CareAssessment = {
  score: 30,
  state: 'Good',
  daysSinceLastClean: 0,
  rationale: 'Loading assessment…',
  recommendation: '',
  signals: {
    cleanlinessRecencySignal: 0,
    rainFreeSignal: 50,
    generationDeviationSignal: 30,
    weatherConfidenceSignal: 40,
  },
  assessedAt: Date.now(),
};

// ── App ───────────────────────────────────────────────────────
export default function App() {
  const [activeTab, setActiveTab]           = useState<Tab>('home');
  const [bills, setBills]                   = useState<SolarBill[]>([]);
  const [cleanings, setCleanings]           = useState<CleaningEvent[]>([]);
  const [profile, setProfile]               = useState<SystemProfile>(DEFAULT_SYSTEM_PROFILE);
  const [careAssessment, setCareAssessment] = useState<CareAssessment>(DEFAULT_CARE);
  const [syncStatus, setSyncStatus]         = useState<SyncStatus>({
    isFirestoreConnected: false, lastSyncedAt: null, message: 'Connecting…',
  });
  const [isRefreshing, setIsRefreshing]     = useState(false);

  // ── Modal states ──
  const [isAddBillOpen, setIsAddBillOpen]     = useState(false);
  const [isAddCleanOpen, setIsAddCleanOpen]   = useState(false);

  // ── Initial load ──────────────────────────────────────────
  useEffect(() => {
    const unsub = subscribeToSyncStatus(setSyncStatus);
    loadAll();
    testFirestoreConnection(); // background connection test
    return () => unsub();
  }, []);

  // ── Derive care assessment whenever relevant state changes ──
  useEffect(() => {
    const latestBill = bills.length > 0 ? bills[0] : null;
    const lastCleanedDate =
      profile.lastCleanedDate ??
      (cleanings.length > 0 ? cleanings[0].date : undefined);

    const avgKwhPerDay =
      latestBill?.generationKwh !== null && latestBill?.generationKwh !== undefined
        ? latestBill.generationKwh / (latestBill.billingDays || 31)
        : undefined;

    const expectedKwhPerDay = (profile.capacityKw || 5.3) * 2.8; // ~2.8 kWh/kW/day Goa avg

    // Determine monsoon season (June–September)
    const month = new Date().getMonth() + 1;
    const isMonsoon = month >= 6 && month <= 9;

    const result = calculateCleaningScore({
      lastCleanedDate,
      isMonsoonSeason: isMonsoon,
      currentMonthAvgKwhPerDay: avgKwhPerDay,
      expectedKwhPerDay,
      monthsOfHistory: bills.length,
    });
    setCareAssessment(result);
  }, [bills, cleanings, profile]);

  const loadAll = useCallback(async () => {
    try {
      const [fetchedBills, fetchedCleanings, fetchedProfile] = await Promise.all([
        getBills(),
        getCleaningEvents(),
        getSystemProfile(),
      ]);
      setBills(fetchedBills);
      setCleanings(fetchedCleanings);
      setProfile(fetchedProfile);
    } catch (err) {
      console.error('loadAll error:', err);
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadAll();
    await testFirestoreConnection();
    setIsRefreshing(false);
  }, [loadAll]);

  const handleSaveBill = async (bill: SolarBill) => {
    await saveBill(bill);
    await loadAll();
  };

  const handleDeleteBill = async (id: string) => {
    await deleteBill(id);
    await loadAll();
  };

  const handleSaveCleaning = async (event: CleaningEvent) => {
    await saveCleaningEvent(event);
    await loadAll();
  };

  const handleSaveProfile = async (updated: SystemProfile) => {
    await saveSystemProfile(updated);
    setProfile(updated);
  };

  const handleSeedCanonical = async () => {
    await seedCanonicalData();
    await loadAll();
  };

  // ── Render ────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />

      {/* Header */}
      <AppHeader
        profile={profile}
        syncStatus={syncStatus}
        onAddBill={() => setIsAddBillOpen(true)}
        onSettingsPress={() => setActiveTab('settings')}
      />

      {/* Main content */}
      <View style={styles.screenContainer}>
        {activeTab === 'home' && (
          <HomeScreen
            bills={bills}
            profile={profile}
            careAssessment={careAssessment}
            isRefreshing={isRefreshing}
            onRefresh={handleRefresh}
            onAddBill={() => setIsAddBillOpen(true)}
            onLogClean={() => setIsAddCleanOpen(true)}
            onSeedCanonical={handleSeedCanonical}
            onNavigateCare={() => setActiveTab('care')}
            onNavigateAnalytics={() => setActiveTab('analytics')}
          />
        )}
        {activeTab === 'bills' && (
          <BillsScreen
            bills={bills}
            onAddBill={() => setIsAddBillOpen(true)}
            onDeleteBill={handleDeleteBill}
          />
        )}
        {activeTab === 'analytics' && (
          <AnalyticsScreen
            bills={bills}
            profile={profile}
            cleaningEventCount={cleanings.length}
          />
        )}
        {activeTab === 'care' && (
          <CareScreen
            careAssessment={careAssessment}
            cleaningEvents={cleanings}
            profile={profile}
            onLogClean={() => setIsAddCleanOpen(true)}
          />
        )}
        {activeTab === 'settings' && (
          <SettingsScreen
            profile={profile}
            syncStatus={syncStatus}
            onProfileSave={handleSaveProfile}
            onDataRefresh={loadAll}
          />
        )}
      </View>

      {/* Bottom Navigation — PRD §4.2 */}
      <View style={styles.tabBar}>
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          const color = isActive ? (tab.color ?? COLORS.gold) : COLORS.textMuted;
          return (
            <TouchableOpacity
              key={tab.key}
              id={`tab-${tab.key}`}
              style={styles.tabItem}
              onPress={() => setActiveTab(tab.key)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={(isActive ? tab.iconActive : tab.icon) as any}
                size={22}
                color={color}
              />
              <Text style={[styles.tabLabel, { color }]}>{tab.label}</Text>
              {isActive && (
                <View style={[styles.tabIndicator, { backgroundColor: color }]} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Modals */}
      <AddBillModal
        visible={isAddBillOpen}
        onClose={() => setIsAddBillOpen(false)}
        onSave={handleSaveBill}
        latestBill={bills.length > 0 ? bills[0] : null}
      />
      <AddCleaningModal
        visible={isAddCleanOpen}
        onClose={() => setIsAddCleanOpen(false)}
        onSave={handleSaveCleaning}
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.surface,
    paddingTop: Platform.OS === 'android' ? RNStatusBar.currentHeight : 0,
  },
  screenContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: SPACING.sm,
    paddingBottom: Platform.OS === 'ios' ? SPACING.lg : SPACING.sm,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    position: 'relative',
    paddingBottom: 4,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: FONT.semi,
  },
  tabIndicator: {
    position: 'absolute',
    top: -SPACING.sm,
    width: 24,
    height: 2,
    borderRadius: RADIUS.full,
  },
});
