// ============================================================
// Solar Care Screen — Simple, Human-Centric Maintenance Checklist
// Adheres to 5 Rules:
// 1. Show only important tasks (panel cleaning, inverter check, roof inspection)
// 2. Use everyday language
// 3. Show one clear date ("Due in 3 days" / "Overdue by 2 days")
// 4. Easy completion (1-tap complete, auto-reschedules next task)
// 5. Hide technical details (collapsible recent history)
// ============================================================

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  Platform,
  TextInput,
  KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CareAssessment, CleaningEvent, SystemProfile } from '../types/solar';
import { Card } from '../components/ui/UIKit';
import { DateField } from '../components/ui/DatePickerModal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACING, RADIUS, FONT, SHADOW } from '../constants/theme';

interface CareScreenProps {
  careAssessment: CareAssessment;
  cleaningEvents: CleaningEvent[];
  profile: SystemProfile;
  onLogClean: () => void;
  onSaveClean?: (event: CleaningEvent) => Promise<void> | void;
  onDeleteClean?: (eventId: string) => Promise<void> | void;
}

interface MaintenanceTask {
  id: string;
  title: string;
  description: string;
  frequencyDays: number;
  icon: keyof typeof Ionicons.glyphMap;
  iconBg: string;
  iconColor: string;
  providerTag: string;
}

const DEFAULT_TASKS: MaintenanceTask[] = [
  {
    id: 'task-clean',
    title: 'Clean solar panels',
    description: 'Remove dust and dirt to restore energy output',
    frequencyDays: 30, // 30-day recommended cycle for Goa
    icon: 'water',
    iconBg: '#FEF3C7',
    iconColor: '#D97706',
    providerTag: 'Panel wash',
  },
  {
    id: 'task-inverter',
    title: 'Check inverter',
    description: 'Check for green normal light and error codes on screen',
    frequencyDays: 60,
    icon: 'flash',
    iconBg: '#EFF6FF',
    iconColor: '#2563EB',
    providerTag: 'Inverter check',
  },
  {
    id: 'task-roof',
    title: 'Visual roof inspection',
    description: 'Check panel mounting brackets, rust & loose wires',
    frequencyDays: 180,
    icon: 'shield-checkmark',
    iconBg: '#ECFDF5',
    iconColor: '#059669',
    providerTag: 'Roof inspection',
  },
];

