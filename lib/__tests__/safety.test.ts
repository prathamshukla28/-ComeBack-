import { CRISIS_RESOURCES, SAFETY_PREAMBLE, detectCrisis } from '../safety';

describe('detectCrisis', () => {
  const crisis = [
    'i want to kill myself',
    'I keep thinking about killing myself',
    'honestly I just want to die',
    "I don't want to live anymore",
    'thinking about suicide again',
    'I feel suicidal tonight',
    'everyone would be better off without me',
    "i've been cutting myself",
    'I want to end my life',
    'there is no reason to go on',
  ];

  it.each(crisis)('flags self-harm signal: %s', (msg) => {
    expect(detectCrisis(msg)).toBe(true);
  });

  // NOTE: bare "suicide" intentionally triggers (high-recall design — a false
  // positive only costs a set of hotline numbers), so gym slang like "that was
  // suicide" is deliberately not in this list.
  const safe = [
    'I killed my workout today',
    'I want to live my best life',
    'I had 2 beers last night',
    'cutting back on cigarettes this week',
    'dying to hit a new PR',
    '',
  ];

  it.each(safe)('does not flag ordinary message: %s', (msg) => {
    expect(detectCrisis(msg)).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(detectCrisis('I WANT TO KILL MYSELF')).toBe(true);
  });
});

describe('crisis resources payload', () => {
  it('surfaces the 988 lifeline and a findahelpline fallback', () => {
    expect(CRISIS_RESOURCES).toContain('988');
    expect(CRISIS_RESOURCES).toContain('findahelpline.com');
  });

  it('safety preamble forbids diagnosis and medication advice', () => {
    expect(SAFETY_PREAMBLE.toLowerCase()).toContain('never diagnose');
    expect(SAFETY_PREAMBLE.toLowerCase()).toContain('medication');
  });
});
