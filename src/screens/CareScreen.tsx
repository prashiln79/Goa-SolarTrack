// ============================================================
// Solar Care Screen — Human-Centric Maintenance Checklist
// Matches exact UI/UX design:
// - Two-column Hero Card (System Status + Next Task)
// - Upcoming Maintenance Checklist with urgency highlights & "Mark done"
// - Collapsible "View maintenance history"
// - Real Android local notifications via expo-notifications
// ============================================================

import React, { useState, useMemo, useEffect } from 'react';
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
import { DateField } from '../components/ui/DatePickerModal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACING, RADIUS, FONT, SHADOW } from '../constants/theme';
import {
  getRemindersEnabledAsync,
  cancelAllCareNotificationsAsync,
  syncCareNotificationsAsync,
  setupNotificationChannelAsync,
  ScheduleTaskInput,
} from '../services/notificationService';
import { deduplicateCleaningEvents } from '../services/solarStorage';

interface CareScreenProps {
  careAssessment: CareAssessment;
  cleaningEvents: CleaningEvent[];
  profile: SystemProfile;
  onLogClean: () => void;
  onSaveClean?: (event: CleaningEvent) => Promise<void> | void;
  onDeleteClean?: (eventId: string) => Promise<void> | void;
  onNavigateSettings?: () => void;
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
    id: 'task-inverter',
    title: 'Check inverter',
    description: 'Check for warning lights on inverter',
    frequencyDays: 60,
    icon: 'flash',
    iconBg: '#FEF3C7',
    iconColor: '#F59E0B',
    providerTag: 'Inverter check',
  },
  {
  id: 'task-clean',
  title: 'Clean solar panels',
  description: 'Remove dust and bird droppings',
  frequencyDays: 30,
  icon: 'water',
  iconBg: '#DBEAFE',
  iconColor: '#46befaff',
  providerTag: 'Panel wash',
  },
  {
    id: 'task-roof',
    title: 'Visual roof inspection',
    description: 'Check panel mounting brackets, rust and loose wires from a safe location',
    frequencyDays: 180,
    icon: 'shield-checkmark',
    iconBg: '#DCFCE7',
    iconColor: '#16A34A',
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

function formatDueSummary(diffDays: number, dateStr: string): string {
  if (!dateStr) return 'Not scheduled';
  try {
    const d = parseDate(dateStr);
    const nowYear = new Date().getFullYear();
    const dateYear = d.getFullYear();
    const showYear = dateYear !== nowYear;
    const dayMonth = d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: showYear ? 'numeric' : undefined,
    });

    if (diffDays < 0) {
      const daysPast = Math.abs(diffDays);
      return `Overdue by ${daysPast} day${daysPast === 1 ? '' : 's'} (${dayMonth})`;
    }
    if (diffDays === 0) {
      return `Due today (${dayMonth})`;
    }
    if (diffDays === 1) {
      return `Due tomorrow (${dayMonth})`;
    }
    if (diffDays < 30) {
      return `Due in ${diffDays} days (${dayMonth})`;
    }
    const months = Math.max(1, Math.round(diffDays / 30.5));
    return `Due in ${months} month${months === 1 ? '' : 's'} (${dayMonth})`;
  } catch {
    return `Due in ${diffDays} days`;
  }
}

