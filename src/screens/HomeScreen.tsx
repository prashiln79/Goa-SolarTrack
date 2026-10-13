// ============================================================
// Home Screen — Simplified light-theme layout
// ============================================================
import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Path, Rect, Circle } from "react-native-svg";
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

	const retailEstimate = bill.estimatedTotalConsumptionKwh !== null ? estimateRetailBill(bill.estimatedTotalConsumptionKwh, bill.billAmount, profile.capacityKw) : null;

	const settlement = profile.settlementRateInr ? projectSettlement(bill.closingCreditKwh, profile.settlementRateInr, "FY 2026-27 (1 Apr – 31 Mar)", "31 May 2027") : null;

	// ── Scope toggle for Energy Flow (Latest Month vs All Bills) ──
	const [flowScope, setFlowScope] = useState<"month" | "all">("month");
	const [connectorWidth, setConnectorWidth] = useState(330);
	const [solarCardLayout, setSolarCardLayout] = useState({ width: 330, height: 58 });
	const [homeCardLayout, setHomeCardLayout] = useState({ width: 155, height: 140 });
	const [gridCardLayout, setGridCardLayout] = useState({ width: 155, height: 160 });

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

	// Solar card parallelogram SVG path (matching tilted solar panel reference)
	const sw = solarCardLayout.width || 330;
	const sh = solarCardLayout.height || 58;
	const pad = 2;
	const slant = Math.round(sh * 0.4);
	const halfBase = Math.round((sw - slant) / 2) - pad;
	const midX = Math.round(sw / 2);

	const xTL = midX - Math.round(slant / 2) - halfBase;
	const xTR = midX - Math.round(slant / 2) + halfBase;
	const xBL = midX + Math.round(slant / 2) - halfBase;
	const xBR = midX + Math.round(slant / 2) + halfBase;
	const yT = pad;
	const yB = sh - pad;
	const scr = 6;
	const slopeX = slant / Math.max(1, yB - yT);

	const solarPath = [
		`M ${xTL + scr} ${yT}`,
		`L ${xTR - scr} ${yT}`,
		`Q ${xTR} ${yT} ${Math.round(xTR + scr * slopeX)} ${yT + scr}`,
		`L ${Math.round(xBR - scr * slopeX)} ${yB - scr}`,
		`Q ${xBR} ${yB} ${xBR - scr} ${yB}`,
		`L ${xBL + scr} ${yB}`,
		`Q ${xBL} ${yB} ${Math.round(xBL - scr * slopeX)} ${yB - scr}`,
		`L ${Math.round(xTL + scr * slopeX)} ${yT + scr}`,
		`Q ${xTL} ${yT} ${xTL + scr} ${yT}`,
		"Z",
	].join(" ");

	// Square solar cells grid lines (light color background inside parallelogram)
	const solarRows = 2;
	const solarCols = 6;
	const gridSegments: string[] = [];
	for (let r = 1; r < solarRows; r++) {
		const y = Math.round(yT + (yB - yT) * (r / solarRows));
		const xL = Math.round(xTL + (y - yT) * slopeX + 4);
		const xR = Math.round(xTR + (y - yT) * slopeX - 4);
		gridSegments.push(`M ${xL} ${y} L ${xR} ${y}`);
	}
	for (let c = 1; c < solarCols; c++) {
		const t = c / solarCols;
		const xTop = Math.round(xTL + (xTR - xTL) * t);
		const xBot = Math.round(xBL + (xBR - xBL) * t);
		gridSegments.push(`M ${xTop} ${yT + 2} L ${xBot} ${yB - 2}`);
	}
	const solarGridPath = gridSegments.join(" ");

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

	const gw = gridCardLayout.width || 155;
	const gh = gridCardLayout.height || 160;

	// Bottom Grid -> Home import & Grid -> Battery paths
	const gridImportX = Math.round(connectorWidth - gw + ((gw - 16) * 0.25 + 8));
	const gridBatteryX = Math.round(connectorWidth - ((gw - 16) * 0.25 + 8));
	const importLineY = 20;
	const importPath = `M ${gridImportX} 0 L ${gridImportX} ${importLineY} L ${leftTargetX} ${importLineY} L ${leftTargetX} 0`;
	const importArrow = `M ${leftTargetX - 4} 7 L ${leftTargetX} 0 L ${leftTargetX + 4} 7`;
	const importPillCenterX = Math.round((leftTargetX + gridImportX) / 2);

	const batteryArrowTipY = 38;
	const batteryPath = `M ${gridBatteryX} 0 L ${gridBatteryX} ${batteryArrowTipY}`;
	const batteryArrow = `M ${gridBatteryX - 4} ${batteryArrowTipY - 6} L ${gridBatteryX} ${batteryArrowTipY} L ${gridBatteryX + 4} ${batteryArrowTipY - 6}`;

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
	const chWidth = Math.max(14, Math.round(slopeWidth * 0.2));
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
		"Z",
	].join(" ");

	const allTimeTotalBill = bills.reduce((sum, b) => sum + b.billAmount, 0);
	const allTimeTotalSavings = bills.reduce((sum, b) => {
		if (b.estimatedTotalConsumptionKwh === null) return sum;
		const est = estimateRetailBill(b.estimatedTotalConsumptionKwh, b.billAmount, profile.capacityKw);
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
			{/* ─── 1. Energy Overview (3 Simple Questions for Normal Person) ─── */}
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
				<View style={styles.flowchartWrap}>
					{/* ─── 1. TOP NODE: SOLAR GENERATED (Slanted Parallelogram Solar Panel) ─── */}
					<View
						style={styles.fcSolarCard}
						onLayout={(e) => {
							const { width, height } = e.nativeEvent.layout;
							if (width > 0 && height > 0 && (Math.abs(width - solarCardLayout.width) > 2 || Math.abs(height - solarCardLayout.height) > 2)) {
								setSolarCardLayout({
									width: Math.round(width),
									height: Math.round(height),
								});
							}
						}}
					>
						<Svg width={sw} height={sh} style={StyleSheet.absoluteFill}>
							{/* Outer Parallelogram Panel Frame */}
							<Path d={solarPath} fill="#FFFBEB" stroke="#F59E0B" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />

							{/* Square Photovoltaic Cells Grid (Light Color) */}
							<Path d={solarGridPath} stroke="#FDE68A" strokeWidth={1.3} strokeLinecap="round" />
						</Svg>

						{/* Same Row: Header (Icon + Label) & Reading Box */}
						<View style={styles.fcSolarMainRow}>
							<View style={styles.fcSolarHeaderGroup}>
								<View style={styles.fcSolarIconBadge}>
									<Ionicons name="sunny" size={12} color="#F59E0B" />
								</View>
								<Text style={styles.fcSolarHeaderLabel}>SOLAR GENERATED</Text>
							</View>

							{/* Reading Box */}
							<View style={styles.fcSolarLcdBox}>
								<Text style={styles.fcSolarHeroNum}>
									{displayGen ?? "—"}
									<Text style={styles.fcSolarHeroUnit}> kWh</Text>
								</Text>
							</View>
						</View>

						{/* Centered Daily Average */}
						<View style={styles.fcSolarAvgRow}>
							<Ionicons name="stats-chart" size={9.5} color="#D97706" />
							<Text style={styles.fcSolarAvgText}>
								{flowScope === "month" && avgPerDay ? `${avgPerDay} kWh/day avg` : `${((displayGen ?? 0) / Math.max(1, bills.length * 30)).toFixed(1)} kWh/day avg`}
							</Text>
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
							<Path d={leftPath} stroke="#8B5CF6" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
							<Path d={leftArrow} stroke="#8B5CF6" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
							{/* Right flow (Green): Straight stem -> horizontal split -> drop */}
							<Path d={rightPath} stroke="#10B981" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
							<Path d={rightArrow} stroke="#10B981" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
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
								if (width > 0 && height > 0 && (Math.abs(width - homeCardLayout.width) > 2 || Math.abs(height - homeCardLayout.height) > 2)) {
									setHomeCardLayout({
										width: Math.round(width),
										height: Math.round(height),
									});
								}
							}}
						>
							<Svg width={hw} height={hh} style={StyleSheet.absoluteFill}>
								{/* House Wall & Roof Silhouette */}
								<Path d={housePath} fill="#FAF5FF" stroke="#7C3AED" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />

								{/* Attic Circular Window on Roof Gable */}
								<Circle cx={hcx} cy={Math.round(roofEaveY * 0.44)} r={6.5} fill="#EDE9FE" stroke="#7C3AED" strokeWidth={1.5} />
								<Path
									d={`M ${hcx - 6.5} ${Math.round(roofEaveY * 0.44)} L ${hcx + 6.5} ${Math.round(roofEaveY * 0.44)} M ${hcx} ${Math.round(roofEaveY * 0.44) - 6.5} L ${hcx} ${Math.round(roofEaveY * 0.44) + 6.5}`}
									stroke="#7C3AED"
									strokeWidth={1.2}
								/>
							</Svg>

							{/* Centered Content: Title, Reading, Tag */}
							<View style={styles.fcHomeCenterContent}>
								<Text style={styles.fcHomeTitleText}>Home</Text>

								{/* Consumption Value Box */}
								<View style={styles.fcHomeLcdBox}>
									<Text style={styles.fcHeroValue}>
										{displayHomeConsumption.toFixed(0)}
										<Text style={styles.fcHeroUnit}> kWh</Text>
									</Text>
								</View>

								{/* Total Consumed Label Tag */}
								<View style={styles.fcHomeTag}>
									<Text style={styles.fcHomeTagText}>Total Used</Text>
								</View>
							</View>
						</View>

						{/* Right Card: Goa Grid (Utility Meter Enclosure Shape) */}
						<View
							style={styles.fcGridCard}
							onLayout={(e) => {
								const { width, height } = e.nativeEvent.layout;
								if (width > 0 && height > 0 && (Math.abs(width - gridCardLayout.width) > 2 || Math.abs(height - gridCardLayout.height) > 2)) {
									setGridCardLayout({
										width: Math.round(width),
										height: Math.round(height),
									});
								}
							}}
						>
							{/* Vector SVG Meter Enclosure */}
							<Svg width={gw} height={gh} style={StyleSheet.absoluteFill}>
								{/* Left Hinge Tabs (Upper & Lower) */}
								<Rect x={1} y={Math.round(2 + (gh - 18) * 0.18)} width={7} height={18} rx={3} ry={3} fill="#F0FDF4" stroke="#0D9488" strokeWidth={2} />
								<Rect x={1} y={Math.round(2 + (gh - 18) * 0.62)} width={7} height={18} rx={3} ry={3} fill="#F0FDF4" stroke="#0D9488" strokeWidth={2} />

								{/* Right Latch Handle */}
								<Rect x={Math.max(10, gw - 8)} y={Math.round(2 + (gh - 18) * 0.35)} width={7} height={28} rx={3} ry={3} fill="#F0FDF4" stroke="#0D9488" strokeWidth={2} />

								{/* Bottom Cable Glands / Terminals (Left, Middle, Right) */}
								{/* Left terminal */}
								<Rect x={Math.round((gw - 16) * 0.25 + 8 - 7)} y={gh - 16} width={14} height={5} rx={1.5} fill="#F0FDF4" stroke="#0D9488" strokeWidth={1.8} />
								<Rect x={Math.round((gw - 16) * 0.25 + 8 - 4.5)} y={gh - 12} width={9} height={8} rx={2} fill="#F0FDF4" stroke="#0D9488" strokeWidth={1.8} />

								{/* Middle terminal */}
								<Rect x={Math.round(gw / 2 - 7)} y={gh - 16} width={14} height={5} rx={1.5} fill="#F0FDF4" stroke="#0D9488" strokeWidth={1.8} />
								<Rect x={Math.round(gw / 2 - 4.5)} y={gh - 12} width={9} height={8} rx={2} fill="#F0FDF4" stroke="#0D9488" strokeWidth={1.8} />

								{/* Right terminal */}
								<Rect x={Math.round((gw - 16) * 0.75 + 8 - 7)} y={gh - 16} width={14} height={5} rx={1.5} fill="#F0FDF4" stroke="#0D9488" strokeWidth={1.8} />
								<Rect x={Math.round((gw - 16) * 0.75 + 8 - 4.5)} y={gh - 12} width={9} height={8} rx={2} fill="#F0FDF4" stroke="#0D9488" strokeWidth={1.8} />

								{/* Main Meter Outer Enclosure Box */}
								<Rect x={7} y={2} width={Math.max(10, gw - 14)} height={Math.max(10, gh - 18)} rx={14} ry={14} fill="#F0FDF4" stroke="#0D9488" strokeWidth={2.5} />

								{/* Inner Bezel Border */}
								<Rect x={13} y={7} width={Math.max(6, gw - 26)} height={Math.max(6, gh - 28)} rx={8} ry={8} fill="none" stroke="#A7F3D0" strokeWidth={1.5} />
							</Svg>

							{/* Header: Meter Icon and Title */}
							<View style={styles.fcNodeHeader}>
								<View style={styles.fcGridIconWrap}>
									<GridIcon size={16} color="#0D9488" />
								</View>
								<Text style={styles.fcCardTitleText}>Grid</Text>
							</View>

							{/* Digital LCD Window with Reading */}
							<View style={styles.fcGridLcdBox}>
								<Text style={styles.fcHeroValue}>
									{displayExp}
									<Text style={styles.fcHeroUnit}> kWh</Text>
								</Text>
							</View>

							{/* 3 Push Buttons below LCD */}
							<View style={styles.fcMeterButtonsRow}>
								<View style={styles.fcMeterBtn} />
								<View style={styles.fcMeterBtn} />
								<View style={styles.fcMeterBtn} />
							</View>

							{/* Bottom Breakdown Floor Card */}
							<View style={styles.fcGridFloorCard}>
								<View style={styles.fcBreakdownItem}>
									<Ionicons name="pie-chart" size={11} color="#0D9488" />
									<Text style={styles.fcBreakdownLabel} numberOfLines={1}>
										Solar Share
									</Text>
									<Text style={styles.fcBreakdownValExport} numberOfLines={1}>
										{solarToGridPct}%
									</Text>
								</View>
								<View style={styles.fcGridFloorDivider} />
								<View style={styles.fcBreakdownItem}>
									<Ionicons name="stats-chart" size={11} color="#10B981" />
									<Text style={styles.fcBreakdownLabel} numberOfLines={1}>
										Daily Avg
									</Text>
									<Text style={styles.fcBreakdownValExport} numberOfLines={1}>
										{exportAvgPerDay} kWh
									</Text>
								</View>
							</View>
						</View>
					</View>

					{/* ─── 4. BOTTOM CONNECTORS: GRID → HOME & GRID → BATTERY ─── */}
					<View
						style={styles.fcImportConnector}
						onLayout={(e) => {
							const w = Math.round(e.nativeEvent.layout.width);
							if (w > 0 && Math.abs(w - connectorWidth) > 2) {
								setConnectorWidth(w);
							}
						}}
					>
						<Svg width={connectorWidth} height={100} style={StyleSheet.absoluteFill}>
							{/* Left: Grid -> Home import path (Blue) */}
							<Path d={importPath} stroke="#2563EB" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
							<Path d={importArrow} stroke="#2563EB" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />

							{/* Right: Grid -> Battery remaining balance path (Emerald Green) */}
							<Path d={batteryPath} stroke="#059669" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
							<Path d={batteryArrow} stroke="#059669" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
						</Svg>

						{/* Imported Value Pill Badge (Centered along the horizontal path, not covering arrows) */}
						<View style={[styles.fcImportPillWrap, { left: Math.max(leftTargetX + 16, Math.min(gridImportX - 110, Math.round(importPillCenterX - 55))) }]}>
							<View style={styles.fcImportPill}>
								<Ionicons name="arrow-back" size={11} color="#2563EB" />
								<Text style={styles.fcImportPillText}>
									Imported: <Text style={styles.fcImportPillVal}>{displayImp} kWh</Text>
								</Text>
							</View>
						</View>

						{/* Battery Remaining Balance Badge (Bigger) */}
						<View style={[styles.fcBatteryPillWrap, { right: 0 }]}>
							<View style={styles.fcBatteryPill}>
								<View style={styles.fcBatteryIconCircle}>
									<Ionicons name="battery-charging" size={18} color="#059669" />
								</View>
								<View style={styles.fcBatteryTextCol}>
									<Text style={styles.fcBatteryPillText} numberOfLines={1}>
										{connectorWidth < 340 ? "Remaining" : "Remaining Balance"}
									</Text>
									<View style={styles.fcBatteryValRow}>
										<Text style={styles.fcBatteryPillVal}>{displayClosingCredit}</Text>
										<Text style={styles.fcBatteryUnit}>kWh</Text>
									</View>
								</View>
							</View>
						</View>
					</View>

					{/* ─── 5. INTEGRATED ENERGY BANK ─── */}
					{/* <View style={styles.bankContainer}>
						<View style={styles.bankHeaderRow}>
							<View style={styles.bankTitleGroup}>
								<View style={styles.bankIconWrap}>
									<Ionicons name="battery-charging" size={16} color={COLORS.bank} />
								</View>
								<View>
									<Text style={styles.bankTitleText}>Energy Bank</Text>
									<Text style={styles.bankSubtitleText}>
										{flowScope === "month" ? `Carried forward (${bill.period})` : `Carried forward (as of ${lastPeriod})`}
									</Text>
								</View>
							</View>
							<View style={styles.bankHeroBadge}>
								<Text style={styles.bankHeroVal}>
									{displayClosingCredit} <Text style={styles.bankHeroUnit}>kWh</Text>
								</Text>
								<Text style={styles.bankHeroSub}>Balance</Text>
							</View>
						</View>

						<View style={styles.formulaRow}>
							<FormulaStep value={displayOpeningCredit} label="Opening" />
							<Text style={styles.formulaOp}>＋</Text>
							<FormulaStep value={displayExp ?? 0} label="Export" color={COLORS.export} />
							<Text style={styles.formulaOp}>－</Text>
							<FormulaStep value={displayUsedCredit} label="Used" color={COLORS.import} />
							<Text style={styles.formulaOp}>＝</Text>
							<FormulaStep value={displayClosingCredit} label="Balance" color={COLORS.gold} highlight />
						</View>

						{bill.needsReview && (
							<InfoNote
								text="⚠️ Bill value differs from calculated. Bill-stated values are preserved."
								color={COLORS.danger}
								style={{ marginTop: SPACING.xs }}
							/>
						)}
					</View> */}
				</View>
			</Card>

			{/* ─── 2. Current Bill ─── */}
			<Card
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
			</Card>

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

	// Flowchart
	flowchartWrap: {
		width: "100%",
		marginTop: 2,
	},

	// 1. Solar Generated Card (Slanted Parallelogram)
	fcSolarCard: {
		width: "100%",
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "transparent",
		paddingVertical: 5,
		paddingHorizontal: 22,
		minHeight: 56,
		position: "relative",
	},
	fcSolarMainRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		width: "100%",
	},
	fcSolarHeaderGroup: {
		flexDirection: "row",
		alignItems: "center",
		gap: 5,
	},
	fcSolarIconBadge: {
		width: 18,
		height: 18,
		borderRadius: 9,
		backgroundColor: "#FEF3C7",
		alignItems: "center",
		justifyContent: "center",
	},
	fcSolarHeaderLabel: {
		fontSize: 10,
		fontWeight: FONT.bold,
		color: "#B45309",
		letterSpacing: 0.5,
		textTransform: "uppercase",
	},
	fcSolarLcdBox: {
		backgroundColor: "rgba(255, 255, 255, 0.92)",
		borderWidth: 1.5,
		borderColor: "#FCD34D",
		borderRadius: 6,
		paddingVertical: 2,
		paddingHorizontal: 8,
		alignItems: "center",
		justifyContent: "center",
	},
	fcSolarHeroNum: {
		fontSize: 18,
		fontWeight: FONT.heavy,
		color: "#0F172A",
		letterSpacing: -0.3,
	},
	fcSolarHeroUnit: {
		fontSize: 11.5,
		fontWeight: FONT.semi,
		color: "#64748B",
		marginLeft: 3,
	},
	fcSolarAvgRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 4,
		marginTop: 2,
		backgroundColor: "#FEF3C7",
		paddingHorizontal: 8,
		paddingVertical: 1.5,
		borderRadius: 6,
		borderWidth: 1,
		borderColor: "#FDE68A",
	},
	fcSolarAvgText: {
		fontSize: 9.5,
		fontWeight: FONT.semi,
		color: "#B45309",
		textAlign: "center",
	},

	// 2. Connector & Flow Arrows
	fcConnectorContainer: {
		width: "100%",
		height: 54,
		position: "relative",
		justifyContent: "center",
	},
	fcPillBadgeLeft: {
		position: "absolute",
		top: 15,
		backgroundColor: "#F3E8FF",
		borderWidth: 1,
		borderColor: "#E9D5FF",
		paddingHorizontal: 8,
		paddingVertical: 2,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	fcPillTextLeft: {
		fontSize: 11,
		fontWeight: FONT.bold,
		color: "#7C3AED",
	},
	fcPillBadgeRight: {
		position: "absolute",
		top: 15,
		backgroundColor: "#DCFCE7",
		borderWidth: 1,
		borderColor: "#BBF7D0",
		paddingHorizontal: 8,
		paddingVertical: 2,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	fcPillTextRight: {
		fontSize: 11,
		fontWeight: FONT.bold,
		color: "#059669",
	},

	// 3. Middle Row
	fcMiddleRow: {
		width: "100%",
		flexDirection: "row",
		alignItems: "stretch",
		gap: 10,
	},
	fcHomeCard: {
		flex: 1,
		minWidth: 0,
		backgroundColor: "transparent",
		paddingHorizontal: 22,
		paddingTop: 60,
		paddingBottom: 22,
		minHeight: 168,
		justifyContent: "center",
		alignItems: "center",
		position: "relative",
	},
	fcHomeCenterContent: {
		width: "100%",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
	},
	fcHomeTitleText: {
		fontSize: 14,
		fontWeight: FONT.bold,
		color: "#0F172A",
		textAlign: "center",
	},
	fcHomeLcdBox: {
		backgroundColor: "#FAF5FF",
		borderWidth: 1.5,
		borderColor: "#8B5CF6",
		borderRadius: 8,
		paddingVertical: 6,
		paddingHorizontal: 10,
		alignItems: "center",
		justifyContent: "center",
		width: "100%",
	},
	fcHomeTag: {
		backgroundColor: "#EDE9FE",
		paddingHorizontal: 10,
		paddingVertical: 4,
		borderRadius: 6,
		alignItems: "center",
		justifyContent: "center",
	},
	fcHomeTagText: {
		fontSize: 9.5,
		fontWeight: FONT.bold,
		color: "#7C3AED",
		letterSpacing: 0.6,
		textTransform: "uppercase",
		textAlign: "center",
	},
	fcGridCard: {
		flex: 1,
		minWidth: 0,
		backgroundColor: "transparent",
		paddingHorizontal: 16,
		paddingTop: 10,
		paddingBottom: 22,
		minHeight: 168,
		justifyContent: "space-between",
		position: "relative",
	},
	fcGridLcdBox: {
		backgroundColor: "#E0F2FE",
		borderWidth: 1.5,
		borderColor: "#0D9488",
		borderRadius: 8,
		paddingVertical: 3,
		paddingHorizontal: 6,
		alignItems: "center",
		justifyContent: "center",
		width: "100%",
		marginVertical: 2,
	},
	fcMeterButtonsRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
		marginBottom: 4,
	},
	fcMeterBtn: {
		width: 7,
		height: 7,
		borderRadius: 2,
		backgroundColor: "#CCFBF1",
		borderWidth: 1,
		borderColor: "#0D9488",
	},
	fcNodeHeader: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		marginBottom: 6,
	},
	fcHomeIconWrap: {
		width: 32,
		height: 32,
		borderRadius: 16,
		backgroundColor: "#EDE9FE",
		alignItems: "center",
		justifyContent: "center",
	},
	fcGridIconWrap: {
		width: 32,
		height: 32,
		borderRadius: 16,
		backgroundColor: "#DCFCE7",
		alignItems: "center",
		justifyContent: "center",
	},
	fcCardTitleText: {
		fontSize: 14,
		fontWeight: FONT.bold,
		color: "#0F172A",
		flexShrink: 1,
	},
	fcHeroValueRow: {
		flexDirection: "row",
		alignItems: "baseline",
		justifyContent: "center",
		width: "100%",
		marginBottom: 10,
	},
	fcHeroValue: {
		fontSize: 24,
		fontWeight: FONT.heavy,
		color: "#0F172A",
		letterSpacing: -0.4,
	},
	fcHeroUnit: {
		fontSize: 13,
		fontWeight: FONT.semi,
		color: "#64748B",
		marginLeft: 4,
	},
	fcBreakdownList: {
		gap: 6,
	},
	fcBreakdownItem: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	fcBreakdownLabel: {
		fontSize: 11,
		color: "#475569",
		fontWeight: FONT.medium,
		flex: 1,
		marginLeft: 5,
	},
	fcBreakdownValSolar: {
		fontSize: 12,
		fontWeight: FONT.bold,
		color: "#7C3AED",
	},
	fcBreakdownValGrid: {
		fontSize: 12,
		fontWeight: FONT.bold,
		color: "#2563EB",
	},
	fcBreakdownValExport: {
		fontSize: 12,
		fontWeight: FONT.bold,
		color: "#059669",
	},

	fcGridBadge: {
		flexDirection: "row",
		alignItems: "center",
		gap: 3,
		backgroundColor: "#DCFCE7",
		paddingHorizontal: 7,
		paddingVertical: 2,
		borderRadius: 10,
		marginLeft: "auto",
	},
	fcGridBadgeText: {
		fontSize: 10,
		fontWeight: FONT.bold,
		color: "#059669",
	},
	fcGridFloorCard: {
		width: "100%",
		backgroundColor: "#FFFFFF",
		borderRadius: 10,
		borderWidth: 1,
		borderColor: "#BBF7D0",
		paddingVertical: 6,
		paddingHorizontal: 8,
		gap: 4,
	},
	fcGridFloorDivider: {
		height: 1,
		backgroundColor: "#F0FDF4",
	},

	// Bottom Grid -> Home Import & Grid -> Battery Connectors
	fcImportConnector: {
		width: "100%",
		height: 100,
		position: "relative",
		marginTop: 0,
		marginBottom: 4,
	},
	fcImportPillWrap: {
		position: "absolute",
		top: 9,
		alignItems: "center",
		justifyContent: "center",
	},
	fcImportPill: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		backgroundColor: "#EFF6FF",
		borderWidth: 1,
		borderColor: "#BFDBFE",
		borderRadius: 12,
		paddingHorizontal: 10,
		paddingVertical: 3.5,
	},
	fcImportPillText: {
		fontSize: 11,
		color: "#1E40AF",
		fontWeight: FONT.medium,
	},
	fcImportPillVal: {
		fontSize: 11,
		fontWeight: FONT.bold,
		color: "#2563EB",
	},
	fcBatteryPillWrap: {
		position: "absolute",
		top: 40,
		alignItems: "center",
		justifyContent: "center",
	},
	fcBatteryPill: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		backgroundColor: "#F0FDF4",
		borderWidth: 1.5,
		borderColor: "#86EFAC",
		borderRadius: 16,
		paddingVertical: 6,
		paddingHorizontal: 10,
		...SHADOW.card,
	},
	fcBatteryIconCircle: {
		width: 32,
		height: 32,
		borderRadius: 16,
		backgroundColor: "#DCFCE7",
		alignItems: "center",
		justifyContent: "center",
	},
	fcBatteryTextCol: {
		justifyContent: "center",
	},
	fcBatteryPillText: {
		fontSize: 10,
		fontWeight: FONT.bold,
		color: "#047857",
		letterSpacing: 0.5,
		textTransform: "uppercase",
	},
	fcBatteryValRow: {
		flexDirection: "row",
		alignItems: "baseline",
		gap: 3,
		marginTop: 1,
	},
	fcBatteryPillVal: {
		fontSize: 22,
		fontWeight: FONT.heavy,
		color: "#065F46",
		letterSpacing: -0.3,
	},
	fcBatteryUnit: {
		fontSize: 13,
		fontWeight: FONT.semi,
		color: "#059669",
	},

	// Flow grid
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
