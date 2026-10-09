// ============================================================
// GOA SOLARTRACKER — Consumer Onboarding & Identification Modal
// Allows user to enter their unique EDG consumer number to load
// or create their isolated profile and monthly solar data.
// ============================================================

import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, FONT, SHADOW } from '../constants/theme';
import { SystemProfile } from '../types/solar';

interface ConsumerOnboardingModalProps {
  visible: boolean;
  canCancel?: boolean;
  currentConsumerNumber?: string | null;
  onClose?: () => void;
  onConnect: (consumerNumber: string, profileDetails?: Partial<SystemProfile>) => Promise<void>;
}

export const ConsumerOnboardingModal: React.FC<ConsumerOnboardingModalProps> = ({
  visible,
  canCancel = false,
  currentConsumerNumber = null,
  onClose,
  onConnect,
}) => {
  const [consumerNum, setConsumerNum] = useState(currentConsumerNumber ?? '');
  const [capacity, setCapacity] = useState('5.0');
  const [location, setLocation] = useState('Panaji, Goa');
  const [systemName, setSystemName] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async () => {
    const trimmed = consumerNum.trim();
    if (!trimmed) {
      Alert.alert('Required', 'Please enter your Electricity Consumer Number.');
      return;
    }

    const capNum = parseFloat(capacity) || 5.0;

    try {
      setIsLoading(true);
      await onConnect(trimmed, {
        capacityKw: capNum,
        location: location.trim() || 'Goa, India',
        systemName: systemName.trim() || `Consumer ${trimmed}`,
      });
      setIsLoading(false);
    } catch (err: any) {
      setIsLoading(false);
      Alert.alert('Connection Error', err?.message ?? 'Could not set consumer account.');
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={() => {
        if (canCancel && onClose) onClose();
      }}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <View style={styles.card}>
          <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.iconCircle}>
                <Ionicons name="sunny" size={28} color={COLORS.gold} />
              </View>
              <Text style={styles.title}>Goa SolarTrack</Text>
              <Text style={styles.subtitle}>
                Enter your unique Electricity Consumer ID to access and manage your solar data.
              </Text>
              {canCancel && onClose && (
                <TouchableOpacity
                  id="btn-close-consumer-modal"
                  style={styles.closeBtn}
                  onPress={onClose}
                >
                  <Ionicons name="close" size={22} color={COLORS.textSub} />
                </TouchableOpacity>
              )}
            </View>

            {/* Input Section */}
            <View style={styles.form}>
              <Text style={styles.inputLabel}>
                ELECTRICITY CONSUMER NUMBER <Text style={styles.req}>*</Text>
              </Text>
              <View style={styles.inputBox}>
                <Ionicons name="card-outline" size={20} color={COLORS.gold} style={styles.inputIcon} />
                <TextInput
                  id="input-consumer-number"
                  style={styles.textInput}
                  placeholder="e.g. 1002345678"
                  placeholderTextColor={COLORS.textMuted}
                  value={consumerNum}
                  onChangeText={setConsumerNum}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  editable={!isLoading}
                />
              </View>
              <Text style={styles.helperText}>
                Found at the top of your Goa Electricity Department (EDG) bill.
              </Text>

              {/* Advanced / Optional Initial Setup */}
              <TouchableOpacity
                id="btn-toggle-setup"
                style={styles.advancedToggle}
                onPress={() => setShowAdvanced(!showAdvanced)}
              >
                <Text style={styles.advancedToggleText}>
                  {showAdvanced ? 'Hide Solar Setup Details' : '+ System Capacity & Location (Optional)'}
                </Text>
                <Ionicons
                  name={showAdvanced ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={COLORS.gold}
                />
              </TouchableOpacity>

              {showAdvanced && (
                <View style={styles.advancedFields}>
                  <Text style={styles.inputLabel}>ROOFTOP CAPACITY (kW)</Text>
                  <View style={styles.inputBox}>
                    <Ionicons name="flash-outline" size={20} color={COLORS.textMuted} style={styles.inputIcon} />
                    <TextInput
                      id="input-system-capacity"
                      style={styles.textInput}
                      placeholder="5.0"
                      placeholderTextColor={COLORS.textMuted}
                      value={capacity}
                      onChangeText={setCapacity}
                      keyboardType="numeric"
                      editable={!isLoading}
                    />
                  </View>

                  <Text style={[styles.inputLabel, { marginTop: SPACING.md }]}>LOCATION / TALUKA</Text>
                  <View style={styles.inputBox}>
                    <Ionicons name="location-outline" size={20} color={COLORS.textMuted} style={styles.inputIcon} />
                    <TextInput
                      id="input-system-location"
                      style={styles.textInput}
                      placeholder="e.g. Panaji, North Goa"
                      placeholderTextColor={COLORS.textMuted}
                      value={location}
                      onChangeText={setLocation}
                      editable={!isLoading}
                    />
                  </View>

                  <Text style={[styles.inputLabel, { marginTop: SPACING.md }]}>SYSTEM / OWNER NAME</Text>
                  <View style={styles.inputBox}>
                    <Ionicons name="person-outline" size={20} color={COLORS.textMuted} style={styles.inputIcon} />
                    <TextInput
                      id="input-system-name"
                      style={styles.textInput}
                      placeholder="e.g. My Rooftop Solar"
                      placeholderTextColor={COLORS.textMuted}
                      value={systemName}
                      onChangeText={setSystemName}
                      editable={!isLoading}
                    />
                  </View>
                </View>
              )}

              {/* Action Button */}
              <TouchableOpacity
                id="btn-connect-consumer"
                style={[styles.submitBtn, isLoading && styles.submitBtnDisabled]}
                onPress={handleSubmit}
                disabled={isLoading}
                activeOpacity={0.8}
              >
                {isLoading ? (
                  <ActivityIndicator color={COLORS.textInverse} size="small" />
                ) : (
                  <>
                    <Ionicons name="arrow-forward-circle" size={20} color={COLORS.textInverse} />
                    <Text style={styles.submitBtnText}>Connect & Load Data</Text>
                  </>
                )}
              </TouchableOpacity>

              <Text style={styles.privacyNote}>
                🔒 Data is stored isolated under your consumer ID in Firestore & synced locally.
              </Text>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  card: {
    width: '100%',
    maxHeight: '90%',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOW.card,
  },
  header: {
    alignItems: 'center',
    marginBottom: SPACING.lg,
    position: 'relative',
  },
  closeBtn: {
    position: 'absolute',
    top: -4,
    right: -4,
    padding: SPACING.xs,
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: COLORS.glowGold,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: `${COLORS.gold}44`,
  },
  title: {
    fontSize: 22,
    fontWeight: FONT.bold,
    color: COLORS.text,
    letterSpacing: -0.3,
    marginBottom: SPACING.xs,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textSub,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: SPACING.sm,
  },
  form: {
    marginTop: SPACING.sm,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: FONT.bold,
    color: COLORS.textSub,
    letterSpacing: 0.6,
    marginBottom: SPACING.xs,
  },
  req: {
    color: COLORS.danger,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceRaised,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    height: 48,
  },
  inputIcon: {
    marginRight: SPACING.sm,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    color: COLORS.text,
    fontWeight: FONT.semi,
  },
  helperText: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 6,
    marginBottom: SPACING.md,
  },
  advancedToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  advancedToggleText: {
    fontSize: 13,
    fontWeight: FONT.semi,
    color: COLORS.gold,
  },
  advancedFields: {
    backgroundColor: COLORS.surfaceRaised,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.gold,
    height: 50,
    borderRadius: RADIUS.lg,
    gap: SPACING.sm,
    marginTop: SPACING.sm,
    ...SHADOW.card,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    fontSize: 16,
    fontWeight: FONT.bold,
    color: COLORS.textInverse,
  },
  privacyNote: {
    fontSize: 11,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: SPACING.md,
    lineHeight: 16,
  },
});
