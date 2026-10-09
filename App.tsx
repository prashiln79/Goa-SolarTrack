// ============================================================
// GOA SOLARTRACKER — Root Application
// PRD §4 navigation: Home | Bills | Analytics | Care | Settings
// Multi-consumer isolation with unique Consumer Number onboarding
// ============================================================
import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  TouchableOpacity,
  Text,
  StatusBar as RNStatusBar,
  ActivityIndicator,
} from 'react-native';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';

// ── Screens ──────────────────────────────────────────────────
import { HomeScreen }      from './src/screens/HomeScreen';
import { BillsScreen }     from './src/screens/BillsScreen';
import { AnalyticsScreen } from './src/screens/AnalyticsScreen';
import { CareScreen }      from './src/screens/CareScreen';
import { SettingsScreen }  from './src/screens/SettingsScreen';

// ── Components ────────────────────────────────────────────────
import { AppHeader }               from './src/components/AppHeader';
import { AddBillModal }            from './src/components/AddBillModal';
import { AddCleaningModal }        from './src/components/AddCleaningModal';
import { ConsumerOnboardingModal } from './src/components/ConsumerOnboardingModal';

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
  loadStoredConsumerNumber,
  saveActiveConsumerNumber,
  getActiveConsumerNumber,
  createDefaultProfile,
  SyncStatus,
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
  { key: 'home',      label: 'Home',      icon: 'sunny-outline',         iconActive: 'sunny',         color: COLORS.gold },
  { key: 'bills',     label: 'Bills',     icon: 'document-text-outline', iconActive: 'document-text', color: COLORS.gold },
  { key: 'analytics', label: 'Analytics', icon: 'bar-chart-outline',    iconActive: 'bar-chart',     color: COLORS.gold },
  { key: 'care',      label: 'Care',      icon: 'water-outline',         iconActive: 'water',         color: COLORS.gold },
  { key: 'settings',  label: 'Settings',  icon: 'settings-outline',     iconActive: 'settings',      color: COLORS.gold },
];

