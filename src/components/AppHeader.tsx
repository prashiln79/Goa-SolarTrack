import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SystemProfile, SyncStatus } from '../types/solar';
import { COLORS, SPACING, RADIUS, FONT } from '../constants/theme';

const APP_ICON = require('../../assets/icon1.png');

interface AppHeaderProps {
  profile: SystemProfile;
  syncStatus: SyncStatus;
  onAddBill: () => void;
  onSettingsPress: () => void;
  onConsumerPress?: () => void;
  onNotificationPress?: () => void;
  hasNotificationDot?: boolean;
  remindersEnabled?: boolean;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  profile,
  syncStatus: _,
  onAddBill,
  onSettingsPress,
  onConsumerPress,
  onNotificationPress,
  hasNotificationDot = true,
  remindersEnabled = true,
}) => (
  <View style={styles.container}>
    <View style={styles.topRow}>
      {/* Brand */}
      <TouchableOpacity
        id="btn-header-profile"
        style={styles.brand}
        onPress={onConsumerPress || onSettingsPress}
        activeOpacity={0.7}
      >
        <Image
          source={APP_ICON}
          style={styles.appIcon}
          resizeMode="cover"
        />
        <View style={styles.brandTextContainer}>
          <Text style={styles.appName} numberOfLines={1}>Goa SolarTrack</Text>
          <Text style={styles.systemInfo} numberOfLines={1}>
            {profile.consumerNumber ? `ID: ${profile.consumerNumber}` : profile.location} · {profile.capacityKw} kW
          </Text>
        </View>
      </TouchableOpacity>

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity
          id="btn-add-bill-header"
          style={styles.addBtn}
          onPress={onAddBill}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={17} color={COLORS.textInverse} />
          <Text style={styles.addBtnText}>Add Bill</Text>
        </TouchableOpacity>

        <TouchableOpacity
          id="btn-header-notifications"
          style={styles.bellBtn}
          onPress={onNotificationPress || onSettingsPress}
          activeOpacity={0.7}
        >
          <Ionicons
            name={remindersEnabled === false ? 'notifications-off-outline' : 'notifications-outline'}
            size={20}
            color={remindersEnabled === false ? COLORS.muted : COLORS.textSub}
          />
          {hasNotificationDot && remindersEnabled !== false && (
            <View style={styles.notificationDot} />
          )}
        </TouchableOpacity>
      </View>
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 4,
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
    gap: SPACING.sm + 2,
    flex: 1,
    marginRight: SPACING.sm,
  },
  appIcon: {
    width: 42,
    height: 42,
    borderRadius: RADIUS.md,
  },
  brandTextContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  appName: {
    fontSize: 16,
    fontWeight: FONT.bold,
    color: COLORS.text,
    letterSpacing: 0.1,
  },
  systemInfo: {
    fontSize: 11.5,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
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
    elevation: 2,
  },
  addBtnText: {
    fontSize: 12.5,
    fontWeight: FONT.semi,
    color: COLORS.textInverse,
    letterSpacing: 0.1,
  },
  bellBtn: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surfaceRaised,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  notificationDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EA580C',
    borderWidth: 1.5,
    borderColor: COLORS.surface,
  },
});
