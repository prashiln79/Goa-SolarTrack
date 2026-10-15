// ============================================================
// Care Screen — PRD §8 Panel Care & Cleaning Intelligence
// Clean, minimal, and spacious layout
// ============================================================
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CareAssessment, CleaningEvent, SystemProfile } from '../types/solar';
import { Card, InfoNote, ProgressBar } from '../components/ui/UIKit';
import { COLORS, SPACING, RADIUS, FONT } from '../constants/theme';

interface CareScreenProps {
  careAssessment: CareAssessment;
  cleaningEvents: CleaningEvent[];
  profile: SystemProfile;
  onLogClean: () => void;
}

export const CareScreen: React.FC<CareScreenProps> = ({
  careAssessment,
  cleaningEvents,
  profile,
  onLogClean,
}) => {
  const stateColor =
    careAssessment.state === 'Good'
      ? COLORS.success
      : careAssessment.state === 'Watch'
      ? COLORS.warning
      : COLORS.danger;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Top Bar ── */}
      <View style={styles.topBar}>
        <View>
          <Text style={styles.pageTitle}>Panel Care</Text>
          <Text style={styles.pageSub}>{profile.location} · Goa Climate-Aware</Text>
        </View>
        <TouchableOpacity
          id="btn-log-clean-care"
          style={styles.logBtn}
          onPress={onLogClean}
          activeOpacity={0.8}
        >
          <Ionicons name="water-outline" size={15} color={COLORS.textInverse} />
          <Text style={styles.logBtnText}>Log Wash</Text>
        </TouchableOpacity>
      </View>

      {/* ── 1. Status Hero Card ── */}
      <Card
        title="Soiling Assessment"
        subtitle={`Last cleaned: ${profile.lastCleanedDate ?? 'Not recorded'} · ${careAssessment.daysSinceLastClean} days ago`}
        style={styles.cardSpacing}
        badge={
          <View
            style={[
              styles.stateBadge,
              {
                backgroundColor: `${stateColor}15`,
                borderColor: `${stateColor}40`,
              },
            ]}
          >
            <Text style={[styles.stateBadgeText, { color: stateColor }]}>
              {careAssessment.state}
            </Text>
          </View>
        }
      >
        <View style={styles.heroRow}>
          <View
            style={[
              styles.statusIconBox,
              {
                backgroundColor: `${stateColor}15`,
                borderColor: `${stateColor}35`,
              },
            ]}
          >
            <Ionicons
              name={
                careAssessment.state === 'Good'
                  ? 'sparkles'
                  : careAssessment.state === 'Watch'
                  ? 'eye-outline'
                  : 'warning-outline'
              }
              size={24}
              color={stateColor}
            />
          </View>
          <View style={styles.heroTextCol}>
            <Text style={styles.rationaleText}>{careAssessment.rationale}</Text>
            {careAssessment.recommendation ? (
              <Text style={styles.recommendationText}>{careAssessment.recommendation}</Text>
            ) : null}
          </View>
        </View>

        {/* Health Index Progress */}
        <View style={styles.healthContainer}>
          <View style={styles.healthLabelRow}>
            <Text style={styles.healthLabel}>Panel Health Index</Text>
            <Text style={[styles.healthPct, { color: stateColor }]}>
              {100 - careAssessment.score}%
            </Text>
          </View>
          <ProgressBar value={100 - careAssessment.score} color={stateColor} height={7} />
          <View style={styles.progressLabels}>
            <Text style={styles.progressText}>Clean & Optimal</Text>
            <Text style={styles.progressText}>Needs Wash</Text>
          </View>
        </View>

        {careAssessment.weatherExplained && (
          <InfoNote
            text="☁️ Current cloud cover / monsoon weather explains part of the generation drop. Alert suppressed per PRD §8.3."
            color={COLORS.info}
            style={{ marginTop: SPACING.md }}
          />
        )}
      </Card>

      {/* ── 2. Diagnostic Signals ── */}
      <Card
        title="Scoring Signals"
        subtitle="Transparent heuristic model (PRD §8.3)"
        style={styles.cardSpacing}
      >
        <View style={styles.signalsContainer}>
          <SignalItem
            icon="calendar-outline"
            label="Recency Signal"
            weight="20%"
            value={careAssessment.signals.cleanlinessRecencySignal}
            detail={`${careAssessment.daysSinceLastClean} days since last confirmed wash`}
          />
          <SignalItem
            icon="rainy-outline"
            label="Natural Rain Washing"
            weight="25%"
            value={careAssessment.signals.rainFreeSignal}
            detail="Monsoon rains provide natural washing. Dry season accumulates dust."
          />
          <SignalItem
            icon="pulse-outline"
            label="Generation Deviation"
            weight="40%"
            value={careAssessment.signals.generationDeviationSignal}
            detail="Normalized kWh/kW/day vs expected seasonal benchmark."
          />
          <SignalItem
            icon="partly-sunny-outline"
            label="Weather Confidence"
            weight="15%"
            value={careAssessment.signals.weatherConfidenceSignal}
            detail="Sunshine hours and cloud cover data availability."
          />
        </View>
      </Card>

      {/* ── 3. Goa Climate & Coastal Advisory ── */}
      <Card title="Goa Climate Advisory" style={styles.cardSpacing}>
        <View style={styles.advisoryContainer}>
          <View style={styles.advisoryCard}>
            <View style={styles.advisoryHeader}>
              <View style={[styles.advisoryIconBox, { backgroundColor: '#E0F2FE' }]}>
                <Ionicons name="rainy" size={14} color="#0284C7" />
              </View>
              <Text style={styles.advisoryTitle}>Monsoon Season (June–Sept)</Text>
            </View>
            <Text style={styles.advisoryText}>
              Heavy Goa showers naturally rinse rooftop panels. Routine cleaning is typically not needed, and soiling alerts are automatically suppressed.
            </Text>
          </View>

          <View style={styles.advisoryCard}>
            <View style={styles.advisoryHeader}>
              <View style={[styles.advisoryIconBox, { backgroundColor: '#FEF3C7' }]}>
                <Ionicons name="sunny" size={14} color="#D97706" />
              </View>
              <Text style={styles.advisoryTitle}>Dry Coastal Season (Oct–May)</Text>
            </View>
            <Text style={styles.advisoryText}>
              Red laterite road dust and coastal salt film accumulate rapidly. Rinse panels every 20–30 days before 8 AM using soft water and a squeegee.
            </Text>
          </View>
        </View>
      </Card>

      {/* ── 4. Maintenance Log ── */}
      <Card
        title="Maintenance Log"
        subtitle={`${cleaningEvents.length} event${cleaningEvents.length === 1 ? '' : 's'} recorded`}
        style={styles.cardSpacing}
      >
        {cleaningEvents.length === 0 ? (
          <Text style={styles.emptyLog}>No cleaning events logged yet. Tap &apos;Log Wash&apos; to add one.</Text>
        ) : (
          <View style={styles.logList}>
            {cleaningEvents.map((evt) => (
              <View key={evt.id} style={styles.logItem}>
                <View style={styles.logTop}>
                  <View style={styles.logLeft}>
                    <Ionicons
                      name={evt.skipped ? 'close-circle-outline' : 'water'}
                      size={14}
                      color={evt.skipped ? COLORS.textMuted : COLORS.info}
                    />
                    <Text style={styles.logDate}>{evt.date}</Text>
                    {evt.skipped && <Text style={styles.skippedTag}>Skipped</Text>}
                  </View>
                  <Text style={styles.logProvider}>{evt.provider ?? 'Self-cleaned'}</Text>
                </View>
                {evt.notes ? <Text style={styles.logNotes}>{evt.notes}</Text> : null}
                {evt.cost ? <Text style={styles.logCost}>Cost: ₹{evt.cost}</Text> : null}
              </View>
            ))}
          </View>
        )}
      </Card>
    </ScrollView>
  );
};

