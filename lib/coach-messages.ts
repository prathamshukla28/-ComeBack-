export type Vibe = 'good' | 'ok' | 'warn' | 'bad';
export interface CoachMessage {
  text: string;
  vibe: Vibe;
  emoji: string;
}

export function cigaretteMessage(count: number): CoachMessage {
  if (count === 0) return { text: 'Zero cigs today. Lungs approve.', vibe: 'good', emoji: '🫁' };
  if (count === 1) return { text: 'One down. Try to make that the last.', vibe: 'ok', emoji: '👀' };
  if (count <= 3)
    return {
      text: `${count} today. Water break instead of the next one?`,
      vibe: 'warn',
      emoji: '💧',
    };
  if (count <= 6)
    return { text: `${count} today. Your bench will feel it tomorrow.`, vibe: 'warn', emoji: '⚠️' };
  if (count <= 10)
    return { text: `${count} today. Rough day. Talk to your Coach.`, vibe: 'bad', emoji: '🚨' };
  return { text: `${count}+. Chest is screaming. Slow down.`, vibe: 'bad', emoji: '🆘' };
}

export function alcoholMessage(units: number): CoachMessage {
  if (units === 0) return { text: 'Dry day. Recovery is happening.', vibe: 'good', emoji: '💪' };
  if (units <= 2) return { text: `${units} units. Within safe range.`, vibe: 'ok', emoji: '🍷' };
  if (units <= 4)
    return {
      text: `${units} units. Tomorrow\u2019s lift will drop 5-10%.`,
      vibe: 'warn',
      emoji: '⚠️',
    };
  if (units <= 7)
    return { text: `${units} units. Sleep + gains both taking a hit.`, vibe: 'warn', emoji: '😬' };
  return {
    text: `${units}+ units. Big night. Hydrate. Skip fasted training tomorrow.`,
    vibe: 'bad',
    emoji: '🚨',
  };
}

export function workoutMessage(setsToday: number): CoachMessage {
  if (setsToday === 0)
    return { text: 'Rest day or no-show? Log something.', vibe: 'ok', emoji: '⏳' };
  if (setsToday < 6)
    return { text: `${setsToday} sets. Warm-up done. Keep going.`, vibe: 'ok', emoji: '🔥' };
  if (setsToday < 15)
    return { text: `${setsToday} sets. Solid session.`, vibe: 'good', emoji: '💪' };
  if (setsToday < 25) return { text: `${setsToday} sets. Beast mode.`, vibe: 'good', emoji: '🦁' };
  return { text: `${setsToday} sets. Volume monster. Watch recovery.`, vibe: 'warn', emoji: '🔥' };
}

export function streakMessage(days: number, kind: 'clean' | 'workout'): CoachMessage {
  if (days === 0)
    return {
      text: kind === 'clean' ? 'Start today. Day 0 → Day 1.' : 'No workout streak yet.',
      vibe: 'ok',
      emoji: '🌱',
    };
  if (days < 3)
    return {
      text: `${days} day${days > 1 ? 's' : ''}. Fragile. Protect it.`,
      vibe: 'ok',
      emoji: '🌿',
    };
  if (days < 7) return { text: `${days} days. Momentum building.`, vibe: 'good', emoji: '🔥' };
  if (days < 30) return { text: `${days} days. Real streak.`, vibe: 'good', emoji: '🏆' };
  return { text: `${days} days. Elite territory.`, vibe: 'good', emoji: '👑' };
}
