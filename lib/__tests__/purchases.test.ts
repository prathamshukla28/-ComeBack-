import { hasProEntitlement, PRO_ENTITLEMENT } from '../purchases';

describe('hasProEntitlement', () => {
  it('is false for null / undefined / empty info', () => {
    expect(hasProEntitlement(null)).toBe(false);
    expect(hasProEntitlement(undefined)).toBe(false);
    expect(hasProEntitlement({})).toBe(false);
    expect(hasProEntitlement({ entitlements: {} })).toBe(false);
    expect(hasProEntitlement({ entitlements: { active: {} } })).toBe(false);
  });

  it('is true when the pro entitlement is active', () => {
    expect(
      hasProEntitlement({ entitlements: { active: { [PRO_ENTITLEMENT]: { isActive: true } } } }),
    ).toBe(true);
  });

  it('ignores unrelated active entitlements', () => {
    expect(hasProEntitlement({ entitlements: { active: { some_other_tier: {} } } })).toBe(false);
  });

  it('treats any truthy entitlement object as granted', () => {
    expect(hasProEntitlement({ entitlements: { active: { [PRO_ENTITLEMENT]: {} } } })).toBe(true);
  });
});
