import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';

export function useTheme() {
  const scheme = useColorScheme();
  const c = Colors[scheme];
  return { scheme, c, brand: Colors.brand };
}
