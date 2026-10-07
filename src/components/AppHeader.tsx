import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
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
          <Ionicons name="sunny" size={20} color={COLORS.gold} />
        </View>
        <View>
          <Text style={styles.appName}>Goa SolarTrack</Text>
          <Text style={styles.systemInfo}>
            {profile.location} · {profile.capacityKw} kW
          </Text>
        </View>
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity
          id="btn-sync-status"
          style={styles.syncDot}
          onPress={onSettingsPress}
          activeOpacity={0.7}
        >
          <View
            style={[
              styles.dot,
              { backgroundColor: syncStatus.isFirestoreConnected ? COLORS.success : COLORS.muted },
            ]}
          />
        </TouchableOpacity>
        <TouchableOpacity
          id="btn-add-bill-header"
          style={styles.addBtn}
          onPress={onAddBill}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={18} color={COLORS.textInverse} />
          <Text style={styles.addBtnText}>Add Bill</Text>
        </TouchableOpacity>
      </View>
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
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
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.glowGold,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: `${COLORS.gold}33`,
  },
  appName: {
    fontSize: 17,
    fontWeight: FONT.bold,
    color: COLORS.text,
    letterSpacing: 0.2,
  },
  systemInfo: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  syncDot: {
    padding: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.gold,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: RADIUS.full,
    elevation: 2,
  },
  addBtnText: {
    fontSize: 13,
    fontWeight: FONT.bold,
    color: COLORS.textInverse,
  },
});
