// ============================================================
// Home Screen — Simplified light-theme layout
// ============================================================
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import { SolarBill, SystemProfile, CareAssessment } from '../types/solar';
import { Card, Badge, Divider, InfoNote, ProgressBar, LedgerRow, SolarPanelIcon, GridIcon } from '../components/ui/UIKit';
import { estimateRetailBill, projectSettlement } from '../domain/tariffEngine';
import { COLORS, SPACING, RADIUS, FONT, SHADOW } from '../constants/theme';

interface HomeScreenProps {
  bills: SolarBill[];
  profile: SystemProfile;
  careAssessment: CareAssessment;
  isRefreshing: boolean;
  onRefresh: () => Promise<void>;
  onAddBill: () => void;
  onLogClean: () => void;
  onSeedCanonical?: () => void;
  onNavigateCare: () => void;
  onNavigateAnalytics: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  bills, profile, careAssessment, isRefreshing, onRefresh,
  onAddBill, onLogClean, onSeedCanonical,
  onNavigateCare, onNavigateAnalytics,
}) => {
  const bill = bills.length > 0 ? bills[0] : null;

  if (!bill) {
    return <EmptyState onAddBill={onAddBill} />;
  }

  const days = bill.billingDays || 31;
  const avgPerDay = bill.generationKwh !== null
    ? (bill.generationKwh / days).toFixed(1)
    : null;

  const retailEstimate =
    bill.estimatedTotalConsumptionKwh !== null
      ? estimateRetailBill(bill.estimatedTotalConsumptionKwh, bill.billAmount, profile.capacityKw)
      : null;

  const settlement =
    profile.settlementRateInr
      ? projectSettlement(
          bill.closingCreditKwh,
          profile.settlementRateInr,
          'FY 2026-27 (1 Apr – 31 Mar)',
          '31 May 2027'
        )
      : null;

  // ── Scope toggle for Energy Flow (Latest Month vs All Bills) ──
  const [flowScope, setFlowScope] = useState<'month' | 'all'>('month');
  const [connectorWidth, setConnectorWidth] = useState(330);
  const [homeCardLayout, setHomeCardLayout] = useState({ width: 155, height: 140 });

  // ── All-time aggregates for the summary strip & all-time flow ──
  const allTimeGeneration = bills.reduce((sum, b) => sum + (b.generationKwh ?? 0), 0);
  const allTimeImport = bills.reduce((sum, b) => sum + b.importKwh, 0);
  const allTimeExport = bills.reduce((sum, b) => sum + b.exportKwh, 0);
  const allTimeDirectUse = bills.reduce((sum, b) => sum + (b.directSolarUseKwh ?? 0), 0);

  const displayGen = flowScope === 'month' ? bill.generationKwh : allTimeGeneration;
  const displayImp = flowScope === 'month' ? bill.importKwh : allTimeImport;
  const displayExp = flowScope === 'month' ? bill.exportKwh : allTimeExport;
  const displayDirect = flowScope === 'month' ? bill.directSolarUseKwh : allTimeDirectUse;

  // ── Derived home consumption & grid balance for visual flow diagram ──
  const displayHomeConsumption =
    flowScope === 'month'
      ? (bill.estimatedTotalConsumptionKwh ?? ((displayDirect ?? 0) + displayImp))
      : (allTimeDirectUse + allTimeImport);

  const isNetImport = displayImp >= displayExp;
  const netGridValue = Math.abs(displayExp - displayImp);

  const solarGenSafe = displayGen ?? 0;
  const directSafe = displayDirect !== null && displayDirect !== undefined
    ? displayDirect
    : (solarGenSafe > 0 ? Math.max(0, solarGenSafe - displayExp) : 0);
  const solarToHomePct = solarGenSafe > 0
    ? Math.min(100, Math.max(0, Math.round((directSafe / solarGenSafe) * 100)))
    : 0;
  const solarToGridPct = solarGenSafe > 0 ? Math.max(0, 100 - solarToHomePct) : 0;
  const exportDays = flowScope === 'month' ? (bill.billingDays || 31) : Math.max(1, bills.reduce((s, b) => s + (b.billingDays || 31), 0));
  const exportAvgPerDay = ((displayExp ?? 0) / exportDays).toFixed(1);

  // Straight orthogonal connector SVG paths
  const cx = connectorWidth / 2;
  const leftTargetX = connectorWidth * 0.25;
  const rightTargetX = connectorWidth * 0.75;
  const splitY = 26;
  const arrowTipY = 48;
  const leftPath = `M ${cx} 0 L ${cx} ${splitY} L ${leftTargetX} ${splitY} L ${leftTargetX} ${arrowTipY}`;
  const leftArrow = `M ${leftTargetX - 4} ${arrowTipY - 6} L ${leftTargetX} ${arrowTipY} L ${leftTargetX + 4} ${arrowTipY - 6}`;
  const rightPath = `M ${cx} 0 L ${cx} ${splitY} L ${rightTargetX} ${splitY} L ${rightTargetX} ${arrowTipY}`;
  const rightArrow = `M ${rightTargetX - 4} ${arrowTipY - 6} L ${rightTargetX} ${arrowTipY} L ${rightTargetX + 4} ${arrowTipY - 6}`;

  // Bottom Grid -> Home import connector paths
  const importLineY = 18;
  const importPath = `M ${rightTargetX} 0 L ${rightTargetX} ${importLineY} L ${leftTargetX} ${importLineY} L ${leftTargetX} 6`;
  const importArrow = `M ${leftTargetX - 4} 12 L ${leftTargetX} 5 L ${leftTargetX + 4} 12`;

  // Home card house silhouette SVG path (matching reference image)
  const hw = homeCardLayout.width || 155;
  const hh = homeCardLayout.height || 160;
  const hcx = hw / 2;
  const wallInset = 14;
  const roofEaveY = Math.round(hh * 0.36);
  const cr = 14;
  const slopeWidth = hw - 3 - hcx;
  const slopeHeight = roofEaveY - 4;
  // Chimney on right slope: positioned proportionally matching reference icon
  const chX1 = Math.round(hcx + slopeWidth * 0.32);
  const chWidth = Math.max(14, Math.round(slopeWidth * 0.20));
  const chX2 = Math.min(hw - wallInset - 2, chX1 + chWidth);
  const chY1 = Math.round(4 + ((chX1 - hcx) / slopeWidth) * slopeHeight);
  const chY2 = Math.round(4 + ((chX2 - hcx) / slopeWidth) * slopeHeight);
  // Chimney flat top slightly below apex (apex at y=4)
  const chTop = Math.max(8, Math.round(4 + slopeHeight * 0.14));

  const housePath = [
    `M ${hcx} 4`,
    `L ${chX1} ${chY1}`,
    `L ${chX1} ${chTop}`,
    `L ${chX2} ${chTop}`,
    `L ${chX2} ${chY2}`,
    `L ${hw - 3} ${roofEaveY}`,
    `L ${hw - wallInset} ${roofEaveY}`,
    `L ${hw - wallInset} ${hh - cr}`,
    `Q ${hw - wallInset} ${hh - 3} ${hw - wallInset - cr} ${hh - 3}`,
    `L ${wallInset + cr} ${hh - 3}`,
    `Q ${wallInset} ${hh - 3} ${wallInset} ${hh - cr}`,
    `L ${wallInset} ${roofEaveY}`,
    `L 3 ${roofEaveY}`,
    'Z',
  ].join(' ');

  const allTimeTotalBill = bills.reduce((sum, b) => sum + b.billAmount, 0);
  const allTimeTotalSavings = bills.reduce((sum, b) => {
    if (b.estimatedTotalConsumptionKwh === null) return sum;
    const est = estimateRetailBill(b.estimatedTotalConsumptionKwh, b.billAmount, profile.capacityKw);
    return sum + est.estimatedSavingsInr;
  }, 0);
  const hasSavingsData = bills.some((b) => b.estimatedTotalConsumptionKwh !== null);
  // Period label: oldest → newest
  const sortedBills = [...bills].sort(
    (a, b) => new Date(a.periodStart).getTime() - new Date(b.periodStart).getTime()
  );
  const firstPeriod = sortedBills[0]?.period ?? bill.period;
  const lastPeriod = sortedBills[sortedBills.length - 1]?.period ?? bill.period;
  const allTimePeriodLabel = bills.length === 1 ? bill.period : `${firstPeriod} – ${lastPeriod}`;

  const careColor = careAssessment.state === 'Good' ? COLORS.success
    : careAssessment.state === 'Watch' ? COLORS.warning
    : COLORS.danger;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={onRefresh}
          colors={[COLORS.gold]}
        />
      }
      showsVerticalScrollIndicator={false}
    >
      {/* ── Top summary strip — All-time totals ── */}
      <View style={styles.summaryStrip}>
        <SummaryChip
          label="Total Savings"
          value={hasSavingsData ? `₹${Math.round(allTimeTotalSavings).toLocaleString()}` : '—'}
          valueColor={hasSavingsData ? COLORS.success : COLORS.textMuted}
        />
        <View style={styles.stripDivider} />
        <SummaryChip
          label="Total Paid"
          value={`₹${Math.round(allTimeTotalBill).toLocaleString()}`}
          valueColor={COLORS.gold}
        />
      </View>

      {/* ─── 1. Energy Overview (3 Simple Questions for Normal Person) ─── */}
      <Card
        title="Energy Overview"
        subtitle={
          flowScope === 'month'
            ? `${bill.period} (Latest Bill)`
            : `All Bills Total (${bills.length} bills · ${allTimePeriodLabel})`
        }
        badge={
          bills.length > 1 ? (
            <View style={styles.scopeToggle}>
              <TouchableOpacity
                id="btn-flow-scope-month"
                style={[styles.scopeBtn, flowScope === 'month' && styles.scopeBtnActive]}
                onPress={() => setFlowScope('month')}
              >
                <Text style={[styles.scopeBtnText, flowScope === 'month' && styles.scopeBtnTextActive]}>
                  Month
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                id="btn-flow-scope-all"
                style={[styles.scopeBtn, flowScope === 'all' && styles.scopeBtnActive]}
                onPress={() => setFlowScope('all')}
              >
                <Text style={[styles.scopeBtnText, flowScope === 'all' && styles.scopeBtnTextActive]}>
                  All ({bills.length})
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Badge label={bill.period} color={COLORS.gold} />
          )
        }
      >
        <View style={styles.flowchartWrap}>
          {/* ─── 1. TOP NODE: SOLAR GENERATED ─── */}
          <View style={styles.fcSolarCard}>
            {/* Left: Sun Icon circle badge */}
            <View style={styles.fcSolarIconBadge}>
              <Ionicons name="sunny" size={34} color="#F59E0B" />
            </View>

            {/* Right: Data Column */}
            <View style={styles.fcSolarDataCol}>
              <Text style={styles.fcSolarHeaderLabel}>SOLAR GENERATED</Text>
              <View style={styles.fcSolarValueRow}>
                <Text style={styles.fcSolarHeroNum}>{displayGen ?? '—'}</Text>
                <Text style={styles.fcSolarHeroUnit}>kWh</Text>
              </View>
              <View style={styles.fcSolarAvgRow}>
                <Ionicons name="stats-chart" size={12} color="#F59E0B" />
                <Text style={styles.fcSolarAvgText}>
                  {flowScope === 'month' && avgPerDay
                    ? `${avgPerDay} kWh/day avg`
                    : `${((displayGen ?? 0) / Math.max(1, bills.length * 30)).toFixed(1)} kWh/day avg`}
                </Text>
              </View>
            </View>
          </View>

          {/* ─── 2. SPLIT STEM & STRAIGHT FLOW ARROWS ─── */}
          <View
            style={styles.fcConnectorContainer}
            onLayout={(e) => {
              const w = Math.round(e.nativeEvent.layout.width);
              if (w > 0 && Math.abs(w - connectorWidth) > 2) {
                setConnectorWidth(w);
              }
            }}
          >
            <Svg width={connectorWidth} height={54} style={StyleSheet.absoluteFill}>
              {/* Left flow (Purple): Straight stem -> horizontal split -> drop */}
              <Path
                d={leftPath}
                stroke="#8B5CF6"
                strokeWidth={2}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <Path
                d={leftArrow}
                stroke="#8B5CF6"
                strokeWidth={2}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Right flow (Green): Straight stem -> horizontal split -> drop */}
              <Path
                d={rightPath}
                stroke="#10B981"
                strokeWidth={2}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <Path
                d={rightArrow}
                stroke="#10B981"
                strokeWidth={2}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>

            {/* Percentage Badges */}
            <View style={[styles.fcPillBadgeLeft, { left: Math.round(connectorWidth * 0.375 - 18) }]}>
              <Text style={styles.fcPillTextLeft}>{solarToHomePct}%</Text>
            </View>
            <View style={[styles.fcPillBadgeRight, { left: Math.round(connectorWidth * 0.625 - 18) }]}>
              <Text style={styles.fcPillTextRight}>{solarToGridPct}%</Text>
            </View>
          </View>

          {/* ─── 3. MIDDLE ROW: HOME USED & GOA GRID ─── */}
          <View style={styles.fcMiddleRow}>
            {/* Left Card: Home Used (House Shape) */}
            <View
              style={styles.fcHomeCard}
              onLayout={(e) => {
                const { width, height } = e.nativeEvent.layout;
                if (
                  width > 0 &&
                  height > 0 &&
                  (Math.abs(width - homeCardLayout.width) > 2 ||
                    Math.abs(height - homeCardLayout.height) > 2)
                ) {
                  setHomeCardLayout({
                    width: Math.round(width),
                    height: Math.round(height),
                  });
                }
              }}
            >
              <Svg
                width={hw}
                height={hh}
                style={StyleSheet.absoluteFill}
              >
                <Path
                  d={housePath}
                  fill="#FAF5FF"
                  stroke="#7C3AED"
                  strokeWidth={2.5}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </Svg>

              <View style={styles.fcHomeHeroCenter}>
                <Text style={styles.fcHeroValue}>
                  {displayHomeConsumption.toFixed(0)}
                  <Text style={styles.fcHeroUnit}> kWh</Text>
                </Text>
              </View>

              <View style={styles.fcHomeFloorCard}>
                <View style={styles.fcBreakdownItem}>
                  <Ionicons name="sunny" size={13} color="#F59E0B" />
                  <Text style={styles.fcBreakdownLabel} numberOfLines={1}>From Solar</Text>
                  <Text style={styles.fcBreakdownValSolar} numberOfLines={1}>{displayDirect ?? 0} kWh</Text>
                </View>
                <View style={styles.fcFloorDivider} />
                <View style={styles.fcBreakdownItem}>
                  <Ionicons name="flash" size={13} color="#3B82F6" />
                  <Text style={styles.fcBreakdownLabel} numberOfLines={1}>From Grid</Text>
                  <Text style={styles.fcBreakdownValGrid} numberOfLines={1}>{displayImp} kWh</Text>
                </View>
              </View>
            </View>

            {/* Right Card: Goa Grid */}
            <View style={styles.fcGridCard}>
              <View style={styles.fcNodeHeader}>
                <View style={styles.fcGridIconWrap}>
                  <GridIcon size={18} color="#059669" />
                </View>
                <Text style={styles.fcCardTitleText}>Grid</Text>
               
              </View>

              <View style={styles.fcHeroValueRow}>
                <Text style={styles.fcHeroValue}>
                  {displayExp}
                  <Text style={styles.fcHeroUnit}> kWh</Text>
                </Text>
              </View>

              <View style={styles.fcGridFloorCard}>
                <View style={styles.fcBreakdownItem}>
                  <Ionicons name="pie-chart" size={12} color="#059669" />
                  <Text style={styles.fcBreakdownLabel} numberOfLines={1}>Solar Share</Text>
                  <Text style={styles.fcBreakdownValExport} numberOfLines={1}>{solarToGridPct}%</Text>
                </View>
                <View style={styles.fcGridFloorDivider} />
                <View style={styles.fcBreakdownItem}>
                  <Ionicons name="stats-chart" size={12} color="#10B981" />
                  <Text style={styles.fcBreakdownLabel} numberOfLines={1}>Daily Avg</Text>
                  <Text style={styles.fcBreakdownValExport} numberOfLines={1}>{exportAvgPerDay} kWh</Text>
                </View>
              </View>
            </View>
          </View>

          {/* ─── 4. BOTTOM CONNECTOR: GRID → HOME IMPORT PATH ─── */}
          <View style={styles.fcImportConnector}>
            <Svg width={connectorWidth} height={36} style={StyleSheet.absoluteFill}>
              <Path
                d={importPath}
                stroke="#2563EB"
                strokeWidth={2}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <Path
                d={importArrow}
                stroke="#2563EB"
                strokeWidth={2}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>

            {/* In-between Imported Value Pill Badge */}
            <View style={styles.fcImportPillWrap}>
              <View style={styles.fcImportPill}>
                <Text style={styles.fcImportPillText}>
                  Imported:{' '}
                  <Text style={styles.fcImportPillVal}>{displayImp} kWh</Text>
                </Text>
              </View>
            </View>
          </View>
        </View>
      </Card>

      {/* ─── 2. Energy Bank ─── */}
      <Card
        title="Energy Bank"
        subtitle={`Cumulative credit balance as of ${bill.period}`}
        badge={<Badge label={bill.period} color={COLORS.gold} />}
      >
        <View style={styles.bankHero}>
          <Text style={styles.bankValue}>{bill.closingCreditKwh}</Text>
          <Text style={styles.bankUnit}>kWh carried forward</Text>
        </View>
        <View style={styles.formulaRow}>
          <FormulaStep value={bill.openingCreditKwh} label="Opening" />
          <Text style={styles.formulaOp}>＋</Text>
          <FormulaStep value={bill.exportKwh} label="Export" color={COLORS.export} />
          <Text style={styles.formulaOp}>－</Text>
          <FormulaStep value={bill.adjustedCreditKwh} label="Used" color={COLORS.import} />
          <Text style={styles.formulaOp}>＝</Text>
          <FormulaStep value={bill.closingCreditKwh} label="Balance" color={COLORS.gold} highlight />
        </View>
        {bill.needsReview && (
          <InfoNote
            text="⚠️ Bill value differs from calculated. Bill-stated values are preserved."
            color={COLORS.danger}
            style={{ marginTop: SPACING.sm }}
          />
        )}
      </Card>

      {/* ─── 3. Current Bill ─── */}
      <Card
        title="Current Bill"
        subtitle={`${bill.period} · Bill #${bill.billNumber ?? 'N/A'}  ·  Due: ${bill.dueDate ?? 'N/A'}`}
        badge={<Badge label={`₹${bill.billAmount.toFixed(0)}`} color={COLORS.gold} />}
      >
        <View style={styles.billBox}>
          {bill.demandCharges !== undefined && (
            <LedgerRow label="Demand / Fixed Charges" value={`₹${bill.demandCharges.toFixed(2)}`} />
          )}
          {bill.fppca !== undefined && (
            <LedgerRow label="FPPCA" value={`₹${bill.fppca.toFixed(2)}`} />
          )}
          {bill.rebate !== undefined && bill.rebate !== 0 && (
            <LedgerRow label="Prompt Payment Rebate" value={`−₹${Math.abs(bill.rebate).toFixed(2)}`} valueColor={COLORS.success} />
          )}
          {bill.otherCharges !== undefined && bill.otherCharges !== 0 && (
            <LedgerRow label="Other Charges" value={`₹${bill.otherCharges.toFixed(2)}`} />
          )}
          <Divider />
          <LedgerRow label="Credit used this period" value={`${bill.adjustedCreditKwh} kWh`} valueColor={COLORS.export} />
          <LedgerRow label="Credit carried forward" value={`${bill.closingCreditKwh} kWh`} valueColor={COLORS.gold} />
        </View>
        <InfoNote
          text="Fixed charges, FPPCA and duties are payable regardless of energy credits."
          color={COLORS.warning}
          style={{ marginTop: SPACING.sm }}
        />
      </Card>

      {/* ─── 4. Panel Care ─── */}
      <Card
        title="Panel Care"
        subtitle={`Last cleaned: ${profile.lastCleanedDate ?? 'Not recorded'}`}
        badge={<Badge label={careAssessment.state} color={careColor} />}
      >
        <Text style={styles.careRationale}>{careAssessment.rationale}</Text>
        {careAssessment.recommendation ? (
          <Text style={styles.careRecommendation}>{careAssessment.recommendation}</Text>
        ) : null}
        <ProgressBar
          value={100 - careAssessment.score}
          color={careColor}
          height={8}
          style={{ marginTop: SPACING.md }}
        />
        <View style={styles.progressLabels}>
          <Text style={styles.progressLabel}>Clean</Text>
          <Text style={[styles.progressLabel, { color: careColor, fontWeight: FONT.semi }]}>
            {100 - careAssessment.score}% health
          </Text>
          <Text style={styles.progressLabel}>Needs Wash</Text>
        </View>
        <View style={styles.careActions}>
          <TouchableOpacity
            id="btn-log-clean-home"
            style={styles.logCleanBtn}
            onPress={onLogClean}
            activeOpacity={0.8}
          >
            <Ionicons name="water-outline" size={16} color={COLORS.textInverse} />
            <Text style={styles.logCleanText}>Log Panel Wash</Text>
          </TouchableOpacity>
          <TouchableOpacity
            id="btn-view-care"
            style={styles.viewCareBtn}
            onPress={onNavigateCare}
          >
            <Text style={styles.viewCareText}>Full Report →</Text>
          </TouchableOpacity>
        </View>
      </Card>

      {/* ─── 5. Annual Settlement ─── */}
      {settlement ? (
        <Card title="Annual Settlement Outlook" subtitle="FY 1 Apr – 31 Mar · JERC 2019">
          <View style={styles.settlementRow}>
            <View style={styles.settlementCol}>
              <Text style={styles.settlementLabel}>Banked</Text>
              <Text style={styles.settlementVal}>{settlement.bankedCreditKwh} kWh</Text>
            </View>
            <Text style={styles.formulaOp}>×</Text>
            <View style={styles.settlementCol}>
              <Text style={styles.settlementLabel}>APPC Rate</Text>
              <Text style={styles.settlementVal}>₹{settlement.ratePerKwh}/kWh</Text>
            </View>
            <Text style={styles.formulaOp}>＝</Text>
            <View style={[styles.settlementCol, styles.settlementHighlight]}>
              <Text style={[styles.settlementLabel, { color: COLORS.success }]}>Projected</Text>
              <Text style={[styles.settlementVal, { color: COLORS.success, fontSize: 20 }]}>
                ₹{settlement.projectedPayoutInr.toFixed(0)}
              </Text>
            </View>
          </View>
          <InfoNote
            text="Estimate only — actual settlement computed by EDG by 30 Apr."
            color={COLORS.warning}
            style={{ marginTop: SPACING.sm }}
          />
        </Card>
      ) : (
        <InfoNote
          text="Set the APPC settlement rate in Settings to see your annual payout estimate."
          color={COLORS.info}
        />
      )}
    </ScrollView>
  );
};

