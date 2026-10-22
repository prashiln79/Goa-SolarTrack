// ============================================================
// Settings Screen — Manage Solar System, Accounts & Data Sync
// Matches Goa-SolarTrack Design System (Android Exclusive)
// ============================================================

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SystemProfile, SyncStatus } from '../types/solar';
import { testFirestoreConnection, seedCanonicalData } from '../services/solarStorage';
import { runCanonicalVerification } from '../domain/energyAccounting';
import { DateField } from '../components/ui/DatePickerModal';
import {
  getRemindersEnabledAsync,
  setRemindersEnabledAsync,
  sendInstantTestNotificationAsync,
} from '../services/notificationService';
import { SHADOW } from '../constants/theme';

interface SettingsScreenProps {
  profile: SystemProfile;
  syncStatus: SyncStatus;
  onProfileSave: (updated: SystemProfile) => Promise<void>;
  onDataRefresh: () => Promise<void>;
  onSwitchConsumer?: () => void;
}

function formatInstallDate(dateStr?: string): string {
  if (!dateStr) return '21 Oct 2026';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const y = parts[0];
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    if (!isNaN(m) && m >= 0 && m < 12 && !isNaN(d)) {
      return `${d} ${months[m]} ${y}`;
    }
  }
  return dateStr;
}