export const CareScreen: React.FC<CareScreenProps> = ({
  careAssessment,
  cleaningEvents,
  profile,
  onLogClean,
  onSaveClean,
  onDeleteClean,
  onNavigateSettings,
}) => {
  const insets = useSafeAreaInsets();
  const todayYMD = useMemo(() => formatDateYMD(new Date()), []);

  // Notifications enabled state (loaded from AsyncStorage)
  const [remindersEnabled, setRemindersEnabled] = useState(true);

  // History expansion state
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false);

  // Completion modal state
  const [completingTask, setCompletingTask] = useState<MaintenanceTask | null>(null);
  const [completionDate, setCompletionDate] = useState(todayYMD);
  const [completionNotes, setCompletionNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load saved reminder preference and setup notification channel on mount
  useEffect(() => {
    let isMounted = true;
    (async () => {
      await setupNotificationChannelAsync();
      const enabled = await getRemindersEnabledAsync();
      if (isMounted) {
        setRemindersEnabled(enabled);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  // Deduplicate cleaning events so multiple logs for the same day/provider are unified
  const cleanEvents = useMemo(() => deduplicateCleaningEvents(cleaningEvents), [cleaningEvents]);

  // ── Calculate due status for each task (Sorted by urgency) ──
  const tasksWithSchedule = useMemo(() => {
    const list = DEFAULT_TASKS.map((task) => {
      // Find latest completed event matching this task
      let lastCompletedDate: string | null = null;

      if (task.id === 'task-clean') {
        const cleanEvt = cleanEvents.find(
          (e) => !e.skipped && e.provider !== 'Inverter check' && e.provider !== 'Roof inspection'
        );
        lastCompletedDate = cleanEvt?.date || profile.lastCleanedDate || null;
      } else {
        const matchEvt = cleanEvents.find((e) => e.provider === task.providerTag);
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
        nextDueDate = new Date(
          now.getTime() +
            (task.id === 'task-clean' ? 24 : task.id === 'task-inverter' ? 14 : 60) * 86400000
        );
      }

      const nextDueDateStr = formatDateYMD(nextDueDate);
      const diffMs = nextDueDate.getTime() - new Date().setHours(0, 0, 0, 0);
      const diffDays = Math.round(diffMs / 86400000);

      const dueText = formatDueSummary(diffDays, nextDueDateStr);
      let dueSeverity: 'normal' | 'soon' | 'overdue' = 'normal';

      if (diffDays < 0) {
        dueSeverity = 'overdue';
      } else if (diffDays <= 14) {
        dueSeverity = 'soon';
      }

      return {
        ...task,
        lastCompletedDate,
        nextDueDate,
        nextDueDateStr,
        diffDays,
        dueText,
        dueSeverity,
      };
    });

    // Sort ascending by diffDays so nearest task appears first
    return list.sort((a, b) => a.diffDays - b.diffDays);
  }, [cleanEvents, profile.lastCleanedDate]);

  // Overall system summary status
  const overdueTasks = tasksWithSchedule.filter((t) => t.dueSeverity === 'overdue');
  const nextTask = tasksWithSchedule[0] || null;

  // ── Sync Android OS System Notifications ─────────────────────
  useEffect(() => {
    if (remindersEnabled) {
      const inputs: ScheduleTaskInput[] = tasksWithSchedule.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        dueDate: t.nextDueDate,
      }));
      syncCareNotificationsAsync(inputs).catch((err) => {
        console.warn('Failed to sync care notifications:', err);
      });
    } else {
      cancelAllCareNotificationsAsync().catch(() => {});
    }
  }, [remindersEnabled, tasksWithSchedule]);

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

      const nextDate = new Date(
        parseDate(newEvent.date).getTime() + completingTask.frequencyDays * 86400000
      );
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

  const isOverdue = overdueTasks.length > 0;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Solar Care Status Hero Card (2-Column Split) ── */}
      <View style={styles.heroCard}>
        <View style={styles.heroTopRow}>
          <View style={styles.heroTitleCol}>
            <Text style={styles.heroTitle}>Solar Care</Text>
            <Text style={styles.heroSub}>Keep your solar system in good shape</Text>
          </View>

          <TouchableOpacity
            id="btn-care-settings"
            style={styles.gearBtn}
            onPress={onNavigateSettings || (() => {})}
            activeOpacity={0.7}
          >
            <Ionicons
              name="settings-outline"
              size={18}
              color="#64748B"
            />
          </TouchableOpacity>
        </View>

        {/* 2-column split status banner */}
        <View style={styles.heroSplitBox}>
          {/* Left Column: System Status */}
          <View style={styles.heroStatusLeft}>
            <Ionicons
              name={isOverdue ? 'alert-circle' : 'checkmark-circle'}
              size={34}
              color={isOverdue ? '#EF4444' : '#13A956'}
            />

            <View style={styles.systemStatusTextCol}>
              <Text
                style={[
                  styles.systemStatusTitle,
                  isOverdue ? styles.statusTitleDanger : styles.statusTitleSuccess,
                ]}
              >
                {isOverdue ? 'Attention needed' : 'System looks good'}
              </Text>
              <Text style={styles.systemStatusSub}>
                {isOverdue
                  ? `${overdueTasks.length} task overdue.`
                  : 'No tasks due today.'}
              </Text>
            </View>
          </View>

          {/* Right Column: Next Task */}
          <View style={styles.heroStatusRight}>
            {/* <Ionicons name="calendar-outline" size={24} color="#64748B" /> */}
            <View style={styles.nextTaskTextCol}>
              <Text style={styles.nextTaskLabel}>Next task</Text>
              <Text style={styles.nextTaskTitle} numberOfLines={1}>
                {nextTask ? nextTask.title : 'All caught up'}
              </Text>
              <Text style={styles.nextTaskDue} numberOfLines={1}>
                {nextTask ? nextTask.dueText : 'No tasks scheduled'}
              </Text>
            </View>
          </View>
        </View>

        {/* Optional Generation Dip Alert if needed */}
        {careAssessment.state.includes('recommended') && !careAssessment.weatherExplained && (
          <View style={styles.generationAlert}>
            <View style={styles.generationAlertHeader}>
              <Ionicons name="flash-outline" size={14} color={COLORS.danger} />
              <Text style={styles.generationAlertTitle}>Generation Dip Detected</Text>
            </View>
            <Text style={styles.generationAlertText}>
              Daily solar output dropped below seasonal expected averages in Goa. A panel wash or inverter check will help recover full generation.
            </Text>
          </View>
        )}
      </View>

      {/* ── Section Title: Upcoming maintenance ── */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Upcoming maintenance</Text>
        <Text style={styles.sectionBadge}>
          {`${tasksWithSchedule.length} tasks`}
        </Text>
      </View>

      {/* ── Task Cards List ── */}
      <View style={styles.taskList}>
        {tasksWithSchedule.map((task, index) => {
          const isFirstOrUrgent =
            index === 0 || task.dueSeverity === 'overdue' || task.dueSeverity === 'soon';

          return (
            <View
              key={task.id}
              style={[
                styles.taskCard,
                isFirstOrUrgent ? styles.taskCardHighlighted : styles.taskCardNormal,
              ]}
            >
              <View style={styles.taskTopRow}>
                <View style={[styles.taskIconBox, { backgroundColor: task.iconBg }]}>
                  <Ionicons name={task.icon} size={22} color={task.iconColor} />
                </View>

                <View style={styles.taskInfoCol}>
                  <Text style={styles.taskTitle}>{task.title}</Text>
                  <Text style={styles.taskDesc}>{task.description}</Text>

                  <View style={styles.dueBadgeRow}>
                    <Ionicons
                      name="calendar-outline"
                      size={14}
                      color={isFirstOrUrgent ? '#F59E0B' : '#94A3B8'}
                    />
                    <Text
                      style={[
                        styles.dueText,
                        isFirstOrUrgent ? styles.dueTextUrgent : styles.dueTextMuted,
                      ]}
                    >
                      {task.dueText}
                    </Text>
                  </View>
                </View>

                <View style={styles.taskChevronBox}>
                  <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
                </View>
              </View>

              {/* Action Button: Mark done */}
              <TouchableOpacity
                id={`btn-complete-${task.id}`}
                style={[
                  styles.markDoneBtn,
                  isFirstOrUrgent ? styles.markDoneBtnUrgent : styles.markDoneBtnNormal,
                ]}
                onPress={() => handleOpenCompleteModal(task)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="checkmark"
                  size={16}
                  color={isFirstOrUrgent ? '#EA580C' : '#0F172A'}
                />
                <Text
                  style={[
                    styles.markDoneBtnText,
                    isFirstOrUrgent ? styles.markDoneBtnTextUrgent : styles.markDoneBtnTextNormal,
                  ]}
                >
                  Mark done
                </Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </View>

      {/* ── View Maintenance History (Collapsible) ── */}
      <View style={styles.recentSection}>
        <TouchableOpacity
          id="btn-toggle-recent-history"
          style={[styles.historyCard, isHistoryExpanded && styles.historyCardExpanded]}
          onPress={() => setIsHistoryExpanded(!isHistoryExpanded)}
          activeOpacity={0.7}
        >
          <Ionicons name="time-outline" size={20} color="#475569" />
          <Text style={styles.historyCardTitle}>View maintenance history</Text>
          <Ionicons
            name={isHistoryExpanded ? 'chevron-up' : 'chevron-forward'}
            size={18}
            color="#94A3B8"
          />
        </TouchableOpacity>

        {/* Expanded History List */}
        {isHistoryExpanded && (
          <View style={styles.historyDropdown}>
            {cleanEvents.length === 0 ? (
              <Text style={styles.emptyHistoryText}>No maintenance logs found.</Text>
            ) : (
              cleanEvents.map((evt) => (
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

      {/* ── Secondary Wash Link ── */}
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
        <KeyboardAvoidingView behavior="height" style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
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

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 16 }}
            >
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
                <Text style={styles.todayQuickText}>
                  Completed Today ({formatFriendlyDate(todayYMD)})
                </Text>
              </TouchableOpacity>

              {/* Custom date field */}
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
                  placeholder="e.g. Cleaned with hose / Inverter lights verified normal"
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
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: SPACING.xxl + 32,
  },

  // ── Hero Card (Green Tinted Split Box) ──
  heroCard: {
    backgroundColor: '#F4FEF8',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2F7EB',
    padding: 16,
    marginBottom: 20,
    ...SHADOW.card,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  heroTitleCol: {
    flex: 1,
  },
  heroTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  heroSub: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  gearBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },

  // Split Status Box inside Hero Card (Rounded green capsule)
  heroSplitBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8FDF0',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  heroStatusLeft: {
    flex: 0.6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  systemStatusTextCol: {
    flex: 1,
  },
  systemStatusTitle: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  statusTitleSuccess: {
    color: '#0E9E4E',
  },
  statusTitleWarning: {
    color: '#D97706',
  },
  statusTitleDanger: {
    color: '#DC2626',
  },
  systemStatusSub: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
  },
  heroSplitDivider: {
    width: 1,
    height: 38,
    backgroundColor: '#D1FAE5',
    marginHorizontal: 10,
  },
  heroStatusRight: {
    flex: 0.4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  nextTaskTextCol: {
    alignItems: 'flex-end',
  },
  nextTaskLabel: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
    textAlign: 'right',
  },
  nextTaskTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 1,
    textAlign: 'right',
  },
  nextTaskDue: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 1,
    textAlign: 'right',
  },

  // Generation Dip Alert
  generationAlert: {
    backgroundColor: '#FFF1F2',
    borderWidth: 1,
    borderColor: '#FECDD3',
    borderRadius: RADIUS.md,
    padding: 12,
    marginTop: 14,
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

  // ── Section Header ──
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 8,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  sectionBadge: {
    fontSize: 13,
    color: '#94A3B8',
    fontWeight: '500',
  },

  // ── Task Cards (Child width under Solar Care) ──
  taskList: {
    gap: 12,
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  taskCard: {
    borderRadius: 14,
    padding: 14,
    ...SHADOW.card,
  },
  taskCardHighlighted: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#FED7AA',
  },
  taskCardNormal: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  taskTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
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
    marginLeft: 12,
  },
  taskTitle: {
    fontSize: 15.5,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  taskDesc: {
    fontSize: 12.5,
    color: '#64748B',
    marginTop: 3,
    lineHeight: 17,
  },
  dueBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 7,
  },
  dueText: {
    fontSize: 12,
    fontWeight: '600',
  },
  dueTextUrgent: {
    color: '#F59E0B',
  },
  dueTextMuted: {
    color: '#64748B',
  },
  taskChevronBox: {
    paddingTop: 2,
    paddingLeft: 4,
  },

  // Mark done button
  markDoneBtn: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  markDoneBtnUrgent: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FDBA74',
  },
  markDoneBtnNormal: {
    backgroundColor: '#FFFFFF',
    borderColor: '#CBD5E1',
  },
  markDoneBtnText: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  markDoneBtnTextUrgent: {
    color: '#EA580C',
  },
  markDoneBtnTextNormal: {
    color: '#0F172A',
  },

  // ── History Section ──
  recentSection: {
    marginBottom: 8,
    paddingHorizontal: 8,
  },
  historyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...SHADOW.card,
  },
  historyCardExpanded: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomColor: '#F1F5F9',
  },
  historyCardTitle: {
    flex: 1,
    marginLeft: 12,
    fontSize: 14.5,
    fontWeight: '700',
    color: '#0F172A',
  },

  // Expanded History Dropdown
  historyDropdown: {
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingVertical: 6,
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
    borderBottomColor: '#F1F5F9',
  },
  historyProvider: {
    fontSize: 13,
    fontWeight: FONT.semi,
    color: '#0F172A',
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
    maxHeight: '90%',
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
