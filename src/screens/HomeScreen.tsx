// ============================================================
// Home Screen — Simplified light-theme layout
// ============================================================
import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { SolarBill, SystemProfile, CareAssessment } from "../types/solar";
import { Card, Badge, Divider, InfoNote, ProgressBar, LedgerRow, SolarPanelIcon, GridIcon } from "../components/ui/UIKit";
import { estimateRetailBill, projectSettlement } from "../domain/tariffEngine";
import { COLORS, SPACING, RADIUS, FONT, SHADOW } from "../constants/theme";

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

export const HomeScreen: React.FC<HomeScreenProps> = ({ bills, profile, careAssessment, isRefreshing, onRefresh, onAddBill, onLogClean, onSeedCanonical, onNavigateCare, onNavigateAnalytics }) => {
	const bill = bills.length > 0 ? bills[0] : null;

	if (!bill) {
		return <EmptyState onAddBill={onAddBill} />;
	}

	const days = bill.billingDays || 31;
	const avgPerDay = bill.generationKwh !== null ? (bill.generationKwh / days).toFixed(1) : null;

	const retailEstimate =
		bill.estimatedTotalConsumptionKwh !== null
			? estimateRetailBill(
					bill.estimatedTotalConsumptionKwh,
					bill.billAmount,
					profile.capacityKw,
					undefined,
					{
						actualDemandCharges: bill.demandCharges,
						fppca: bill.fppca,
					}
			  )
			: null;

	const settlement = profile.settlementRateInr ? projectSettlement(bill.closingCreditKwh, profile.settlementRateInr, "FY 2026-27 (1 Apr – 31 Mar)", "31 May 2027") : null;

	// ── Scope toggle for Energy Overview (Latest Month vs All Bills) ──
	const [flowScope, setFlowScope] = useState<"month" | "all">("month");

	// ── All-time aggregates for the summary strip & all-time flow ──
	const allTimeGeneration = bills.reduce((sum, b) => sum + (b.generationKwh ?? 0), 0);
	const allTimeImport = bills.reduce((sum, b) => sum + b.importKwh, 0);
	const allTimeExport = bills.reduce((sum, b) => sum + b.exportKwh, 0);
	const allTimeDirectUse = bills.reduce((sum, b) => sum + (b.directSolarUseKwh ?? 0), 0);

	const displayGen = flowScope === "month" ? bill.generationKwh : allTimeGeneration;
	const displayImp = flowScope === "month" ? bill.importKwh : allTimeImport;
	const displayExp = flowScope === "month" ? bill.exportKwh : allTimeExport;
	const displayDirect = flowScope === "month" ? bill.directSolarUseKwh : allTimeDirectUse;

	// ── Derived home consumption & grid balance for visual flow diagram ──
	const displayHomeConsumption = flowScope === "month" ? (bill.estimatedTotalConsumptionKwh ?? (displayDirect ?? 0) + displayImp) : allTimeDirectUse + allTimeImport;

	const isNetImport = displayImp >= displayExp;
	const netGridValue = Math.abs(displayExp - displayImp);

	const solarGenSafe = displayGen ?? 0;
	const directSafe = displayDirect !== null && displayDirect !== undefined ? displayDirect : solarGenSafe > 0 ? Math.max(0, solarGenSafe - displayExp) : 0;
	const solarToHomePct = solarGenSafe > 0 ? Math.min(100, Math.max(0, Math.round((directSafe / solarGenSafe) * 100))) : 0;
	const solarToGridPct = solarGenSafe > 0 ? Math.max(0, 100 - solarToHomePct) : 0;
	const exportDays =
		flowScope === "month"
			? bill.billingDays || 31
			: Math.max(
					1,
					bills.reduce((s, b) => s + (b.billingDays || 31), 0),
				);
	const exportAvgPerDay = ((displayExp ?? 0) / exportDays).toFixed(1);

	const billCount = Math.max(1, bills.length);
	const genBillsCount = Math.max(1, bills.filter((b) => b.generationKwh !== null && b.generationKwh !== undefined).length);
	const allTimeGenAvgPerMonth = (allTimeGeneration / genBillsCount).toFixed(0);
	const allTimeHomeAvgPerMonth = (displayHomeConsumption / billCount).toFixed(0);
	const allTimeImpAvgPerMonth = (allTimeImport / billCount).toFixed(0);
	const allTimeExpAvgPerMonth = (allTimeExport / billCount).toFixed(0);

	const allTimeTotalBill = bills.reduce((sum, b) => sum + b.billAmount, 0);
	const allTimeTotalSavings = bills.reduce((sum, b) => {
		if (b.estimatedTotalConsumptionKwh === null) return sum;
		const est = estimateRetailBill(
			b.estimatedTotalConsumptionKwh,
			b.billAmount,
			profile.capacityKw,
			undefined,
			{
				actualDemandCharges: b.demandCharges,
				fppca: b.fppca,
			}
		);
		return sum + est.estimatedSavingsInr;
	}, 0);
	const hasSavingsData = bills.some((b) => b.estimatedTotalConsumptionKwh !== null);
	// Period label: oldest → newest
	const sortedBills = [...bills].sort((a, b) => new Date(a.periodStart).getTime() - new Date(b.periodStart).getTime());
	const firstPeriod = sortedBills[0]?.period ?? bill.period;
	const lastPeriod = sortedBills[sortedBills.length - 1]?.period ?? bill.period;
	const allTimePeriodLabel = bills.length === 1 ? bill.period : `${firstPeriod} – ${lastPeriod}`;

	const firstBill = sortedBills[0] ?? bill;
	const allTimeOpeningCredit = firstBill.openingCreditKwh;
	const allTimeUsedCredit = bills.reduce((sum, b) => sum + b.adjustedCreditKwh, 0);

	const displayOpeningCredit = flowScope === "month" ? bill.openingCreditKwh : allTimeOpeningCredit;
	const displayUsedCredit = flowScope === "month" ? bill.adjustedCreditKwh : allTimeUsedCredit;
	const displayClosingCredit = bill.closingCreditKwh;

	const careColor = careAssessment.state === "Good" ? COLORS.success : careAssessment.state === "Watch" ? COLORS.warning : COLORS.danger;

	return (
		<ScrollView
			style={styles.scroll}
			contentContainerStyle={styles.content}
			refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} colors={[COLORS.gold]} />}
			showsVerticalScrollIndicator={false}
		>
			{/* ─── 1. Energy Overview ─── */}
			<Card
				title="Energy Overview"
				subtitle={flowScope === "month" ? `${bill.period} (Latest Bill)` : `All Bills Total (${bills.length} bills · ${allTimePeriodLabel})`}
				badge={
					bills.length > 1 ? (
						<View style={styles.scopeToggle}>
							<TouchableOpacity id="btn-flow-scope-month" style={[styles.scopeBtn, flowScope === "month" && styles.scopeBtnActive]} onPress={() => setFlowScope("month")}>
								<Text style={[styles.scopeBtnText, flowScope === "month" && styles.scopeBtnTextActive]}>Month</Text>
							</TouchableOpacity>
							<TouchableOpacity id="btn-flow-scope-all" style={[styles.scopeBtn, flowScope === "all" && styles.scopeBtnActive]} onPress={() => setFlowScope("all")}>
								<Text style={[styles.scopeBtnText, flowScope === "all" && styles.scopeBtnTextActive]}>All ({bills.length})</Text>
							</TouchableOpacity>
						</View>
					) : (
						<Badge label={bill.period} color={COLORS.gold} />
					)
				}
			>
				<View style={styles.eoContainer}>
					{/* Row 1: Generation & Home Use */}
					<View style={styles.eoRow}>
						<View style={styles.eoStat}>
							<View style={styles.eoIconWrap}>
								<Ionicons name="sunny-outline" size={20} color="#F59E0B" />
							</View>
							<Text style={styles.eoStatLabel}>Solar generation</Text>
							<Text style={[styles.eoStatValue, { color: "#D97706" }]}>
								{displayGen !== null ? displayGen.toFixed(0) : "—"} <Text style={styles.eoStatUnit}>kWh</Text>
							</Text>
							<Text style={styles.eoStatNote}>
								{flowScope === "all"
									? `${allTimeGenAvgPerMonth} kWh/mo avg`
									: (avgPerDay ? `${avgPerDay} kWh/day avg` : "Goa meter · kWh_G")}
							</Text>
						</View>
						<View style={styles.eoStat}>
							<View style={styles.eoIconWrap}>
								<Ionicons name="home-outline" size={20} color="#10B981" />
							</View>
							<Text style={styles.eoStatLabel}>Estimated home use</Text>
							<Text style={[styles.eoStatValue, { color: "#10B981" }]}>
								{displayHomeConsumption.toFixed(0)} <Text style={styles.eoStatUnit}>kWh</Text>
							</Text>
							<Text style={styles.eoStatNote}>
								{flowScope === "all"
									? `${allTimeHomeAvgPerMonth} kWh/mo avg`
									: "Calculated estimate"}
							</Text>
						</View>
					</View>

					{/* Row 2: Import & Export */}
					<View style={styles.eoRow}>
						<View style={styles.eoStat}>
							<View style={styles.eoIconWrap}>
								<MaterialCommunityIcons name="tray-arrow-down" size={22} color={COLORS.text} />
							</View>
							<Text style={styles.eoStatLabel}>Grid import</Text>
							<Text style={[styles.eoStatValue, { color: COLORS.text }]}>
								{displayImp.toFixed(0)} <Text style={styles.eoStatUnit}>kWh</Text>
							</Text>
							{flowScope === "all" && (
								<Text style={styles.eoStatNote}>{allTimeImpAvgPerMonth} kWh/mo avg</Text>
							)}
						</View>
						<View style={styles.eoStat}>
							<View style={styles.eoIconWrap}>
								<MaterialCommunityIcons name="tray-arrow-up" size={22} color={COLORS.text} />
							</View>
							<Text style={styles.eoStatLabel}>Grid export</Text>
							<Text style={[styles.eoStatValue, { color: COLORS.text }]}>
								{displayExp.toFixed(0)} <Text style={styles.eoStatUnit}>kWh</Text>
							</Text>
							{flowScope === "all" && (
								<Text style={styles.eoStatNote}>{allTimeExpAvgPerMonth} kWh/mo avg</Text>
							)}
						</View>
					</View>

					{/* Remaining Balance */}
					<View style={styles.eoRemainingRow}>
						<View style={styles.eoRemainingIconWrap}>
							<Ionicons name="battery-charging" size={20} color="#059669" />
						</View>
						<View style={styles.eoRemainingTextCol}>
							<Text style={styles.eoRemainingLabel}>Remaining Balance</Text>
							<Text style={styles.eoRemainingSubLabel}>Carried forward to next bill</Text>
						</View>
						<Text style={styles.eoRemainingValue}>
							{displayClosingCredit}{" "}
							<Text style={styles.eoRemainingUnit}>kWh</Text>
						</Text>
					</View>
				</View>
			</Card>

			{/* ─── 2. Current Bill ─── */}
			{/* <Card
				title="Current Bill"
				subtitle={bill.dueDate ? `Due: ${bill.dueDate}${bill.billNumber ? ` · #${bill.billNumber}` : ""}` : (bill.billNumber ? `Bill #${bill.billNumber}` : bill.period)}
				badge={<Badge label={`₹${bill.billAmount.toFixed(0)}`} color={COLORS.gold} />}
			>
				<View style={styles.billBox}>
					{bill.demandCharges !== undefined && <LedgerRow label="Fixed Charges" value={`₹${bill.demandCharges.toFixed(2)}`} />}
					{bill.energyCharges !== undefined && bill.energyCharges > 0 && <LedgerRow label="Energy Charges" value={`₹${bill.energyCharges.toFixed(2)}`} />}
					{bill.fppca !== undefined && bill.fppca > 0 && <LedgerRow label="FPPCA" value={`₹${bill.fppca.toFixed(2)}`} />}
					{bill.electricityDuty !== undefined && bill.electricityDuty > 0 && <LedgerRow label="Electricity Duty" value={`₹${bill.electricityDuty.toFixed(2)}`} />}
					{bill.publicLightingDuty !== undefined && bill.publicLightingDuty > 0 && <LedgerRow label="Public Lighting Duty" value={`₹${bill.publicLightingDuty.toFixed(2)}`} />}
					{bill.rebate !== undefined && bill.rebate !== 0 && <LedgerRow label="Rebate" value={`−₹${Math.abs(bill.rebate).toFixed(2)}`} valueColor={COLORS.success} />}
					{bill.otherCharges !== undefined && bill.otherCharges !== 0 && <LedgerRow label="Other Charges" value={`₹${bill.otherCharges.toFixed(2)}`} />}
				</View>
			</Card> */}

			{/* ─── 4. Panel Care ─── */}
			<Card title="Panel Care" subtitle={`Last cleaned: ${profile.lastCleanedDate ?? "Not recorded"}`} badge={<Badge label={careAssessment.state} color={careColor} />}>
				<Text style={styles.careRationale}>{careAssessment.rationale}</Text>
				{careAssessment.recommendation ? <Text style={styles.careRecommendation}>{careAssessment.recommendation}</Text> : null}
				<ProgressBar value={100 - careAssessment.score} color={careColor} height={8} style={{ marginTop: SPACING.md }} />
				<View style={styles.progressLabels}>
					<Text style={styles.progressLabel}>Clean</Text>
					<Text style={[styles.progressLabel, { color: careColor, fontWeight: FONT.semi }]}>{100 - careAssessment.score}% health</Text>
					<Text style={styles.progressLabel}>Needs Wash</Text>
				</View>
				<View style={styles.careActions}>
					<TouchableOpacity id="btn-log-clean-home" style={styles.logCleanBtn} onPress={onLogClean} activeOpacity={0.8}>
						<Ionicons name="water-outline" size={16} color={COLORS.textInverse} />
						<Text style={styles.logCleanText}>Log Panel Wash</Text>
					</TouchableOpacity>
					<TouchableOpacity id="btn-view-care" style={styles.viewCareBtn} onPress={onNavigateCare}>
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
							<Text style={[styles.settlementVal, { color: COLORS.success, fontSize: 20 }]}>₹{settlement.projectedPayoutInr.toFixed(0)}</Text>
						</View>
					</View>
					<InfoNote text="Estimate only — actual settlement computed by EDG by 30 Apr." color={COLORS.warning} style={{ marginTop: SPACING.sm }} />
				</Card>
			) : (
				<InfoNote text="Set the APPC settlement rate in Settings to see your annual payout estimate." color={COLORS.info} />
			)}
		</ScrollView>
	);
};

