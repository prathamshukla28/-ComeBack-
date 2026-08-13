import { useEffect, useRef, useState } from 'react';
import { Text, type TextStyle } from 'react-native';

export function AnimatedNumber({
  value,
  style,
  duration = 600,
}: {
  value: number;
  style?: TextStyle | TextStyle[];
  duration?: number;
}) {
  const [display, setDisplay] = useState(value);
  const displayRef = useRef(value);
  displayRef.current = display;

  useEffect(() => {
    const start = displayRef.current;
    const delta = value - start;
    if (delta === 0) return;
    const startTs = Date.now();
    let raf = 0;
    const tick = () => {
      const t = Math.min(1, (Date.now() - startTs) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(start + delta * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <Text style={style}>{display}</Text>;
}
