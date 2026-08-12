import { useEffect, useRef } from 'react';
import { Animated, Dimensions, Easing, StyleSheet, View } from 'react-native';

const { width, height } = Dimensions.get('window');
const COLORS = ['#FF3B30', '#FFCC00', '#34C759', '#0A84FF', '#AF52DE', '#FF9500'];
const PIECES = 60;

function Piece({ delay }: { delay: number }) {
  const x = useRef(new Animated.Value(width / 2)).current;
  const y = useRef(new Animated.Value(-20)).current;
  const rot = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const color = COLORS[Math.floor(Math.random() * COLORS.length)];
  const size = 6 + Math.random() * 6;
  const targetX = Math.random() * width;
  const targetY = height * (0.5 + Math.random() * 0.5);
  const spins = 2 + Math.random() * 3;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(x, {
        toValue: targetX,
        duration: 1600,
        delay,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(y, {
        toValue: targetY,
        duration: 1800,
        delay,
        easing: Easing.bezier(0.2, 0.6, 0.4, 1),
        useNativeDriver: true,
      }),
      Animated.timing(rot, { toValue: spins, duration: 1800, delay, useNativeDriver: true }),
      Animated.sequence([
        Animated.delay(delay + 1200),
        Animated.timing(opacity, { toValue: 0, duration: 600, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  const rotate = rot.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        width: size,
        height: size * 1.6,
        backgroundColor: color,
        borderRadius: 2,
        transform: [{ translateX: x }, { translateY: y }, { rotate }],
        opacity,
      }}
    />
  );
}

export function Confetti({ visible, onDone }: { visible: boolean; onDone?: () => void }) {
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => onDone?.(), 2500);
    return () => clearTimeout(t);
  }, [visible]);
  if (!visible) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
      {Array.from({ length: PIECES }, (_, i) => (
        <Piece key={i} delay={i * 12} />
      ))}
    </View>
  );
}
