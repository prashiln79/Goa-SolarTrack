// ============================================================
// Solar Mascot Card — Interactive Animated Motion Character
// Depicts Real-time Solar System Health & Energy Status
// ============================================================

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CareAssessment, SolarBill } from '../types/solar';

// Asset sources for the 3 dynamic states
const MASCOT_HAPPY = require('../../assets/mascot-happy-transparent.png');
const MASCOT_WASH = require('../../assets/mascot-wash.png');
const MASCOT_MONSOON = require('../../assets/mascot-monsoon.png');

interface SolarMascotCardProps {
  bill: SolarBill | null;
  careAssessment: CareAssessment;
  selfSufficiencyPct: number;
  onNavigateCare?: () => void;
  onNavigateAnalytics?: () => void;
  onLogClean?: () => void;
}

export const SolarMascotCard: React.FC<SolarMascotCardProps> = ({
  bill,
  careAssessment,
  selfSufficiencyPct,
  onNavigateCare,
  onNavigateAnalytics,
  onLogClean,
}) => {
  // ── Determine Mascot Mood & State ──────────────────────────
  const isWashNeeded =
    careAssessment.state === 'Cleaning recommended' ||
    careAssessment.state === 'Cleaning check recommended' ||
    careAssessment.daysSinceLastClean > 35;

  const currentMonth = new Date().getMonth(); // 5 = June, 6 = July, 7 = Aug, 8 = Sept (Goa Monsoon)
  const isMonsoon = currentMonth >= 5 && currentMonth <= 8 && !isWashNeeded;

  // Mascot image and speech based on state
  let mascotImage = MASCOT_HAPPY;
  let statusBadgeText = 'System Healthy';
  let statusBadgeColor = '#059669';
  let statusBadgeBg = '#ECFDF5';
  let defaultQuote = 'All systems go! Generating clean solar power for your home.';

  if (isWashNeeded) {
    mascotImage = MASCOT_WASH;
    statusBadgeText = 'Needs a Wash';
    statusBadgeColor = '#EA580C';
    statusBadgeBg = '#FFF7ED';
    defaultQuote =
      careAssessment.daysSinceLastClean > 30
        ? `It's been ${careAssessment.daysSinceLastClean} days since my last wash! A quick splash will boost my output.`
        : 'My rooftop panels caught some dust! A gentle water spray will help me shine.';
  } else if (isMonsoon) {
    mascotImage = MASCOT_MONSOON;
    statusBadgeText = 'Monsoon Season';
    statusBadgeColor = '#0284C7';
    statusBadgeBg = '#E0F2FE';
    defaultQuote = 'Monsoon showers in Goa! The rain is giving my panels a natural rinse.';
  } else if (selfSufficiencyPct >= 80) {
    defaultQuote = `Your rooftop covered ${selfSufficiencyPct}% of your electricity this cycle! Super proud!`;
  }

  // ── Interactive Quotes on Tap ──────────────────────────────
  const quotesList = isWashNeeded
    ? [
        'A quick wash helps me generate up to 15% more power!',
        'A gentle rinse with water early morning is best!',
        defaultQuote,
      ]
    : isMonsoon
    ? [
        'Rainy days are cozy! Banked units keep your home powered.',
        'Natural rainwater keeps dust from settling on my glass.',
        defaultQuote,
      ]
    : [
        defaultQuote,
        `Solar output is looking strong this month (${bill?.generationKwh ?? 0} kWh)!`,
        `Rooftop self-sufficiency is at ${selfSufficiencyPct}%! Great job!`,
        'Clean panels + Goa sunshine = Maximum savings! ⚡',
      ];

  const [quoteIndex, setQuoteIndex] = useState(0);

  // ── Smooth Native-Driven Motion Animations ─────────────────
  const [floatAnim] = useState(() => new Animated.Value(0));
  const [shadowScale] = useState(() => new Animated.Value(1));
  const [tapBounce] = useState(() => new Animated.Value(0));
  const [speechBubbleFade] = useState(() => new Animated.Value(1));

  useEffect(() => {
    // 1) Continuous Gentle Breathing / Floating Loop
    const floatLoop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(floatAnim, {
            toValue: -8,
            duration: 1800,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(shadowScale, {
            toValue: 0.88,
            duration: 1800,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(floatAnim, {
            toValue: 0,
            duration: 1800,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(shadowScale, {
            toValue: 1,
            duration: 1800,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      ])
    );
    floatLoop.start();

    return () => floatLoop.stop();
  }, [floatAnim, shadowScale]);

  // Handle Tap Interaction
  const handleTapMascot = () => {
    // Playful Hop
    Animated.sequence([
      Animated.timing(tapBounce, {
        toValue: -16,
        duration: 150,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.spring(tapBounce, {
        toValue: 0,
        friction: 4,
        tension: 100,
        useNativeDriver: true,
      }),
    ]).start();

    // Fade and switch speech bubble text
    Animated.sequence([
      Animated.timing(speechBubbleFade, {
        toValue: 0.2,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(speechBubbleFade, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();

    setQuoteIndex((prev) => (prev + 1) % quotesList.length);
  };

  const currentSpeech = quotesList[quoteIndex] || defaultQuote;

  return (
    <View style={styles.card}>
      {/* ── Top Header with Live System Health Pill ── */}
      <View style={styles.headerRow}>
        <View style={styles.titleCol}>
          <Text style={styles.title}>System Companion</Text>
          <Text style={styles.subtitle}>Tap your solar house to check in</Text>
        </View>

        <View style={[styles.healthBadge, { backgroundColor: statusBadgeBg }]}>
          <View style={[styles.healthDot, { backgroundColor: statusBadgeColor }]} />
          <Text style={[styles.healthBadgeText, { color: statusBadgeColor }]}>
            {statusBadgeText}
          </Text>
        </View>
      </View>

      {/* ── Character Center Stage with Motion ── */}
      <View style={styles.stage}>
        {/* Animated Speech Bubble */}
        <Animated.View
          style={[
            styles.speechBubble,
            { opacity: speechBubbleFade },
          ]}
        >
          <Text style={styles.speechText}>{currentSpeech}</Text>
          <View style={styles.bubbleTail} />
        </Animated.View>

        {/* Mascot Image with Float + Tap Bounce */}
        <TouchableOpacity
          id="btn-mascot-character"
          activeOpacity={0.9}
          onPress={handleTapMascot}
          style={styles.mascotTouchable}
        >
          <Animated.View
            style={[
              styles.mascotContainer,
              {
                transform: [
                  { translateY: Animated.add(floatAnim, tapBounce) },
                ],
              },
            ]}
          >
            <Image
              source={mascotImage}
              style={styles.mascotImage}
              resizeMode="contain"
            />
          </Animated.View>

          {/* 3D Depth Ground Shadow */}
          <Animated.View
            style={[
              styles.groundShadow,
              {
                transform: [{ scaleX: shadowScale }, { scaleY: shadowScale }],
              },
            ]}
          />
        </TouchableOpacity>
      </View>

      {/* ── Quick Health Chips Bar ── */}
      <View style={styles.chipsRow}>
        {/* Chip 1: Self Sufficiency */}
        <TouchableOpacity
          style={styles.chip}
          onPress={onNavigateAnalytics}
          activeOpacity={0.7}
        >
          <Ionicons name="flash" size={13} color="#EA580C" />
          <Text style={styles.chipText}>{selfSufficiencyPct}% Self-Powered</Text>
        </TouchableOpacity>

        {/* Chip 2: Panel Cleanliness */}
        <TouchableOpacity
          style={styles.chip}
          onPress={onNavigateCare}
          activeOpacity={0.7}
        >
          <Ionicons
            name={isWashNeeded ? 'water' : 'sparkles'}
            size={13}
            color={isWashNeeded ? '#EA580C' : '#059669'}
          />
          <Text
            style={[
              styles.chipText,
              isWashNeeded && { color: '#EA580C', fontWeight: '700' },
            ]}
          >
            {isWashNeeded ? 'Wash Needed' : 'Panels Clean'}
          </Text>
        </TouchableOpacity>

        {/* Chip 3: Status / Log Clean */}
        {isWashNeeded && onLogClean ? (
          <TouchableOpacity
            id="btn-mascot-log-clean"
            style={[styles.chip, styles.chipAction]}
            onPress={onLogClean}
            activeOpacity={0.7}
          >
            <Ionicons name="water-outline" size={13} color="#FFFFFF" />
            <Text style={styles.chipActionText}>Log Wash</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.chip}
            onPress={onNavigateCare}
            activeOpacity={0.7}
          >
            <Ionicons name="shield-checkmark" size={13} color="#2563EB" />
            <Text style={styles.chipText}>Care Active</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  titleCol: {
    flex: 1,
    paddingRight: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 1,
  },
  healthBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 20,
  },
  healthDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  healthBadgeText: {
    fontSize: 11.5,
    fontWeight: '700',
  },

  // ── Stage ──
  stage: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  speechBubble: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 9,
    maxWidth: '92%',
    marginBottom: 4,
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  speechText: {
    fontSize: 12.5,
    color: '#334155',
    lineHeight: 17,
    textAlign: 'center',
    fontWeight: '500',
  },
  bubbleTail: {
    position: 'absolute',
    bottom: -6,
    alignSelf: 'center',
    width: 10,
    height: 10,
    backgroundColor: '#F8FAFC',
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#CBD5E1',
    transform: [{ rotate: '45deg' }],
  },
  mascotTouchable: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  mascotContainer: {
    width: 220,
    height: 145,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mascotImage: {
    width: '100%',
    height: '100%',
  },
  groundShadow: {
    width: 120,
    height: 10,
    borderRadius: 50,
    backgroundColor: 'rgba(15, 23, 42, 0.09)',
    marginTop: -8,
  },

  // ── Quick Health Chips ──
  chipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    flexWrap: 'wrap',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#334155',
  },
  chipAction: {
    backgroundColor: '#EA580C',
    borderColor: '#EA580C',
  },
  chipActionText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
