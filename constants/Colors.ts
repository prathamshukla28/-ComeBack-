// ComeBack — brand palette
const brand = '#FF3B30';       // gym red — action, PRs, streaks
const brandMuted = '#B5251E';
const accent = '#0A84FF';       // links, secondary actions

export default {
  brand,
  brandMuted,
  accent,
  light: {
    text: '#0A0A0A',
    textMuted: '#6B7280',
    background: '#FAFAF9',
    card: '#FFFFFF',
    border: '#E5E7EB',
    tint: brand,
    tabIconDefault: '#9CA3AF',
    tabIconSelected: brand,
    danger: '#DC2626',
    success: '#16A34A',
  },
  dark: {
    text: '#F5F5F4',
    textMuted: '#9CA3AF',
    background: '#0A0A0A',
    card: '#171717',
    border: '#262626',
    tint: brand,
    tabIconDefault: '#525252',
    tabIconSelected: brand,
    danger: '#EF4444',
    success: '#22C55E',
  },
};