function formatLastSynced(timestamp?: Date | number | null): string {
  if (!timestamp) return 'Today, 11:27 AM';
  const d = typeof timestamp === 'number' ? new Date(timestamp) : timestamp;
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
  return isToday ? `Today, ${timeStr}` : `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })}, ${timeStr}`;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  profile,
  syncStatus,
  onProfileSave,
  onDataRefresh,
  onSwitchConsumer,
}) => {
  const insets = useSafeAreaInsets();

  // Modal visibility states
  const [showEditProfile, setShowEditProfile]   = useState(false);
  const [showAdvanced, setShowAdvanced]         = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showDataPrivacy, setShowDataPrivacy]   = useState(false);
  const [showHelpSupport, setShowHelpSupport]   = useState(false);
  const [showAbout, setShowAbout]               = useState(false);

  // Status flags
  const [isTestingConn, setIsTestingConn]       = useState(false);
  const [isSyncing, setIsSyncing]               = useState(false);
  const [remindersEnabled, setRemindersEnabled] = useState(true);

  // Profile edit fields
  const [capacityKw, setCapacityKw]         = useState(profile.capacityKw ? String(profile.capacityKw) : '5.3');
  const [location, setLocation]             = useState(profile.location || 'Panaji, Goa');
  const [tariff, setTariff]                 = useState(profile.tariffCategory || 'LTDS-II-SOLAR');
  const [installDate, setInstallDate]       = useState(profile.installationDate || '2026-10-21');
  const [panelCount, setPanelCount]         = useState(profile.panelCount ? String(profile.panelCount) : '');
  const [inverterModel, setInverterModel]   = useState(profile.inverterModel || '');
  const [settlementRate, setSettlementRate] = useState(profile.settlementRateInr ? String(profile.settlementRateInr) : '3.50');
  const [systemCost, setSystemCost]         = useState(profile.systemCostInr ? String(profile.systemCostInr) : '300000');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Load reminders preference on mount
  React.useEffect(() => {
    let mounted = true;
    getRemindersEnabledAsync().then((val) => {
      if (mounted) setRemindersEnabled(val);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const populateFields = () => {
    setCapacityKw(profile.capacityKw ? String(profile.capacityKw) : '5.3');
    setLocation(profile.location || 'Panaji, Goa');
    setTariff(profile.tariffCategory || 'LTDS-II-SOLAR');
    setInstallDate(profile.installationDate || '2026-10-21');
    setPanelCount(profile.panelCount ? String(profile.panelCount) : '');
    setInverterModel(profile.inverterModel || '');
    setSettlementRate(profile.settlementRateInr ? String(profile.settlementRateInr) : '3.50');
    setSystemCost(profile.systemCostInr ? String(profile.systemCostInr) : '300000');
  };

  const handleOpenEditProfile = () => {
    populateFields();
    setShowEditProfile(true);
  };

  const handleSyncNow = async () => {
    setIsSyncing(true);
    try {
      await onDataRefresh();
      Alert.alert('Cloud Sync', 'Data refreshed successfully with cloud records.');
    } catch {
      Alert.alert('Offline Mode', 'Operating with locally saved records.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleToggleReminders = async (val: boolean) => {
    setRemindersEnabled(val);
    await setRemindersEnabledAsync(val);
  };

  const handleSendTestNotification = async () => {
    await sendInstantTestNotificationAsync();
    Alert.alert('Reminder Sent', 'A test reminder has been triggered to your notification tray.');
  };

  const handleTestConnection = async () => {
    setIsTestingConn(true);
    const result = await testFirestoreConnection();
    setIsTestingConn(false);
    Alert.alert(
      result.isFirestoreConnected ? '✅ Cloud Connected' : 'ℹ️ Offline Mode',
      result.isFirestoreConnected
        ? 'Remote server connection verified successfully.'
        : 'Currently operating in offline mode. Local records are safely preserved.'
    );
  };

  const handleSeedCanonical = () => {
    Alert.alert(
      'Reload Canonical Test Bill',
      'This will insert the August 2026 Goa Electricity Dept test fixture (canonical PRD §15.2).',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Load Fixture',
          onPress: async () => {
            await seedCanonicalData();
            await onDataRefresh();
            Alert.alert('Done', 'August 2026 canonical bill loaded.');
          },
        },
      ]
    );
  };

  const handleRunVerification = () => {
    const result = runCanonicalVerification();
    if (result.passed) {
      Alert.alert('✅ All Tests Passed', 'All PRD §15.2 canonical and edge-case tests pass.');
    } else {
      Alert.alert('❌ Test Failures', result.failures.join('\n'));
    }
  };

  const handleSaveProfile = async () => {
    const rawCap = parseFloat(capacityKw);
    if (isNaN(rawCap) || rawCap <= 0) {
      Alert.alert('Invalid Capacity', 'Please enter a valid system capacity in kW (e.g. 5.3 or 3.3).');
      return;
    }
    const cap = rawCap >= 1000 ? rawCap / 1000 : rawCap;

    const parsedCost: number | undefined = (() => {
      const clean = systemCost.trim().toLowerCase().replace(/,/g, '');
      if (!clean) return undefined;
      const lakhMatch = clean.match(/^([\d.]+)\s*(?:lakh|lakhs|lac|lacs|l)$/);
      if (lakhMatch) {
        const val = parseFloat(lakhMatch[1]);
        return isNaN(val) ? undefined : Math.round(val * 100000);
      }
      const kMatch = clean.match(/^([\d.]+)\s*k$/);
      if (kMatch) {
        const val = parseFloat(kMatch[1]);
        return isNaN(val) ? undefined : Math.round(val * 1000);
      }
      const num = parseFloat(clean);
      if (isNaN(num) || num <= 0) return undefined;
      if (num <= 50 && clean.includes('.')) {
        return Math.round(num * 100000);
      }
      return Math.round(num);
    })();

    const updated: SystemProfile = {
      ...profile,
      capacityKw: cap,
      location: location.trim() || profile.location || 'Panaji, Goa',
      tariffCategory: tariff.trim() || profile.tariffCategory || 'LTDS-II-SOLAR',
      installationDate: installDate.trim() || profile.installationDate || '2026-10-21',
      panelCount: parseInt(panelCount, 10) || undefined,
      inverterModel: inverterModel.trim() || undefined,
      settlementRateInr: parseFloat(settlementRate) || 3.5,
      systemCostInr: parsedCost || 300000,
      updatedAt: Date.now(),
    };

    try {
      setIsSavingProfile(true);
      await onProfileSave(updated);
      setIsSavingProfile(false);
      setShowEditProfile(false);
      Alert.alert('Saved', 'Your solar system profile has been updated.');
    } catch (e: any) {
      setIsSavingProfile(false);
      Alert.alert('Save Failed', e?.message ?? 'Could not save profile.');
    }
  };

  const consumerNum = profile.consumerNumber || '60007315413';
  const displayCost = profile.systemCostInr
    ? `₹${profile.systemCostInr.toLocaleString('en-IN')}`
    : '₹3,00,000';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Screen Title ── */}
      <View style={styles.headerBlock}>
        <Text style={styles.pageTitle}>Settings</Text>
        <Text style={styles.pageSubtitle}>Manage your solar system</Text>
      </View>

      {/* ── 1. Electricity Account Card ── */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.accountIconBox}>
            <Ionicons name="home-outline" size={20} color="#2563EB" />
          </View>
          <View style={styles.cardHeaderTextCol}>
            <Text style={styles.cardTitle}>Electricity account</Text>
            <Text style={styles.cardSubtitle}>Your EDG electricity account</Text>
          </View>
          {onSwitchConsumer && (
            <TouchableOpacity
              id="btn-switch-account"
              style={styles.pillActionBtn}
              onPress={onSwitchConsumer}
              activeOpacity={0.7}
            >
              <Ionicons name="swap-horizontal" size={13} color="#EA580C" />
              <Text style={styles.pillActionText}>Switch account</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.cardDivider} />

        <View style={styles.dataRow}>
          <Text style={styles.dataLabel}>Consumer number</Text>
          <Text style={styles.dataValue}>{consumerNum}</Text>
        </View>

        <View style={styles.dataDivider} />

        <View style={styles.dataRow}>
          <Text style={styles.dataLabel}>Account type</Text>
          <Text style={styles.dataValue}>Consumer</Text>
        </View>
      </View>

      {/* ── 2. Your Solar System Card ── */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.solarIconBox}>
            <Ionicons name="sunny" size={22} color="#EA580C" />
          </View>
          <View style={styles.cardHeaderTextCol}>
            <Text style={styles.cardTitle}>Your solar system</Text>
            <Text style={styles.cardSubtitle}>Rooftop installation details</Text>
          </View>
          <TouchableOpacity
            id="btn-edit-solar-system"
            style={styles.pillActionBtn}
            onPress={handleOpenEditProfile}
            activeOpacity={0.7}
          >
            <Ionicons name="pencil" size={12} color="#EA580C" />
            <Text style={styles.pillActionText}>Edit</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.cardDivider} />

        <View style={styles.dataRow}>
          <Text style={styles.dataLabel}>System capacity</Text>
          <Text style={styles.dataValue}>{profile.capacityKw || 5.3} kW</Text>
        </View>

        <View style={styles.dataDivider} />

        <View style={styles.dataRow}>
          <Text style={styles.dataLabel}>Location</Text>
          <Text style={styles.dataValue}>{profile.location || 'Panaji, Goa'}</Text>
        </View>

        <View style={styles.dataDivider} />

        <View style={styles.dataRow}>
          <Text style={styles.dataLabel}>Installation date</Text>
          <Text style={styles.dataValue}>{formatInstallDate(profile.installationDate)}</Text>
        </View>

        <View style={styles.dataDivider} />

        <View style={styles.dataRow}>
          <Text style={styles.dataLabel}>System investment</Text>
          <Text style={styles.dataValue}>{displayCost}</Text>
        </View>

        {/* Nested Child: Advanced details */}
        <TouchableOpacity
          id="btn-advanced-details"
          style={styles.advancedBox}
          onPress={() => setShowAdvanced(true)}
          activeOpacity={0.7}
        >
          <View style={styles.advancedIconBox}>
            <Ionicons name="document-text-outline" size={18} color="#D97706" />
          </View>
          <View style={styles.advancedTextCol}>
            <Text style={styles.advancedTitle}>Advanced details</Text>
            <Text style={styles.advancedSub}>Tariff category, settlement rate and more</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
        </TouchableOpacity>
      </View>

      {/* ── 3. Backup & Sync Card ── */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.backupIconBox}>
            <Ionicons name="cloud-outline" size={22} color="#10B981" />
          </View>
          <View style={styles.cardHeaderTextCol}>
            <Text style={styles.cardTitle}>Backup & sync</Text>
            <Text style={styles.cardSubtitle}>Keep your data safe and in sync</Text>
          </View>
          <TouchableOpacity
            id="btn-sync-now"
            style={[styles.syncNowBtn, isSyncing && { opacity: 0.7 }]}
            onPress={handleSyncNow}
            disabled={isSyncing}
            activeOpacity={0.8}
          >
            <Ionicons name="sync" size={13} color="#FFFFFF" />
            <Text style={styles.syncNowBtnText}>{isSyncing ? 'Syncing…' : 'Sync now'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.cardDivider} />

        <View style={styles.dataRow}>
          <Text style={styles.dataLabel}>Cloud backup</Text>
          <View style={styles.statusPillRow}>
            <Ionicons
              name={syncStatus.isFirestoreConnected ? 'checkmark-circle' : 'cloud-offline'}
              size={15}
              color={syncStatus.isFirestoreConnected ? '#10B981' : '#64748B'}
            />
            <Text
              style={[
                styles.statusPillText,
                { color: syncStatus.isFirestoreConnected ? '#10B981' : '#64748B' },
              ]}
            >
              {syncStatus.isFirestoreConnected ? 'Connected' : 'Offline'}
            </Text>
          </View>
        </View>

        <View style={styles.dataDivider} />

        <View style={styles.dataRow}>
          <Text style={styles.dataLabel}>Offline access</Text>
          <View style={styles.statusPillRow}>
            <Ionicons name="checkmark-circle" size={15} color="#10B981" />
            <Text style={[styles.statusPillText, { color: '#10B981' }]}>On</Text>
          </View>
        </View>

        <View style={styles.dataDivider} />

        <View style={styles.dataRow}>
          <Text style={styles.dataLabel}>Last synced</Text>
          <Text style={styles.dataValue}>{formatLastSynced(syncStatus.lastSyncedAt)}</Text>
        </View>
      </View>

      {/* ── 4. Navigation Menu Items ── */}
      <View style={styles.menuList}>
        {/* Notifications */}
        <TouchableOpacity
          id="btn-menu-notifications"
          style={styles.menuCard}
          onPress={() => setShowNotifications(true)}
          activeOpacity={0.7}
        >
          <View style={[styles.menuIconBox, { backgroundColor: '#FFF7ED' }]}>
            <Ionicons name="notifications-outline" size={19} color="#EA580C" />
          </View>
          <View style={styles.menuTextCol}>
            <Text style={styles.menuTitle}>Notifications</Text>
            <Text style={styles.menuSubtitle}>Bill reminders, maintenance alerts</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
        </TouchableOpacity>

        {/* Data & privacy */}
        <TouchableOpacity
          id="btn-menu-data-privacy"
          style={styles.menuCard}
          onPress={() => setShowDataPrivacy(true)}
          activeOpacity={0.7}
        >
          <View style={[styles.menuIconBox, { backgroundColor: '#EFF6FF' }]}>
            <Ionicons name="shield-checkmark-outline" size={19} color="#2563EB" />
          </View>
          <View style={styles.menuTextCol}>
            <Text style={styles.menuTitle}>Data & privacy</Text>
            <Text style={styles.menuSubtitle}>Your data, backup and privacy settings</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
        </TouchableOpacity>

        {/* Help & support */}
        <TouchableOpacity
          id="btn-menu-help-support"
          style={styles.menuCard}
          onPress={() => setShowHelpSupport(true)}
          activeOpacity={0.7}
        >
          <View style={[styles.menuIconBox, { backgroundColor: '#F1F5F9' }]}>
            <Ionicons name="help-circle-outline" size={19} color="#64748B" />
          </View>
          <View style={styles.menuTextCol}>
            <Text style={styles.menuTitle}>Help & support</Text>
            <Text style={styles.menuSubtitle}>FAQs and contact support</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
        </TouchableOpacity>

        {/* About Goa SolarTrack */}
        <TouchableOpacity
          id="btn-menu-about"
          style={styles.menuCard}
          onPress={() => setShowAbout(true)}
          activeOpacity={0.7}
        >
          <View style={[styles.menuIconBox, { backgroundColor: '#F1F5F9' }]}>
            <Ionicons name="information-circle-outline" size={19} color="#64748B" />
          </View>
          <View style={styles.menuTextCol}>
            <Text style={styles.menuTitle}>About Goa SolarTrack</Text>
            <Text style={styles.menuSubtitle}>Version 1.0.0</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
        </TouchableOpacity>
      </View>

      {/* ════════════════════════════════════════════════════════════
          MODAL: Edit System Profile
      ════════════════════════════════════════════════════════════ */}
      <Modal
        visible={showEditProfile}
        animationType="slide"
        transparent
        onRequestClose={() => setShowEditProfile(false)}
      >
        <KeyboardAvoidingView behavior="height" style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit System Profile</Text>
              <TouchableOpacity
                id="btn-close-edit-modal"
                onPress={() => setShowEditProfile(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.modalBody}
              contentContainerStyle={{ paddingBottom: 40 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <InputField
                label="System Capacity (kW) *"
                value={capacityKw}
                onChange={setCapacityKw}
                keyboardType="numeric"
                placeholder="5.3"
              />
              <InputField
                label="Location / Taluka"
                value={location}
                onChange={setLocation}
                placeholder="Panaji, Goa"
              />
              <InputField
                label="Tariff Category"
                value={tariff}
                onChange={setTariff}
                placeholder="LTDS-II-SOLAR"
              />
              <DateField
                label="Installation Date"
                value={installDate}
                onChange={setInstallDate}
                placeholder="YYYY-MM-DD"
              />
              <InputField
                label="Panel Count (Optional)"
                value={panelCount}
                onChange={setPanelCount}
                keyboardType="numeric"
                placeholder="12"
              />
              <InputField
                label="Inverter Model (Optional)"
                value={inverterModel}
                onChange={setInverterModel}
                placeholder="e.g. Havells / Growatt 5kW"
              />
              <InputField
                label="APPC Settlement Rate (₹/kWh)"
                value={settlementRate}
                onChange={setSettlementRate}
                keyboardType="numeric"
                placeholder="3.50"
              />
              <InputField
                label="System Investment Cost (₹)"
                value={systemCost}
                onChange={setSystemCost}
                keyboardType="numeric"
                placeholder="300000"
              />

              <View style={styles.modalInfoBox}>
                <Ionicons name="information-circle-outline" size={16} color="#D97706" />
                <Text style={styles.modalInfoText}>
                  PRD §2.2: Confirm your APPC settlement rate from the latest JERC tariff notification before production use.
                </Text>
              </View>
            </ScrollView>

            <View style={[styles.modalFooter, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
              <TouchableOpacity
                id="btn-cancel-edit"
                style={styles.modalCancelBtn}
                onPress={() => setShowEditProfile(false)}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                id="btn-save-edit"
                style={[styles.modalSaveBtn, isSavingProfile && { opacity: 0.65 }]}
                onPress={handleSaveProfile}
                disabled={isSavingProfile}
              >
                <Text style={styles.modalSaveBtnText}>
                  {isSavingProfile ? 'Saving…' : 'Save Profile'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ════════════════════════════════════════════════════════════
          MODAL: Advanced Details
      ════════════════════════════════════════════════════════════ */}
      <Modal
        visible={showAdvanced}
        animationType="slide"
        transparent
        onRequestClose={() => setShowAdvanced(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Advanced Details</Text>
              <TouchableOpacity onPress={() => setShowAdvanced(false)}>
                <Ionicons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              <View style={styles.sheetSectionCard}>
                <View style={styles.sheetRow}>
                  <Text style={styles.dataLabel}>Tariff Category</Text>
                  <Text style={styles.dataValue}>{profile.tariffCategory || 'LTDS-II-SOLAR'}</Text>
                </View>
                <View style={styles.dataDivider} />
                <View style={styles.sheetRow}>
                  <Text style={styles.dataLabel}>Settlement Rate (APPC)</Text>
                  <Text style={[styles.dataValue, { color: '#16A34A' }]}>
                    ₹{profile.settlementRateInr || 3.5}/kWh
                  </Text>
                </View>
                <View style={styles.dataDivider} />
                <View style={styles.sheetRow}>
                  <Text style={styles.dataLabel}>Panel Count</Text>
                  <Text style={styles.dataValue}>{profile.panelCount ? `${profile.panelCount} panels` : 'Not specified'}</Text>
                </View>
                <View style={styles.dataDivider} />
                <View style={styles.sheetRow}>
                  <Text style={styles.dataLabel}>Inverter Model</Text>
                  <Text style={styles.dataValue}>{profile.inverterModel || 'Standard String Inverter'}</Text>
                </View>
                <View style={styles.dataDivider} />
                <View style={styles.sheetRow}>
                  <Text style={styles.dataLabel}>System Name</Text>
                  <Text style={styles.dataValue}>{profile.systemName}</Text>
                </View>
              </View>

              <TouchableOpacity
                style={styles.sheetEditAction}
                onPress={() => {
                  setShowAdvanced(false);
                  handleOpenEditProfile();
                }}
              >
                <Ionicons name="pencil" size={14} color="#EA580C" />
                <Text style={styles.sheetEditActionText}>Edit Advanced Fields</Text>
              </TouchableOpacity>
            </ScrollView>

            <View style={[styles.modalFooter, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setShowAdvanced(false)}
              >
                <Text style={styles.modalCloseBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ════════════════════════════════════════════════════════════
          MODAL: Notifications
      ════════════════════════════════════════════════════════════ */}
      <Modal
        visible={showNotifications}
        animationType="slide"
        transparent
        onRequestClose={() => setShowNotifications(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Notification Settings</Text>
              <TouchableOpacity onPress={() => setShowNotifications(false)}>
                <Ionicons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              <View style={styles.sheetSectionCard}>
                <View style={styles.toggleRow}>
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    <Text style={styles.toggleTitle}>Solar Care Reminders</Text>
                    <Text style={styles.toggleSubtitle}>
                      Receive reminders for panel wash, inverter checks, and roof cleaning.
                    </Text>
                  </View>
                  <Switch
                    value={remindersEnabled}
                    onValueChange={handleToggleReminders}
                    thumbColor={remindersEnabled ? '#EA580C' : '#CBD5E1'}
                    trackColor={{ false: '#E2E8F0', true: '#FFEDD5' }}
                  />
                </View>
              </View>

              <TouchableOpacity
                style={styles.testNotificationBtn}
                onPress={handleSendTestNotification}
                activeOpacity={0.8}
              >
                <Ionicons name="paper-plane-outline" size={16} color="#EA580C" />
                <Text style={styles.testNotificationBtnText}>Send Test Reminder</Text>
              </TouchableOpacity>
            </ScrollView>

            <View style={[styles.modalFooter, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setShowNotifications(false)}
              >
                <Text style={styles.modalCloseBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ════════════════════════════════════════════════════════════
          MODAL: Data & Privacy / Developer Tools
      ════════════════════════════════════════════════════════════ */}
      <Modal
        visible={showDataPrivacy}
        animationType="slide"
        transparent
        onRequestClose={() => setShowDataPrivacy(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Data & Privacy</Text>
              <TouchableOpacity onPress={() => setShowDataPrivacy(false)}>
                <Ionicons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              <View style={styles.sheetSectionCard}>
                <Text style={styles.privacyHeading}>Local-First Storage</Text>
                <Text style={styles.privacyBody}>
                  All your electricity bills, solar generations, and care logs are stored directly on your phone in encrypted SQLite / AsyncStorage, with cloud synchronization to Firebase when online.
                </Text>
              </View>

              <Text style={styles.sectionHeading}>Diagnostic & Developer Tools</Text>

              <TouchableOpacity
                style={styles.toolBtn}
                onPress={handleTestConnection}
                disabled={isTestingConn}
              >
                <Ionicons name="cloud-done-outline" size={18} color="#2563EB" />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.toolBtnTitle}>
                    {isTestingConn ? 'Pinging Cloud Server…' : 'Test Cloud Connection'}
                  </Text>
                  <Text style={styles.toolBtnSub}>Verify Firestore remote server reachability</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity style={styles.toolBtn} onPress={handleSeedCanonical}>
                <Ionicons name="sparkles-outline" size={18} color="#D97706" />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.toolBtnTitle}>Load PRD §15.2 Test Fixture</Text>
                  <Text style={styles.toolBtnSub}>Load August 2026 canonical net metering bill</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity style={styles.toolBtn} onPress={handleRunVerification}>
                <Ionicons name="checkmark-circle-outline" size={18} color="#16A34A" />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.toolBtnTitle}>Run Domain Verification Tests</Text>
                  <Text style={styles.toolBtnSub}>Verify energy ledger and edge case math</Text>
                </View>
              </TouchableOpacity>
            </ScrollView>

            <View style={[styles.modalFooter, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setShowDataPrivacy(false)}
              >
                <Text style={styles.modalCloseBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ════════════════════════════════════════════════════════════
          MODAL: Help & Support
      ════════════════════════════════════════════════════════════ */}
      <Modal
        visible={showHelpSupport}
        animationType="slide"
        transparent
        onRequestClose={() => setShowHelpSupport(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Help & Support</Text>
              <TouchableOpacity onPress={() => setShowHelpSupport(false)}>
                <Ionicons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              <Text style={styles.sectionHeading}>Official Regulations & Sources</Text>

              <View style={styles.sheetSectionCard}>
                <View style={styles.sourceItem}>
                  <Ionicons name="link-outline" size={16} color="#EA580C" />
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={styles.sourceItemTitle}>Goa Electricity Dept — Net Metering</Text>
                    <Text style={styles.sourceItemSub}>goaelectricity.gov.in/solar-others-matters/net-metering</Text>
                  </View>
                </View>

                <View style={styles.dataDivider} />

                <View style={styles.sourceItem}>
                  <Ionicons name="link-outline" size={16} color="#EA580C" />
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={styles.sourceItemTitle}>JERC Net Metering Regulations</Text>
                    <Text style={styles.sourceItemSub}>Joint Electricity Regulatory Commission (FY 2025–26)</Text>
                  </View>
                </View>
              </View>

              <Text style={styles.sectionHeading}>Frequently Asked Questions</Text>
              <View style={styles.sheetSectionCard}>
                <Text style={styles.faqQ}>How is solar generation tracked?</Text>
                <Text style={styles.faqA}>
                  Generation is recorded from your solar inverter reading or electricity bill generation units.
                </Text>
                <View style={styles.dataDivider} />
                <Text style={styles.faqQ}>What are banked units?</Text>
                <Text style={styles.faqA}>
                  Surplus units exported to the grid accumulate in your energy bank and are offset against future consumption according to JERC net metering rules.
                </Text>
              </View>
            </ScrollView>

            <View style={[styles.modalFooter, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setShowHelpSupport(false)}
              >
                <Text style={styles.modalCloseBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ════════════════════════════════════════════════════════════
          MODAL: About
      ════════════════════════════════════════════════════════════ */}
      <Modal
        visible={showAbout}
        animationType="slide"
        transparent
        onRequestClose={() => setShowAbout(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>About Goa SolarTrack</Text>
              <TouchableOpacity onPress={() => setShowAbout(false)}>
                <Ionicons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              <View style={styles.aboutHeroBox}>
                <View style={styles.aboutLogoBox}>
                  <Ionicons name="sunny" size={32} color="#EA580C" />
                </View>
                <Text style={styles.aboutAppName}>Goa SolarTrack</Text>
                <Text style={styles.aboutAppVersion}>Version 1.0.0 (Build 2026)</Text>
                <Text style={styles.aboutAppDesc}>
                  Tailored specifically for rooftop solar producers in Goa under the Goa Electricity Department & JERC Net Metering framework.
                </Text>
              </View>
            </ScrollView>

            <View style={[styles.modalFooter, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setShowAbout(false)}
              >
                <Text style={styles.modalCloseBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const InputField: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  keyboardType?: 'numeric' | 'default';
  placeholder?: string;
}> = ({ label, value, onChange, keyboardType = 'default', placeholder }) => (
  <View style={styles.inputGroup}>
    <Text style={styles.inputLabel}>{label}</Text>
    <TextInput
      style={styles.textInput}
      value={value}
      onChangeText={onChange}
      keyboardType={keyboardType}
      placeholder={placeholder}
      placeholderTextColor="#94A3B8"
    />
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40,
  },

  // ── Header Block ──
  headerBlock: {
    marginBottom: 16,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.4,
  },
  pageSubtitle: {
    fontSize: 13.5,
    color: '#64748B',
    marginTop: 2,
  },

  // ── Shared Card ──
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    marginBottom: 14,
    ...SHADOW.card,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardHeaderTextCol: {
    flex: 1,
    marginLeft: 12,
  },
  cardTitle: {
    fontSize: 15.5,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginTop: 14,
    marginBottom: 12,
  },

  // ── Icon Boxes ──
  accountIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  solarIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FFFBEB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backupIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── Pill Action Buttons (Header Right) ──
  pillActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  pillActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#EA580C',
  },

  // Sync Now Button (Filled Orange)
  syncNowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#EA580C',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  syncNowBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // ── Key Value Rows ──
  dataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  dataLabel: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '400',
  },
  dataValue: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  dataDivider: {
    height: 1,
    backgroundColor: '#F8FAFC',
    marginVertical: 9,
  },

  // ── Status Pill Row (Connected / On) ──
  statusPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusPillText: {
    fontSize: 13,
    fontWeight: '700',
  },

  // ── Advanced Box (Child in Solar System Card) ──
  advancedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFDF5',
    borderWidth: 1,
    borderColor: '#FEF3C7',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginTop: 14,
  },
  advancedIconBox: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#FEF3C7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  advancedTextCol: {
    flex: 1,
    marginLeft: 10,
    paddingRight: 6,
  },
  advancedTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  advancedSub: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
  },

  // ── Navigation Menu Cards ──
  menuList: {
    marginTop: 2,
    marginBottom: 10,
  },
  menuCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    marginBottom: 10,
    ...SHADOW.card,
  },
  menuIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuTextCol: {
    flex: 1,
    marginLeft: 12,
    paddingRight: 6,
  },
  menuTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  menuSubtitle: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
  },

  // ── Modals / Bottom Sheets ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  modalBody: {
    padding: 20,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
  },
  modalCancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  modalSaveBtn: {
    flex: 2,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#EA580C',
  },
  modalSaveBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  modalCloseBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
  },
  modalCloseBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },

  // Input Fields inside modal
  inputGroup: {
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 5,
  },
  textInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13.5,
    color: '#0F172A',
  },
  modalInfoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FEF3C7',
    borderRadius: 10,
    padding: 12,
    marginTop: 4,
    marginBottom: 16,
    gap: 8,
  },
  modalInfoText: {
    flex: 1,
    fontSize: 11.5,
    color: '#B45309',
    lineHeight: 16,
  },

  // Modal Section Card
  sheetSectionCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    marginBottom: 16,
  },
  sheetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  sheetEditAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FED7AA',
    backgroundColor: '#FFF7ED',
    marginBottom: 10,
  },
  sheetEditActionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#EA580C',
  },

  // Toggle Row in Notifications
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  toggleSubtitle: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 16,
  },
  testNotificationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    marginBottom: 10,
  },
  testNotificationBtnText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#EA580C',
  },

  // Privacy & Developer Tools Modal
  privacyHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  privacyBody: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 18,
  },
  sectionHeading: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 6,
    marginBottom: 10,
  },
  toolBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  toolBtnTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  toolBtnSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },

  // Help & Support Modal
  sourceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  sourceItemTitle: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#0F172A',
  },
  sourceItemSub: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 1,
  },
  faqQ: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
    marginTop: 2,
  },
  faqA: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 16,
  },

  // About Modal
  aboutHeroBox: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  aboutLogoBox: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#FFF7ED',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  aboutAppName: {
    fontSize: 19,
    fontWeight: '800',
    color: '#0F172A',
  },
  aboutAppVersion: {
    fontSize: 12.5,
    color: '#64748B',
    marginTop: 2,
  },
  aboutAppDesc: {
    fontSize: 12.5,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 12,
    paddingHorizontal: 20,
  },
});
