// ============================================================
// Home Screen — Minimal, Clean, and Intuitive Layout
// ============================================================
import React, { useState, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { SolarBill, SystemProfile, CareAssessment } from "../types/solar";
import { Card, Badge, ProgressBar, LedgerRow } from "../components/ui/UIKit";
import { projectSettlement } from "../domain/tariffEngine";
import { COLORS, SPACING, RADIUS, FONT, SHADOW } from "../constants/theme";

const formatMonthShort = (period: string) => {
	const parts = period.trim().split(" ");
	if (parts.length >= 2) {
		const month = parts[0].slice(0, 3);
		const yr = parts[1].length === 4 ? parts[1].slice(2) : parts[1];
		return `${month} '${yr}`;
	}
	return period;
};

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
	bills,
	profile,
	careAssessment,
	isRefreshing,
	onRefresh,
	onAddBill,
	onLogClean,
	onNavigateCare,
	onNavigateAnalytics,
}) => {
	// ── Scope toggle for Energy Overview (Latest Month vs All Bills) ──
	const [flowScope, setFlowScope] = useState<"month" | "all">("month");
	const [activeCompareTab, setActiveCompareTab] = useState<"home" | "export">("home");
	const [showBreakdown, setShowBreakdown] = useState(false);
	const [selectedGraphBillId, setSelectedGraphBillId] = useState<string | null>(null);

	// Chronological bills for generation graph (oldest -> newest)
	const sortedBills = useMemo(() => {
		return [...bills].sort((a, b) => new Date(a.periodStart).getTime() - new Date(b.periodStart).getTime());
	}, [bills]);

	const chronologicalBills = useMemo(() => {
		return sortedBills.filter((b) => b.generationKwh !== null && b.generationKwh !== undefined);
	}, [sortedBills]);

	const maxGenValue = useMemo(() => {
		if (chronologicalBills.length === 0) return 600;
		const max = Math.max(...chronologicalBills.map((b) => b.generationKwh ?? 0));
		return Math.max(max, 100);
	}, [chronologicalBills]);

	const bestBill = useMemo(() => {
		if (chronologicalBills.length === 0) return null;
		return [...chronologicalBills].sort((a, b) => (b.generationKwh ?? 0) - (a.generationKwh ?? 0))[0];
	}, [chronologicalBills]);

	const activeGraphBill = useMemo(() => {
		if (chronologicalBills.length === 0) return null;
		if (selectedGraphBillId) {
			return chronologicalBills.find((b) => b.id === selectedGraphBillId) ?? chronologicalBills[chronologicalBills.length - 1];
		}
		return chronologicalBills[chronologicalBills.length - 1];
	}, [chronologicalBills, selectedGraphBillId]);

	const bill = bills.length > 0 ? bills[0] : null;

	if (!bill) {
		return <EmptyState onAddBill={onAddBill} />;
	}

	const days = bill.billingDays || 31;
	const avgPerDay = bill.generationKwh !== null ? (bill.generationKwh / days).toFixed(1) : null;

	const settlement = profile.settlementRateInr
		? projectSettlement(bill.closingCreditKwh, profile.settlementRateInr, "FY 2026-27 (1 Apr – 31 Mar)", "31 May 2027")
		: null;

	// ── Aggregates ──
	const allTimeGeneration = bills.reduce((sum, b) => sum + (b.generationKwh ?? 0), 0);
	const allTimeImport = bills.reduce((sum, b) => sum + b.importKwh, 0);
	const allTimeExport = bills.reduce((sum, b) => sum + b.exportKwh, 0);
	const allTimeDirectUse = bills.reduce((sum, b) => sum + (b.directSolarUseKwh ?? 0), 0);

	const displayGen = flowScope === "month" ? bill.generationKwh : allTimeGeneration;
	const displayImp = flowScope === "month" ? bill.importKwh : allTimeImport;
	const displayExp = flowScope === "month" ? bill.exportKwh : allTimeExport;
	const displayDirect = flowScope === "month" ? bill.directSolarUseKwh : allTimeDirectUse;

	// ── Derived home consumption & solar self-sufficiency ──
	const displayHomeConsumption =
		flowScope === "month"
			? (bill.estimatedTotalConsumptionKwh ?? (displayDirect ?? 0) + displayImp)
			: allTimeDirectUse + allTimeImport;

	const directSolarUse =
		displayGen !== null && displayGen > 0 ? Math.max(0, displayGen - displayExp) : (displayDirect ?? 0);

	const selfSufficiencyPct =
		displayHomeConsumption > 0
			? Math.min(100, Math.max(0, Math.round((directSolarUse / displayHomeConsumption) * 100)))
			: 0;

	const billCount = Math.max(1, bills.length);
	const genBillsCount = Math.max(1, bills.filter((b) => b.generationKwh !== null && b.generationKwh !== undefined).length);
	const allTimeGenAvgPerMonth = (allTimeGeneration / genBillsCount).toFixed(0);
	const allTimeHomeAvgPerMonth = (displayHomeConsumption / billCount).toFixed(0);

	const remainingBankedKwh = Math.max(0, displayExp - displayImp);
	const netGridKwh = displayExp - displayImp;
	const energyDistTotal = displayHomeConsumption + remainingBankedKwh;
	const homeUsagePct = energyDistTotal > 0 ? Math.round((displayHomeConsumption / energyDistTotal) * 100) : 0;
	const bankedSharePct = energyDistTotal > 0 ? Math.max(0, 100 - homeUsagePct) : 0;

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
				subtitle={flowScope === "month" ? `${bill.period} · Latest Bill` : `Total of ${bills.length} billing periods`}
				style={styles.cardSpacing}
				badge={
					bills.length > 1 ? (
						<View style={styles.scopeToggle}>
							<TouchableOpacity
								id="btn-flow-scope-month"
								style={[styles.scopeBtn, flowScope === "month" && styles.scopeBtnActive]}
								onPress={() => setFlowScope("month")}
							>
								<Text style={[styles.scopeBtnText, flowScope === "month" && styles.scopeBtnTextActive]}>Month</Text>
							</TouchableOpacity>
							<TouchableOpacity
								id="btn-flow-scope-all"
								style={[styles.scopeBtn, flowScope === "all" && styles.scopeBtnActive]}
								onPress={() => setFlowScope("all")}
							>
								<Text style={[styles.scopeBtnText, flowScope === "all" && styles.scopeBtnTextActive]}>All ({bills.length})</Text>
							</TouchableOpacity>
						</View>
					) : (
						<Badge label={bill.period} color={COLORS.gold} />
					)
				}
			>
				<View style={styles.eoContainer}>
					{/* Row 1: Generation & Home Use (Spacious Tiles with Icons) */}
					<View style={styles.eoRow}>
						<View style={styles.eoTile}>
							<View style={styles.eoTileHeader}>
								<View style={[styles.eoIconBadge, { backgroundColor: "#FEF3C7" }]}>
									<Ionicons name="sunny" size={16} color="#D97706" />
								</View>
								<Text style={styles.eoTileLabel} numberOfLines={1}>Solar Generated</Text>
							</View>
							<View style={styles.eoTileValueRow}>
								<Text style={[styles.eoTileValue, { color: "#D97706" }]}>
									{displayGen !== null ? displayGen.toFixed(0) : "—"}
								</Text>
								<Text style={styles.eoTileUnit}>kWh</Text>
							</View>
							<Text style={styles.eoTileNote}>
								{flowScope === "all"
									? `${allTimeGenAvgPerMonth} kWh/mo avg`
									: (avgPerDay ? `${avgPerDay} kWh/day` : "Goa meter reading")}
							</Text>
						</View>

						<View style={styles.eoTile}>
							<View style={styles.eoTileHeader}>
								<View style={[styles.eoIconBadge, { backgroundColor: "#DCFCE7" }]}>
									<Ionicons name="home" size={16} color="#059669" />
								</View>
								<Text style={styles.eoTileLabel} numberOfLines={1}>Home Consumed</Text>
							</View>
							<View style={styles.eoTileValueRow}>
								<Text style={[styles.eoTileValue, { color: "#059669" }]}>
									{displayHomeConsumption.toFixed(0)}
								</Text>
								<Text style={styles.eoTileUnit}>kWh</Text>
							</View>
							<Text style={styles.eoTileNote}>
								{flowScope === "all" ? `${allTimeHomeAvgPerMonth} kWh/mo avg` : `${selfSufficiencyPct}% from solar`}
							</Text>
						</View>
					</View>

					{/* ── Interactive Energy Distribution Flow ── */}
					<View style={styles.eoFlowCard}>
						<View style={styles.eoFlowHeader}>
							<View style={{ flex: 1, marginRight: SPACING.sm }}>
								<Text style={styles.eoFlowTitle}>Energy Distribution</Text>
								<Text style={styles.eoFlowSubtitle} numberOfLines={1}>
									Home consumption vs. bank storage grid
								</Text>
							</View>
							<TouchableOpacity
								activeOpacity={0.7}
								onPress={() => setActiveCompareTab(activeCompareTab === "home" ? "export" : "home")}
								style={[
									styles.eoFlowBadge,
									activeCompareTab === "export" && {
										backgroundColor: "#E0F2FE",
										borderColor: "#BAE6FD",
									},
								]}
							>
								<Text
									style={[
										styles.eoFlowBadgeText,
										activeCompareTab === "export" && { color: "#0284C7" },
									]}
								>
									{activeCompareTab === "home" ? `${homeUsagePct}% Home Use` : `${bankedSharePct}% Sent to Bank`}
								</Text>
							</TouchableOpacity>
						</View>

						{/* Dual-color Split Bar (Tap to select) */}
						<View style={styles.eoFlowTrack}>
							<TouchableOpacity
								id="btn-eo-track-home"
								activeOpacity={0.8}
								onPress={() => setActiveCompareTab("home")}
								style={[
									styles.eoFlowSegmentHome,
									{ flex: Math.max(0.05, displayHomeConsumption) },
									activeCompareTab === "export" && { opacity: 0.45 },
								]}
							/>
							<TouchableOpacity
								id="btn-eo-track-export"
								activeOpacity={0.8}
								onPress={() => setActiveCompareTab("export")}
								style={[
									styles.eoFlowSegmentExport,
									{ flex: Math.max(0.05, remainingBankedKwh) },
									activeCompareTab === "home" && { opacity: 0.45 },
								]}
							/>
						</View>

						{/* Interactive Pill Tabs */}
						<View style={styles.eoFlowTabsRow}>
							<TouchableOpacity
								id="btn-eo-select-home"
								activeOpacity={0.7}
								onPress={() => setActiveCompareTab("home")}
								style={[
									styles.eoFlowTab,
									activeCompareTab === "home" && styles.eoFlowTabActiveHome,
								]}
							>
								<View style={styles.eoFlowTabHeader}>
									<View style={[styles.eoFlowTabDot, { backgroundColor: "#059669" }]} />
									<Text style={styles.eoFlowTabLabel} numberOfLines={1}>Used by Home</Text>
								</View>
								<View style={styles.eoFlowTabValRow}>
									<Text style={[styles.eoFlowTabVal, activeCompareTab === "home" && { color: "#065F46" }]}>
										{displayHomeConsumption.toFixed(0)}
									</Text>
									<Text style={styles.eoFlowTabUnit}>kWh</Text>
									<Text style={styles.eoFlowTabShare}>({homeUsagePct}%)</Text>
								</View>
							</TouchableOpacity>

							<TouchableOpacity
								id="btn-eo-select-export"
								activeOpacity={0.7}
								onPress={() => setActiveCompareTab("export")}
								style={[
									styles.eoFlowTab,
									activeCompareTab === "export" && styles.eoFlowTabActiveExport,
								]}
							>
								<View style={styles.eoFlowTabHeader}>
									<View style={[styles.eoFlowTabDot, { backgroundColor: "#0284C7" }]} />
									<Text style={styles.eoFlowTabLabel} numberOfLines={1}>Sent to Bank</Text>
								</View>
								<View style={styles.eoFlowTabValRow}>
									<Text style={[styles.eoFlowTabVal, activeCompareTab === "export" && { color: "#0369A1" }]}>
										{remainingBankedKwh.toFixed(0)}
									</Text>
									<Text style={styles.eoFlowTabUnit}>kWh</Text>
									<Text style={styles.eoFlowTabShare}>({bankedSharePct}%)</Text>
								</View>
							</TouchableOpacity>
						</View>

						{/* Dynamic Contextual Detail Banner */}
						<View
							style={[
								styles.eoFlowCallout,
								activeCompareTab === "home" ? styles.eoFlowCalloutHome : styles.eoFlowCalloutExport,
							]}
						>
							<Ionicons
								name={activeCompareTab === "home" ? "home-outline" : "battery-charging-outline"}
								size={14}
								color={activeCompareTab === "home" ? "#059669" : "#0284C7"}
							/>
							<Text style={styles.eoFlowCalloutText} numberOfLines={2}>
								{activeCompareTab === "home"
									? `Direct solar (${directSolarUse.toFixed(0)} kWh) covers ${selfSufficiencyPct}% of home use · ${displayImp.toFixed(0)} kWh drawn from grid`
									: `${displayExp.toFixed(0)} kWh export − ${displayImp.toFixed(0)} kWh import = ${remainingBankedKwh.toFixed(0)} kWh net surplus stored in grid`}
							</Text>
						</View>
					</View>

					{/* ── Expandable Energy Ledger Drawer ── */}
					<View style={styles.ledgerSection}>
						<TouchableOpacity
							id="btn-toggle-energy-ledger"
							style={styles.expandLedgerBtn}
							onPress={() => setShowBreakdown(!showBreakdown)}
							activeOpacity={0.7}
						>
							<View style={styles.expandLedgerLeft}>
								<Ionicons name="receipt-outline" size={15} color={COLORS.textSub} />
								<Text style={styles.expandLedgerText}>
									{showBreakdown ? "Hide Full Energy Ledger" : "View Full Energy Ledger"}
								</Text>
							</View>
							<View style={styles.expandLedgerRight}>
								<Text style={styles.expandLedgerHint}>
									{showBreakdown ? "Less" : "Audit"}
								</Text>
								<Ionicons
									name={showBreakdown ? "chevron-up" : "chevron-down"}
									size={15}
									color={COLORS.textMuted}
								/>
							</View>
						</TouchableOpacity>

						{showBreakdown && (
							<View style={styles.ledgerDrawer}>
								<LedgerRow
									label="Solar Generation"
									value={`${(displayGen ?? 0).toFixed(0)} kWh`}
									valueColor="#D97706"
								/>
								<LedgerRow
									label="Direct Daytime Solar Used"
									value={`${directSolarUse.toFixed(0)} kWh`}
									valueColor="#059669"
								/>
								<LedgerRow
									label="Grid Power Imported"
									value={`${displayImp.toFixed(0)} kWh`}
									valueColor={COLORS.text}
								/>
								<LedgerRow
									label="Total Home Consumption"
									value={`${displayHomeConsumption.toFixed(0)} kWh`}
									valueColor="#059669"
								/>
								<LedgerRow
									label="Gross Solar Exported"
									value={`${displayExp.toFixed(0)} kWh`}
									valueColor="#0284C7"
								/>
								<LedgerRow
									label="Net Surplus This Cycle"
									value={`${netGridKwh >= 0 ? `+${remainingBankedKwh.toFixed(0)}` : `-${Math.abs(netGridKwh).toFixed(0)}`} kWh`}
									valueColor={netGridKwh >= 0 ? COLORS.success : COLORS.warning}
								/>
								<LedgerRow
									label="Banked Energy Credit Balance"
									value={`${displayClosingCredit} kWh`}
									valueColor="#0284C7"
								/>
								<LedgerRow
									label="Solar Self-Sufficiency"
									value={`${selfSufficiencyPct}%`}
									valueColor={COLORS.success}
								/>
							</View>
						)}
					</View>
				</View>
			</Card>

			{/* ─── 2. Generation Graph ─── */}
			{chronologicalBills.length > 0 && (
				<Card
					title="Solar Generation"
					subtitle={
						chronologicalBills.length > 1
							? `${chronologicalBills.length} billing cycles · Avg ${allTimeGenAvgPerMonth} kWh/mo`
							: `${bill.period} · Latest billing reading`
					}
					style={styles.cardSpacing}
					badge={
						bestBill?.generationKwh ? (
							<Badge label={`Peak ${bestBill.generationKwh.toFixed(0)} kWh`} color={COLORS.gold} />
						) : undefined
					}
				>
					{/* Visual Bar Graph */}
					<View style={styles.chartContainer}>
						{/* Average Benchmark Line (shown if 2+ bills) */}
						{chronologicalBills.length > 1 && (
							<View
								style={[
									styles.chartAvgLine,
									{
										bottom: `${Math.min(88, Math.max(16, (Number(allTimeGenAvgPerMonth) / maxGenValue) * 100))}%`,
									},
								]}
							>
								<View style={styles.chartAvgDashes} />
								<Text style={styles.chartAvgText}>Avg {allTimeGenAvgPerMonth} kWh</Text>
							</View>
						)}

						{/* Bars Row */}
						<View style={styles.chartBarsRow}>
							{chronologicalBills.map((b) => {
								const isSelected = activeGraphBill?.id === b.id;
								const genVal = b.generationKwh ?? 0;
								const heightPct = Math.min(100, Math.max(14, Math.round((genVal / maxGenValue) * 100)));
								const bDays = b.billingDays || 31;
								const dayRate = (genVal / bDays).toFixed(1);

								return (
									<TouchableOpacity
										key={b.id}
										id={`btn-graph-bar-${b.id}`}
										activeOpacity={0.75}
										onPress={() => setSelectedGraphBillId(b.id)}
										style={styles.chartBarCol}
									>
										{/* Value text above bar */}
										<Text style={[styles.chartBarValText, isSelected && styles.chartBarValTextActive]}>
											{genVal.toFixed(0)}
										</Text>

										{/* Bar track and fill */}
										<View style={[styles.chartBarTrack, isSelected && styles.chartBarTrackActive]}>
											<View
												style={[
													styles.chartBarFill,
													{ height: `${heightPct}%` },
													isSelected ? styles.chartBarFillActive : styles.chartBarFillInactive,
												]}
											/>
										</View>

										{/* X Axis Month Label */}
										<Text style={[styles.chartBarMonthText, isSelected && styles.chartBarMonthTextActive]}>
											{formatMonthShort(b.period)}
										</Text>
										<Text style={styles.chartBarDayRateText}>{dayRate}/d</Text>
									</TouchableOpacity>
								);
							})}
						</View>
					</View>

					{/* Selected Month Interactive Detail Pill */}
					{activeGraphBill && (
						<View style={styles.chartDetailPill}>
							<View style={styles.chartDetailPillLeft}>
								<View style={styles.chartDetailIconWrap}>
									<Ionicons name="sunny" size={15} color="#D97706" />
								</View>
								<View>
									<Text style={styles.chartDetailPillTitle}>
										{activeGraphBill.period}:{" "}
										<Text style={styles.chartDetailPillHighlight}>
											{activeGraphBill.generationKwh?.toFixed(0)} kWh
										</Text>
									</Text>
									<Text style={styles.chartDetailPillSub}>
										{((activeGraphBill.generationKwh ?? 0) / (activeGraphBill.billingDays || 31)).toFixed(1)} kWh/day · {activeGraphBill.billingDays || 31} days
									</Text>
								</View>
							</View>
							{activeGraphBill.exportKwh > 0 && (
								<View style={styles.chartDetailPillRight}>
									<Text style={styles.chartDetailExportLabel}>Exported</Text>
									<Text style={styles.chartDetailExportVal}>{activeGraphBill.exportKwh.toFixed(0)} kWh</Text>
								</View>
							)}
						</View>
					)}
				</Card>
			)}

			{/* ─── 3. Panel Care ─── */}
			<Card
				title="Panel Care"
				subtitle={`Last cleaned: ${profile.lastCleanedDate ?? "Not recorded"}`}
				style={styles.cardSpacing}
				badge={<Badge label={careAssessment.state} color={careColor} />}
			>
				<View style={styles.careContainer}>
					<Text style={styles.careRationale}>{careAssessment.rationale}</Text>
					{careAssessment.recommendation ? (
						<Text style={styles.careRecommendation}>{careAssessment.recommendation}</Text>
					) : null}

					<ProgressBar value={100 - careAssessment.score} color={careColor} height={7} style={{ marginTop: SPACING.xs }} />

					<View style={styles.progressLabels}>
						<Text style={styles.progressLabel}>Clean</Text>
						<Text style={[styles.progressLabel, { color: careColor, fontWeight: FONT.semi }]}>
							{100 - careAssessment.score}% health
						</Text>
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
				</View>
			</Card>

			{/* ─── 4. Banked Credit & Annual Settlement ─── */}
			<Card
				title="Banked Credit & Settlement"
				subtitle="FY 2026-27 · JERC Net Metering"
				style={styles.cardSpacing}
				badge={<Badge label={settlement ? "Settles 31 May" : "Annual Settlement"} color={COLORS.info} />}
			>
				<View style={styles.settlementCard}>
					{/* Banked Energy Balance */}
					<View style={styles.settlementBankedRow}>
						<View style={styles.settlementIconWrap}>
							<Ionicons name="battery-charging" size={18} color="#059669" />
						</View>
						<View style={styles.settlementBankedCol}>
							<Text style={styles.settlementBankedLabel}>Banked Credit Balance</Text>
							<Text style={styles.settlementBankedSub} numberOfLines={1}>
								{displayExp.toFixed(0)} export − {displayImp.toFixed(0)} import = +{remainingBankedKwh.toFixed(0)} kWh this bill
							</Text>
						</View>
						<View style={styles.settlementBankedValWrap}>
							<Text style={styles.settlementBankedVal}>
								{displayClosingCredit}{" "}
								<Text style={styles.settlementBankedUnit}>kWh</Text>
							</Text>
						</View>
					</View>

					{/* Settlement Projection / Rate Details */}
					{settlement ? (
						<View style={styles.settlementPayoutBlock}>
							<View style={styles.settlementDivider} />
							<View style={styles.settlementMetricsRow}>
								<View style={styles.settlementMetricCol}>
									<Text style={styles.settlementDetailLabel}>Projected Payout</Text>
									<Text style={styles.settlementPayoutVal}>₹{settlement.projectedPayoutInr.toFixed(0)}</Text>
								</View>
								<View style={[styles.settlementMetricCol, { alignItems: "center" }]}>
									<Text style={styles.settlementDetailLabel}>APPC Rate</Text>
									<Text style={styles.settlementDetailVal}>₹{settlement.ratePerKwh}/kWh</Text>
								</View>
								<View style={[styles.settlementMetricCol, { alignItems: "flex-end" }]}>
									<Text style={styles.settlementDetailLabel}>Settlement Date</Text>
									<Text style={styles.settlementDetailVal}>31 May 2027</Text>
								</View>
							</View>
						</View>
					) : (
						<View style={styles.settlementPromptBlock}>
							<View style={styles.settlementDivider} />
							<View style={styles.settlementPromptRow}>
								<Ionicons name="information-circle-outline" size={16} color={COLORS.info} />
								<Text style={styles.settlementPromptText}>
									Set your APPC settlement rate in Settings to calculate your projected annual cash payout for these {displayClosingCredit} banked units.
								</Text>
							</View>
						</View>
					)}
				</View>

				<Text style={styles.settlementFootnote}>
					Net surplus units carry forward across billing cycles and are settled annually by Electricity Department Goa under JERC net metering regulations.
				</Text>
			</Card>
		</ScrollView>
	);
};

