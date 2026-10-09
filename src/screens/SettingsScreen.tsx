// ============================================================
// Settings Screen — PRD §9 Firebase architecture + system config
// ============================================================
import React, { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity,
  Alert, Platform, Modal, KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SystemProfile, SyncStatus } from '../types/solar';
import { Card, Divider, LedgerRow, InfoNote } from '../components/ui/UIKit';
import { testFirestoreConnection, seedCanonicalData } from '../services/solarStorage';
import { firebaseConfig } from '../config/firebase';
import { runCanonicalVerification } from '../domain/energyAccounting';
import { COLORS, SPACING, RADIUS, FONT } from '../constants/theme';

interface SettingsScreenProps {
  profile: SystemProfile;
  syncStatus: SyncStatus;
  onProfileSave: (updated: SystemProfile) => Promise<void>;
  onDataRefresh: () => Promise<void>;
  onSwitchConsumer?: () => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  profile, syncStatus, onProfileSave, onDataRefresh, onSwitchConsumer,
}) => {
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [isTestingConn, setIsTestingConn]     = useState(false);

  // Edit fields
  const [capacityKw, setCapacityKw]       = useState(String(profile.capacityKw));
  const [location, setLocation]           = useState(profile.location);
  const [tariff, setTariff]               = useState(profile.tariffCategory);
  const [installDate, setInstallDate]     = useState(profile.installationDate);
  const [panelCount, setPanelCount]       = useState(String(profile.panelCount ?? ''));
  const [inverterModel, setInverterModel] = useState(profile.inverterModel ?? '');
  const [settlementRate, setSettlementRate] = useState(String(profile.settlementRateInr ?? '3.50'));
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const handleTestConnection = async () => {
    setIsTestingConn(true);
    const result = await testFirestoreConnection();
    setIsTestingConn(false);
    Alert.alert(
      result.isFirestoreConnected ? '✅ Firebase Connected' : 'ℹ️ Firebase Status',
      result.message
    );
  };

  const handleSeedCanonical = () =>
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

  const handleRunVerification = () => {
    const result = runCanonicalVerification();
    if (result.passed) {
      Alert.alert('✅ All Tests Passed', 'All PRD §15.2 canonical and edge-case tests pass.');
    } else {
      Alert.alert('❌ Test Failures', result.failures.join('\n'));
    }
  };

  const handleSaveProfile = async () => {
    const cap = parseFloat(capacityKw);
    if (!cap || cap <= 0) {
      Alert.alert('Invalid', 'Please enter a valid system capacity in kW.');
      return;
    }
    const updated: SystemProfile = {
      ...profile,
      capacityKw: cap,
      location: location.trim() || 'Goa, India',
      tariffCategory: tariff.trim() || 'LTDS-II-SOLAR',
      installationDate: installDate.trim() || profile.installationDate,
      panelCount: parseInt(panelCount) || undefined,
      inverterModel: inverterModel.trim() || undefined,
      settlementRateInr: parseFloat(settlementRate) || 3.5,
    };
    try {
      setIsSavingProfile(true);
      await onProfileSave(updated);
      setIsSavingProfile(false);
      setShowEditProfile(false);
    } catch (e: any) {
      setIsSavingProfile(false);
      Alert.alert('Error', e?.message ?? 'Save failed');
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.pageTitle}>Settings</Text>

      {/* ── Active Consumer Account ── */}
      <Card
        title="Active Consumer"
        subtitle="EDG Electricity Account"
        badge={
          onSwitchConsumer ? (
            <TouchableOpacity
              id="btn-switch-consumer"
              style={styles.editBtn}
              onPress={onSwitchConsumer}
            >
              <Ionicons name="swap-horizontal" size={12} color={COLORS.gold} />
              <Text style={styles.editBtnText}>Switch</Text>
            </TouchableOpacity>
          ) : undefined
        }
      >
        <LedgerRow
          label="Consumer Number"
          value={profile.consumerNumber || 'Not configured'}
          valueColor={COLORS.gold}
        />
        <LedgerRow label="System / Owner" value={profile.systemName} />
      </Card>

      {/* ── System Profile ── */}
      <Card
        title="Solar System Profile"
        subtitle="Rooftop installation details"
        badge={
          <TouchableOpacity
            id="btn-edit-profile"
            style={styles.editBtn}
            onPress={() => setShowEditProfile(true)}
          >
            <Ionicons name="pencil" size={12} color={COLORS.gold} />
            <Text style={styles.editBtnText}>Edit</Text>
          </TouchableOpacity>
        }
      >
        <LedgerRow label="System Name" value={profile.systemName} />
        <LedgerRow label="DC Capacity" value={`${profile.capacityKw} kW`} />
        <LedgerRow label="Location" value={profile.location} />
        <LedgerRow label="Tariff Category" value={profile.tariffCategory} />
        <LedgerRow label="Installation Date" value={profile.installationDate} />
        {profile.panelCount && <LedgerRow label="Panel Count" value={`${profile.panelCount}`} />}
        {profile.inverterModel && <LedgerRow label="Inverter Model" value={profile.inverterModel} />}
        <Divider />
        <LedgerRow
          label="Settlement Rate (APPC)"
          value={profile.settlementRateInr ? `₹${profile.settlementRateInr}/kWh` : 'Not configured'}
          valueColor={profile.settlementRateInr ? COLORS.success : COLORS.warning}
        />
        <InfoNote
          text="PRD §2.2: Do not hard-code the settlement rate. Confirm from current JERC announcement before production use."
          color={COLORS.warning}
          style={{ marginTop: SPACING.sm }}
        />
      </Card>

      {/* ── Firebase Firestore ── */}
      <Card
        title="Firebase Firestore"
        subtitle={`Project: ${firebaseConfig.projectId}`}
        badge={
          <View style={[
            styles.syncPill,
            syncStatus.isFirestoreConnected ? styles.syncOnline : styles.syncOffline,
          ]}>
            <View style={[styles.syncDot, {
              backgroundColor: syncStatus.isFirestoreConnected ? COLORS.success : COLORS.info,
            }]} />
            <Text style={[styles.syncText, {
              color: syncStatus.isFirestoreConnected ? COLORS.success : COLORS.info,
            }]}>
              {syncStatus.isFirestoreConnected ? 'Online' : 'Local'}
            </Text>
          </View>
        }
      >
        <LedgerRow label="Project ID" value={firebaseConfig.projectId ?? ''} />
        <LedgerRow label="Auth Domain" value={firebaseConfig.authDomain ?? ''} />
        <LedgerRow label="Bucket" value={firebaseConfig.storageBucket ?? ''} />
        <Divider />
        <View style={styles.statusBox}>
          <Ionicons name="information-circle-outline" size={14} color={COLORS.textMuted} />
          <Text style={styles.statusMsg} numberOfLines={3}>{syncStatus.message}</Text>
        </View>

        <TouchableOpacity
          id="btn-test-firestore"
          style={[styles.actionBtn, styles.actionBtnBlue]}
          onPress={handleTestConnection}
          disabled={isTestingConn}
        >
          <Ionicons name="cloud-upload-outline" size={16} color={COLORS.textInverse} />
          <Text style={styles.actionBtnText}>
            {isTestingConn ? 'Testing…' : 'Test Firestore Connection'}
          </Text>
        </TouchableOpacity>

        {/* No-login rules hint */}
        <InfoNote
          text={
            '⚡ No-Login Firestore Setup\n\nSet Firestore rules to allow open read/write for no-login usage:\n\n' +
            'match /databases/{db}/documents {\n  match /{doc=**} {\n    allow read, write: if true;\n  }\n}\n\n' +
            'All data is also cached locally via AsyncStorage as offline fallback.'
          }
          color={COLORS.info}
          style={{ marginTop: SPACING.sm }}
        />
      </Card>

      {/* ── Tariff & Regulatory sources ── */}
      <Card
        title="Tariff & Regulatory Sources"
        subtitle="PRD §17 — must be revalidated before each production release"
      >
        <SourceLink
          title="Goa Electricity Dept — Net Metering"
          url="goaelectricity.gov.in/general-information/solar-others-matters/net-metering/"
        />
        <SourceLink
          title="JERC Net Metering Regulations 2019"
          url="goaelectricity.gov.in/wp-content/uploads/2026/01/Solar-pv-grid-regulation-2019.pdf"
        />
        <SourceLink
          title="JERC Tariff Order (FY 2025-26 to FY 2029-30)"
          url="goaelectricity.gov.in/Regulations/TARIFF%20ORDER%20w.e.f%201st%20October%202025.pdf"
        />
        <SourceLink
          title="JERC 1st Amendment Regulations 2024"
          url="goaelectricity.gov.in/Regulations/JERC_Net-Metering%20%281st%20Amendment%29.pdf"
        />
        <InfoNote
          text="Regulatory values in this app are based on publicly available orders. Confirm against your active EDG agreement and current JERC announcements before making financial decisions."
          color={COLORS.warning}
          style={{ marginTop: SPACING.sm }}
        />
      </Card>

      {/* ── Developer / Test tools ── */}
      <Card title="Developer Tools & Test Fixtures">
        <TouchableOpacity id="btn-seed-canonical-settings" style={styles.devBtn} onPress={handleSeedCanonical}>
          <Ionicons name="sparkles-outline" size={16} color={COLORS.gold} />
          <View style={{ flex: 1 }}>
            <Text style={styles.devBtnTitle}>Load PRD §15.2 Canonical Test Fixture</Text>
            <Text style={styles.devBtnSub}>August 2026 bill: 431G/241I/331E/239 opening</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity id="btn-run-verification" style={styles.devBtn} onPress={handleRunVerification}>
          <Ionicons name="checkmark-circle-outline" size={16} color={COLORS.success} />
          <View style={{ flex: 1 }}>
            <Text style={styles.devBtnTitle}>Run Domain Verification Tests</Text>
            <Text style={styles.devBtnSub}>Canonical + PRD §15.3 edge cases</Text>
          </View>
        </TouchableOpacity>
      </Card>

      {/* ── Edit Profile Modal ── */}
      <Modal visible={showEditProfile} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Edit System Profile</Text>
              <TouchableOpacity id="btn-close-edit-profile" onPress={() => setShowEditProfile(false)}>
                <Ionicons name="close" size={22} color={COLORS.textSub} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ padding: SPACING.lg }}>
              <ProfileField label="System Capacity (kW) *" value={capacityKw} onChange={setCapacityKw} keyboardType="numeric" />
              <ProfileField label="Location / Taluka" value={location} onChange={setLocation} />
              <ProfileField label="Tariff Category" value={tariff} onChange={setTariff} />
              <ProfileField label="Installation Date (YYYY-MM-DD)" value={installDate} onChange={setInstallDate} />
              <ProfileField label="Panel Count" value={panelCount} onChange={setPanelCount} keyboardType="numeric" />
              <ProfileField label="Inverter Make/Model" value={inverterModel} onChange={setInverterModel} />
              <ProfileField label="APPC Settlement Rate (₹/kWh)" value={settlementRate} onChange={setSettlementRate} keyboardType="numeric" />
              <InfoNote
                text="PRD §2.2: Confirm the APPC/settlement rate from current JERC announcement before entering."
                color={COLORS.warning}
                style={{ marginBottom: SPACING.md }}
              />
            </ScrollView>
            <View style={styles.sheetFooter}>
              <TouchableOpacity id="btn-cancel-profile" style={styles.cancelBtn} onPress={() => setShowEditProfile(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                id="btn-save-profile"
                style={[styles.saveBtn, isSavingProfile && { opacity: 0.65 }]}
                onPress={handleSaveProfile} disabled={isSavingProfile}
              >
                <Text style={styles.saveBtnText}>
                  {isSavingProfile ? 'Saving…' : 'Save Profile'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
};

const ProfileField: React.FC<{
  label: string; value: string; onChange: (v: string) => void;
  keyboardType?: 'numeric' | 'default';
}> = ({ label, value, onChange, keyboardType = 'default' }) => (
  <View style={{ marginBottom: SPACING.sm + 2 }}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <TextInput
      style={styles.input} value={value} onChangeText={onChange}
      keyboardType={keyboardType} placeholderTextColor={COLORS.textMuted}
    />
  </View>
);

const SourceLink: React.FC<{ title: string; url: string }> = ({ title, url }) => (
  <View style={styles.sourceRow}>
    <Ionicons name="link-outline" size={14} color={COLORS.textMuted} />
    <View style={{ flex: 1 }}>
      <Text style={styles.sourceTitle}>{title}</Text>
      <Text style={styles.sourceUrl} numberOfLines={1}>{url}</Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xxl + 20 },
  pageTitle: { fontSize: 20, fontWeight: FONT.heavy, color: COLORS.text, marginBottom: SPACING.md },
  editBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.glowGold,
    borderWidth: 1, borderColor: `${COLORS.gold}44`, paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: RADIUS.full,
  },
  editBtnText: { fontSize: 11, fontWeight: FONT.bold, color: COLORS.gold },
  syncPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.full },
  syncOnline: { backgroundColor: COLORS.glowGreen },
  syncOffline: { backgroundColor: COLORS.glowBlue },
  syncDot: { width: 6, height: 6, borderRadius: 3 },
  syncText: { fontSize: 10, fontWeight: FONT.bold },
  statusBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: SPACING.sm },
  statusMsg: { fontSize: 11, color: COLORS.textSub, flex: 1 },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    padding: 10, borderRadius: RADIUS.md, marginBottom: SPACING.xs,
  },
  actionBtnBlue: { backgroundColor: COLORS.info },
  actionBtnText: { fontSize: 13, fontWeight: FONT.bold, color: COLORS.textInverse },
  devBtn: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, backgroundColor: COLORS.surfaceRaised,
    borderWidth: 1, borderColor: COLORS.borderSubtle, borderRadius: RADIUS.md,
    padding: SPACING.sm + 2, marginBottom: SPACING.sm,
  },
  devBtnTitle: { fontSize: 13, fontWeight: FONT.semi, color: COLORS.text },
  devBtnSub: { fontSize: 10, color: COLORS.textMuted, marginTop: 2 },
  sourceRow: { flexDirection: 'row', gap: SPACING.sm, paddingVertical: 6 },
  sourceTitle: { fontSize: 12, color: COLORS.text, fontWeight: FONT.semi },
  sourceUrl: { fontSize: 10, color: COLORS.textMuted },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: COLORS.surface, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl,
    maxHeight: '88%', borderWidth: 1, borderColor: COLORS.border,
  },
  sheetHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: SPACING.lg, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  sheetTitle: { fontSize: 18, fontWeight: FONT.bold, color: COLORS.text },
  sheetFooter: {
    flexDirection: 'row', gap: SPACING.sm, padding: SPACING.lg,
    borderTopWidth: 1, borderTopColor: COLORS.border,
    paddingBottom: Platform.OS === 'ios' ? SPACING.xl : SPACING.lg,
  },
  fieldLabel: { fontSize: 11, fontWeight: FONT.semi, color: COLORS.textSub, marginBottom: 4 },
  input: {
    backgroundColor: COLORS.surfaceRaised, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: 9,
    color: COLORS.text, fontSize: 13,
  },
  cancelBtn: { flex: 1, padding: 12, alignItems: 'center', borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  cancelBtnText: { fontSize: 14, fontWeight: FONT.semi, color: COLORS.textSub },
  saveBtn: { flex: 2, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.gold, padding: 12, borderRadius: RADIUS.md },
  saveBtnText: { fontSize: 14, fontWeight: FONT.bold, color: COLORS.textInverse },
});