// ── Sub-Components ────────────────────────────────────────────

const SummaryChip: React.FC<{ label: string; value: string; valueColor?: string }> = ({ label, value, valueColor = COLORS.text }) => (
	<View style={styles.chip}>
		<Text style={styles.chipLabel}>{label}</Text>
		<Text style={[styles.chipValue, { color: valueColor }]}>{value}</Text>
	</View>
);

const FlowTile: React.FC<{
	icon: string;
	label: string;
	value: number | null;
	unit: string;
	color: string;
	note?: string;
}> = ({ icon, label, value, unit, color, note }) => (
	<View style={[styles.flowTile, { borderTopColor: color, borderTopWidth: 3 }]}>
		<View style={styles.flowTileHeader}>
			<Ionicons name={icon as any} size={14} color={color} />
			<Text style={[styles.flowTileLabel, { color }]}>{label}</Text>
		</View>
		<Text style={styles.flowTileValue}>{value !== null ? value : "—"}</Text>
		<Text style={styles.flowTileUnit}>{value !== null ? unit : ""}</Text>
		{note && <Text style={styles.flowTileNote}>{note}</Text>}
	</View>
);

const FormulaStep: React.FC<{
	value: number;
	label: string;
	color?: string;
	highlight?: boolean;
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
		<Text style={styles.emptySub}>Add your first monthly electricity bill to begin tracking your rooftop solar production, savings, and energy credits in Goa.</Text>
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
		flexDirection: "row",
		backgroundColor: COLORS.surface,
		borderRadius: RADIUS.lg,
		borderWidth: 1,
		borderColor: COLORS.border,
		marginBottom: SPACING.md,
		...SHADOW.card,
	},
	chip: {
		flex: 1,
		alignItems: "center",
		paddingVertical: SPACING.md,
		paddingHorizontal: SPACING.xs,
	},
	chipLabel: { fontSize: 11, color: COLORS.textMuted, marginBottom: 4 },
	chipValue: { fontSize: 15, fontWeight: FONT.bold },
	stripDivider: { width: 1, backgroundColor: COLORS.border, marginVertical: SPACING.sm },

	// Scope toggle
	scopeToggle: {
		flexDirection: "row",
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

	// ── Energy Overview Flat Stats ──────────────────────────────
	eoContainer: {
		gap: SPACING.md + 2,
	},
	eoRow: {
		flexDirection: "row",
		gap: SPACING.md,
		alignItems: "flex-start",
	},
	eoStat: {
		flex: 1,
	},
	eoIconWrap: {
		height: 24,
		justifyContent: "center",
		marginBottom: 6,
	},
	eoStatLabel: {
		fontSize: 13,
		color: COLORS.textMuted,
		fontWeight: FONT.medium,
		marginBottom: 2,
	},
	eoStatValue: {
		fontSize: 26,
		fontWeight: FONT.heavy,
		letterSpacing: -0.5,
		lineHeight: 32,
	},
	eoStatUnit: {
		fontSize: 15,
		fontWeight: FONT.medium,
		color: COLORS.textMuted,
	},
	eoStatNote: {
		fontSize: 12,
		color: COLORS.textMuted,
		marginTop: 4,
	},
	eoRemainingRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		backgroundColor: "#F0FDF4",
		borderRadius: RADIUS.md,
		borderWidth: 1,
		borderColor: "#86EFAC",
		paddingVertical: 12,
		paddingHorizontal: SPACING.md,
		...SHADOW.card,
	},
	eoRemainingIconWrap: {
		width: 36,
		height: 36,
		borderRadius: 18,
		backgroundColor: "#DCFCE7",
		alignItems: "center",
		justifyContent: "center",
	},
	eoRemainingTextCol: {
		flex: 1,
	},
	eoRemainingLabel: {
		fontSize: 13,
		fontWeight: FONT.bold,
		color: "#065F46",
	},
	eoRemainingSubLabel: {
		fontSize: 11,
		color: "#059669",
		marginTop: 1,
	},
	eoRemainingValue: {
		fontSize: 22,
		fontWeight: FONT.heavy,
		color: "#065F46",
		letterSpacing: -0.5,
	},
	eoRemainingUnit: {
		fontSize: 13,
		fontWeight: FONT.medium,
		color: "#059669",
	},

	// (legacy fc* styles removed — flowchart replaced by eo* tiles)

	// Flow grid (used by older FlowTile sub-component)
	flowGrid: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: SPACING.sm,
		marginBottom: SPACING.sm,
	},
	flowTile: {
		flex: 1,
		minWidth: "46%",
		backgroundColor: COLORS.surfaceRaised,
		borderRadius: RADIUS.md,
		borderWidth: 1,
		borderColor: COLORS.border,
		padding: SPACING.md,
	},
	flowTileHeader: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: SPACING.xs },
	flowTileLabel: { fontSize: 11, fontWeight: FONT.semi },
	flowTileValue: { fontSize: 26, fontWeight: FONT.heavy, color: COLORS.text, marginTop: 2 },
	flowTileUnit: { fontSize: 12, color: COLORS.textMuted },
	flowTileNote: { fontSize: 11, color: COLORS.textMuted, marginTop: 4 },

	// placeholder to maintain style block structure
	savingsRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		backgroundColor: COLORS.glowGreen,
		borderRadius: RADIUS.md,
		padding: SPACING.sm,
		borderWidth: 1,
		borderColor: `${COLORS.success}22`,
	},
	savingsText: { fontSize: 13, color: COLORS.textSub, flex: 1 },

	// Energy bank (integrated in Energy Overview)
	bankContainer: {
		backgroundColor: "#F8FAFC",
		borderRadius: 16,
		borderWidth: 1,
		borderColor: "#E2E8F0",
		padding: 12,
		marginTop: 8,
	},
	bankHeaderRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginBottom: 10,
	},
	bankTitleGroup: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		flex: 1,
	},
	bankIconWrap: {
		width: 32,
		height: 32,
		borderRadius: 16,
		backgroundColor: "#DCFCE7",
		alignItems: "center",
		justifyContent: "center",
	},
	bankTitleText: {
		fontSize: 14,
		fontWeight: FONT.bold,
		color: "#0F172A",
	},
	bankSubtitleText: {
		fontSize: 11,
		color: "#64748B",
		marginTop: 1,
	},
	bankHeroBadge: {
		alignItems: "flex-end",
	},
	bankHeroVal: {
		fontSize: 20,
		fontWeight: FONT.heavy,
		color: COLORS.bank,
		letterSpacing: -0.3,
	},
	bankHeroUnit: {
		fontSize: 12,
		fontWeight: FONT.semi,
		color: "#64748B",
	},
	bankHeroSub: {
		fontSize: 10,
		color: "#64748B",
		marginTop: 1,
	},
	formulaRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		backgroundColor: "#FFFFFF",
		borderRadius: RADIUS.md,
		paddingVertical: 8,
		paddingHorizontal: 8,
		borderWidth: 1,
		borderColor: "#E2E8F0",
	},
	formulaStep: { alignItems: "center", flex: 1 },
	formulaStepHighlight: {
		backgroundColor: COLORS.glowGold,
		borderRadius: RADIUS.sm,
		borderWidth: 1,
		borderColor: `${COLORS.gold}33`,
		paddingVertical: 4,
	},
	formulaValue: { fontSize: 14, fontWeight: FONT.heavy, color: COLORS.text },
	formulaLabel: { fontSize: 10, color: COLORS.textMuted, marginTop: 2 },
	formulaOp: { fontSize: 12, color: COLORS.textMuted, fontWeight: FONT.bold, paddingHorizontal: 1 },

	// Bill breakdown
	billBox: {
		backgroundColor: COLORS.surfaceRaised,
		borderRadius: RADIUS.md,
		borderWidth: 1,
		borderColor: COLORS.border,
		paddingHorizontal: SPACING.md,
		paddingVertical: 4,
	},

	// Care
	careRationale: { fontSize: 14, color: COLORS.textSub, lineHeight: 21, marginBottom: 4 },
	careRecommendation: { fontSize: 13, color: COLORS.textMuted, lineHeight: 19, fontStyle: "italic" },
	progressLabels: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
	progressLabel: { fontSize: 11, color: COLORS.textMuted },
	careActions: { flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.md },
	logCleanBtn: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
		backgroundColor: COLORS.gold,
		padding: 12,
		borderRadius: RADIUS.md,
		elevation: 1,
	},
	logCleanText: { fontSize: 14, fontWeight: FONT.bold, color: COLORS.textInverse },
	viewCareBtn: {
		paddingHorizontal: 14,
		justifyContent: "center",
		alignItems: "center",
		borderRadius: RADIUS.md,
		borderWidth: 1,
		borderColor: COLORS.border,
	},
	viewCareText: { fontSize: 13, color: COLORS.textSub, fontWeight: FONT.semi },

	// Settlement
	settlementRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		backgroundColor: COLORS.surfaceRaised,
		borderRadius: RADIUS.md,
		borderWidth: 1,
		borderColor: COLORS.border,
		padding: SPACING.md,
	},
	settlementCol: { alignItems: "center", flex: 1 },
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
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		padding: SPACING.xl,
		gap: SPACING.md,
	},
	emptyIconWrap: {
		width: 80,
		height: 80,
		borderRadius: 40,
		backgroundColor: COLORS.glowGold,
		borderWidth: 1,
		borderColor: `${COLORS.gold}33`,
		justifyContent: "center",
		alignItems: "center",
	},
	emptyTitle: { fontSize: 22, fontWeight: FONT.heavy, color: COLORS.text, textAlign: "center" },
	emptySub: { fontSize: 14, color: COLORS.textMuted, textAlign: "center", lineHeight: 21 },
	emptyAddBtn: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		backgroundColor: COLORS.gold,
		paddingHorizontal: SPACING.xl,
		paddingVertical: 14,
		borderRadius: RADIUS.full,
		...SHADOW.glow,
	},
	emptyAddBtnText: { fontSize: 15, fontWeight: FONT.bold, color: COLORS.textInverse },
	emptySeedBtn: {
		paddingVertical: 10,
	},
	emptySeedText: { fontSize: 13, color: COLORS.textMuted, textDecorationLine: "underline" },
});
