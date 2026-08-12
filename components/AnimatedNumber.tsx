import { useEffect, useState } from 'react';
import { Text, type TextStyle } from 'react-native';

export function AnimatedNumber({ value, style, duration = 600 }: { value: number; style?: TextStyle | TextStyle[]; duration?: number }) {
  const [display, setDisplay] = useState(value);
  useEffect(() => {
    const start = display;
    const delta = value - start;
    if (delta === 0) return;
    const startTs = Date.now();
    let raf: any;
    const tick = () => {
      const t = Math.min(1, (Date.now() - startTs) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(start + delta * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <Text style={style}>{display}</Text>;
}
