// ============================================================
// Goa SolarTrack — Home Screen
// Designed for Quick Comprehension, Trustworthy Data & Easy Daily Use
// 5 Compact Content Areas:
// 1. Monthly Energy Overview (Hero Card with Integrated Mascot)
// 2. Where your energy went (Energy Distribution)
// 3. Monthly Solar Generation (5–6 Months Vertical Bar Chart)
// 4. Latest Electricity Bill (Quick Action Card)
// 5. Next Solar Care Task (Quick Action Card)
// ============================================================

import React, { useState, useMemo, useEffect } from "react";
import {
	View,
	Text,
	StyleSheet,
	ScrollView,
	TouchableOpacity,
	RefreshControl,
	Image,
	Animated,
	Easing,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { SolarBill, SystemProfile, CareAssessment } from "../types/solar";
import { COLORS, SPACING, RADIUS, FONT, SHADOW } from "../constants/theme";
import { deduplicateBills } from "../services/solarStorage";

const MASCOT_HAPPY = require("../../assets/mascot-happy-transparent.png");

// Split "Aug '26" into month and year for stacked chart labels
const parseMonthYearParts = (period: string) => {
	const parts = period.trim().split(" ");
	if (parts.length >= 2) {
		return {
			month: parts[0].slice(0, 3),
			year: `'${parts[1].length === 4 ? parts[1].slice(2) : parts[1]}`,
		};
	}
	return { month: period, year: "" };
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
	onNavigateBills?: () => void;
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
	onNavigateBills,
	onNavigateCare,
	onNavigateAnalytics,
}) => {
	// Scope toggle: "month" (latest billing period) vs "year" (all bills aggregated)
	const [flowScope, setFlowScope] = useState<"month" | "year">("month");
	const [selectedBarBillId, setSelectedBarBillId] = useState<string | null>(null);

	// ── Subtle Mascot Floating Idle Animation ──
	const [floatAnim] = useState(() => new Animated.Value(0));
	useEffect(() => {
		const animation = Animated.loop(
			Animated.sequence([
				Animated.timing(floatAnim, {
					toValue: -5,
					duration: 2200,
					easing: Easing.inOut(Easing.sin),
					useNativeDriver: true,
				}),
				Animated.timing(floatAnim, {
					toValue: 0,
					duration: 2200,
					easing: Easing.inOut(Easing.sin),
					useNativeDriver: true,
				}),
			])
		);
		animation.start();
		return () => animation.stop();
	}, [floatAnim]);

	// ── Deduplicate bills by month to ensure each month appears strictly once ──
	const uniqueBills = useMemo(() => {
		return deduplicateBills(bills);
	}, [bills]);

	// ── Chronological bills for Monthly Generation Bar Chart (oldest -> newest) ──
	const sortedBills = useMemo(() => {
		return [...uniqueBills].sort(
			(a, b) => new Date(a.periodStart).getTime() - new Date(b.periodStart).getTime()
		);
	}, [uniqueBills]);

	// Filter valid generation bills
	const validGenBills = useMemo(() => {
		return sortedBills.filter(
			(b) => b.generationKwh !== null && b.generationKwh !== undefined && b.generationKwh > 0
		);
	}, [sortedBills]);

	// Display the most recent 5 to 6 monthly generation records (strictly unique months)
	const recentMonthlyBills = useMemo(() => {
		if (validGenBills.length === 0) return [];
		return validGenBills.slice(-6);
	}, [validGenBills]);

	const maxChartGenValue = useMemo(() => {
		if (recentMonthlyBills.length === 0) return 600;
		const max = Math.max(...recentMonthlyBills.map((b) => b.generationKwh ?? 0));
		return Math.max(max * 1.15, 100);
	}, [recentMonthlyBills]);

	// Average monthly generation for displayed period
	const avgMonthlyGen = useMemo(() => {
		if (recentMonthlyBills.length === 0) return null;
		const sum = recentMonthlyBills.reduce((s, b) => s + (b.generationKwh ?? 0), 0);
		return Math.round(sum / recentMonthlyBills.length);
	}, [recentMonthlyBills]);

	// Average bill amount for comparison
	const avgBillAmount = useMemo(() => {
		if (uniqueBills.length <= 1) return null;
		const sum = uniqueBills.reduce((s, b) => s + b.billAmount, 0);
		return sum / uniqueBills.length;
	}, [uniqueBills]);

	// ── Care Next Task Helper ──
	const careNextTask = useMemo(() => {
		const isAttentionNeeded =
			careAssessment.state === "Cleaning recommended" ||
			careAssessment.state === "Cleaning check recommended" ||
			careAssessment.state === "Watch";

		if (isAttentionNeeded) {
			return {
				isAttentionNeeded: true,
				title: "Wash solar panels",
				dueText: "Action recommended",
			};
		}

		const daysLeft = 30 - (careAssessment.daysSinceLastClean || 0);
		if (daysLeft <= 0) {
			return {
				isAttentionNeeded: true,
				title: "Wash solar panels",
				dueText: "Overdue",
			};
		}
		if (daysLeft <= 14) {
			return {
				isAttentionNeeded: false,
				title: "Wash solar panels",
				dueText: `Due in ${daysLeft} days`,
			};
		}
		return {
			isAttentionNeeded: false,
			title: "Check inverter",
			dueText: "Due in 14 days",
		};
	}, [careAssessment.state, careAssessment.daysSinceLastClean]);

	// Helper to safely get solar generation for any bill
	const getBillGeneration = (b: SolarBill): number => {
		if (b.generationKwh !== null && b.generationKwh !== undefined && b.generationKwh > 0) {
			return b.generationKwh;
		}
		if (b.directSolarUseKwh !== null && b.directSolarUseKwh !== undefined && b.directSolarUseKwh > 0) {
			return b.directSolarUseKwh + (b.exportKwh || 0);
		}
		return b.exportKwh || 0;
	};

	// Year scope: past 12 records (or all bills in current list)
	const yearBills = useMemo(() => {
		return uniqueBills.slice(0, 12);
	}, [uniqueBills]);

	// Aggregates for Year scope (using deduplicated bills)
	const yearGeneration = useMemo(() => {
		return yearBills.reduce((sum, b) => sum + getBillGeneration(b), 0);
	}, [yearBills]);

	const yearExport = useMemo(() => {
		return yearBills.reduce((sum, b) => sum + (b.exportKwh || 0), 0);
	}, [yearBills]);

	const yearImport = useMemo(() => {
		return yearBills.reduce((sum, b) => sum + (b.importKwh || 0), 0);
	}, [yearBills]);

	const yearDirectUse = useMemo(() => {
		return yearBills.reduce((sum, b) => {
			const direct = b.directSolarUseKwh ?? Math.max(0, getBillGeneration(b) - (b.exportKwh || 0));
			return sum + direct;
		}, 0);
	}, [yearBills]);

	// Latest bill record (from deduplicated bills)
	const latestBill = uniqueBills.length > 0 ? uniqueBills[0] : null;

	if (!latestBill) {
		return <EmptyState onAddBill={onAddBill} />;
	}

	// ── Energy Calculations (Preserving Single Source of Truth) ──
	const isPartialMonth =
		latestBill.billingDays && latestBill.billingDays < 25 && latestBill.billingDays > 0;
	const periodLabel = isPartialMonth ? `${latestBill.period} (Month to date)` : latestBill.period;

	// Daily generation rate
	const days = latestBill.billingDays || 31;
	const avgDailyGen =
		latestBill.generationKwh !== null && days > 0
			? (latestBill.generationKwh / days).toFixed(1)
			: null;

	// Scope values
	const activeGen =
		flowScope === "month"
			? getBillGeneration(latestBill)
			: yearGeneration;

	const activeExport =
		flowScope === "month"
			? latestBill.exportKwh
			: yearExport;

	const activeImport =
		flowScope === "month"
			? latestBill.importKwh
			: yearImport;

	// Net banked units added in a bill (surplus exported after offsetting import)
	const getBillBankedSurplus = (b: SolarBill): number => {
		if (
			b.closingCreditKwh !== undefined &&
			b.openingCreditKwh !== undefined &&
			b.openingCreditKwh > 0
		) {
			return Math.max(0, b.closingCreditKwh - b.openingCreditKwh);
		}
		const exp = b.exportKwh || 0;
		const offset = b.adjustedCreditKwh ?? (b.importKwh || 0);
		return Math.max(0, exp - offset);
	};

	const monthBanked = getBillBankedSurplus(latestBill);
	const yearBanked = yearBills.reduce((sum, b) => sum + getBillBankedSurplus(b), 0);

	const activeBanked = flowScope === "month" ? monthBanked : yearBanked;

	// Direct solar used at home: max(0, gen - export)
	const activeUsedAtHome =
		flowScope === "month"
			? (latestBill.directSolarUseKwh ?? (activeGen > 0 ? Math.max(0, activeGen - activeExport) : 0))
			: (yearDirectUse > 0 ? yearDirectUse : Math.max(0, yearGeneration - yearExport));

	// Total home consumption = direct solar use + grid import
	const activeHomeConsumption =
		flowScope === "month"
			? (latestBill.estimatedTotalConsumptionKwh ?? (activeUsedAtHome + activeImport))
			: (activeUsedAtHome + activeImport);

	// Percentage of home electricity supplied directly by solar
	const selfSufficiencyPct =
		activeHomeConsumption > 0
			? Math.min(100, Math.round((activeUsedAtHome / activeHomeConsumption) * 100))
			: 0;

	// Energy distribution percentages (Household Consumption vs Banked Credit)
	const totalHouseholdAndBanked = activeHomeConsumption + activeBanked;
	const homeSharePct =
		totalHouseholdAndBanked > 0
			? Math.round((activeHomeConsumption / totalHouseholdAndBanked) * 100)
			: 100;
	const bankedSharePct = Math.max(0, 100 - homeSharePct);

	// Bill status comparison
	let billStatusBadge = "Normal";
	let billStatusColor = COLORS.success;
	let billStatusBg = "#ECFDF5";

	if (latestBill.closingCreditKwh > 0 && latestBill.billAmount <= 300) {
		billStatusBadge = "Credit Banked";
		billStatusColor = COLORS.gold;
		billStatusBg = "#FFFBEB";
	} else if (avgBillAmount !== null && latestBill.billAmount > avgBillAmount * 1.25) {
		billStatusBadge = "Higher";
		billStatusColor = "#EF4444";
		billStatusBg = "#FEF2F2";
	}

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
			{/* ══════════════════════════════════════════════════════════
			    1. MAIN HERO CARD — THIS MONTH
			══════════════════════════════════════════════════════════ */}
			<View style={styles.heroCard}>
				{/* Top Hero Row: Headline + House Mascot */}
				<View style={styles.heroTopRow}>
					<View style={styles.heroTextCol}>
						<Text style={styles.heroPeriodLabel}>
							{flowScope === "year"
								? (yearBills.length > 1 ? `Past ${yearBills.length} Months` : "Past Year")
								: periodLabel}
						</Text>
						<Text style={styles.heroHeadline}>
							{"Your home\nis solar powered"}
						</Text>
						<Text style={styles.heroSubtext}>
							Clean energy for a brighter tomorrow
						</Text>
					</View>

					{/* Friendly Solar House Mascot */}
					<Animated.View
						style={[
							styles.mascotWrap,
							{ transform: [{ translateY: floatAnim }] },
						]}
					>
						<Image
							source={MASCOT_HAPPY}
							style={styles.mascotImage}
							resizeMode="contain"
						/>
					</Animated.View>
				</View>

				{/* Two Child Metric Cards Inside Hero */}
				<View style={styles.heroMetricsRow}>
					{/* Metric 1: Solar Generated (Warm Orange) */}
					<View style={styles.heroMetricCardOrange}>
						<View style={styles.heroMetricHeader}>
							<View style={styles.heroMetricIconWrapOrange}>
								<Ionicons name="sunny" size={17} color="#EA580C" />
							</View>
							<Text style={styles.heroMetricLabel} numberOfLines={1}>
								Solar generated
							</Text>
						</View>
						<View style={styles.heroMetricValueRow}>
							<Text style={styles.heroMetricValueOrange}>
								{activeGen > 0 ? Math.round(activeGen) : "—"}
							</Text>
							<Text style={styles.heroMetricUnit}>kWh</Text>
						</View>
						<Text style={styles.heroMetricSubOrange}>
							{flowScope === "year"
								? `${yearBills.length} months combined`
								: (avgDailyGen ? `${avgDailyGen} kWh/day` : "Goa meter reading")}
						</Text>
					</View>

					{/* Metric 2: Home Consumed (Fresh Green) */}
					<View style={styles.heroMetricCardGreen}>
						<View style={styles.heroMetricHeader}>
							<View style={styles.heroMetricIconWrapGreen}>
								<Ionicons name="home" size={16} color="#059669" />
							</View>
							<Text style={styles.heroMetricLabel} numberOfLines={1}>
								Home consumed
							</Text>
						</View>
						<View style={styles.heroMetricValueRow}>
							<Text style={styles.heroMetricValueGreen}>
								{Math.round(activeHomeConsumption)}
							</Text>
							<Text style={styles.heroMetricUnit}>kWh</Text>
						</View>
						<Text style={styles.heroMetricSubGreen}>
							{`${selfSufficiencyPct}% from solar`}
						</Text>
					</View>
				</View>
			</View>

			{/* ══════════════════════════════════════════════════════════
			    2. ENERGY DISTRIBUTION — WHERE YOUR ENERGY WENT
			══════════════════════════════════════════════════════════ */}
			<View style={styles.card}>
				{/* Header with Title & Scope Toggle */}
				<View style={styles.distHeaderRow}>
					<View style={{ flex: 1, paddingRight: 8 }}>
						<Text style={styles.cardTitle}>Where your energy went</Text>
						<Text style={styles.cardSubtitle}>
							{flowScope === "year"
								? `Total solar generated: ${Math.round(activeGen)} kWh (Year)`
								: `Total solar generated: ${Math.round(activeGen)} kWh`}
						</Text>
					</View>

					{/* Scope toggle (Month vs Year) */}
					{uniqueBills.length > 1 && (
						<View style={styles.scopeToggle}>
							<TouchableOpacity
								id="btn-dist-scope-month"
								style={[styles.scopeBtn, flowScope === "month" && styles.scopeBtnActive]}
								onPress={() => setFlowScope("month")}
								activeOpacity={0.7}
							>
								<Text
									style={[
										styles.scopeBtnText,
										flowScope === "month" && styles.scopeBtnTextActive,
									]}
								>
									Month
								</Text>
							</TouchableOpacity>
							<TouchableOpacity
								id="btn-dist-scope-year"
								style={[styles.scopeBtn, flowScope === "year" && styles.scopeBtnActive]}
								onPress={() => setFlowScope("year")}
								activeOpacity={0.7}
							>
								<Text
									style={[
										styles.scopeBtnText,
										flowScope === "year" && styles.scopeBtnTextActive,
									]}
								>
									Year
								</Text>
							</TouchableOpacity>
						</View>
					)}
				</View>

				{/* Simple Horizontal Distribution Bar */}
				<View style={styles.distTrack}>
					{/* Green Segment: Total Household Consumption */}
					<View
						style={[
							styles.distSegmentHome,
							{ flex: Math.max(0.08, homeSharePct) },
						]}
					>
						{homeSharePct >= 18 && (
							<Text style={styles.distBarPctText}>{`${homeSharePct}%`}</Text>
						)}
					</View>

					{/* Blue Segment: Banked Units */}
					<View
						style={[
							styles.distSegmentExport,
							{ flex: Math.max(activeBanked > 0 ? 0.08 : 0, bankedSharePct) },
						]}
					>
						{bankedSharePct >= 18 && (
							<Text style={styles.distBarPctText}>{`${bankedSharePct}%`}</Text>
						)}
					</View>
				</View>

				{/* Two Clearly Labelled Metric Boxes */}
				<View style={styles.distBoxesRow}>
					{/* Box 1: Total Household Consumption */}
					<View style={styles.distBoxHome}>
						<View style={styles.distBoxHeader}>
							<View style={styles.distDotHome} />
							<Text style={styles.distBoxLabel}>Household consumed</Text>
						</View>
						<View style={styles.distBoxValRow}>
							<Text style={styles.distBoxVal}>
								{Math.round(activeHomeConsumption)}
								<Text style={styles.distBoxUnit}> kWh</Text>
							</Text>
							<Text style={styles.distBoxShareHome}>{`${homeSharePct}%`}</Text>
						</View>
						<Text style={styles.distBoxSubtext}>Total home electricity</Text>
					</View>

					{/* Box 2: Banked Units Only */}
					<View style={styles.distBoxExport}>
						<View style={styles.distBoxHeader}>
							<View style={styles.distDotExport} />
							<Text style={styles.distBoxLabel}>Banked units</Text>
						</View>
						<View style={styles.distBoxValRow}>
							<Text style={styles.distBoxVal}>
								{Math.round(activeBanked)}
								<Text style={styles.distBoxUnit}> kWh</Text>
							</Text>
							{activeBanked > 0 && (
								<Text style={styles.distBoxShareExport}>{`${bankedSharePct}%`}</Text>
							)}
						</View>
						<Text style={styles.distBoxSubtext}>
							{latestBill.closingCreditKwh > 0
								? `Total reserve: ${Math.round(latestBill.closingCreditKwh)} kWh`
								: "No banked reserve"}
						</Text>
					</View>
				</View>

				{/* Callout Banner: Solar coverage of home electricity */}
				<TouchableOpacity
					id="btn-nav-analytics-callout"
					style={styles.distCalloutBanner}
					onPress={onNavigateAnalytics}
					activeOpacity={0.7}
				>
					<Ionicons name="leaf" size={17} color="#10B981" />
					<Text style={styles.distCalloutText}>
						{"Solar covered "}
						<Text style={styles.distCalloutBold}>{`${selfSufficiencyPct}%`}</Text>
						{" of your home’s total electricity use."}
					</Text>
					<Ionicons name="chevron-forward" size={15} color="#94A3B8" />
				</TouchableOpacity>
			</View>

			{/* ══════════════════════════════════════════════════════════
			    3. MONTHLY SOLAR GENERATION (MONTH-WISE ONLY)
			══════════════════════════════════════════════════════════ */}
			<View style={styles.card}>
				<View style={styles.chartHeaderRow}>
					<View style={{ flex: 1 }}>
						<Text style={styles.cardTitle}>Monthly Solar Generation</Text>
						<Text style={styles.cardSubtitle}>
							{avgMonthlyGen !== null
								? `Avg ${avgMonthlyGen} kWh/month · Recent months`
								: "Recent monthly solar production"}
						</Text>
					</View>

					<TouchableOpacity
						id="btn-view-analytics-chart"
						style={styles.viewAllBtn}
						onPress={onNavigateAnalytics}
						activeOpacity={0.7}
					>
						<Text style={styles.viewAllBtnText}>View all</Text>
						<Ionicons name="chevron-forward" size={14} color="#EA580C" />
					</TouchableOpacity>
				</View>

				{/* Vertical Bar Chart (5–6 recent months) */}
				{recentMonthlyBills.length > 0 ? (
					<View style={styles.chartContainer}>
						<View style={styles.chartBarsRow}>
							{recentMonthlyBills.map((b, idx) => {
								const isLatest = idx === recentMonthlyBills.length - 1;
								const isSelected = selectedBarBillId === b.id;
								const genValue = b.generationKwh ?? 0;
								const heightPct = Math.min(
									100,
									Math.max(14, Math.round((genValue / maxChartGenValue) * 100))
								);
								const { month, year } = parseMonthYearParts(b.period);

								return (
									<TouchableOpacity
										key={b.id || idx}
										id={`btn-chart-bar-${idx}`}
										style={styles.chartCol}
										onPress={() =>
											setSelectedBarBillId(isSelected ? null : b.id)
										}
										activeOpacity={0.8}
									>
										{/* Value in kWh above bar */}
										<Text
											style={[
												styles.chartValText,
												isLatest && styles.chartValTextLatest,
												isSelected && styles.chartValTextSelected,
											]}
											numberOfLines={1}
										>
											{Math.round(genValue)}
										</Text>

										{/* Bar Track & Fill */}
										<View style={styles.chartTrack}>
											<View
												style={[
													styles.chartFill,
													{ height: `${heightPct}%` },
													isLatest
														? styles.chartFillLatest
														: styles.chartFillPrevious,
													isSelected && styles.chartFillSelected,
												]}
											/>
										</View>

										{/* Month Label (Stacked for Clean Readability) */}
										<Text
											style={[
												styles.chartMonthText,
												isLatest && styles.chartMonthTextLatest,
											]}
										>
											{month}
										</Text>
										{year ? (
											<Text
												style={[
													styles.chartYearText,
													isLatest && styles.chartYearTextLatest,
												]}
											>
												{year}
											</Text>
										) : null}
									</TouchableOpacity>
								);
							})}
						</View>

						{/* Interactive Detail Strip on Bar Tap */}
						{selectedBarBillId && (
							(() => {
								const selBill = recentMonthlyBills.find((b) => b.id === selectedBarBillId);
								if (!selBill) return null;
								const selDaily =
									selBill.generationKwh !== null && (selBill.billingDays || 31) > 0
										? (selBill.generationKwh / (selBill.billingDays || 31)).toFixed(1)
										: null;
								return (
									<View style={styles.chartSelectedPill}>
										<View style={styles.chartSelectedIcon}>
											<Ionicons name="sunny" size={15} color="#EA580C" />
										</View>
										<View style={{ flex: 1 }}>
											<Text style={styles.chartSelectedTitle}>
												{selBill.period}:{" "}
												<Text style={{ fontWeight: FONT.bold, color: "#EA580C" }}>
													{`${Math.round(selBill.generationKwh ?? 0)} kWh`}
												</Text>
											</Text>
											<Text style={styles.chartSelectedSub}>
												{selDaily ? `${selDaily} kWh/day` : ""}{" "}
												{selBill.exportKwh > 0 ? `· ${Math.round(selBill.exportKwh)} kWh exported` : ""}
											</Text>
										</View>
									</View>
								);
							})()
						)}
					</View>
				) : (
					<View style={styles.chartEmpty}>
						<Text style={styles.chartEmptyText}>
							Monthly generation records will appear as bills are added.
						</Text>
					</View>
				)}
			</View>

			{/* ══════════════════════════════════════════════════════════
			    4 & 5. QUICK INFORMATION CARDS (LATEST BILL & SOLAR CARE)
			══════════════════════════════════════════════════════════ */}
			<View style={styles.quickCardsRow}>
				{/* Card 4: Latest Electricity Bill */}
				<TouchableOpacity
					id="btn-quick-latest-bill"
					style={styles.quickCard}
					onPress={onNavigateBills || onAddBill}
					activeOpacity={0.7}
				>
					<View style={styles.quickCardTop}>
						<View style={styles.quickIconWrapBlue}>
							<Ionicons name="document-text" size={18} color="#2563EB" />
						</View>
						<Ionicons name="chevron-forward" size={16} color="#94A3B8" />
					</View>

					<Text style={styles.quickCardLabel}>Latest electricity bill</Text>
					<Text style={styles.quickCardAmount}>
						{`₹${Math.round(latestBill.billAmount)}`}
					</Text>

					<View style={styles.quickCardFooter}>
						<Text style={styles.quickCardPeriod} numberOfLines={1}>
							{latestBill.period}
						</Text>
						<View style={[styles.statusBadge, { backgroundColor: billStatusBg }]}>
							<Ionicons name="checkmark" size={11} color={billStatusColor} />
							<Text style={[styles.statusBadgeText, { color: billStatusColor }]}>
								{billStatusBadge}
							</Text>
						</View>
					</View>
				</TouchableOpacity>

				{/* Card 5: Solar Care Next Task */}
				<TouchableOpacity
					id="btn-quick-solar-care"
					style={styles.quickCard}
					onPress={onNavigateCare}
					activeOpacity={0.7}
				>
					<View style={styles.quickCardTop}>
						<View style={styles.quickIconWrapAmber}>
							<Ionicons name="construct" size={17} color="#D97706" />
						</View>
						<Ionicons name="chevron-forward" size={16} color="#94A3B8" />
					</View>

					<Text style={styles.quickCardLabel}>Solar care</Text>
					<Text style={styles.quickCardTask} numberOfLines={1}>
						{careNextTask.title}
					</Text>

					<View style={styles.quickCardFooter}>
						<Text style={styles.quickCardDue} numberOfLines={1}>
							{careNextTask.dueText}
						</Text>
					</View>
				</TouchableOpacity>
			</View>
		</ScrollView>
	);
};

