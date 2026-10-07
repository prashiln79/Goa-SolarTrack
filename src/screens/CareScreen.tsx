// ============================================================
// Care Screen — PRD §8 Panel Care & Cleaning Intelligence
// ============================================================
import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CareAssessment, CleaningEvent, SystemProfile } from '../types/solar';
import { Card, Divider, InfoNote, ProgressBar } from '../components/ui/UIKit';
import { COLORS, SPACING, RADIUS, FONT } from '../constants/theme';

interface CareScreenProps {
  careAssessment: CareAssessment;
  cleaningEvents: CleaningEvent[];
  profile: SystemProfile;
  onLogClean: () => void;
}

export const CareScreen: React.FC<CareScreenProps> = ({
  careAssessment, cleaningEvents, profile, onLogClean,
}) => {
  const stateColor =
    careAssessment.state === 'Good' ? COLORS.success
    : careAssessment.state === 'Watch' ? COLORS.warning
    : COLORS.danger;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
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
          <Ionicons name="water" size={16} color={COLORS.textInverse} />
          <Text style={styles.logBtnText}>Log Wash</Text>
        </TouchableOpacity>
      </View>

      {/* ── Status hero card ── */}
      <Card
        title="Soiling Assessment"
        subtitle={`Last cleaned: ${profile.lastCleanedDate ?? 'Not recorded'} · ${careAssessment.daysSinceLastClean} days ago`}
      >
        <View style={styles.heroRow}>
          <View style={[styles.statusIcon, { backgroundColor: `${stateColor}18`, borderColor: `${stateColor}44` }]}>
            <Ionicons
              name={
                careAssessment.state === 'Good' ? 'sparkles' :
                careAssessment.state === 'Watch' ? 'eye-outline' : 'warning-outline'
              }
              size={28}
              color={stateColor}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.statusText, { color: stateColor }]}>{careAssessment.state}</Text>
            <Text style={styles.rationaleText}>{careAssessment.rationale}</Text>
            <Text style={styles.recommendationText}>{careAssessment.recommendation}</Text>
          </View>
        </View>

        <View style={{ marginTop: SPACING.md }}>
          <View style={styles.healthLabelRow}>
            <Text style={styles.healthLabel}>Panel Health Index</Text>
            <Text style={[styles.healthPct, { color: stateColor }]}>
              {100 - careAssessment.score}%
            </Text>
          </View>
          <ProgressBar value={100 - careAssessment.score} color={stateColor} height={8} />
          <View style={styles.progressLabels}>
            <Text style={styles.progressLeft}>Clean & Optimal</Text>
            <Text style={styles.progressRight}>Needs Wash</Text>
          </View>
        </View>

        {careAssessment.weatherExplained && (
          <InfoNote
            text="☁️ Current cloud cover / monsoon weather explains part of the generation drop. Alert suppressed per PRD §8.3."
            color={COLORS.info}
            style={{ marginTop: SPACING.sm }}
          />
        )}
      </Card>

      {/* ── 4 Diagnostic Signals (PRD §8.3) ── */}
      <Card
        title="Scoring Signals (V1 Heuristic)"
        subtitle="Transparent model — not an engineering diagnosis (PRD §8.3)"
      >
        <SignalRow
          icon="calendar-outline"
          label="Recency Signal"
          weight="20%"
          value={careAssessment.signals.cleanlinessRecencySignal}
          detail={`${careAssessment.daysSinceLastClean} days since last confirmed wash`}
        />
        <Divider />
        <SignalRow
          icon="rainy-outline"
          label="Rain-free / Natural Washing"
          weight="25%"
          value={careAssessment.signals.rainFreeSignal}
          detail="Goa monsoon rainfall provides natural panel washing. Dry coastal season = higher score."
        />
        <Divider />
        <SignalRow
          icon="pulse-outline"
          label="Generation Deviation"
          weight="40% (highest)"
          value={careAssessment.signals.generationDeviationSignal}
          detail="Normalized kWh/kW/day vs. expected benchmark. Suppressed when weather explains."
        />
        <Divider />
        <SignalRow
          icon="partly-sunny-outline"
          label="Weather Confidence"
          weight="15%"
          value={careAssessment.signals.weatherConfidenceSignal}
          detail="Sunshine hours / cloud cover data availability and confidence."
        />
      </Card>

      {/* ── Goa climate advisory ── */}
      <Card title="Goa Climate & Coastal Advisory">
        <View style={styles.advisoryRow}>
          <Ionicons name="information-circle-outline" size={18} color={COLORS.gold} />
          <View style={{ flex: 1 }}>
            <Text style={styles.advisoryTitle}>Monsoon Season (June–September)</Text>
            <Text style={styles.advisoryText}>
              Heavy Goa showers naturally rinse rooftop panels. Routine cleaning is typically not needed during active monsoon. The soiling score is automatically suppressed.
            </Text>
          </View>
        </View>
        <Divider />
        <View style={styles.advisoryRow}>
          <Ionicons name="sunny-outline" size={18} color={COLORS.gold} />
          <View style={{ flex: 1 }}>
            <Text style={styles.advisoryTitle}>Dry / Coastal Season (Oct–May)</Text>
            <Text style={styles.advisoryText}>
              Red laterite road dust and coastal salt film accumulate rapidly. Rinse panels every 20–30 days before 8 AM using soft water and a gentle squeegee. Avoid midday cleaning in peak summer.
            </Text>
          </View>
        </View>
      </Card>

      {/* ── Maintenance log ── */}
      <Card
        title="Maintenance Log"
        subtitle={`${cleaningEvents.length} event${cleaningEvents.length === 1 ? '' : 's'} recorded · PRD §8.4`}
      >
        {cleaningEvents.length === 0 && (
          <Text style={styles.emptyLog}>No cleaning events logged yet. Tap "Log Wash" to add one.</Text>
        )}
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
                {evt.skipped && <Text style={styles.skippedTag}>Skip / Not needed</Text>}
              </View>
              <Text style={styles.logProvider}>{evt.provider ?? 'Self-cleaned'}</Text>
            </View>
            {evt.notes && <Text style={styles.logNotes}>{evt.notes}</Text>}
            {evt.cost ? <Text style={styles.logCost}>Cost: ₹{evt.cost}</Text> : null}
          </View>
        ))}
      </Card>
    </ScrollView>
  );
};

