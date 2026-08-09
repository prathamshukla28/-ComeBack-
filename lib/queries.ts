import { supabase } from './supabase';

/* ---------- Habits (cigarette, alcohol, intimacy) ---------- */

export type HabitKind = 'cigarette' | 'alcohol' | 'intimacy';

export async function logHabit(kind: HabitKind, amount = 1, meta: Record<string, any> = {}) {
  const { error, data } = await supabase
    .from('habit_logs')
    .insert({ kind, amount, meta })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function habitCountToday(kind: HabitKind): Promise<number> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const { data, error } = await supabase
    .from('habit_logs')
    .select('amount')
    .eq('kind', kind)
    .gte('occurred_at', start.toISOString());
  if (error) throw error;
  return (data ?? []).reduce((s, r: any) => s + Number(r.amount || 0), 0);
}

export async function cleanStreak(kind: HabitKind): Promise<number> {
  const { data, error } = await supabase
    .from('habit_logs')
    .select('occurred_at')
    .eq('kind', kind)
    .order('occurred_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  if (!data?.length) return 999;
  const lastDay = new Date(data[0].occurred_at);
  lastDay.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffMs = today.getTime() - lastDay.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return Math.max(0, days);
}

export async function workoutStreak(): Promise<number> {
  const { data, error } = await supabase
    .from('workouts')
    .select('performed_on')
    .order('performed_on', { ascending: false })
    .limit(60);
  if (error) throw error;
  if (!data?.length) return 0;
  const dates = new Set(data.map((d: any) => d.performed_on));
  let streak = 0;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  while (dates.has(d.toISOString().slice(0, 10))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

export async function isNewPR(exerciseName: string, weightKg: number, reps: number): Promise<boolean> {
  const { data, error } = await supabase
    .from('workout_sets')
    .select('weight_kg, reps')
    .eq('exercise_name', exerciseName)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  const rows = (data ?? []) as { weight_kg: number; reps: number }[];
  if (rows.length <= 1) return true;
  const prior = rows.slice(1);
  const bestOneRM = prior.reduce((max, r) => {
    const est = Number(r.weight_kg) * (1 + Number(r.reps) / 30);
    return Math.max(max, est);
  }, 0);
  const currOneRM = weightKg * (1 + reps / 30);
  return currOneRM > bestOneRM;
}

export async function habitLast7Days(kind: HabitKind): Promise<{ date: string; total: number }[]> {
  const start = new Date();
  start.setDate(start.getDate() - 6);
  start.setHours(0, 0, 0, 0);
  const { data, error } = await supabase
    .from('habit_logs')
    .select('amount, occurred_at')
    .eq('kind', kind)
    .gte('occurred_at', start.toISOString());
  if (error) throw error;
  const map = new Map<string, number>();
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    map.set(d.toISOString().slice(0, 10), 0);
  }
  for (const r of data ?? []) {
    const key = (r as any).occurred_at.slice(0, 10);
    map.set(key, (map.get(key) ?? 0) + Number((r as any).amount || 0));
  }
  return Array.from(map, ([date, total]) => ({ date, total }));
}

export async function undoLastHabit(kind: HabitKind) {
  const { data, error } = await supabase
    .from('habit_logs')
    .select('id')
    .eq('kind', kind)
    .order('occurred_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  if (!data?.length) return false;
  const del = await supabase.from('habit_logs').delete().eq('id', data[0].id);
  if (del.error) throw del.error;
  return true;
}

/* ---------- Workouts ---------- */

export interface Exercise {
  id: string;
  name: string;
  muscle_group: string;
}

export async function listExercises(): Promise<Exercise[]> {
  const { data, error } = await supabase.from('exercises').select('id, name, muscle_group').order('name');
  if (error) throw error;
  return (data ?? []) as Exercise[];
}

export async function ensureTodayWorkout(): Promise<string> {
  const today = new Date().toISOString().slice(0, 10);
  const { data: existing, error: e1 } = await supabase
    .from('workouts')
    .select('id')
    .eq('performed_on', today)
    .limit(1);
  if (e1) throw e1;
  if (existing?.length) return existing[0].id;
  const { data, error } = await supabase.from('workouts').insert({ performed_on: today }).select('id').single();
  if (error) throw error;
  return data.id;
}

export async function logSet(args: { workoutId: string; exerciseName: string; exerciseId?: string; weightKg: number; reps: number; rir?: number }) {
  const { data: lastIdx } = await supabase
    .from('workout_sets')
    .select('set_index')
    .eq('workout_id', args.workoutId)
    .eq('exercise_name', args.exerciseName)
    .order('set_index', { ascending: false })
    .limit(1);
  const setIndex = (lastIdx?.[0]?.set_index ?? 0) + 1;
  const { error } = await supabase.from('workout_sets').insert({
    workout_id: args.workoutId,
    exercise_id: args.exerciseId ?? null,
    exercise_name: args.exerciseName,
    set_index: setIndex,
    weight_kg: args.weightKg,
    reps: args.reps,
    rir: args.rir ?? null,
  });
  if (error) throw error;
}

export async function todaySets(workoutId: string) {
  const { data, error } = await supabase
    .from('workout_sets')
    .select('id, exercise_name, set_index, weight_kg, reps, rir, created_at')
    .eq('workout_id', workoutId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function deleteSet(id: string) {
  const { error } = await supabase.from('workout_sets').delete().eq('id', id);
  if (error) throw error;
}

/* ---------- Chat ---------- */

export type ChatThread = 'guru' | 'coach';

export async function loadThread(thread: ChatThread, limit = 50) {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('id, role, content, created_at')
    .eq('thread', thread)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).reverse();
}

export async function saveMessage(thread: ChatThread, role: 'user' | 'model', content: string) {
  const { error } = await supabase.from('chat_messages').insert({ thread, role, content });
  if (error) throw error;
}

export async function clearThread(thread: ChatThread) {
  const { error } = await supabase.from('chat_messages').delete().eq('thread', thread);
  if (error) throw error;
}

/* ---------- Coach memory + profile ---------- */

export async function loadCoachMemory(): Promise<Array<{ key: string; value: string }>> {
  const { data, error } = await supabase.from('coach_memory').select('key, value').order('updated_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function upsertMemory(key: string, value: string) {
  const { error } = await supabase
    .from('coach_memory')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'owner_id,key' });
  if (error) throw error;
}

export async function loadProfile() {
  const { data, error } = await supabase.from('user_profile').select('*').maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertProfile(patch: Record<string, any>) {
  const { data: existing } = await supabase.from('user_profile').select('owner_id').maybeSingle();
  if (existing) {
    const { error } = await supabase.from('user_profile').update({ ...patch, updated_at: new Date().toISOString() }).eq('owner_id', existing.owner_id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('user_profile').insert(patch);
    if (error) throw error;
  }
}

/* ---------- Aggregate context for AI ---------- */

export async function last30dContext(): Promise<string> {
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const iso = since.toISOString();

  const [workouts, sets, habits, body] = await Promise.all([
    supabase.from('workouts').select('id, performed_on, name').gte('performed_on', iso.slice(0, 10)),
    supabase
      .from('workout_sets')
      .select('exercise_name, weight_kg, reps, rir, created_at')
      .gte('created_at', iso)
      .order('created_at', { ascending: false })
      .limit(200),
    supabase.from('habit_logs').select('kind, amount, occurred_at').gte('occurred_at', iso),
    supabase.from('body_metrics').select('measured_on, weight_kg, body_fat_pct').gte('measured_on', iso.slice(0, 10)),
  ]);

  const cigTotal = (habits.data ?? []).filter((h: any) => h.kind === 'cigarette').reduce((s, h: any) => s + Number(h.amount), 0);
  const alcTotal = (habits.data ?? []).filter((h: any) => h.kind === 'alcohol').reduce((s, h: any) => s + Number(h.amount), 0);
  const intCount = (habits.data ?? []).filter((h: any) => h.kind === 'intimacy').length;
  const workoutDates = (workouts.data ?? []).map((w: any) => w.performed_on).join(', ');
  const setLines = (sets.data ?? [])
    .slice(0, 40)
    .map((s: any) => `${s.exercise_name}: ${s.weight_kg}kg x ${s.reps}${s.rir != null ? ` (RIR ${s.rir})` : ''}`)
    .join('\n');
  const bodyLatest = (body.data ?? [])[0];

  return `--- Last 30 days ---
Workouts (${workouts.data?.length ?? 0}): ${workoutDates || 'none'}
Recent sets:
${setLines || 'none'}

Cigarettes total: ${cigTotal}
Alcohol units total: ${alcTotal}
Intimacy count: ${intCount}
Latest body: ${bodyLatest ? `${bodyLatest.weight_kg}kg${bodyLatest.body_fat_pct ? `, ${bodyLatest.body_fat_pct}% bf` : ''}` : 'no data'}
---`;
}