const EmptyState: React.FC<{
	onAddBill: () => void;
}> = ({ onAddBill }) => (
	<View style={styles.emptyContainer}>
		<View style={styles.emptyIconWrap}>
			<Ionicons name="sunny-outline" size={44} color={COLORS.gold} />
		</View>
		<Text style={styles.emptyTitle}>Welcome to Goa SolarTrack</Text>
		<Text style={styles.emptySub}>
			Add your first monthly electricity bill to begin tracking rooftop solar production, savings, and energy credits in Goa.
		</Text>
		<TouchableOpacity id="btn-add-bill-empty" style={styles.emptyAddBtn} onPress={onAddBill}>
			<Ionicons name="add-circle" size={18} color={COLORS.textInverse} />
			<Text style={styles.emptyAddBtnText}>Add Monthly Bill</Text>
		</TouchableOpacity>
	</View>
);

// ── Styles ────────────────────────────────────────────────────
const styles = StyleSheet.create({
	scroll: {
		flex: 1,
		backgroundColor: COLORS.background,
	},
	content: {
		padding: SPACING.md,
		paddingBottom: SPACING.xxl + 24,
	},
	cardSpacing: {
		marginBottom: SPACING.lg,
	},

	// Scope toggle
	scopeToggle: {
		flexDirection: "row",
		backgroundColor: "#F1F5F9",
		borderRadius: RADIUS.full,
		padding: 2,
		borderWidth: 1,
		borderColor: "#E2E8F0",
	},
	scopeBtn: {
		paddingHorizontal: 10,
		paddingVertical: 3,
		borderRadius: RADIUS.full,
	},
	scopeBtnActive: {
		backgroundColor: COLORS.card,
		...SHADOW.card,
	},
	scopeBtnText: {
		fontSize: 11,
		fontWeight: FONT.medium,
		color: COLORS.textMuted,
	},
	scopeBtnTextActive: {
		color: COLORS.text,
		fontWeight: FONT.bold,
	},

	// ── Energy Overview (Refactored Clean Hierarchy) ──────────
	eoContainer: {
		gap: SPACING.md - 2,
	},
	// 2 Spacious Metric Tiles with Icons
	eoRow: {
		flexDirection: "row",
		gap: SPACING.sm + 2,
	},
	eoTile: {
		flex: 1,
		backgroundColor: "#F8FAFC",
		borderRadius: RADIUS.md,
		borderWidth: 1,
		borderColor: "#EEF2F6",
		paddingVertical: 12,
		paddingHorizontal: 14,
	},
	eoTileHeader: {
		flexDirection: "row",
		alignItems: "center",
		gap: 7,
		marginBottom: 6,
	},
	eoIconBadge: {
		width: 28,
		height: 28,
		borderRadius: 14,
		alignItems: "center",
		justifyContent: "center",
	},
	eoTileLabel: {
		fontSize: 12,
		fontWeight: FONT.medium,
		color: COLORS.textSub,
		flex: 1,
	},
	eoTileValueRow: {
		flexDirection: "row",
		alignItems: "baseline",
		gap: 4,
	},
	eoTileValue: {
		fontSize: 23,
		fontWeight: FONT.heavy,
		letterSpacing: -0.5,
		lineHeight: 28,
	},
	eoTileUnit: {
		fontSize: 12,
		fontWeight: FONT.semi,
		color: COLORS.textMuted,
	},
	eoTileNote: {
		fontSize: 11,
		color: COLORS.textMuted,
		marginTop: 3,
	},


	// Interactive Flow Section
	eoFlowCard: {
		backgroundColor: "#F8FAFC",
		borderRadius: RADIUS.md,
		borderWidth: 1,
		borderColor: "#EEF2F6",
		paddingVertical: 12,
		paddingHorizontal: 12,
	},
	eoFlowHeader: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginBottom: 8,
	},
	eoFlowTitle: {
		fontSize: 13,
		fontWeight: FONT.bold,
		color: COLORS.text,
	},
	eoFlowSubtitle: {
		fontSize: 11,
		color: COLORS.textMuted,
		marginTop: 1,
	},
	eoFlowBadge: {
		backgroundColor: "#ECFDF5",
		paddingHorizontal: 8,
		paddingVertical: 3,
		borderRadius: RADIUS.full,
		borderWidth: 1,
		borderColor: "#A7F3D0",
	},
	eoFlowBadgeText: {
		fontSize: 11,
		fontWeight: FONT.bold,
		color: "#059669",
	},
	eoFlowTrack: {
		flexDirection: "row",
		height: 10,
		gap: 3,
		width: "100%",
		borderRadius: 5,
		overflow: "hidden",
		marginBottom: 10,
	},
	eoFlowSegmentHome: {
		backgroundColor: "#059669",
		borderRadius: 4,
		height: "100%",
	},
	eoFlowSegmentExport: {
		backgroundColor: "#0284C7",
		borderRadius: 4,
		height: "100%",
	},
	eoFlowTabsRow: {
		flexDirection: "row",
		gap: 8,
		marginBottom: 8,
	},
	eoFlowTab: {
		flex: 1,
		backgroundColor: COLORS.surface,
		borderRadius: RADIUS.sm,
		borderWidth: 1,
		borderColor: COLORS.border,
		paddingVertical: 7,
		paddingHorizontal: 9,
	},
	eoFlowTabActiveHome: {
		backgroundColor: "#F0FDF4",
		borderColor: "#86EFAC",
	},
	eoFlowTabActiveExport: {
		backgroundColor: "#F0F9FF",
		borderColor: "#BAE6FD",
	},
	eoFlowTabHeader: {
		flexDirection: "row",
		alignItems: "center",
		gap: 5,
		marginBottom: 2,
	},
	eoFlowTabDot: {
		width: 7,
		height: 7,
		borderRadius: 3.5,
	},
	eoFlowTabLabel: {
		fontSize: 11,
		fontWeight: FONT.medium,
		color: COLORS.textMuted,
		flex: 1,
	},
	eoFlowTabValRow: {
		flexDirection: "row",
		alignItems: "baseline",
		gap: 3,
	},
	eoFlowTabVal: {
		fontSize: 15,
		fontWeight: FONT.heavy,
		color: COLORS.text,
	},
	eoFlowTabUnit: {
		fontSize: 10,
		color: COLORS.textMuted,
		fontWeight: FONT.medium,
	},
	eoFlowTabShare: {
		fontSize: 11,
		fontWeight: FONT.semi,
		color: COLORS.textSub,
		marginLeft: "auto",
	},
	eoFlowCallout: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		paddingVertical: 6,
		paddingHorizontal: 8,
		borderRadius: RADIUS.sm - 2,
	},
	eoFlowCalloutHome: {
		backgroundColor: "#F0FDF4",
	},
	eoFlowCalloutExport: {
		backgroundColor: "#F0F9FF",
	},
	eoFlowCalloutText: {
		fontSize: 11,
		color: COLORS.textSub,
		flex: 1,
		lineHeight: 14,
	},

	// Expandable Ledger Drawer
	ledgerSection: {
		marginTop: 2,
	},
	expandLedgerBtn: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingVertical: 8,
		paddingHorizontal: 6,
	},
	expandLedgerLeft: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
	},
	expandLedgerText: {
		fontSize: 12,
		fontWeight: FONT.semi,
		color: COLORS.textSub,
	},
	expandLedgerRight: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
	},
	expandLedgerHint: {
		fontSize: 11,
		color: COLORS.textMuted,
	},
	ledgerDrawer: {
		backgroundColor: "#F8FAFC",
		borderRadius: RADIUS.md,
		paddingVertical: 8,
		paddingHorizontal: 12,
		borderWidth: 1,
		borderColor: "#EEF2F6",
		marginTop: 4,
	},

	// ── Generation Graph Card ───────────────────────────────────
	chartContainer: {
		height: 175,
		marginTop: SPACING.xs,
		marginBottom: 2,
		position: "relative",
		justifyContent: "flex-end",
	},
	chartAvgLine: {
		position: "absolute",
		left: 0,
		right: 0,
		flexDirection: "row",
		alignItems: "center",
		zIndex: 2,
	},
	chartAvgDashes: {
		flex: 1,
		height: 1,
		borderStyle: "dashed",
		borderWidth: 1,
		borderColor: "#F59E0B88",
	},
	chartAvgText: {
		fontSize: 10,
		fontWeight: FONT.semi,
		color: "#D97706",
		backgroundColor: "#FFFBEB",
		paddingHorizontal: 6,
		paddingVertical: 1,
		borderRadius: RADIUS.full,
		borderWidth: 1,
		borderColor: "#FDE68A",
		marginLeft: 4,
	},
	chartBarsRow: {
		flexDirection: "row",
		alignItems: "flex-end",
		justifyContent: "space-around",
		height: 140,
		paddingTop: 20,
		borderBottomWidth: 1,
		borderBottomColor: "#E2E8F0",
	},
	chartBarCol: {
		flex: 1,
		alignItems: "center",
		height: "100%",
		justifyContent: "flex-end",
		paddingHorizontal: 2,
	},
	chartBarValText: {
		fontSize: 11,
		fontWeight: FONT.semi,
		color: COLORS.textMuted,
		marginBottom: 4,
	},
	chartBarValTextActive: {
		color: "#D97706",
		fontWeight: FONT.bold,
		fontSize: 12,
	},
	chartBarTrack: {
		width: 32,
		height: 92,
		backgroundColor: "#F1F5F9",
		borderRadius: 8,
		justifyContent: "flex-end",
		overflow: "hidden",
	},
	chartBarTrackActive: {
		borderWidth: 1.5,
		borderColor: "#F59E0B",
	},
	chartBarFill: {
		width: "100%",
		borderRadius: 6,
	},
	chartBarFillActive: {
		backgroundColor: "#F59E0B",
		borderTopLeftRadius: 6,
		borderTopRightRadius: 6,
	},
	chartBarFillInactive: {
		backgroundColor: "#FCD34D",
		borderTopLeftRadius: 6,
		borderTopRightRadius: 6,
	},
	chartBarMonthText: {
		fontSize: 11,
		color: COLORS.textMuted,
		marginTop: 6,
		fontWeight: FONT.medium,
	},
	chartBarMonthTextActive: {
		color: "#0F172A",
		fontWeight: FONT.bold,
	},
	chartBarDayRateText: {
		fontSize: 9,
		color: COLORS.textMuted,
		marginTop: 1,
	},
	chartDetailPill: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		backgroundColor: "#FFFBEB",
		borderRadius: RADIUS.md,
		borderWidth: 1,
		borderColor: "#FDE68A",
		paddingVertical: 9,
		paddingHorizontal: 12,
		marginTop: 12,
	},
	chartDetailPillLeft: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	chartDetailIconWrap: {
		width: 26,
		height: 26,
		borderRadius: 13,
		backgroundColor: "#FEF3C7",
		alignItems: "center",
		justifyContent: "center",
	},
	chartDetailPillTitle: {
		fontSize: 13,
		fontWeight: FONT.bold,
		color: "#92400E",
	},
	chartDetailPillHighlight: {
		fontSize: 13,
		fontWeight: FONT.heavy,
		color: "#B45309",
	},
	chartDetailPillSub: {
		fontSize: 11,
		color: "#B45309",
		marginTop: 1,
	},
	chartDetailPillRight: {
		alignItems: "flex-end",
	},
	chartDetailExportLabel: {
		fontSize: 10,
		color: "#92400E",
		fontWeight: FONT.medium,
	},
	chartDetailExportVal: {
		fontSize: 13,
		fontWeight: FONT.bold,
		color: "#059669",
	},

	// ── Panel Care ──────────────────────────────────────────────
	careContainer: {
		gap: SPACING.xs,
	},
	careRationale: {
		fontSize: 13,
		color: COLORS.textSub,
		lineHeight: 19,
	},
	careRecommendation: {
		fontSize: 12,
		color: COLORS.textMuted,
		lineHeight: 18,
		fontStyle: "italic",
	},
	progressLabels: {
		flexDirection: "row",
		justifyContent: "space-between",
		marginTop: 4,
	},
	progressLabel: {
		fontSize: 11,
		color: COLORS.textMuted,
	},
	careActions: {
		flexDirection: "row",
		gap: SPACING.sm,
		marginTop: SPACING.sm + 2,
	},
	logCleanBtn: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
		backgroundColor: COLORS.gold,
		paddingVertical: 11,
		borderRadius: RADIUS.md,
	},
	logCleanText: {
		fontSize: 13,
		fontWeight: FONT.bold,
		color: COLORS.textInverse,
	},
	viewCareBtn: {
		paddingHorizontal: 14,
		justifyContent: "center",
		alignItems: "center",
		borderRadius: RADIUS.md,
		borderWidth: 1,
		borderColor: COLORS.border,
		backgroundColor: COLORS.card,
	},
	viewCareText: {
		fontSize: 13,
		color: COLORS.textSub,
		fontWeight: FONT.semi,
	},

	// ── Banked Credit & Annual Settlement ───────────────────────
	settlementCard: {
		backgroundColor: "#F8FAFC",
		borderRadius: RADIUS.md,
		borderWidth: 1,
		borderColor: "#E2E8F0",
		padding: SPACING.md,
	},
	settlementBankedRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: SPACING.sm + 2,
	},
	settlementIconWrap: {
		width: 36,
		height: 36,
		borderRadius: 18,
		backgroundColor: "#DCFCE7",
		alignItems: "center",
		justifyContent: "center",
	},
	settlementBankedCol: {
		flex: 1,
	},
	settlementBankedLabel: {
		fontSize: 13,
		fontWeight: FONT.semi,
		color: COLORS.text,
	},
	settlementBankedSub: {
		fontSize: 11,
		color: COLORS.textMuted,
		marginTop: 2,
	},
	settlementBankedValWrap: {
		alignItems: "flex-end",
	},
	settlementBankedVal: {
		fontSize: 21,
		fontWeight: FONT.heavy,
		color: "#059669",
		letterSpacing: -0.5,
	},
	settlementBankedUnit: {
		fontSize: 12,
		fontWeight: FONT.semi,
		color: COLORS.textMuted,
	},
	settlementDivider: {
		height: 1,
		backgroundColor: "#EEF2F6",
		marginVertical: SPACING.sm + 4,
	},
	settlementPayoutBlock: {
		marginTop: 0,
	},
	settlementMetricsRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "flex-start",
	},
	settlementMetricCol: {
		flex: 1,
	},
	settlementDetailLabel: {
		fontSize: 11,
		color: COLORS.textMuted,
		fontWeight: FONT.medium,
	},
	settlementPayoutVal: {
		fontSize: 19,
		fontWeight: FONT.heavy,
		color: COLORS.success,
		letterSpacing: -0.5,
		marginTop: 2,
	},
	settlementDetailVal: {
		fontSize: 13,
		fontWeight: FONT.bold,
		color: COLORS.text,
		marginTop: 2,
	},
	settlementPromptBlock: {
		marginTop: 0,
	},
	settlementPromptRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		backgroundColor: "#F1F5F9",
		paddingVertical: 8,
		paddingHorizontal: 10,
		borderRadius: RADIUS.sm,
	},
	settlementPromptText: {
		fontSize: 11,
		color: COLORS.textSub,
		flex: 1,
		lineHeight: 16,
	},
	settlementFootnote: {
		fontSize: 11,
		color: COLORS.textMuted,
		marginTop: SPACING.sm,
		lineHeight: 16,
	},

	// ── Empty state ─────────────────────────────────────────────
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
	emptyTitle: {
		fontSize: 22,
		fontWeight: FONT.heavy,
		color: COLORS.text,
		textAlign: "center",
	},
	emptySub: {
		fontSize: 14,
		color: COLORS.textMuted,
		textAlign: "center",
		lineHeight: 21,
	},
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
	emptyAddBtnText: {
		fontSize: 15,
		fontWeight: FONT.bold,
		color: COLORS.textInverse,
	},
});