// ── Sub-Components ────────────────────────────────────────────

const SummaryChip: React.FC<{ label: string; value: string; valueColor?: string }> = ({
  label, value, valueColor = COLORS.text,
}) => (
  <View style={styles.chip}>
    <Text style={styles.chipLabel}>{label}</Text>
    <Text style={[styles.chipValue, { color: valueColor }]}>{value}</Text>
  </View>
);

const FlowTile: React.FC<{
  icon: string; label: string; value: number | null;
  unit: string; color: string; note?: string;
}> = ({ icon, label, value, unit, color, note }) => (
  <View style={[styles.flowTile, { borderTopColor: color, borderTopWidth: 3 }]}>
    <View style={styles.flowTileHeader}>
      <Ionicons name={icon as any} size={14} color={color} />
      <Text style={[styles.flowTileLabel, { color }]}>{label}</Text>
    </View>
    <Text style={styles.flowTileValue}>
      {value !== null ? value : '—'}
    </Text>
    <Text style={styles.flowTileUnit}>{value !== null ? unit : ''}</Text>
    {note && <Text style={styles.flowTileNote}>{note}</Text>}
  </View>
);

const FormulaStep: React.FC<{
  value: number; label: string; color?: string; highlight?: boolean;
}> = ({ value, label, color = COLORS.textSub, highlight }) => (
  <View style={[styles.formulaStep, highlight && styles.formulaStepHighlight]}>
    <Text style={[styles.formulaValue, { color }]}>{value}</Text>
    <Text style={styles.formulaLabel}>{label}</Text>
  </View>
);

