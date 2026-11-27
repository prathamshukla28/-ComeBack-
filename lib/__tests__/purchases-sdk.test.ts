/**
 * The RevenueCat wrapper with a mocked native SDK: configuration per platform,
 * entitlement reads, and graceful degradation when the SDK misbehaves.
 */
const mockSdk = {
  configure: jest.fn(),
  getCustomerInfo: jest.fn(),
  getOfferings: jest.fn(),
  purchasePackage: jest.fn(),
  restorePurchases: jest.fn(),
  addCustomerInfoUpdateListener: jest.fn(),
  removeCustomerInfoUpdateListener: jest.fn(),
};

jest.mock('react-native-purchases', () => ({ __esModule: true, default: mockSdk }));

const PRO = { entitlements: { active: { pro: {} } } };

type Purchases = typeof import('../purchases');

function load(os: 'ios' | 'android' | 'web', keys: { ios?: string; android?: string }): Purchases {
  let mod!: Purchases;
  jest.isolateModules(() => {
    jest.doMock('react-native', () => ({ Platform: { OS: os } }));
    jest.doMock('../env', () => ({
      env: {
        EXPO_PUBLIC_REVENUECAT_IOS_KEY: keys.ios,
        EXPO_PUBLIC_REVENUECAT_ANDROID_KEY: keys.android,
      },
    }));
    mod = require('../purchases');
  });
  return mod;
}

beforeEach(() => {
  Object.values(mockSdk).forEach((fn) => fn.mockReset());
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('platform key selection', () => {
  it('uses the platform key and is unavailable on web', () => {
    expect(load('ios', { ios: 'appl_key_123' }).purchasesApiKey()).toBe('appl_key_123');
    expect(load('android', { android: 'goog_key_123' }).purchasesApiKey()).toBe('goog_key_123');
    const web = load('web', { ios: 'appl_key_123', android: 'goog_key_123' });
    expect(web.purchasesApiKey()).toBeUndefined();
    expect(web.purchasesAvailable()).toBe(false);
  });

  it('is unavailable without a key even when the SDK is present', () => {
    expect(load('ios', {}).purchasesAvailable()).toBe(false);
    expect(load('ios', { ios: 'appl_key_123' }).purchasesAvailable()).toBe(true);
  });
});

describe('with the SDK configured', () => {
  const p = () => load('ios', { ios: 'appl_key_123' });

  it('configures with the Supabase user id and returns customer info', async () => {
    mockSdk.getCustomerInfo.mockResolvedValue(PRO);
    const mod = p();
    await expect(mod.configurePurchases('user-1')).resolves.toBe(PRO);
    expect(mockSdk.configure).toHaveBeenCalledWith({ apiKey: 'appl_key_123', appUserID: 'user-1' });
  });

  it('configure failure degrades to null', async () => {
    mockSdk.configure.mockImplementation(() => {
      throw new Error('bad key');
    });
    await expect(p().configurePurchases()).resolves.toBeNull();
  });

  it('reads packages from the current offering, [] on failure', async () => {
    mockSdk.getOfferings.mockResolvedValueOnce({ current: { availablePackages: [{ id: 'm' }] } });
    const mod = p();
    await expect(mod.getProPackages()).resolves.toEqual([{ id: 'm' }]);
    mockSdk.getOfferings.mockRejectedValueOnce(new Error('offline'));
    await expect(mod.getProPackages()).resolves.toEqual([]);
  });

  it('purchase resolves Pro status, treats cancel as non-error, rethrows real failures', async () => {
    const mod = p();
    mockSdk.purchasePackage.mockResolvedValueOnce({ customerInfo: PRO });
    await expect(mod.purchasePackage({})).resolves.toEqual({ isPro: true });
    mockSdk.purchasePackage.mockRejectedValueOnce({ userCancelled: true });
    await expect(mod.purchasePackage({})).resolves.toEqual({ isPro: false, cancelled: true });
    mockSdk.purchasePackage.mockRejectedValueOnce(new Error('declined'));
    await expect(mod.purchasePackage({})).rejects.toThrow('declined');
  });

  it('restore and getCustomerInfo report entitlement state', async () => {
    const mod = p();
    mockSdk.restorePurchases.mockResolvedValueOnce({ entitlements: { active: {} } });
    await expect(mod.restorePurchases()).resolves.toEqual({ isPro: false });
    mockSdk.getCustomerInfo.mockRejectedValueOnce(new Error('x'));
    await expect(mod.getCustomerInfo()).resolves.toBeNull();
  });

  it('customer-info listener subscribes and unsubscribes', () => {
    const cb = jest.fn();
    const unsubscribe = p().onCustomerInfo(cb);
    expect(mockSdk.addCustomerInfoUpdateListener).toHaveBeenCalledWith(cb);
    unsubscribe();
    expect(mockSdk.removeCustomerInfoUpdateListener).toHaveBeenCalledWith(cb);
  });
});
