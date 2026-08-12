import { z } from 'zod';

const EnvSchema = z.object({
  EXPO_PUBLIC_SUPABASE_URL: z.string().url({ message: 'Must be a valid https URL' }),
  EXPO_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20, 'Anon key looks too short'),
  EXPO_PUBLIC_GEMINI_API_KEY: z.string().min(10).optional(),
});

export type Env = z.infer<typeof EnvSchema>;

const raw = {
  EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  EXPO_PUBLIC_GEMINI_API_KEY: process.env.EXPO_PUBLIC_GEMINI_API_KEY,
};

const parsed = EnvSchema.safeParse(raw);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  • ${i.path.join('.')}: ${i.message}`).join('\n');
  console.warn(
    `[ComeBack] Environment variable validation failed:\n${issues}\n` +
      `Copy .env.example to .env and fill in the values (see docs/SETUP.md).`,
  );
}

export const env: Env = parsed.success
  ? parsed.data
  : {
      EXPO_PUBLIC_SUPABASE_URL: 'https://placeholder.supabase.co',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'placeholder-anon-key-not-configured',
    };

export const isEnvValid = parsed.success;
