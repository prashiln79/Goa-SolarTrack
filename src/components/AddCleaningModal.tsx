import React, { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, Modal, TouchableOpacity,
  Alert, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CleaningEvent } from '../types/solar';
import { COLORS, SPACING, RADIUS, FONT } from '../constants/theme';

interface AddCleaningModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (event: CleaningEvent) => Promise<void>;
}

export const AddCleaningModal: React.FC<AddCleaningModalProps> = ({
  visible, onClose, onSave,
}) => {
  const today = new Date().toISOString().split('T')[0];
  const [date, setDate]         = useState(today);
  const [provider, setProvider] = useState('Self-cleaned');
  const [notes, setNotes]       = useState('');
  const [cost, setCost]         = useState('0');
  const [skipped, setSkipped]   = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSave = async () => {
    if (!date.trim()) {
      Alert.alert('Required', 'Please enter the cleaning date.');
      return;
    }
    const event: CleaningEvent = {
      id: `clean-${Date.now()}`,
      date: date.trim(),
      provider: provider.trim() || 'Self-cleaned',
      notes: notes.trim() || undefined,
      cost: parseFloat(cost) || 0,
      skipped,
      createdAt: Date.now(),
    };
    try {
      setIsSubmitting(true);
      await onSave(event);
      setIsSubmitting(false);
      onClose();
    } catch (e: any) {
      setIsSubmitting(false);
      Alert.alert('Error', e?.message ?? 'Could not save');
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Log Panel Maintenance</Text>
              <Text style={styles.sub}>PRD §8.4 — resets soiling recency signal</Text>
            </View>
            <TouchableOpacity id="btn-close-cleaning" onPress={onClose}>
              <Ionicons name="close" size={22} color={COLORS.textSub} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.form} showsVerticalScrollIndicator={false}>
            {/* Skip toggle */}
            <TouchableOpacity
              id="btn-skip-clean"
              style={[styles.skipBtn, skipped && styles.skipBtnActive]}
              onPress={() => setSkipped(!skipped)}
            >
              <Ionicons
                name={skipped ? 'checkmark-circle' : 'close-circle-outline'}
                size={16}
                color={skipped ? COLORS.gold : COLORS.textMuted}
              />
              <Text style={[styles.skipBtnText, skipped && { color: COLORS.gold }]}>
                {skipped ? '"Skip / Not needed" selected — suppresses alert' : 'Mark as "Skip / Not needed" instead of actual clean'}
              </Text>
            </TouchableOpacity>

            <Text style={styles.section}>CLEANING DETAILS</Text>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Date (YYYY-MM-DD) *</Text>
              <TextInput
                style={styles.input} value={date} onChangeText={setDate}
                placeholder={today} placeholderTextColor={COLORS.textMuted}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Service Provider / Method</Text>
              <TextInput
                style={styles.input} value={provider} onChangeText={setProvider}
                placeholder="Self-cleaned / Solar Care Goa" placeholderTextColor={COLORS.textMuted}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Cost (₹, 0 for self-clean)</Text>
              <TextInput
                style={styles.input} value={cost} onChangeText={setCost}
                keyboardType="numeric" placeholder="0" placeholderTextColor={COLORS.textMuted}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Observations / Notes</Text>
              <TextInput
                style={[styles.input, { height: 72, textAlignVertical: 'top' }]}
                value={notes} onChangeText={setNotes} multiline
                placeholder="e.g. Bird droppings on panels 2 & 3. Dust from road. Post-clean output improved."
                placeholderTextColor={COLORS.textMuted}
              />
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity id="btn-cancel-cleaning" style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              id="btn-save-cleaning"
              style={[styles.saveBtn, isSubmitting && { opacity: 0.65 }]}
              onPress={handleSave} disabled={isSubmitting}
            >
              <Ionicons name="water" size={18} color={COLORS.textInverse} />
              <Text style={styles.saveBtnText}>
                {isSubmitting ? 'Saving…' : skipped ? 'Log Skip' : 'Log Wash'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    maxHeight: '85%',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: SPACING.lg, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  title: { fontSize: 18, fontWeight: FONT.bold, color: COLORS.text },
  sub: { fontSize: 12, color: COLORS.textSub, marginTop: 2 },
  form: { padding: SPACING.lg },
  skipBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.surfaceRaised, borderWidth: 1, borderColor: COLORS.border,
    padding: SPACING.sm + 2, borderRadius: RADIUS.md, marginBottom: SPACING.md,
  },
  skipBtnActive: { borderColor: `${COLORS.gold}55`, backgroundColor: COLORS.glowGold },
  skipBtnText: { fontSize: 12, color: COLORS.textSub, flex: 1 },
  section: {
    fontSize: 11, fontWeight: FONT.bold, color: COLORS.textMuted,
    letterSpacing: 0.7, marginBottom: SPACING.sm,
  },
  fieldGroup: { marginBottom: SPACING.sm + 2 },
  label: { fontSize: 11, fontWeight: FONT.semi, color: COLORS.textSub, marginBottom: 4 },
  input: {
    backgroundColor: COLORS.surfaceRaised, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: 9,
    color: COLORS.text, fontSize: 13,
  },
  footer: {
    flexDirection: 'row', gap: SPACING.sm, padding: SPACING.lg,
    borderTopWidth: 1, borderTopColor: COLORS.border,
    paddingBottom: Platform.OS === 'ios' ? SPACING.xl : SPACING.lg,
  },
  cancelBtn: { flex: 1, padding: 12, alignItems: 'center', borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  cancelBtnText: { fontSize: 14, fontWeight: FONT.semi, color: COLORS.textSub },
  saveBtn: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: COLORS.info, padding: 12, borderRadius: RADIUS.md,
  },
  saveBtnText: { fontSize: 14, fontWeight: FONT.bold, color: COLORS.textInverse },
});