const SignalItem: React.FC<{
  icon: string;
  label: string;
  weight: string;
  value: number;
  detail: string;
}> = ({ icon, label, weight, value, detail }) => (
  <View style={styles.signalCard}>
    <View style={styles.signalIconBox}>
      <Ionicons name={icon as any} size={16} color={COLORS.textSub} />
    </View>
    <View style={styles.signalContent}>
      <View style={styles.signalHeader}>
        <Text style={styles.signalLabel}>{label}</Text>
        <View style={styles.signalPill}>
          <Text style={styles.signalScore}>{Math.round(value)}/100</Text>
        </View>
      </View>
      <Text style={styles.signalWeight}>Weight: {weight}</Text>
      <Text style={styles.signalDetail}>{detail}</Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: SPACING.md,
    paddingBottom: SPACING.xxl + 24,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
    paddingHorizontal: 2,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: FONT.heavy,
    color: COLORS.text,
  },
  pageSub: {
    fontSize: 12,
    color: COLORS.textSub,
    marginTop: 2,
  },
  cardSpacing: {
    marginBottom: SPACING.lg,
  },
  logBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.gold,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: RADIUS.full,
  },
  logBtnText: {
    fontSize: 12,
    fontWeight: FONT.bold,
    color: COLORS.textInverse,
  },

  // State Badge
  stateBadge: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    borderWidth: 1,
  },
  stateBadgeText: {
    fontSize: 11,
    fontWeight: FONT.bold,
  },

  // Hero Row
  heroRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  statusIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroTextCol: {
    flex: 1,
  },
  rationaleText: {
    fontSize: 13,
    color: COLORS.textSub,
    lineHeight: 18,
  },
  recommendationText: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontStyle: 'italic',
    marginTop: 4,
    lineHeight: 16,
  },

  // Health container
  healthContainer: {
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderSubtle,
  },
  healthLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  healthLabel: {
    fontSize: 12,
    fontWeight: FONT.semi,
    color: COLORS.text,
  },
  healthPct: {
    fontSize: 13,
    fontWeight: FONT.heavy,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  progressText: {
    fontSize: 10,
    color: COLORS.textMuted,
  },

  // Scoring Signals
  signalsContainer: {
    gap: SPACING.sm,
  },
  signalCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#F8FAFC',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: '#EEF2F6',
    padding: SPACING.sm + 2,
  },
  signalIconBox: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  signalContent: {
    flex: 1,
  },
  signalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  signalLabel: {
    fontSize: 12,
    fontWeight: FONT.bold,
    color: COLORS.text,
    flex: 1,
  },
  signalPill: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: RADIUS.full,
  },
  signalScore: {
    fontSize: 10,
    fontWeight: FONT.bold,
    color: COLORS.textSub,
  },
  signalWeight: {
    fontSize: 10,
    fontWeight: FONT.semi,
    color: '#D97706',
    marginTop: 2,
  },
  signalDetail: {
    fontSize: 11,
    color: COLORS.textMuted,
    lineHeight: 15,
    marginTop: 2,
  },

  // Climate Advisory
  advisoryContainer: {
    gap: SPACING.sm,
  },
  advisoryCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: '#EEF2F6',
    padding: SPACING.md,
  },
  advisoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  advisoryIconBox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  advisoryTitle: {
    fontSize: 12,
    fontWeight: FONT.bold,
    color: COLORS.text,
  },
  advisoryText: {
    fontSize: 12,
    color: COLORS.textSub,
    lineHeight: 17,
  },

  // Maintenance Log
  logList: {
    gap: SPACING.sm,
  },
  emptyLog: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'center',
    paddingVertical: SPACING.md,
  },
  logItem: {
    backgroundColor: '#F8FAFC',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: '#EEF2F6',
    padding: SPACING.sm + 2,
    gap: 4,
  },
  logTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  logDate: {
    fontSize: 12,
    fontWeight: FONT.bold,
    color: COLORS.text,
  },
  skippedTag: {
    fontSize: 10,
    color: COLORS.textMuted,
    fontStyle: 'italic',
  },
  logProvider: {
    fontSize: 11,
    color: COLORS.info,
    fontWeight: FONT.semi,
  },
  logNotes: {
    fontSize: 11,
    color: COLORS.textSub,
  },
  logCost: {
    fontSize: 10,
    color: COLORS.textMuted,
  },
});
