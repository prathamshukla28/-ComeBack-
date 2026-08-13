import { alcoholMessage, cigaretteMessage, streakMessage, workoutMessage } from '../coach-messages';

describe('cigaretteMessage', () => {
  it.each([
    [0, 'good'],
    [1, 'ok'],
    [3, 'warn'],
    [6, 'warn'],
    [10, 'bad'],
    [25, 'bad'],
  ])('count=%i classifies as vibe=%s', (count, vibe) => {
    expect(cigaretteMessage(count).vibe).toBe(vibe);
  });

  it('interpolates the count into the message when > 1', () => {
    expect(cigaretteMessage(5).text).toContain('5');
  });

  it('returns an emoji for every count', () => {
    for (const n of [0, 1, 2, 5, 8, 15]) {
      expect(cigaretteMessage(n).emoji).toBeTruthy();
    }
  });
});

describe('alcoholMessage', () => {
  it.each([
    [0, 'good'],
    [2, 'ok'],
    [4, 'warn'],
    [7, 'warn'],
    [12, 'bad'],
  ])('units=%i classifies as vibe=%s', (units, vibe) => {
    expect(alcoholMessage(units).vibe).toBe(vibe);
  });
});

describe('workoutMessage', () => {
  it.each([
    [0, 'ok'],
    [3, 'ok'],
    [8, 'good'],
    [20, 'good'],
    [30, 'warn'],
  ])('sets=%i classifies as vibe=%s', (sets, vibe) => {
    expect(workoutMessage(sets).vibe).toBe(vibe);
  });
});

describe('streakMessage', () => {
  it('handles day 0 with kind-specific copy', () => {
    expect(streakMessage(0, 'clean').text).toMatch(/day/i);
    expect(streakMessage(0, 'workout').text).toMatch(/workout/i);
  });

  it.each([
    [1, 'ok'],
    [2, 'ok'],
    [5, 'good'],
    [15, 'good'],
    [90, 'good'],
  ])('day=%i classifies as vibe=%s', (day, vibe) => {
    expect(streakMessage(day, 'clean').vibe).toBe(vibe);
  });

  it('uses singular vs plural correctly', () => {
    expect(streakMessage(1, 'clean').text).toContain('1 day');
    expect(streakMessage(1, 'clean').text).not.toContain('1 days');
    expect(streakMessage(2, 'clean').text).toContain('2 days');
  });
});
