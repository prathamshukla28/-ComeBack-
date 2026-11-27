import { tabBarHeight } from '@/constants/Layout';

describe('tabBarHeight', () => {
  it('matches the absolute tab bar the chat input must stay clear of', () => {
    expect(tabBarHeight('ios')).toBe(88);
    expect(tabBarHeight('android')).toBe(68);
    expect(tabBarHeight('web')).toBe(68);
  });
});