const SignalRow: React.FC<{
  icon: string; label: string; weight: string; value: number; detail: string;
}> = ({ icon, label, weight, value, detail }) => (
  <View style={styles.signalRow}>
    <View style={styles.signalIconBox}>
      <Ionicons name={icon as any} size={18} color={COLORS.textSub} />
    </View>
    <View style={{ flex: 1 }}>
      <View style={styles.signalHeader}>
        <Text style={styles.signalLabel}>{label}</Text>
        <Text style={styles.signalScore}>{Math.round(value)}/100</Text>
      </View>
      <Text style={styles.signalWeight}>Weight: {weight}</Text>
      <Text style={styles.signalDetail}>{detail}</Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xxl + 20 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md },
  pageTitle: { fontSize: 20, fontWeight: FONT.heavy, color: COLORS.text },
  pageSub: { fontSize: 12, color: COLORS.textSub, marginTop: 2 },
  logBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.info,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: RADIUS.full,
  },
  logBtnText: { fontSize: 13, fontWeight: FONT.bold, color: COLORS.textInverse },
  heroRow: { flexDirection: 'row', gap: SPACING.md, alignItems: 'flex-start' },
  statusIcon: {
    width: 52, height: 52, borderRadius: RADIUS.md, borderWidth: 1,
    justifyContent: 'center', alignItems: 'center',
  },
  statusText: { fontSize: 15, fontWeight: FONT.heavy, marginBottom: 4 },
  rationaleText: { fontSize: 12, color: COLORS.textSub, lineHeight: 17 },
  recommendationText: { fontSize: 11, color: COLORS.textMuted, fontStyle: 'italic', marginTop: 4, lineHeight: 15 },
  healthLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  healthLabel: { fontSize: 12, fontWeight: FONT.semi, color: COLORS.text },
  healthPct: { fontSize: 14, fontWeight: FONT.heavy },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  progressLeft: { fontSize: 9, color: COLORS.textMuted },
  progressRight: { fontSize: 9, color: COLORS.textMuted },
  signalRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm, paddingVertical: SPACING.xs },
  signalIconBox: {
    width: 34, height: 34, borderRadius: RADIUS.sm, backgroundColor: COLORS.surfaceRaised,
    justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: COLORS.borderSubtle,
  },
  signalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  signalLabel: { fontSize: 12, fontWeight: FONT.semi, color: COLORS.text, flex: 1 },
  signalScore: { fontSize: 12, fontWeight: FONT.bold, color: COLORS.textMuted },
  signalWeight: { fontSize: 10, color: COLORS.gold, marginTop: 1 },
  signalDetail: { fontSize: 10, color: COLORS.textMuted, lineHeight: 14, marginTop: 2 },
  advisoryRow: { flexDirection: 'row', gap: SPACING.sm, paddingVertical: SPACING.xs },
  advisoryTitle: { fontSize: 12, fontWeight: FONT.bold, color: COLORS.gold, marginBottom: 2 },
  advisoryText: { fontSize: 11, color: COLORS.textSub, lineHeight: 16 },
  emptyLog: { fontSize: 12, color: COLORS.textMuted, textAlign: 'center', paddingVertical: SPACING.md },
  logItem: {
    backgroundColor: COLORS.surfaceRaised, borderRadius: RADIUS.md, borderWidth: 1,
    borderColor: COLORS.borderSubtle, padding: SPACING.sm + 2, marginBottom: SPACING.sm, gap: 3,
  },
  logTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  logDate: { fontSize: 13, fontWeight: FONT.bold, color: COLORS.text },
  skippedTag: { fontSize: 10, color: COLORS.textMuted, fontStyle: 'italic' },
  logProvider: { fontSize: 11, color: COLORS.info, fontWeight: FONT.semi },
  logNotes: { fontSize: 11, color: COLORS.textSub },
  logCost: { fontSize: 10, color: COLORS.textMuted },
});