// ── Default Care Assessment ───────────────────────────────────
const DEFAULT_CARE: CareAssessment = {
  score: 30,
  state: 'Good',
  daysSinceLastClean: 0,
  rationale: 'Awaiting monthly bill or wash logs…',
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
function MainApp() {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab]                     = useState<Tab>('home');
  const [consumerNumber, setConsumerNumber]           = useState<string | null>(null);
  const [isConsumerModalOpen, setIsConsumerModalOpen] = useState(false);
  const [isInitializing, setIsInitializing]           = useState(true);

  const [bills, setBills]                             = useState<SolarBill[]>([]);
  const [cleanings, setCleanings]                     = useState<CleaningEvent[]>([]);
  const [profile, setProfile]                         = useState<SystemProfile>(() =>
    createDefaultProfile('')
  );
  const [careAssessment, setCareAssessment]           = useState<CareAssessment>(DEFAULT_CARE);
  const [syncStatus, setSyncStatus]                   = useState<SyncStatus>({
    isFirestoreConnected: false, lastSyncedAt: null, message: 'Connecting…',
  });
  const [isRefreshing, setIsRefreshing]               = useState(false);

  // ── Modal states ──
  const [isAddBillOpen, setIsAddBillOpen]             = useState(false);
  const [isAddCleanOpen, setIsAddCleanOpen]           = useState(false);

  // ── Load data for a specific consumer ──────────────────────
  const loadAll = useCallback(async (cNum?: string) => {
    const targetConsumer = cNum ?? consumerNumber ?? getActiveConsumerNumber();
    if (!targetConsumer) {
      setBills([]);
      setCleanings([]);
      return;
    }

    try {
      const [fetchedBills, fetchedCleanings, fetchedProfile] = await Promise.all([
        getBills(targetConsumer),
        getCleaningEvents(targetConsumer),
        getSystemProfile(targetConsumer),
      ]);

      setBills(fetchedBills);
      setCleanings(fetchedCleanings);

      if (fetchedProfile) {
        setProfile(fetchedProfile);
      } else {
        const fallback = createDefaultProfile(targetConsumer);
        setProfile(fallback);
      }
    } catch (err) {
      console.error('loadAll error:', err);
    }
  }, [consumerNumber]);

  // ── Initial load ──────────────────────────────────────────
  useEffect(() => {
    const unsub = subscribeToSyncStatus(setSyncStatus);

    const bootstrap = async () => {
      try {
        const savedConsumer = await loadStoredConsumerNumber();
        if (savedConsumer) {
          setConsumerNumber(savedConsumer);
          await loadAll(savedConsumer);
        } else {
          // No consumer configured yet: show onboarding prompt
          setIsConsumerModalOpen(true);
        }
        await testFirestoreConnection();
      } finally {
        setIsInitializing(false);
      }
    };

    bootstrap();
    return () => unsub();
  }, [loadAll]);

  // ── Connect / Switch Consumer Number ───────────────────────
  const handleConnectConsumer = async (
    cNum: string,
    profileDetails?: Partial<SystemProfile>
  ) => {
    await saveActiveConsumerNumber(cNum);
    setConsumerNumber(cNum);

    // Look up if profile already exists in Firestore or locally
    let existing = await getSystemProfile(cNum);
    if (!existing) {
      existing = createDefaultProfile(cNum, profileDetails);
      await saveSystemProfile(existing, cNum);
    }
    setProfile(existing);

    await loadAll(cNum);
    setIsConsumerModalOpen(false);
  };

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

    const expectedKwhPerDay = (profile.capacityKw || 5.0) * 2.8; // ~2.8 kWh/kW/day Goa avg

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

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadAll();
    await testFirestoreConnection();
    setIsRefreshing(false);
  }, [loadAll]);

  const handleSaveBill = async (bill: SolarBill) => {
    const cNum = consumerNumber || profile.consumerNumber || getActiveConsumerNumber() || 'primary';
    await saveBill(bill, cNum);
    await loadAll(cNum);
  };

  const handleDeleteBill = async (id: string) => {
    const cNum = consumerNumber || profile.consumerNumber || getActiveConsumerNumber() || 'primary';
    await deleteBill(id, cNum);
    await loadAll(cNum);
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

  // Safe-area insets
  const topInset = Math.max(insets.top, RNStatusBar.currentHeight ?? 0);
  const bottomInset = Math.max(insets.bottom, 16);

  if (isInitializing) {
    return (
      <View style={[styles.rootContainer, styles.center]}>
        <ActivityIndicator size="large" color={COLORS.gold} />
        <Text style={{ marginTop: SPACING.md, color: COLORS.textSub, fontSize: 14 }}>
          Initializing Goa SolarTrack…
        </Text>
      </View>
    );
  }

  // ── Render ────────────────────────────────────────────────
  return (
    <View style={[styles.rootContainer, { paddingTop: topInset }]}>
      <StatusBar style="dark" />

      {/* Header */}
      <AppHeader
        profile={profile}
        syncStatus={syncStatus}
        onAddBill={() => setIsAddBillOpen(true)}
        onSettingsPress={() => setActiveTab('settings')}
        onConsumerPress={() => setIsConsumerModalOpen(true)}
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
            onSwitchConsumer={() => setIsConsumerModalOpen(true)}
          />
        )}
      </View>

      {/* Bottom Navigation */}
      <View
        style={[
          styles.tabBar,
          {
            paddingBottom: bottomInset + (insets.bottom > 0 ? 6 : SPACING.sm),
          },
        ]}
      >
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
        profile={profile}
      />
      <AddCleaningModal
        visible={isAddCleanOpen}
        onClose={() => setIsAddCleanOpen(false)}
        onSave={handleSaveCleaning}
      />
      <ConsumerOnboardingModal
        visible={isConsumerModalOpen}
        canCancel={Boolean(consumerNumber)}
        currentConsumerNumber={consumerNumber}
        onClose={() => setIsConsumerModalOpen(false)}
        onConnect={handleConnectConsumer}
      />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <MainApp />
    </SafeAreaProvider>
  );
}

// ── Styles ────────────────────────────────────────────────────
const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: COLORS.surface,
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
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
