// ============================================================
// Home Screen — Minimal, Clean, and Intuitive Layout
// ============================================================
import React, { useState, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";

import { SolarBill, SystemProfile, CareAssessment } from "../types/solar";
import { Card, Badge, InfoNote, ProgressBar } from "../components/ui/UIKit";
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
	const allTimeImpAvgPerMonth = (allTimeImport / billCount).toFixed(0);
	const allTimeExpAvgPerMonth = (allTimeExport / billCount).toFixed(0);

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
					{/* 2x2 Clean Metric Tiles */}
					<View style={styles.eoGrid}>
						{/* Row 1: Generation & Home Use */}
						<View style={styles.eoRow}>
							<View style={styles.eoTile}>
								<View style={styles.eoTileHeader}>
									<View style={[styles.eoIconBadge, { backgroundColor: "#FEF3C7" }]}>
										<Ionicons name="sunny" size={15} color="#D97706" />
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
										<Ionicons name="home" size={15} color="#059669" />
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
									{flowScope === "all" ? `${allTimeHomeAvgPerMonth} kWh/mo avg` : "Estimated use"}
								</Text>
							</View>
						</View>

						{/* Row 2: Grid Import & Grid Export */}
						<View style={styles.eoRow}>
							<View style={styles.eoTile}>
								<View style={styles.eoTileHeader}>
									<View style={[styles.eoIconBadge, { backgroundColor: "#E0F2FE" }]}>
										<MaterialCommunityIcons name="arrow-down" size={16} color="#0284C7" />
									</View>
									<Text style={styles.eoTileLabel} numberOfLines={1}>Grid Import</Text>
								</View>
								<View style={styles.eoTileValueRow}>
									<Text style={[styles.eoTileValue, { color: COLORS.text }]}>
										{displayImp.toFixed(0)}
									</Text>
									<Text style={styles.eoTileUnit}>kWh</Text>
								</View>
								<Text style={styles.eoTileNote}>
									{flowScope === "all" ? `${allTimeImpAvgPerMonth} kWh/mo avg` : "Drawn from grid"}
								</Text>
							</View>

							<View style={styles.eoTile}>
								<View style={styles.eoTileHeader}>
									<View style={[styles.eoIconBadge, { backgroundColor: "#ECFDF5" }]}>
										<MaterialCommunityIcons name="arrow-up" size={16} color="#059669" />
									</View>
									<Text style={styles.eoTileLabel} numberOfLines={1}>Grid Export</Text>
								</View>
								<View style={styles.eoTileValueRow}>
									<Text style={[styles.eoTileValue, { color: COLORS.text }]}>
										{displayExp.toFixed(0)}
									</Text>
									<Text style={styles.eoTileUnit}>kWh</Text>
								</View>
								<Text style={styles.eoTileNote}>
									{flowScope === "all" ? `${allTimeExpAvgPerMonth} kWh/mo avg` : "Sent to grid"}
								</Text>
							</View>
						</View>
					</View>

					{/* Banked Credit Balance Pill */}
					<View style={styles.eoRemainingCard}>
						<View style={styles.eoRemainingIconWrap}>
							<Ionicons name="battery-charging" size={18} color="#059669" />
						</View>
						<View style={styles.eoRemainingCol}>
							<Text style={styles.eoRemainingTitle}>Banked Energy Credit</Text>
							<Text style={styles.eoRemainingSubtitle}>Carried forward to next bill</Text>
						</View>
						<View style={styles.eoRemainingValueCol}>
							<Text style={styles.eoRemainingValue}>
								{displayClosingCredit}{" "}
								<Text style={styles.eoRemainingUnit}>kWh</Text>
							</Text>
						</View>
					</View>

					{/* ── Solar Utilization & Self-Sufficiency ── */}
					{displayGen !== null && displayGen > 0 && (
						<View style={styles.selfSuffContainer}>
							<View style={styles.selfSuffHeader}>
								<View>
									<Text style={styles.selfSuffTitle}>Solar Utilization</Text>
									<Text style={styles.selfSuffSubTitle}>Direct consumption vs. grid export</Text>
								</View>
								<View style={styles.selfSuffBadge}>
									<Text style={styles.selfSuffBadgeText}>{selfSufficiencyPct}% Self-Sufficient</Text>
								</View>
							</View>

							{/* Dual-color Split Bar */}
							<View style={styles.selfSuffTrack}>
								<View style={[styles.selfSuffSegmentDirect, { flex: Math.max(0.05, directSolarUse) }]} />
								<View style={[styles.selfSuffSegmentExport, { flex: Math.max(0.05, displayExp) }]} />
							</View>

							{/* Legend / Breakdown */}
							<View style={styles.selfSuffLegendRow}>
								<View style={styles.selfSuffLegendItem}>
									<View style={[styles.selfSuffDot, { backgroundColor: "#059669" }]} />
									<Text style={styles.selfSuffLegendText}>
										Direct use: <Text style={styles.selfSuffLegendBold}>{directSolarUse.toFixed(0)} kWh</Text>
									</Text>
								</View>
								<View style={styles.selfSuffLegendItem}>
									<View style={[styles.selfSuffDot, { backgroundColor: "#F59E0B" }]} />
									<Text style={styles.selfSuffLegendText}>
										Exported: <Text style={styles.selfSuffLegendBold}>{displayExp.toFixed(0)} kWh</Text>
									</Text>
								</View>
							</View>

							<Text style={styles.selfSuffNote}>
								Direct use is solar electricity consumed on-site before grid export.
							</Text>
						</View>
					)}
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

			{/* ─── 4. Annual Settlement Outlook ─── */}
			{settlement ? (
				<Card
					title="Annual Settlement Outlook"
					subtitle="FY 2026-27 · JERC Net Metering"
					style={styles.cardSpacing}
					badge={<Badge label="31 May 2027" color={COLORS.info} />}
				>
					<View style={styles.settlementCard}>
						<View style={styles.settlementTopRow}>
							<View style={styles.settlementTitleCol}>
								<Text style={styles.settlementHeaderLabel}>Projected Payout</Text>
								<Text style={styles.settlementHeaderSub}>Surplus energy settlement</Text>
							</View>
							<View style={styles.settlementPayoutWrap}>
								<Text style={styles.settlementPayoutVal}>₹{settlement.projectedPayoutInr.toFixed(0)}</Text>
							</View>
						</View>

						<View style={styles.settlementBottomRow}>
							<View style={styles.settlementDetailCol}>
								<Text style={styles.settlementDetailLabel}>Banked Credit</Text>
								<Text style={styles.settlementDetailVal}>{settlement.bankedCreditKwh} kWh</Text>
							</View>
							<View style={[styles.settlementDetailCol, { alignItems: "flex-end" }]}>
								<Text style={styles.settlementDetailLabel}>APPC Rate</Text>
								<Text style={styles.settlementDetailVal}>₹{settlement.ratePerKwh}/kWh</Text>
							</View>
						</View>
					</View>

					<Text style={styles.settlementFootnote}>
						Estimate based on banked units. Final settlement processed annually by Electricity Department Goa.
					</Text>
				</Card>
			) : (
				<InfoNote
					text="Set the APPC settlement rate in Settings to view your projected annual payout."
					color={COLORS.info}
					style={styles.cardSpacing}
				/>
			)}
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

	// ── Energy Overview ──────────────────────────────────────────
	eoContainer: {
		gap: SPACING.md,
	},
	eoGrid: {
		gap: SPACING.sm + 2,
	},
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
		width: 26,
		height: 26,
		borderRadius: 13,
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

	// Banked Balance Pill
	eoRemainingCard: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		backgroundColor: "#F0FDF4",
		borderRadius: RADIUS.md,
		borderWidth: 1,
		borderColor: "#DCFCE7",
		paddingVertical: 12,
		paddingHorizontal: 14,
	},
	eoRemainingIconWrap: {
		width: 34,
		height: 34,
		borderRadius: 17,
		backgroundColor: "#DCFCE7",
		alignItems: "center",
		justifyContent: "center",
	},
	eoRemainingCol: {
		flex: 1,
	},
	eoRemainingTitle: {
		fontSize: 13,
		fontWeight: FONT.bold,
		color: "#065F46",
	},
	eoRemainingSubtitle: {
		fontSize: 11,
		color: "#059669",
		marginTop: 1,
	},
	eoRemainingValueCol: {
		alignItems: "flex-end",
	},
	eoRemainingValue: {
		fontSize: 21,
		fontWeight: FONT.heavy,
		color: "#065F46",
		letterSpacing: -0.5,
	},
	eoRemainingUnit: {
		fontSize: 12,
		fontWeight: FONT.semi,
		color: "#059669",
	},

	// ── Self-Sufficiency Section ──────────────────────────────
	selfSuffContainer: {
		marginTop: 2,
		paddingTop: SPACING.md,
		borderTopWidth: 1,
		borderTopColor: COLORS.borderSubtle,
	},
	selfSuffHeader: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginBottom: 8,
	},
	selfSuffTitle: {
		fontSize: 13,
		fontWeight: FONT.bold,
		color: COLORS.text,
	},
	selfSuffSubTitle: {
		fontSize: 11,
		color: COLORS.textMuted,
		marginTop: 1,
	},
	selfSuffBadge: {
		backgroundColor: "#ECFDF5",
		paddingHorizontal: 9,
		paddingVertical: 3,
		borderRadius: RADIUS.full,
		borderWidth: 1,
		borderColor: "#A7F3D0",
	},
	selfSuffBadgeText: {
		fontSize: 11,
		fontWeight: FONT.bold,
		color: "#059669",
	},
	selfSuffTrack: {
		flexDirection: "row",
		height: 8,
		gap: 3,
		width: "100%",
		borderRadius: 4,
		overflow: "hidden",
		marginBottom: 8,
	},
	selfSuffSegmentDirect: {
		backgroundColor: "#059669",
		borderRadius: 4,
	},
	selfSuffSegmentExport: {
		backgroundColor: "#F59E0B",
		borderRadius: 4,
	},
	selfSuffLegendRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginBottom: 6,
	},
	selfSuffLegendItem: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
	},
	selfSuffDot: {
		width: 8,
		height: 8,
		borderRadius: 4,
	},
	selfSuffLegendText: {
		fontSize: 12,
		color: COLORS.textSub,
	},
	selfSuffLegendBold: {
		fontWeight: FONT.bold,
		color: COLORS.text,
	},
	selfSuffNote: {
		fontSize: 11,
		color: COLORS.textMuted,
		lineHeight: 16,
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

	// ── Annual Settlement Outlook ───────────────────────────────
	settlementCard: {
		backgroundColor: "#F8FAFC",
		borderRadius: RADIUS.md,
		borderWidth: 1,
		borderColor: "#E2E8F0",
		padding: SPACING.md,
	},
	settlementTopRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingBottom: SPACING.sm + 2,
		borderBottomWidth: 1,
		borderBottomColor: "#EEF2F6",
	},
	settlementTitleCol: {
		flex: 1,
	},
	settlementHeaderLabel: {
		fontSize: 11,
		fontWeight: FONT.semi,
		color: COLORS.textMuted,
		textTransform: "uppercase",
		letterSpacing: 0.4,
	},
	settlementHeaderSub: {
		fontSize: 12,
		color: COLORS.textSub,
		marginTop: 1,
	},
	settlementPayoutWrap: {
		alignItems: "flex-end",
	},
	settlementPayoutVal: {
		fontSize: 22,
		fontWeight: FONT.heavy,
		color: COLORS.success,
		letterSpacing: -0.5,
	},
	settlementBottomRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		paddingTop: SPACING.sm + 2,
	},
	settlementDetailCol: {
		flex: 1,
	},
	settlementDetailLabel: {
		fontSize: 11,
		color: COLORS.textMuted,
	},
	settlementDetailVal: {
		fontSize: 14,
		fontWeight: FONT.bold,
		color: COLORS.text,
		marginTop: 2,
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
