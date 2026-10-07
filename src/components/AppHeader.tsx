import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SystemProfile, SyncStatus } from '../types/solar';
import { COLORS, SPACING, RADIUS, FONT } from '../constants/theme';

interface AppHeaderProps {
  profile: SystemProfile;
  syncStatus: SyncStatus;
  onAddBill: () => void;
  onSettingsPress: () => void;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  profile,
  syncStatus,
  onAddBill,
  onSettingsPress,
}) => (
  <View style={styles.container}>
    <View style={styles.topRow}>
      {/* Brand */}
      <View style={styles.brand}>
        <View style={styles.sunIcon}>
          <Ionicons name="sunny" size={18} color={COLORS.gold} />
        </View>
        <View>
          <Text style={styles.appName}>Goa SolarTrack</Text>
          <Text style={styles.systemInfo}>
            {profile.location} • {profile.capacityKw} kW
          </Text>
        </View>
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity
          id="btn-add-bill-header"
          style={styles.addBtn}
          onPress={onAddBill}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={16} color={COLORS.textInverse} />
          <Text style={styles.addBtnText}>Add Bill</Text>
        </TouchableOpacity>
      </View>
    </View>

    {/* Status pills row */}
    <View style={styles.pillsRow}>
      <View style={styles.tariffPill}>
        <Ionicons name="flash-outline" size={11} color={COLORS.gold} />
        <Text style={styles.tariffText}>{profile.tariffCategory}</Text>
      </View>

      <TouchableOpacity
        id="btn-sync-status"
        style={[
          styles.syncPill,
          syncStatus.isFirestoreConnected ? styles.syncOnline : styles.syncOffline,
        ]}
        onPress={onSettingsPress}
        activeOpacity={0.7}
      >
        <View
          style={[
            styles.syncDot,
            { backgroundColor: syncStatus.isFirestoreConnected ? COLORS.success : COLORS.info },
          ]}
        />
        <Text
          style={[
            styles.syncText,
            { color: syncStatus.isFirestoreConnected ? COLORS.success : COLORS.info },
          ]}
          numberOfLines={1}
        >
          {syncStatus.isFirestoreConnected ? 'Firestore Synced' : 'Local Storage'}
        </Text>
      </TouchableOpacity>
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    paddingTop: Platform.OS === 'ios' ? SPACING.sm : SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  sunIcon: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.glowGold,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: `${COLORS.gold}44`,
  },
  appName: {
    fontSize: 17,
    fontWeight: FONT.bold,
    color: COLORS.text,
    letterSpacing: 0.2,
  },
  systemInfo: {
    fontSize: 11,
    color: COLORS.textSub,
    marginTop: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.gold,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: RADIUS.full,
    shadowColor: COLORS.gold,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 3,
  },
  addBtnText: {
    fontSize: 13,
    fontWeight: FONT.bold,
    color: COLORS.textInverse,
  },
  pillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  tariffPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.glowGold,
    borderWidth: 1,
    borderColor: `${COLORS.gold}44`,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
  },
  tariffText: {
    fontSize: 10,
    fontWeight: FONT.bold,
    color: COLORS.gold,
  },
  syncPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
  },
  syncOnline: { backgroundColor: COLORS.glowGreen },
  syncOffline: { backgroundColor: COLORS.glowBlue },
  syncDot: { width: 6, height: 6, borderRadius: 3 },
  syncText: { fontSize: 10, fontWeight: FONT.bold },
});