// ── Clean Empty State when No Bills are Present ───────────────
const EmptyState: React.FC<{ onAddBill: () => void }> = ({ onAddBill }) => (
	<View style={styles.emptyContainer}>
		<View style={styles.emptyIconWrap}>
			<Ionicons name="sunny-outline" size={44} color={COLORS.gold} />
		</View>
		<Text style={styles.emptyTitle}>Welcome to Goa SolarTrack</Text>
		<Text style={styles.emptySub}>
			Add your first monthly electricity bill to begin tracking rooftop solar production, home savings, and energy credits in Goa.
		</Text>
		<TouchableOpacity
			id="btn-add-bill-empty"
			style={styles.emptyAddBtn}
			onPress={onAddBill}
			activeOpacity={0.8}
		>
			<Ionicons name="add-circle" size={18} color={COLORS.textInverse} />
			<Text style={styles.emptyAddBtnText}>Add Monthly Bill</Text>
		</TouchableOpacity>
	</View>
);

// ── Styles (Clean, Premium, Consistent with Design System) ────
const styles = StyleSheet.create({
	scroll: {
		flex: 1,
		backgroundColor: "#F8FAFC",
	},
	content: {
		padding: 16,
		paddingBottom: 36,
		gap: 14,
	},

	// ── 1. Main Hero Card ──
	heroCard: {
		backgroundColor: "#F0F9FF",
		borderRadius: 24,
		padding: 18,
		borderWidth: 1,
		borderColor: "#E0F2FE",
		...SHADOW.card,
	},
	heroTopRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: 16,
	},
	heroTextCol: {
		flex: 1,
		paddingRight: 10,
	},
	heroPeriodLabel: {
		fontSize: 13,
		fontWeight: FONT.semi,
		color: "#0284C7",
		marginBottom: 4,
		letterSpacing: 0.1,
	},
	heroHeadline: {
		fontSize: 23,
		fontWeight: FONT.heavy,
		color: "#0F172A",
		lineHeight: 28,
		letterSpacing: -0.4,
		marginBottom: 4,
	},
	heroSubtext: {
		fontSize: 12.5,
		color: "#64748B",
		lineHeight: 16,
	},
	mascotWrap: {
		width: 108,
		height: 92,
		justifyContent: "center",
		alignItems: "center",
	},
	mascotImage: {
		width: "100%",
		height: "100%",
	},

	// Two Child Metric Cards inside Hero
	heroMetricsRow: {
		flexDirection: "row",
		gap: 10,
	},
	heroMetricCardOrange: {
		flex: 1,
		backgroundColor: "#FFFBEB",
		borderRadius: 16,
		padding: 13,
		borderWidth: 1,
		borderColor: "#FEF3C7",
	},
	heroMetricCardGreen: {
		flex: 1,
		backgroundColor: "#F0FDF4",
		borderRadius: 16,
		padding: 13,
		borderWidth: 1,
		borderColor: "#DCFCE7",
	},
	heroMetricHeader: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		marginBottom: 6,
	},
	heroMetricIconWrapOrange: {
		width: 26,
		height: 26,
		borderRadius: 13,
		backgroundColor: "#FEF3C7",
		justifyContent: "center",
		alignItems: "center",
	},
	heroMetricIconWrapGreen: {
		width: 26,
		height: 26,
		borderRadius: 13,
		backgroundColor: "#DCFCE7",
		justifyContent: "center",
		alignItems: "center",
	},
	heroMetricLabel: {
		fontSize: 12,
		fontWeight: FONT.semi,
		color: "#475569",
		flex: 1,
	},
	heroMetricValueRow: {
		flexDirection: "row",
		alignItems: "baseline",
		gap: 3,
		marginBottom: 2,
	},
	heroMetricValueOrange: {
		fontSize: 27,
		fontWeight: FONT.heavy,
		color: "#EA580C",
		letterSpacing: -0.5,
	},
	heroMetricValueGreen: {
		fontSize: 27,
		fontWeight: FONT.heavy,
		color: "#059669",
		letterSpacing: -0.5,
	},
	heroMetricUnit: {
		fontSize: 13,
		fontWeight: FONT.bold,
		color: "#64748B",
	},
	heroMetricSubOrange: {
		fontSize: 11.5,
		color: "#94A3B8",
		fontWeight: FONT.medium,
	},
	heroMetricSubGreen: {
		fontSize: 11.5,
		color: "#059669",
		fontWeight: FONT.semi,
	},

	// ── Reusable Card Container ──
	card: {
		backgroundColor: "#FFFFFF",
		borderRadius: 20,
		padding: 16,
		borderWidth: 1,
		borderColor: "#E2E8F0",
		...SHADOW.card,
	},
	cardTitle: {
		fontSize: 16.5,
		fontWeight: FONT.bold,
		color: "#0F172A",
		letterSpacing: -0.2,
	},
	cardSubtitle: {
		fontSize: 12,
		color: "#64748B",
		marginTop: 2,
	},

	// ── 2. Energy Distribution ──
	distHeaderRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: 14,
	},
	scopeToggle: {
		flexDirection: "row",
		backgroundColor: "#F1F5F9",
		borderRadius: 20,
		padding: 3,
		borderWidth: 1,
		borderColor: "#E2E8F0",
	},
	scopeBtn: {
		paddingHorizontal: 10,
		paddingVertical: 4,
		borderRadius: 16,
	},
	scopeBtnActive: {
		backgroundColor: "#FFFFFF",
		...SHADOW.card,
	},
	scopeBtnText: {
		fontSize: 11.5,
		fontWeight: FONT.medium,
		color: "#64748B",
	},
	scopeBtnTextActive: {
		color: "#0F172A",
		fontWeight: FONT.bold,
	},
	distTrack: {
		height: 24,
		borderRadius: 12,
		overflow: "hidden",
		flexDirection: "row",
		marginBottom: 12,
		backgroundColor: "#F1F5F9",
	},
	distSegmentHome: {
		backgroundColor: "#10B981",
		justifyContent: "center",
		alignItems: "center",
	},
	distSegmentExport: {
		backgroundColor: "#3B82F6",
		justifyContent: "center",
		alignItems: "center",
	},
	distBarPctText: {
		fontSize: 11,
		fontWeight: FONT.bold,
		color: "#FFFFFF",
	},
	distBoxesRow: {
		flexDirection: "row",
		gap: 10,
		marginBottom: 12,
	},
	distBoxHome: {
		flex: 1,
		backgroundColor: "#F0FDF4",
		borderRadius: 14,
		padding: 11,
		borderWidth: 1,
		borderColor: "#DCFCE7",
	},
	distBoxExport: {
		flex: 1,
		backgroundColor: "#EFF6FF",
		borderRadius: 14,
		padding: 11,
		borderWidth: 1,
		borderColor: "#DBEAFE",
	},
	distBoxHeader: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		marginBottom: 4,
	},
	distDotHome: {
		width: 7,
		height: 7,
		borderRadius: 4,
		backgroundColor: "#10B981",
	},
	distDotExport: {
		width: 7,
		height: 7,
		borderRadius: 4,
		backgroundColor: "#3B82F6",
	},
	distBoxLabel: {
		fontSize: 12,
		color: "#475569",
		fontWeight: FONT.medium,
	},
	distBoxValRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "baseline",
	},
	distBoxVal: {
		fontSize: 18,
		fontWeight: FONT.bold,
		color: "#0F172A",
	},
	distBoxUnit: {
		fontSize: 11.5,
		fontWeight: FONT.medium,
		color: "#64748B",
	},
	distBoxShareHome: {
		fontSize: 15,
		fontWeight: FONT.bold,
		color: "#059669",
	},
	distBoxShareExport: {
		fontSize: 15,
		fontWeight: FONT.bold,
		color: "#2563EB",
	},
	distBoxSubtext: {
		fontSize: 11,
		color: "#64748B",
		marginTop: 4,
		fontWeight: FONT.medium,
	},
	distCalloutBanner: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		backgroundColor: "#F0FDF4",
		borderRadius: 12,
		paddingHorizontal: 12,
		paddingVertical: 10,
		borderWidth: 1,
		borderColor: "#DCFCE7",
	},
	distCalloutText: {
		flex: 1,
		fontSize: 12,
		color: "#166534",
		lineHeight: 16,
	},
	distCalloutBold: {
		fontWeight: FONT.bold,
		color: "#15803D",
	},

	// ── 3. Monthly Solar Generation ──
	chartHeaderRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: 16,
	},
	viewAllBtn: {
		flexDirection: "row",
		alignItems: "center",
		gap: 3,
		paddingVertical: 4,
		paddingHorizontal: 6,
	},
	viewAllBtnText: {
		fontSize: 12.5,
		fontWeight: FONT.bold,
		color: "#EA580C",
	},
	chartContainer: {
		paddingTop: 4,
	},
	chartBarsRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "flex-end",
		height: 150,
		paddingHorizontal: 4,
	},
	chartCol: {
		flex: 1,
		alignItems: "center",
		height: "100%",
		justifyContent: "flex-end",
	},
	chartValText: {
		fontSize: 10.5,
		fontWeight: FONT.semi,
		color: "#64748B",
		marginBottom: 6,
	},
	chartValTextLatest: {
		color: "#EA580C",
		fontWeight: FONT.bold,
	},
	chartValTextSelected: {
		color: "#0F172A",
		fontWeight: FONT.bold,
	},
	chartTrack: {
		width: 22,
		height: 90,
		justifyContent: "flex-end",
		backgroundColor: "#F1F5F9",
		borderRadius: 8,
		overflow: "hidden",
		marginBottom: 6,
	},
	chartFill: {
		width: "100%",
		borderRadius: 8,
	},
	chartFillPrevious: {
		backgroundColor: "#FBBF24",
	},
	chartFillLatest: {
		backgroundColor: "#EA580C",
	},
	chartFillSelected: {
		backgroundColor: "#C2410C",
	},
	chartMonthText: {
		fontSize: 11,
		fontWeight: FONT.semi,
		color: "#64748B",
	},
	chartMonthTextLatest: {
		color: "#0F172A",
		fontWeight: FONT.bold,
	},
	chartYearText: {
		fontSize: 9.5,
		color: "#94A3B8",
		marginTop: 1,
	},
	chartYearTextLatest: {
		color: "#64748B",
		fontWeight: FONT.semi,
	},
	chartSelectedPill: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		backgroundColor: "#FFFBEB",
		borderRadius: 12,
		padding: 10,
		marginTop: 14,
		borderWidth: 1,
		borderColor: "#FEF3C7",
	},
	chartSelectedIcon: {
		width: 28,
		height: 28,
		borderRadius: 14,
		backgroundColor: "#FEF3C7",
		justifyContent: "center",
		alignItems: "center",
	},
	chartSelectedTitle: {
		fontSize: 12.5,
		fontWeight: FONT.semi,
		color: "#0F172A",
	},
	chartSelectedSub: {
		fontSize: 11,
		color: "#64748B",
		marginTop: 1,
	},
	chartEmpty: {
		paddingVertical: 24,
		alignItems: "center",
	},
	chartEmptyText: {
		fontSize: 12.5,
		color: "#94A3B8",
	},

	// ── 4 & 5. Quick Information Cards ──
	quickCardsRow: {
		flexDirection: "row",
		gap: 12,
	},
	quickCard: {
		flex: 1,
		backgroundColor: "#FFFFFF",
		borderRadius: 18,
		padding: 14,
		borderWidth: 1,
		borderColor: "#E2E8F0",
		...SHADOW.card,
		justifyContent: "space-between",
		minHeight: 125,
	},
	quickCardTop: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: 8,
	},
	quickIconWrapBlue: {
		width: 32,
		height: 32,
		borderRadius: 16,
		backgroundColor: "#EFF6FF",
		justifyContent: "center",
		alignItems: "center",
	},
	quickIconWrapAmber: {
		width: 32,
		height: 32,
		borderRadius: 16,
		backgroundColor: "#FEF3C7",
		justifyContent: "center",
		alignItems: "center",
	},
	quickCardLabel: {
		fontSize: 11.5,
		color: "#64748B",
		fontWeight: FONT.medium,
		marginBottom: 2,
	},
	quickCardAmount: {
		fontSize: 22,
		fontWeight: FONT.heavy,
		color: "#0F172A",
		letterSpacing: -0.4,
		marginBottom: 8,
	},
	quickCardTask: {
		fontSize: 14.5,
		fontWeight: FONT.bold,
		color: "#0F172A",
		letterSpacing: -0.2,
		marginBottom: 8,
	},
	quickCardFooter: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 4,
	},
	quickCardPeriod: {
		fontSize: 11,
		color: "#64748B",
		flex: 1,
	},
	quickCardDue: {
		fontSize: 11,
		color: "#64748B",
		fontWeight: FONT.medium,
	},
	statusBadge: {
		flexDirection: "row",
		alignItems: "center",
		gap: 3,
		paddingHorizontal: 6,
		paddingVertical: 2,
		borderRadius: 10,
	},
	statusBadgeText: {
		fontSize: 10.5,
		fontWeight: FONT.bold,
	},

	// ── Empty State ──
	emptyContainer: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		padding: SPACING.xl,
		backgroundColor: "#F8FAFC",
	},
	emptyIconWrap: {
		width: 76,
		height: 76,
		borderRadius: 38,
		backgroundColor: COLORS.glowGold,
		justifyContent: "center",
		alignItems: "center",
		marginBottom: SPACING.lg,
	},
	emptyTitle: {
		fontSize: 20,
		fontWeight: FONT.bold,
		color: COLORS.text,
		marginBottom: SPACING.sm,
		textAlign: "center",
	},
	emptySub: {
		fontSize: 13.5,
		color: COLORS.textSub,
		textAlign: "center",
		lineHeight: 20,
		marginBottom: SPACING.xl,
		maxWidth: 320,
	},
	emptyAddBtn: {
		flexDirection: "row",
		alignItems: "center",
		gap: SPACING.sm,
		backgroundColor: COLORS.gold,
		paddingHorizontal: SPACING.xl,
		paddingVertical: 14,
		borderRadius: RADIUS.full,
		...SHADOW.card,
	},
	emptyAddBtnText: {
		fontSize: 14,
		fontWeight: FONT.bold,
		color: COLORS.textInverse,
	},
});
