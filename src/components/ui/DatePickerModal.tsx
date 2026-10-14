import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, FONT } from '../../constants/theme';

interface DatePickerModalProps {
  visible: boolean;
  value?: string; // YYYY-MM-DD
  onSelect: (date: string) => void;
  onClose: () => void;
  title?: string;
  minDate?: string;
  maxDate?: string;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function parseYMD(dateStr?: string): { year: number; month: number; day: number } {
  if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split('-').map(Number);
    if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
      return { year: y, month: m - 1, day: d };
    }
  }
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth(), day: now.getDate() };
}

function formatYMD(year: number, month: number, day: number): string {
  const mm = String(month + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

export const DatePickerModal: React.FC<DatePickerModalProps> = ({
  visible,
  value,
  onSelect,
  onClose,
  title = 'Select Date',
}) => {
  const parsed = useMemo(() => parseYMD(value), [value]);

  const [currentYear, setCurrentYear] = useState(parsed.year);
  const [currentMonth, setCurrentMonth] = useState(parsed.month);
  const [selectedYMD, setSelectedYMD] = useState(
    value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : formatYMD(parsed.year, parsed.month, parsed.day)
  );

  useEffect(() => {
    if (visible) {
      const p = parseYMD(value);
      setCurrentYear(p.year);
      setCurrentMonth(p.month);
      setSelectedYMD(
        value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : formatYMD(p.year, p.month, p.day)
      );
    }
  }, [visible, value]);

  const todayYMD = useMemo(() => {
    const now = new Date();
    return formatYMD(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);

  const calendarDays = useMemo(() => {
    const firstDayOfWeek = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

    const days: ({ day: number; ymd: string } | null)[] = [];
    for (let i = 0; i < firstDayOfWeek; i++) {
      days.push(null);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      days.push({ day: d, ymd: formatYMD(currentYear, currentMonth, d) });
    }
    return days;
  }, [currentYear, currentMonth]);

  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  const handlePrevYear = () => {
    setCurrentYear((y) => y - 1);
  };

  const handleNextYear = () => {
    setCurrentYear((y) => y + 1);
  };

  const handleSelectDay = (ymd: string) => {
    setSelectedYMD(ymd);
  };

  const handleConfirm = () => {
    onSelect(selectedYMD);
    onClose();
  };

  const handleJumpToToday = () => {
    const now = new Date();
    setCurrentYear(now.getFullYear());
    setCurrentMonth(now.getMonth());
    setSelectedYMD(todayYMD);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.dialog} onPress={(e) => e.stopPropagation()}>
          {/* Header */}
          <View style={styles.dialogHeader}>
            <View>
              <Text style={styles.dialogTitle}>{title}</Text>
              <Text style={styles.dialogSubtitle}>
                {selectedYMD ? selectedYMD : 'No date chosen'}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={20} color={COLORS.textSub} />
            </TouchableOpacity>
          </View>

          {/* Month / Year Navigator */}
          <View style={styles.navRow}>
            <View style={styles.navGroup}>
              <TouchableOpacity onPress={handlePrevYear} style={styles.navIconBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="play-back" size={14} color={COLORS.gold} />
              </TouchableOpacity>
              <TouchableOpacity onPress={handlePrevMonth} style={styles.navIconBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="chevron-back" size={18} color={COLORS.gold} />
              </TouchableOpacity>
            </View>

            <View style={styles.monthYearBox}>
              <Text style={styles.monthYearText}>
                {MONTH_NAMES[currentMonth]} {currentYear}
              </Text>
            </View>

            <View style={styles.navGroup}>
              <TouchableOpacity onPress={handleNextMonth} style={styles.navIconBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="chevron-forward" size={18} color={COLORS.gold} />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleNextYear} style={styles.navIconBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="play-forward" size={14} color={COLORS.gold} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Day of Week Labels */}
          <View style={styles.daysHeaderRow}>
            {DAY_LABELS.map((label, idx) => (
              <Text
                key={label}
                style={[
                  styles.dayLabel,
                  (idx === 0 || idx === 6) && { color: COLORS.textMuted },
                ]}
              >
                {label}
              </Text>
            ))}
          </View>

          {/* Calendar Grid */}
          <View style={styles.grid}>
            {calendarDays.map((item, idx) => {
              if (!item) {
                return <View key={`blank-${idx}`} style={styles.dayCell} />;
              }

              const isSelected = item.ymd === selectedYMD;
              const isToday = item.ymd === todayYMD;

              return (
                <TouchableOpacity
                  key={item.ymd}
                  style={[
                    styles.dayCell,
                    isSelected && styles.dayCellSelected,
                    !isSelected && isToday && styles.dayCellToday,
                  ]}
                  onPress={() => handleSelectDay(item.ymd)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.dayText,
                      isSelected && styles.dayTextSelected,
                      !isSelected && isToday && styles.dayTextToday,
                    ]}
                  >
                    {item.day}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Quick Actions & Confirm */}
          <View style={styles.footer}>
            <TouchableOpacity onPress={handleJumpToToday} style={styles.todayBtn}>
              <Ionicons name="today-outline" size={14} color={COLORS.gold} />
              <Text style={styles.todayBtnText}>Today</Text>
            </TouchableOpacity>

            <View style={styles.actionGroup}>
              <TouchableOpacity onPress={onClose} style={styles.cancelBtn}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleConfirm} style={styles.confirmBtn}>
                <Ionicons name="checkmark" size={16} color={COLORS.textInverse} />
                <Text style={styles.confirmBtnText}>Set Date</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

// ── Drop-in DateField Component ─────────────────────────────
interface DateFieldProps {
  label: string;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  style?: any;
  required?: boolean;
}

export const DateField: React.FC<DateFieldProps> = ({
  label,
  value,
  onChange,
  placeholder = 'YYYY-MM-DD',
  style,
  required = false,
}) => {
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <View style={[styles.fieldContainer, style]}>
      <Text style={styles.fieldLabel}>
        {label} {required && <Text style={{ color: COLORS.danger }}>*</Text>}
      </Text>
      <TouchableOpacity
        style={styles.fieldInputBox}
        onPress={() => setPickerOpen(true)}
        activeOpacity={0.75}
      >
        <Ionicons name="calendar-outline" size={17} color={COLORS.gold} style={{ marginRight: 8 }} />
        <Text style={[styles.fieldValueText, !value && { color: COLORS.textMuted }]}>
          {value || placeholder}
        </Text>
      </TouchableOpacity>

      <DatePickerModal
        visible={pickerOpen}
        value={value}
        title={label}
        onSelect={onChange}
        onClose={() => setPickerOpen(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.md,
  },
  dialog: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    overflow: 'hidden',
  },
  dialogHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.md,
    paddingBottom: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderSubtle,
  },
  dialogTitle: {
    fontSize: 16,
    fontWeight: FONT.bold,
    color: COLORS.text,
  },
  dialogSubtitle: {
    fontSize: 12,
    color: COLORS.gold,
    fontWeight: FONT.semi,
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  navGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  navIconBtn: {
    padding: 6,
    backgroundColor: `${COLORS.gold}15`,
    borderRadius: RADIUS.sm,
  },
  monthYearBox: {
    alignItems: 'center',
  },
  monthYearText: {
    fontSize: 15,
    fontWeight: FONT.bold,
    color: COLORS.text,
  },
  daysHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
    paddingHorizontal: 2,
  },
  dayLabel: {
    width: 38,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: FONT.semi,
    color: COLORS.textSub,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  dayCell: {
    width: 38,
    height: 38,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: RADIUS.full,
    marginVertical: 2,
  },
  dayCellSelected: {
    backgroundColor: COLORS.gold,
  },
  dayCellToday: {
    borderWidth: 1,
    borderColor: COLORS.gold,
  },
  dayText: {
    fontSize: 13,
    color: COLORS.text,
    fontWeight: FONT.medium,
  },
  dayTextSelected: {
    color: COLORS.textInverse,
    fontWeight: FONT.bold,
  },
  dayTextToday: {
    color: COLORS.gold,
    fontWeight: FONT.bold,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderSubtle,
  },
  todayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  todayBtnText: {
    fontSize: 12,
    fontWeight: FONT.semi,
    color: COLORS.gold,
  },
  actionGroup: {
    flexDirection: 'row',
    gap: SPACING.xs,
  },
  cancelBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: RADIUS.sm,
  },
  cancelBtnText: {
    fontSize: 13,
    color: COLORS.textSub,
    fontWeight: FONT.medium,
  },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.gold,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: RADIUS.sm,
  },
  confirmBtnText: {
    fontSize: 13,
    fontWeight: FONT.bold,
    color: COLORS.textInverse,
  },

  // DateField Styles
  fieldContainer: {
    marginBottom: SPACING.md,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: FONT.semi,
    color: COLORS.textSub,
    marginBottom: 6,
  },
  fieldInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceRaised,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    height: 44,
  },
  fieldValueText: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: FONT.regular,
  },
});
