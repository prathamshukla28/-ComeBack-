/**
 * eas.json is read by `eas build` (and the opt-in EAS Preview workflow, which runs
 * `--profile preview`). Guard the profiles it promises and that it holds no secrets.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const raw = readFileSync(join(__dirname, '..', '..', 'eas.json'), 'utf8');
const eas = JSON.parse(raw);

describe('eas.json', () => {
  it('defines development, preview and production build profiles', () => {
    expect(Object.keys(eas.build)).toEqual(
      expect.arrayContaining(['development', 'preview', 'production']),
    );
    expect(eas.build.development.developmentClient).toBe(true);
  });

  it('preview builds an installable Android APK for internal distribution', () => {
    expect(eas.build.preview.distribution).toBe('internal');
    expect(eas.build.preview.android.buildType).toBe('apk');
  });

  it('holds no environment values or secrets (they live in EAS environments)', () => {
    expect(raw).not.toMatch(/"env"\s*:/);
    expect(raw).not.toMatch(/EXPO_PUBLIC_|SUPABASE|service_role|eyJ|AIza|appl_|goog_/i);
  });
});