// ── Date calculation helpers ─────────────────────────────────
function parseDate(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatDateYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatFriendlyDate(ymd: string): string {
  if (!ymd) return 'Not recorded';
  try {
    const d = parseDate(ymd);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  } catch {
    return ymd;
  }
}

export const CareScreen: React.FC<CareScreenProps> = ({
  careAssessment,
  cleaningEvents,
  profile,
  onLogClean,
  onSaveClean,
  onDeleteClean,
}) => {
  const insets = useSafeAreaInsets();
  const todayYMD = useMemo(() => formatDateYMD(new Date()), []);

  // Notifications enabled state (local preference)
  const [remindersEnabled, setRemindersEnabled] = useState(true);

  // History expansion state
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false);

  // Completion modal state
  const [completingTask, setCompletingTask] = useState<MaintenanceTask | null>(null);
  const [completionDate, setCompletionDate] = useState(todayYMD);
  const [completionNotes, setCompletionNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── Calculate due status for each task ──────────────────────
  const tasksWithSchedule = useMemo(() => {
    return DEFAULT_TASKS.map((task) => {
      // Find latest completed event matching this task
      let lastCompletedDate: string | null = null;

      if (task.id === 'task-clean') {
        const cleanEvt = cleaningEvents.find(
          (e) => !e.skipped && e.provider !== 'Inverter check' && e.provider !== 'Roof inspection'
        );
        lastCompletedDate = cleanEvt?.date || profile.lastCleanedDate || null;
      } else {
        const matchEvt = cleaningEvents.find((e) => e.provider === task.providerTag);
        lastCompletedDate = matchEvt?.date || null;
      }

      // Calculate next due date
      let nextDueDate: Date;
      if (lastCompletedDate) {
        const last = parseDate(lastCompletedDate);
        nextDueDate = new Date(last.getTime() + task.frequencyDays * 86400000);
      } else {
        // If never completed, default to frequency from today
        const now = new Date();
        nextDueDate = new Date(now.getTime() + (task.id === 'task-clean' ? 3 : 14) * 86400000);
      }

      const nextDueDateStr = formatDateYMD(nextDueDate);
      const diffMs = nextDueDate.getTime() - new Date().setHours(0, 0, 0, 0);
      const diffDays = Math.round(diffMs / 86400000);

      let dueText = '';
      let dueSeverity: 'normal' | 'soon' | 'overdue' = 'normal';

      if (diffDays < 0) {
        const daysPast = Math.abs(diffDays);
        dueText = `Overdue by ${daysPast} day${daysPast === 1 ? '' : 's'}`;
        dueSeverity = 'overdue';
      } else if (diffDays === 0) {
        dueText = 'Due today';
        dueSeverity = 'soon';
      } else if (diffDays <= 7) {
        dueText = `Due in ${diffDays} day${diffDays === 1 ? '' : 's'}`;
        dueSeverity = 'soon';
      } else {
        dueText = `Due in ${diffDays} days (${formatFriendlyDate(nextDueDateStr)})`;
        dueSeverity = 'normal';
      }

      return {
        ...task,
        lastCompletedDate,
        nextDueDateStr,
        diffDays,
        dueText,
        dueSeverity,
      };
    });
  }, [cleaningEvents, profile.lastCleanedDate]);

  // Overall system summary status
  const overdueTasks = tasksWithSchedule.filter((t) => t.dueSeverity === 'overdue');
  const soonTasks = tasksWithSchedule.filter((t) => t.dueSeverity === 'soon');
  const nextTask = [...tasksWithSchedule].sort((a, b) => a.diffDays - b.diffDays)[0];

  // Most recent completed maintenance event
  const mostRecentEvent = cleaningEvents.length > 0 ? cleaningEvents[0] : null;

  // ── Handle Task Completion ──────────────────────────────────
  const handleOpenCompleteModal = (task: MaintenanceTask) => {
    setCompletingTask(task);
    setCompletionDate(todayYMD);
    setCompletionNotes('');
  };

  const handleConfirmCompletion = async () => {
    if (!completingTask) return;

    try {
      setIsSubmitting(true);
      const newEvent: CleaningEvent = {
        id: `maint-${Date.now()}`,
        date: completionDate || todayYMD,
        provider: completingTask.providerTag,
        notes: completionNotes.trim() || `${completingTask.title} completed`,
        cost: 0,
        createdAt: Date.now(),
      };

      if (onSaveClean) {
        await onSaveClean(newEvent);
      }

      const nextDate = new Date(parseDate(newEvent.date).getTime() + completingTask.frequencyDays * 86400000);
      const formattedNext = formatFriendlyDate(formatDateYMD(nextDate));

      setIsSubmitting(false);
      setCompletingTask(null);

      Alert.alert(
        'Task Completed! 🎉',
        `Great job! "${completingTask.title}" has been saved to your records.\n\nNext check is scheduled for ${formattedNext}.`
      );
    } catch (e: any) {
      setIsSubmitting(false);
      Alert.alert('Save Failed', e?.message || 'Could not record task completion.');
    }
  };

  const handleToggleReminders = () => {
    const nextState = !remindersEnabled;
    setRemindersEnabled(nextState);
    Alert.alert(
      nextState ? 'Reminders Turned On' : 'Reminders Muted',
      nextState
        ? 'You will receive gentle notifications when panel care is due.'
        : 'Maintenance reminder notifications are now turned off.'
    );
  };

  const confirmDelete = (event: CleaningEvent) => {
    const message = `Are you sure you want to delete the record for ${event.date} (${event.skipped ? 'Skipped' : event.provider ?? 'Cleaning'})?`;

    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(message)) {
        if (onDeleteClean) onDeleteClean(event.id);
      }
      return;
    }

    Alert.alert('Delete Record', message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          if (onDeleteClean) onDeleteClean(event.id);
        },
      },
    ]);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Solar Care Status Card ── */}
      <Card
        title="Solar Care"
        subtitle="Keep your solar system in good shape"
        style={styles.heroCard}
        badge={
          <TouchableOpacity
            id="btn-toggle-care-reminders"
            style={[styles.bellBtn, remindersEnabled && styles.bellBtnActive]}
            onPress={handleToggleReminders}
            activeOpacity={0.7}
          >
            <Ionicons
              name={remindersEnabled ? 'notifications' : 'notifications-off-outline'}
              size={17}
              color={remindersEnabled ? COLORS.gold : COLORS.textMuted}
            />
          </TouchableOpacity>
        }
      >
        <View
          style={[
            styles.statusHero,
            overdueTasks.length > 0
              ? styles.statusHeroOverdue
              : soonTasks.length > 0
              ? styles.statusHeroSoon
              : styles.statusHeroCaughtUp,
          ]}
        >
          <View style={styles.statusHeroIconBox}>
            <Ionicons
              name={
                overdueTasks.length > 0
                  ? 'alert-circle'
                  : soonTasks.length > 0
                  ? 'time'
                  : 'checkmark-circle'
              }
              size={22}
              color={
                overdueTasks.length > 0
                  ? COLORS.danger
                  : soonTasks.length > 0
                  ? COLORS.warning
                  : COLORS.success
              }
            />
          </View>
          <View style={styles.statusHeroTextCol}>
            <Text style={styles.statusHeroTitle}>
              {overdueTasks.length > 0
                ? 'Maintenance overdue'
                : soonTasks.length > 0
                ? 'Maintenance coming up'
                : "You're all caught up!"}
            </Text>
            <Text style={styles.statusHeroSub}>
              {overdueTasks.length > 0
                ? `${overdueTasks[0].title} is ${overdueTasks[0].dueText.toLowerCase()}.`
                : soonTasks.length > 0
                ? `${soonTasks[0].title} is ${soonTasks[0].dueText.toLowerCase()}.`
                : `Your next maintenance task is ${nextTask?.title.toLowerCase()} (${nextTask?.dueText.toLowerCase()}).`}
            </Text>
          </View>
        </View>

        {/* ── Separate Generation Alert (Shown ONLY when attention needed) ── */}
        {careAssessment.state.includes('recommended') && !careAssessment.weatherExplained && (
          <View style={styles.generationAlert}>
            <View style={styles.generationAlertHeader}>
              <Ionicons name="flash-outline" size={15} color={COLORS.danger} />
              <Text style={styles.generationAlertTitle}>Generation Dip Detected</Text>
            </View>
            <Text style={styles.generationAlertText}>
              Your daily solar output dropped below seasonal expected averages in Goa. A panel wash or inverter check will help recover full generation.
            </Text>
          </View>
        )}
      </Card>

      {/* ── Section Title: Your Maintenance Checklist ── */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Your maintenance</Text>
        <Text style={styles.sectionBadge}>
          {overdueTasks.length > 0
            ? `${overdueTasks.length} overdue`
            : `${tasksWithSchedule.length} upcoming`}
        </Text>
      </View>

      {/* ── Task Cards (Simple, clear, 3-4 tasks) ── */}
      <View style={styles.taskList}>
        {tasksWithSchedule.map((task) => {
          const isOverdue = task.dueSeverity === 'overdue';
          const isSoon = task.dueSeverity === 'soon';

          return (
            <View key={task.id} style={styles.taskCard}>
              <View style={styles.taskTopRow}>
                <View style={[styles.taskIconBox, { backgroundColor: task.iconBg }]}>
                  <Ionicons name={task.icon} size={20} color={task.iconColor} />
                </View>

                <View style={styles.taskInfoCol}>
                  <Text style={styles.taskTitle}>{task.title}</Text>
                  <Text style={styles.taskDesc}>{task.description}</Text>

                  <View style={styles.dueBadgeRow}>
                    <Ionicons
                      name={isOverdue ? 'alert-circle' : isSoon ? 'time-outline' : 'calendar-outline'}
                      size={13}
                      color={
                        isOverdue
                          ? COLORS.danger
                          : isSoon
                          ? '#D97706'
                          : COLORS.textMuted
                      }
                    />
                    <Text
                      style={[
                        styles.dueText,
                        isOverdue
                          ? styles.dueTextOverdue
                          : isSoon
                          ? styles.dueTextSoon
                          : styles.dueTextNormal,
                      ]}
                    >
                      {task.dueText}
                    </Text>
                  </View>
                </View>

                <View style={styles.taskChevronBox}>
                  <Ionicons name="chevron-forward" size={18} color={COLORS.border} />
                </View>
              </View>

              {/* Action Button: 1-Tap Complete */}
              <TouchableOpacity
                id={`btn-complete-${task.id}`}
                style={styles.completeBtn}
                onPress={() => handleOpenCompleteModal(task)}
                activeOpacity={0.7}
              >
                <Ionicons name="checkmark" size={16} color={COLORS.text} />
                <Text style={styles.completeBtnText}>Mark as completed</Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </View>

      {/* ── Recently Completed (Collapsible History) ── */}
      <View style={styles.recentSection}>
        <TouchableOpacity
          id="btn-toggle-recent-history"
          style={[styles.recentCard, isHistoryExpanded && styles.recentCardExpanded]}
          onPress={() => setIsHistoryExpanded(!isHistoryExpanded)}
          activeOpacity={0.7}
        >
          <View style={styles.recentIconBox}>
            <Ionicons name="time-outline" size={20} color={COLORS.textSub} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.recentTitle}>Recently completed</Text>
            <Text style={styles.recentSub}>
              {mostRecentEvent
                ? `${mostRecentEvent.provider || 'Panel cleaning'} · ${formatFriendlyDate(mostRecentEvent.date)}`
                : 'No completed tasks recorded yet'}
            </Text>
          </View>
          <Ionicons
            name={isHistoryExpanded ? 'chevron-up' : 'chevron-forward'}
            size={18}
            color={COLORS.textMuted}
          />
        </TouchableOpacity>

        {/* Expanded History List */}
        {isHistoryExpanded && (
          <View style={styles.historyDropdown}>
            {cleaningEvents.length === 0 ? (
              <Text style={styles.emptyHistoryText}>No maintenance logs found.</Text>
            ) : (
              cleaningEvents.map((evt) => (
                <View key={evt.id} style={styles.historyRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.historyProvider}>
                      {evt.provider || 'Panel Wash'}
                    </Text>
                    <Text style={styles.historyDate}>
                      {evt.date} {evt.notes ? `· ${evt.notes}` : ''}
                    </Text>
                  </View>

                  {onDeleteClean && (
                    <TouchableOpacity
                      onPress={() => confirmDelete(evt)}
                      style={styles.deleteHistoryBtn}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Ionicons name="trash-outline" size={15} color={COLORS.danger} />
                    </TouchableOpacity>
                  )}
                </View>
              ))
            )}
          </View>
        )}
      </View>

      {/* ── Quick Wash Details Option ── */}
      <TouchableOpacity
        id="btn-open-detailed-clean"
        style={styles.secondaryWashLink}
        onPress={onLogClean}
        activeOpacity={0.7}
      >
        <Ionicons name="add-circle-outline" size={16} color={COLORS.gold} />
        <Text style={styles.secondaryWashLinkText}>
          Add wash with cost / service provider details
        </Text>
      </TouchableOpacity>

      {/* ── Quick Completion Bottom Sheet Modal ── */}
      <Modal
        visible={!!completingTask}
        animationType="slide"
        transparent
        onRequestClose={() => setCompletingTask(null)}
      >
        <KeyboardAvoidingView style={styles.modalOverlay}>
          <View
            style={[
              styles.modalSheet,
              { paddingBottom: Math.max(insets.bottom, 16) + 12 },
            ]}
          >
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Mark Completed</Text>
                <Text style={styles.modalSub}>{completingTask?.title}</Text>
              </View>
              <TouchableOpacity
                onPress={() => setCompletingTask(null)}
                style={styles.modalCloseBtn}
              >
                <Ionicons name="close" size={22} color={COLORS.textSub} />
              </TouchableOpacity>
            </View>

            {/* Quick 1-tap today button */}
            <TouchableOpacity
              style={[
                styles.todayQuickBtn,
                completionDate === todayYMD && styles.todayQuickBtnActive,
              ]}
              onPress={() => setCompletionDate(todayYMD)}
            >
              <Ionicons
                name={completionDate === todayYMD ? 'checkmark-circle' : 'ellipse-outline'}
                size={18}
                color={completionDate === todayYMD ? COLORS.success : COLORS.textMuted}
              />
              <Text style={styles.todayQuickText}>Completed Today ({formatFriendlyDate(todayYMD)})</Text>
            </TouchableOpacity>

            {/* Or custom date */}
            <View style={{ marginTop: SPACING.sm }}>
              <DateField
                label="Or choose actual completion date"
                value={completionDate}
                onChange={setCompletionDate}
                placeholder={todayYMD}
              />
            </View>

            {/* Optional note */}
            <View style={styles.noteFieldGroup}>
              <Text style={styles.noteLabel}>Optional note</Text>
              <TextInput
                style={styles.noteInput}
                value={completionNotes}
                onChangeText={setCompletionNotes}
                placeholder="e.g. Cleaned with hose / Checked inverter lights"
                placeholderTextColor={COLORS.textMuted}
              />
            </View>

            {/* Action Buttons */}
            <View style={styles.modalFooterBtns}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setCompletingTask(null)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalSaveBtn, isSubmitting && { opacity: 0.65 }]}
                onPress={handleConfirmCompletion}
                disabled={isSubmitting}
              >
                <Ionicons name="checkmark-done" size={16} color={COLORS.textInverse} />
                <Text style={styles.modalSaveText}>
                  {isSubmitting ? 'Saving…' : 'Save & Reschedule'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xxl + 32,
  },

  // Solar Care Hero Card
  heroCard: {
    marginBottom: SPACING.lg,
  },
  bellBtn: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
  },
  bellBtnActive: {
    borderColor: `${COLORS.gold}55`,
    backgroundColor: COLORS.glowGold,
  },

  // Status Hero Callout (Inside Card)
  statusHero: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md - 2,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    gap: 12,
  },
  statusHeroCaughtUp: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  statusHeroSoon: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  statusHeroOverdue: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  statusHeroIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusHeroTextCol: {
    flex: 1,
  },
  statusHeroTitle: {
    fontSize: 15,
    fontWeight: FONT.bold,
    color: COLORS.text,
    lineHeight: 20,
  },
  statusHeroSub: {
    fontSize: 12.5,
    color: COLORS.textSub,
    marginTop: 2,
    lineHeight: 17,
  },

  // Generation Alert
  generationAlert: {
    backgroundColor: '#FFF1F2',
    borderWidth: 1,
    borderColor: '#FECDD3',
    borderRadius: RADIUS.md,
    padding: SPACING.md - 2,
    marginTop: SPACING.sm,
  },
  generationAlertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  generationAlertTitle: {
    fontSize: 13,
    fontWeight: FONT.bold,
    color: COLORS.danger,
  },
  generationAlertText: {
    fontSize: 12,
    color: COLORS.textSub,
    lineHeight: 17,
  },

  // Section Header
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm + 4,
    paddingHorizontal: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: FONT.heavy,
    color: COLORS.text,
    letterSpacing: -0.2,
  },
  sectionBadge: {
    fontSize: 12,
    fontWeight: FONT.semi,
    color: COLORS.textMuted,
  },

  // Task Cards
  taskList: {
    gap: 14,
    marginBottom: SPACING.lg,
  },
  taskCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOW.card,
  },
  taskTopRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  taskIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  taskInfoCol: {
    flex: 1,
  },
  taskTitle: {
    fontSize: 15,
    fontWeight: FONT.bold,
    color: COLORS.text,
    lineHeight: 20,
    letterSpacing: -0.2,
  },
  taskDesc: {
    fontSize: 12.5,
    color: COLORS.textSub,
    marginTop: 2,
    lineHeight: 17,
  },
  dueBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 6,
  },
  dueText: {
    fontSize: 12,
    fontWeight: FONT.semi,
    lineHeight: 16,
  },
  dueTextOverdue: {
    color: COLORS.danger,
  },
  dueTextSoon: {
    color: '#D97706',
  },
  dueTextNormal: {
    color: COLORS.textMuted,
  },
  taskChevronBox: {
    paddingTop: 2,
    paddingLeft: 4,
  },

  // Complete Button
  completeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#F8FAFC',
    paddingVertical: 11,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  completeBtnText: {
    fontSize: 13,
    fontWeight: FONT.bold,
    color: COLORS.text,
  },

  // Recently Completed Section
  recentSection: {
    marginBottom: SPACING.md,
  },
  recentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOW.card,
  },
  recentCardExpanded: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomColor: COLORS.borderSubtle,
  },
  recentIconBox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  recentTitle: {
    fontSize: 14,
    fontWeight: FONT.bold,
    color: COLORS.text,
  },
  recentSub: {
    fontSize: 12,
    color: COLORS.textSub,
    marginTop: 2,
  },

  // Expanded History Dropdown
  historyDropdown: {
    backgroundColor: COLORS.surface,
    borderBottomLeftRadius: RADIUS.lg,
    borderBottomRightRadius: RADIUS.lg,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    gap: 0,
  },
  emptyHistoryText: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'center',
    paddingVertical: 12,
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderSubtle,
  },
  historyProvider: {
    fontSize: 13,
    fontWeight: FONT.semi,
    color: COLORS.text,
  },
  historyDate: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  deleteHistoryBtn: {
    padding: 6,
  },

  // Secondary detailed wash link
  secondaryWashLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
  },
  secondaryWashLinkText: {
    fontSize: 12.5,
    fontWeight: FONT.semi,
    color: COLORS.gold,
  },

  // Completion Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md + 2,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: FONT.heavy,
    color: COLORS.text,
  },
  modalSub: {
    fontSize: 13,
    color: COLORS.gold,
    fontWeight: FONT.semi,
    marginTop: 2,
  },
  modalCloseBtn: {
    padding: 4,
  },

  todayQuickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F8FAFC',
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  todayQuickBtnActive: {
    borderColor: COLORS.success,
    backgroundColor: '#ECFDF5',
  },
  todayQuickText: {
    fontSize: 13,
    fontWeight: FONT.bold,
    color: COLORS.text,
  },

  noteFieldGroup: {
    marginTop: SPACING.sm + 4,
    marginBottom: SPACING.md,
  },
  noteLabel: {
    fontSize: 11.5,
    fontWeight: FONT.semi,
    color: COLORS.textSub,
    marginBottom: 6,
  },
  noteInput: {
    backgroundColor: COLORS.surfaceRaised,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    fontSize: 13,
    color: COLORS.text,
  },

  modalFooterBtns: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.sm + 2,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 13,
    alignItems: 'center',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalCancelText: {
    fontSize: 14,
    fontWeight: FONT.semi,
    color: COLORS.textSub,
  },
  modalSaveBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.gold,
    paddingVertical: 13,
    borderRadius: RADIUS.md,
  },
  modalSaveText: {
    fontSize: 14,
    fontWeight: FONT.bold,
    color: COLORS.textInverse,
  },
});
