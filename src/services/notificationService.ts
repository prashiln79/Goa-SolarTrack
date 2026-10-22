// ============================================================
// Notification Service for Android
// Handles permissions, channels, preferences & scheduled local reminders
// ============================================================

import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const REMINDERS_PREF_KEY = '@solar_care_reminders_enabled';
const CHANNEL_ID = 'solar_care_channel';

// ── Set foreground presentation behavior ─────────────────────
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// ── Setup Android Notification Channel ───────────────────────
export async function setupNotificationChannelAsync(): Promise<void> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Solar Care Reminders',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#D97706',
      description: 'Reminders for solar panel cleaning, inverter checks, and roof inspections',
    });
  }
}

// ── Notification Permissions ─────────────────────────────────
export async function requestNotificationPermissionAsync(): Promise<boolean> {
  try {
    const settings = await Notifications.getPermissionsAsync();
    if (settings.granted) {
      return true;
    }
    const requested = await Notifications.requestPermissionsAsync();
    return requested.granted;
  } catch (err) {
    console.warn('Failed to request notification permission:', err);
    return false;
  }
}

export async function getNotificationPermissionStatusAsync(): Promise<boolean> {
  try {
    const settings = await Notifications.getPermissionsAsync();
    return settings.granted;
  } catch {
    return false;
  }
}

// ── Local Storage Preferences ────────────────────────────────
export async function getRemindersEnabledAsync(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(REMINDERS_PREF_KEY);
    return val === null ? true : val === 'true';
  } catch {
    return true;
  }
}

export async function setRemindersEnabledAsync(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(REMINDERS_PREF_KEY, enabled ? 'true' : 'false');
  } catch (e) {
    console.warn('Failed to save reminder preference:', e);
  }
}

// ── Cancellation ─────────────────────────────────────────────
export async function cancelAllCareNotificationsAsync(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch (e) {
    console.warn('Failed to cancel scheduled notifications:', e);
  }
}

// ── Instant Test / Confirmation Notification ──────────────────
export async function sendInstantTestNotificationAsync(): Promise<void> {
  try {
    await setupNotificationChannelAsync();
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Solar Reminders Active ☀️',
        body: 'You will receive gentle alerts before your panels or inverter require attention.',
      },
      trigger: {
        channelId: CHANNEL_ID,
      },
    });
  } catch (err) {
    console.warn('Failed to send test notification:', err);
  }
}

// ── Sync Scheduled Care Tasks ────────────────────────────────
export interface ScheduleTaskInput {
  id: string;
  title: string;
  description: string;
  dueDate: Date;
}

export async function syncCareNotificationsAsync(tasks: ScheduleTaskInput[]): Promise<void> {
  const isEnabled = await getRemindersEnabledAsync();
  if (!isEnabled) {
    await cancelAllCareNotificationsAsync();
    return;
  }

  const hasPerm = await getNotificationPermissionStatusAsync();
  if (!hasPerm) return;

  await setupNotificationChannelAsync();
  // Clear any existing reminders to avoid duplicates before rescheduling
  await cancelAllCareNotificationsAsync();

  const now = Date.now();

  for (const task of tasks) {
    // 1) 3 days before due at 9:00 AM
    const threeDaysBefore = new Date(task.dueDate.getTime() - 3 * 86400000);
    threeDaysBefore.setHours(9, 0, 0, 0);

    if (threeDaysBefore.getTime() > now) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Solar Care Reminder ☀️',
          body: `${task.title} is due in 3 days. Clean panels keep generation high!`,
          data: { taskId: task.id },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: threeDaysBefore,
          channelId: CHANNEL_ID,
        },
      });
    }

    // 2) On the due date at 9:00 AM
    const onDueDate = new Date(task.dueDate.getTime());
    onDueDate.setHours(9, 0, 0, 0);

    if (onDueDate.getTime() > now) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Solar Care Due Today ☀️',
          body: `${task.title} is scheduled for today. Tap to mark as completed.`,
          data: { taskId: task.id },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: onDueDate,
          channelId: CHANNEL_ID,
        },
      });
    }
  }
}