const EmptyState: React.FC<{
  onAddBill: () => void;
}> = ({ onAddBill }) => (
  <View style={styles.emptyContainer}>
    <View style={styles.emptyIconWrap}>
      <Ionicons name="sunny-outline" size={44} color={COLORS.gold} />
    </View>
    <Text style={styles.emptyTitle}>Welcome to Goa SolarTrack</Text>
    <Text style={styles.emptySub}>
      Add your first monthly electricity bill to begin tracking your rooftop solar production, savings, and energy credits in Goa.
    </Text>
    <TouchableOpacity id="btn-add-bill-empty" style={styles.emptyAddBtn} onPress={onAddBill}>
      <Ionicons name="add-circle" size={18} color={COLORS.textInverse} />
      <Text style={styles.emptyAddBtnText}>Add Monthly Bill</Text>
    </TouchableOpacity>
  </View>
);

// ── Styles ────────────────────────────────────────────────────
const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xxl + 20 },

  // Summary strip
  summaryStrip: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.md,
    ...SHADOW.card,
  },
  chip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xs,
  },
  chipLabel: { fontSize: 11, color: COLORS.textMuted, marginBottom: 4 },
  chipValue: { fontSize: 15, fontWeight: FONT.bold },
  stripDivider: { width: 1, backgroundColor: COLORS.border, marginVertical: SPACING.sm },

  // Scope toggle
  scopeToggle: {
    flexDirection: 'row',
    backgroundColor: COLORS.surfaceRaised,
    borderRadius: RADIUS.full,
    padding: 2,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  scopeBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
  },
  scopeBtnActive: {
    backgroundColor: COLORS.gold,
  },
  scopeBtnText: {
    fontSize: 10,
    fontWeight: FONT.semi,
    color: COLORS.textMuted,
  },
  scopeBtnTextActive: {
    color: COLORS.textInverse,
    fontWeight: FONT.bold,
  },

  // Flowchart
  flowchartWrap: {
    width: '100%',
    marginTop: 2,
  },

  // 1. Solar Generated Card
  fcSolarCard: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#FED7AA',
    paddingVertical: 14,
    paddingHorizontal: 16,
    ...SHADOW.card,
  },
  fcSolarIconBadge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fcSolarDataCol: {
    flex: 1,
    marginLeft: 16,
    justifyContent: 'center',
  },
  fcSolarHeaderLabel: {
    fontSize: 12,
    fontWeight: FONT.bold,
    color: '#64748B',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  fcSolarValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 1,
  },
  fcSolarHeroNum: {
    fontSize: 34,
    fontWeight: FONT.heavy,
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  fcSolarHeroUnit: {
    fontSize: 16,
    fontWeight: FONT.semi,
    color: '#64748B',
    marginLeft: 5,
  },
  fcSolarAvgRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  fcSolarAvgText: {
    fontSize: 12,
    fontWeight: FONT.semi,
    color: '#D97706',
  },

  // 2. Connector & Flow Arrows
  fcConnectorContainer: {
    width: '100%',
    height: 54,
    position: 'relative',
    justifyContent: 'center',
  },
  fcPillBadgeLeft: {
    position: 'absolute',
    top: 15,
    backgroundColor: '#F3E8FF',
    borderWidth: 1,
    borderColor: '#E9D5FF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fcPillTextLeft: {
    fontSize: 11,
    fontWeight: FONT.bold,
    color: '#7C3AED',
  },
  fcPillBadgeRight: {
    position: 'absolute',
    top: 15,
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fcPillTextRight: {
    fontSize: 11,
    fontWeight: FONT.bold,
    color: '#059669',
  },

  // 3. Middle Row
  fcMiddleRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
  },
  fcHomeCard: {
    flex: 1,
    minWidth: 0,
    backgroundColor: 'transparent',
    paddingHorizontal: 16,
    paddingBottom: 10,
    paddingTop: 42,
    minHeight: 160,
    justifyContent: 'space-between',
    alignItems: 'center',
    position: 'relative',
  },
  fcHomeHeroCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingVertical: 2,
  },
  fcHomeFloorCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E9D5FF',
    paddingVertical: 6,
    paddingHorizontal: 8,
    gap: 4,
  },
  fcFloorDivider: {
    height: 1,
    backgroundColor: '#F3E8FF',
  },
  fcGridCard: {
    flex: 1,
    minWidth: 0,
    backgroundColor: '#F0FDF4',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#BBF7D0',
    padding: 12,
    minHeight: 160,
    justifyContent: 'space-between',
  },
  fcNodeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  fcHomeIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#EDE9FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fcGridIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fcCardTitleText: {
    fontSize: 14,
    fontWeight: FONT.bold,
    color: '#0F172A',
    flexShrink: 1,
  },
  fcHeroValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 10,
  },
  fcHeroValue: {
    fontSize: 26,
    fontWeight: FONT.heavy,
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  fcHeroUnit: {
    fontSize: 14,
    fontWeight: FONT.semi,
    color: '#64748B',
    marginLeft: 4,
  },
  fcBreakdownList: {
    gap: 6,
  },
  fcBreakdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fcBreakdownLabel: {
    fontSize: 11,
    color: '#475569',
    fontWeight: FONT.medium,
    flex: 1,
    marginLeft: 5,
  },
  fcBreakdownValSolar: {
    fontSize: 12,
    fontWeight: FONT.bold,
    color: '#7C3AED',
  },
  fcBreakdownValGrid: {
    fontSize: 12,
    fontWeight: FONT.bold,
    color: '#2563EB',
  },
  fcBreakdownValExport: {
    fontSize: 12,
    fontWeight: FONT.bold,
    color: '#059669',
  },

  fcGridBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 'auto',
  },
  fcGridBadgeText: {
    fontSize: 10,
    fontWeight: FONT.bold,
    color: '#059669',
  },
  fcGridFloorCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    paddingVertical: 6,
    paddingHorizontal: 8,
    gap: 4,
  },
  fcGridFloorDivider: {
    height: 1,
    backgroundColor: '#F0FDF4',
  },

  // Bottom Grid -> Home Import Connector
  fcImportConnector: {
    width: '100%',
    height: 36,
    position: 'relative',
    marginTop: 2,
    marginBottom: 2,
  },
  fcImportPillWrap: {
    position: 'absolute',
    top: 7,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fcImportPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 2.5,
  },
  fcImportPillText: {
    fontSize: 11,
    color: '#1E40AF',
    fontWeight: FONT.medium,
  },
  fcImportPillVal: {
    fontSize: 11,
    fontWeight: FONT.bold,
    color: '#2563EB',
  },

  // Flow grid
  flowGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  flowTile: {
    flex: 1,
    minWidth: '46%',
    backgroundColor: COLORS.surfaceRaised,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
  },
  flowTileHeader: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: SPACING.xs },
  flowTileLabel: { fontSize: 11, fontWeight: FONT.semi },
  flowTileValue: { fontSize: 26, fontWeight: FONT.heavy, color: COLORS.text, marginTop: 2 },
  flowTileUnit: { fontSize: 12, color: COLORS.textMuted },
  flowTileNote: { fontSize: 11, color: COLORS.textMuted, marginTop: 4 },
  savingsRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.glowGreen,
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    borderWidth: 1, borderColor: `${COLORS.success}22`,
  },
  savingsText: { fontSize: 13, color: COLORS.textSub, flex: 1 },

  // Energy bank
  bankHero: { alignItems: 'center', paddingVertical: SPACING.md },
  bankValue: { fontSize: 48, fontWeight: FONT.heavy, color: COLORS.bank },
  bankUnit: { fontSize: 14, color: COLORS.textMuted, marginTop: 2 },
  formulaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surfaceRaised,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  formulaStep: { alignItems: 'center', flex: 1 },
  formulaStepHighlight: {
    backgroundColor: COLORS.glowGold,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: `${COLORS.gold}33`,
    paddingVertical: 4,
  },
  formulaValue: { fontSize: 15, fontWeight: FONT.heavy, color: COLORS.text },
  formulaLabel: { fontSize: 10, color: COLORS.textMuted, marginTop: 2 },
  formulaOp: { fontSize: 13, color: COLORS.textMuted, fontWeight: FONT.bold, paddingHorizontal: 2 },

  // Bill breakdown
  billBox: {
    backgroundColor: COLORS.surfaceRaised,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },

  // Care
  careRationale: { fontSize: 14, color: COLORS.textSub, lineHeight: 21, marginBottom: 4 },
  careRecommendation: { fontSize: 13, color: COLORS.textMuted, lineHeight: 19, fontStyle: 'italic' },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  progressLabel: { fontSize: 11, color: COLORS.textMuted },
  careActions: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md },
  logCleanBtn: {
    flex: 1,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: COLORS.gold, padding: 12, borderRadius: RADIUS.md,
    elevation: 1,
  },
  logCleanText: { fontSize: 14, fontWeight: FONT.bold, color: COLORS.textInverse },
  viewCareBtn: {
    paddingHorizontal: 14, justifyContent: 'center', alignItems: 'center',
    borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border,
  },
  viewCareText: { fontSize: 13, color: COLORS.textSub, fontWeight: FONT.semi },

  // Settlement
  settlementRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.surfaceRaised, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md,
  },
  settlementCol: { alignItems: 'center', flex: 1 },
  settlementHighlight: {
    backgroundColor: COLORS.glowGreen,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: `${COLORS.success}33`,
    paddingVertical: 6,
  },
  settlementLabel: { fontSize: 11, color: COLORS.textMuted },
  settlementVal: { fontSize: 16, fontWeight: FONT.bold, color: COLORS.text, marginTop: 2 },

  // Empty state
  emptyContainer: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: SPACING.xl, gap: SPACING.md,
  },
  emptyIconWrap: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: COLORS.glowGold,
    borderWidth: 1, borderColor: `${COLORS.gold}33`,
    justifyContent: 'center', alignItems: 'center',
  },
  emptyTitle: { fontSize: 22, fontWeight: FONT.heavy, color: COLORS.text, textAlign: 'center' },
  emptySub: { fontSize: 14, color: COLORS.textMuted, textAlign: 'center', lineHeight: 21 },
  emptyAddBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.gold,
    paddingHorizontal: SPACING.xl, paddingVertical: 14,
    borderRadius: RADIUS.full,
    ...SHADOW.glow,
  },
  emptyAddBtnText: { fontSize: 15, fontWeight: FONT.bold, color: COLORS.textInverse },
  emptySeedBtn: {
    paddingVertical: 10,
  },
  emptySeedText: { fontSize: 13, color: COLORS.textMuted, textDecorationLine: 'underline' },
});
