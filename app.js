'use strict';

/* ============================================================
   UNIFIED STORAGE — single `tempo_data` localStorage key
   Old keys (cb_profile_v2, cb_plan_v2, cb_history_v2, cb_active_v2,
   cb_settings_v2, cb_music_v2) are migrated on first load, then deleted.
   ============================================================ */
const STORAGE_KEY = 'tempo_data';

// Legacy keys kept only for one-time migration on first run.
const LEGACY_KEYS = {
  PROFILE:  'cb_profile_v2',
  PLAN:     'cb_plan_v2',
  HISTORY:  'cb_history_v2',
  ACTIVE:   'cb_active_v2',
  SETTINGS: 'cb_settings_v2',
  MUSIC:    'cb_music_v2',
};

let state = {
  profile: null,
  plan: null,
  history: [],
  active: null,
  settings: { soundEnabled: true, vibrateEnabled: true, theme: 'dark', accentColor: '#4FD1C7', unit: 'metric' },
  music: [],
  measurements: { template: [], entries: [] },
  skillProgress: {}, // keyed by exercise id → { currentStage: number, passedStages: number[] }
  version: 3,
};

let profile  = null;
let plan     = null;
let history  = [];
let active   = null;
let settings = { soundEnabled: true, vibrateEnabled: true, theme: 'dark', accentColor: '#4FD1C7', unit: 'metric' };
let measurements = { template: [], entries: [] };
let skillProgress = {}; // mirrors state.skillProgress — kept as standalone for backward-compat call sites

let currentView = 'home';
let currentDayKey = null;     // when viewing a specific day
let planEditDay = 'saturday'; // active day in plan editor

/* ============================================================
   DEFAULT WORKOUT PLAN
   ============================================================ */
const DEFAULT_PLAN = {
  format: 'tempo-workout-plan',
  version: 1,
  name: 'My Custom Plan',
  description: 'Optional short description of the program — goals, philosophy, anything.',
  days: [
    {
      id: 'monday',
      day: 'Monday',
      workoutName: 'Push Day',
      type: 'strength',
      exercises: [
        {
          id: 'benchpress',
          name: 'Bench Press',
          sets: 4,
          restSeconds: 120,
          type: 'strength',
          note: 'Controlled tempo · 2-sec pause at chest · full lockout',
          mediaLinks: [
            {
              type: 'youtube',
              label: 'Form Tutorial',
              url: 'https://www.youtube.com/watch?v=rT7DgCr-3pg'
            },
            {
              type: 'image',
              label: 'Form Photo',
              url: 'https://example.com/bench-form.jpg'
            },
            {
              type: 'video',
              label: 'Demo',
              url: 'https://example.com/benchpress-demo.mp4'
            },
            {
              type: 'link',
              label: 'Article',
              url: 'https://www.strongfirst.com/blog/bench-press-setup/'
            }
          ]
        },
        {
          id: 'inclinepress',
          name: 'Incline Dumbbell Press',
          sets: 3,
          restSeconds: 90
        },
        {
          id: 'plank',
          name: 'Plank',
          sets: 3,
          restSeconds: 60,
          type: 'timed',
          note: 'Time under tension · neutral spine · breathe normally'
        },
        {
          id: 'handstandpractice',
          name: 'Handstand Practice',
          sets: 1,
          restSeconds: 60,
          type: 'skill',
          note: 'Wall holds → shoulder taps → freestanding attempts'
        }
      ]
    },
    {
      id: 'tuesday',
      day: 'Tuesday',
      workoutName: 'Cindy 20-min AMRAP',
      type: 'cindy',
      exercises: [],
      note: '20-minute AMRAP. Cycle through the scheme as many times as possible. Track total completed rounds.',
      durationSeconds: 1200,
      cindy: {
        durationSeconds: 1200,
        scheme: [
          {
            id: 'cindyPullups',
            name: 'Pull-ups',
            reps: 5,
            mediaLinks: []
          },
          {
            id: 'cindyPushups',
            name: 'Push-ups',
            reps: 10,
            mediaLinks: [
              {
                type: 'youtube',
                label: 'Form',
                url: 'https://www.youtube.com/watch?v=14D-2c9kvVw'
              }
            ]
          },
          {
            id: 'cindySquats',
            name: 'Air Squats',
            reps: 15,
            mediaLinks: []
          }
        ]
      }
    },
    {
      id: 'thursday',
      day: 'Thursday',
      workoutName: 'Recovery',
      type: 'rest',
      exercises: [],
      restNote: 'Light cardio, mobility, or full rest. Recovery is when you actually get stronger.'
    },
    {
      id: 'saturday',
      day: 'Saturday',
      workoutName: 'Skill Day',
      type: 'skill',
      exercises: [
        {
          id: 'handstand',
          name: 'Handstand Practice',
          sets: 1,
          restSeconds: 60,
          type: 'skill',
          note: 'Wall holds → shoulder taps → freestanding attempts · 10–15 min total',
          progression: [
            { stage: 1,  name: 'Wall-Assisted Handstand Hold',                  requirement: 60, unit: 'seconds' },
            { stage: 2,  name: 'Wall-Assisted Handstand Push-Up',               requirement: 10, unit: 'reps' },
            { stage: 3,  name: 'Freestanding Handstand Hold',                   requirement: 60, unit: 'seconds' },
            { stage: 4,  name: 'Freestanding Handstand Push-Up',               requirement: 10, unit: 'reps' },
            { stage: 5,  name: 'Handstand Weight Shifts',                       requirement: 10, unit: 'reps' },
            { stage: 6,  name: 'Wall-Assisted One-Arm Handstand',               requirement: 20, unit: 'seconds' },
            { stage: 7,  name: 'Freestanding Fingertip-Assisted Handstand',     requirement: 15, unit: 'seconds' },
            { stage: 8,  name: 'Freestanding One-Arm Handstand',                requirement: 15, unit: 'seconds' },
            { stage: 9,  name: 'One-Arm Handstand Shrugs',                      requirement: 5,  unit: 'reps' },
            { stage: 10, name: 'Assisted One-Arm Handstand Push-Ups',          requirement: 5,  unit: 'reps' },
            { stage: 11, name: 'One-Arm Handstand Push-Up Negatives',          requirement: 3,  unit: 'reps' },
            { stage: 12, name: 'Full One-Arm Handstand Push-Up',               requirement: 1,  unit: 'reps' }
          ]
        },
        {
          id: 'muscleup',
          name: 'Muscle-up Progression',
          sets: 1,
          restSeconds: 90,
          type: 'skill',
          note: 'Pull-up → high pull-up → chest-to-bar → band-assisted → muscle-up'
        }
      ]
    },
    {
      id: 'wednesday',
      day: 'Wednesday',
      workoutName: 'Pull Day',
      type: 'strength',
      exercises: [
        {
          id: 'deadlift',
          name: 'Deadlift',
          sets: 3,
          restSeconds: 180,
          type: 'strength',
          note: 'Hip hinge · controlled eccentric · no bouncing',
          mediaLinks: [
            {
              type: 'youtube',
              label: 'Form',
              url: 'https://www.youtube.com/watch?v=op9kVnSso6Q'
            }
          ]
        },
        {
          id: 'pullups',
          name: 'Pull-ups',
          sets: 3,
          restSeconds: 90,
          type: 'strength',
          note: 'Full hang start · no kipping'
        },
        {
          id: 'barbellrows',
          name: 'Barbell Rows',
          sets: 3,
          restSeconds: 90,
          type: 'strength',
          note: 'Pendlay style · explosive concentric'
        }
      ]
    },
    {
      id: 'friday',
      day: 'Friday',
      workoutName: 'Free',
      type: 'rest',
      exercises: [],
      restNote: 'Free day. Do what you enjoy — or nothing at all.'
    },
    {
      id: 'sunday',
      day: 'Sunday',
      workoutName: 'Legs',
      type: 'strength',
      exercises: [
        {
          id: 'squats',
          name: 'Squats',
          sets: 4,
          restSeconds: 120
        },
        {
          id: 'lunges',
          name: 'Lunges',
          sets: 3,
          restSeconds: 90
        },
        {
          id: 'calfraises',
          name: 'Calf Raises',
          sets: 3,
          restSeconds: 60
        }
      ]
    }
  ]
};

/* ============================================================
   DEFAULT MEASUREMENT TEMPLATE
   ============================================================ */
function getDefaultMeasurementTemplate() {
  return [
    { id: 'weight', label: 'Weight', unit: 'kg', type: 'number' },
    { id: 'height', label: 'Height', unit: 'cm', type: 'number' },
    { id: 'age', label: 'Age', unit: 'years', type: 'number' },
    { id: 'bodyfat', label: 'Body Fat %', unit: '%', type: 'number' },
    { id: 'chest', label: 'Chest', unit: 'cm', type: 'number' },
    { id: 'waist', label: 'Waist', unit: 'cm', type: 'number' },
    { id: 'hips', label: 'Hips', unit: 'cm', type: 'number' },
    { id: 'leftArm', label: 'Left Arm', unit: 'cm', type: 'number' },
    { id: 'rightArm', label: 'Right Arm', unit: 'cm', type: 'number' },
    { id: 'leftThigh', label: 'Left Thigh', unit: 'cm', type: 'number' },
    { id: 'rightThigh', label: 'Right Thigh', unit: 'cm', type: 'number' },
    { id: 'leftCalf', label: 'Left Calf', unit: 'cm', type: 'number' },
    { id: 'rightCalf', label: 'Right Calf', unit: 'cm', type: 'number' },
    { id: 'shoulders', label: 'Shoulders', unit: 'cm', type: 'number' },
    { id: 'proteinTarget', label: 'Daily Protein Target', unit: 'g', type: 'number' },
    { id: 'calorieTarget', label: 'Daily Calorie Target', unit: 'kcal', type: 'number' },
    { id: 'waterTarget', label: 'Daily Water Target', unit: 'L', type: 'number' }
  ];
}

/* ============================================================
   PERSISTENCE (unified — single `tempo_data` localStorage key)
   ============================================================ */
function migrateOldKeys() {
  // Read each legacy key (if present) and merge into the unified state.
  try {
    const raw = localStorage.getItem(LEGACY_KEYS.PROFILE);
    if (raw) profile = JSON.parse(raw);
  } catch (e) { console.warn('legacy profile load fail', e); }
  try {
    const raw = localStorage.getItem(LEGACY_KEYS.PLAN);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.days) plan = parsed;
    }
  } catch (e) { console.warn('legacy plan load fail', e); }
  try {
    const raw = localStorage.getItem(LEGACY_KEYS.HISTORY);
    if (raw) history = JSON.parse(raw) || [];
  } catch (e) { console.warn('legacy history load fail', e); }
  try {
    const raw = localStorage.getItem(LEGACY_KEYS.ACTIVE);
    if (raw) active = JSON.parse(raw);
  } catch (e) { console.warn('legacy active load fail', e); }
  try {
    const raw = localStorage.getItem(LEGACY_KEYS.SETTINGS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed) settings = Object.assign(settings, parsed);
    }
  } catch (e) { console.warn('legacy settings load fail', e); }
  try {
    const raw = localStorage.getItem(LEGACY_KEYS.MUSIC);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) musicPlaylist = parsed;
    }
  } catch (e) { console.warn('legacy music load fail', e); }

  if (!plan) plan = JSON.parse(JSON.stringify(DEFAULT_PLAN));

  // Ensure every exercise has a mediaLinks array (backward compat with v1 plans)
  normalizePlanMediaLinks();

  // Legacy states don't have skillProgress — initialize empty.
  if (!skillProgress || typeof skillProgress !== 'object' || Array.isArray(skillProgress)) {
    skillProgress = {};
  }
  clampAllSkillProgress();

  // Persist to new key, then remove legacy keys.
  saveData();
  Object.values(LEGACY_KEYS).forEach(k => {
    try { localStorage.removeItem(k); } catch (e) { /* ignore */ }
  });
}

function normalizePlanMediaLinks() {
  if (plan && plan.days) {
    plan.days.forEach(day => {
      if (day.exercises) {
        day.exercises.forEach(ex => {
          if (!Array.isArray(ex.mediaLinks)) ex.mediaLinks = [];
        });
      }
      if (day.cindy && day.cindy.scheme) {
        day.cindy.scheme.forEach(s => {
          if (!Array.isArray(s.mediaLinks)) s.mediaLinks = [];
        });
      }
    });
  }
}

/* ============================================================
   SKILL PROGRESSION HELPERS
   Each skill exercise with a `progression` array tracks per-exercise
   progress in `state.skillProgress[exerciseId] = { currentStage, passedStages }`.
   ============================================================ */
function getSkillProgress(exId) {
  if (!skillProgress || typeof skillProgress !== 'object') skillProgress = {};
  if (!skillProgress[exId] || typeof skillProgress[exId] !== 'object') {
    skillProgress[exId] = { currentStage: 1, passedStages: [] };
  }
  if (!Array.isArray(skillProgress[exId].passedStages)) {
    skillProgress[exId].passedStages = [];
  }
  if (typeof skillProgress[exId].currentStage !== 'number' || skillProgress[exId].currentStage < 1) {
    skillProgress[exId].currentStage = 1;
  }
  return skillProgress[exId];
}

/* Resolve the current stage object for a skill exercise with progression.
   Returns null if the exercise has no `progression` array.
   Also clamps currentStage to the progression length in case stages were removed. */
function getCurrentSkillStage(ex) {
  if (!ex || ex.type !== 'skill' || !Array.isArray(ex.progression) || ex.progression.length === 0) return null;
  const prog = getSkillProgress(ex.id);
  let stage = prog.currentStage || 1;
  if (stage > ex.progression.length) stage = ex.progression.length;
  if (stage < 1) stage = 1;
  if (stage !== prog.currentStage) {
    prog.currentStage = stage;
    saveData();
  }
  // Prefer matching by stage number; fall back to array index.
  let stageObj = ex.progression.find(s => s && s.stage === stage);
  if (!stageObj) stageObj = ex.progression[stage - 1];
  return stageObj || null;
}

/* Walk every exercise in the plan and clamp any out-of-range skill progress.
   This runs on load so that an imported/edited plan can't leave the user
   stuck on a stage that no longer exists. */
function clampAllSkillProgress() {
  if (!plan || !plan.days || !skillProgress || typeof skillProgress !== 'object') return;
  // Build a map of exId → progression length
  const stageCounts = {};
  plan.days.forEach(day => {
    if (day && Array.isArray(day.exercises)) {
      day.exercises.forEach(ex => {
        if (ex && ex.type === 'skill' && Array.isArray(ex.progression) && ex.progression.length > 0) {
          stageCounts[ex.id] = ex.progression.length;
        }
      });
    }
  });
  let changed = false;
  Object.keys(skillProgress).forEach(exId => {
    const prog = skillProgress[exId];
    if (!prog || typeof prog !== 'object') return;
    if (!Array.isArray(prog.passedStages)) { prog.passedStages = []; changed = true; }
    const maxStage = stageCounts[exId];
    if (typeof maxStage === 'number') {
      if (typeof prog.currentStage !== 'number' || prog.currentStage < 1) { prog.currentStage = 1; changed = true; }
      if (prog.currentStage > maxStage) { prog.currentStage = maxStage; changed = true; }
    } else if (typeof prog.currentStage !== 'number' || prog.currentStage < 1) {
      prog.currentStage = 1; changed = true;
    }
    // Drop any passedStages entries that no longer exist (greater than maxStage)
    if (typeof maxStage === 'number' && prog.passedStages.some(s => s > maxStage)) {
      prog.passedStages = prog.passedStages.filter(s => s <= maxStage);
      changed = true;
    }
  });
  if (changed) saveData();
}

/* Look up the most recent saved attempt for this skill exercise at the
   given stage number. Returns { reps, durationSec, stage } or null.
   Used for "Last attempt:" display on the Get Ready screen. */
function lastSkillAttempt(exId, stageNum) {
  for (const entry of history) {
    if (!entry || !Array.isArray(entry.exercises)) continue;
    const ex = entry.exercises.find(e => e && e.id === exId);
    if (ex && Array.isArray(ex.sets) && ex.sets.length > 0) {
      // If we know which stage each saved set was for, filter by stage.
      // Otherwise (older saved entries without stage info), fall back to the
      // most recent set — it's better than nothing.
      if (typeof stageNum === 'number') {
        const matching = ex.sets.filter(s => s && typeof s.stage === 'number' && s.stage === stageNum);
        if (matching.length > 0) return matching[matching.length - 1];
      }
      return ex.sets[ex.sets.length - 1];
    }
  }
  return null;
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      state = JSON.parse(raw);
      profile = state.profile || null;
      plan = state.plan || JSON.parse(JSON.stringify(DEFAULT_PLAN));
      history = Array.isArray(state.history) ? state.history : [];
      active = state.active || null;
      settings = Object.assign(
        { soundEnabled: true, vibrateEnabled: true, theme: 'dark', accentColor: '#4FD1C7', unit: 'metric' },
        state.settings || {}
      );
      musicPlaylist = Array.isArray(state.music) ? state.music : [];
      measurements = (state.measurements && Array.isArray(state.measurements.template))
        ? state.measurements
        : { template: getDefaultMeasurementTemplate(), entries: [] };
      if (!Array.isArray(measurements.entries)) measurements.entries = [];
      // Migration: older saved states don't have skillProgress — initialize as {}
      skillProgress = (state.skillProgress && typeof state.skillProgress === 'object' && !Array.isArray(state.skillProgress))
        ? state.skillProgress
        : {};
    } else {
      // First run on this device, or migrating from legacy keys.
      migrateOldKeys();
    }
  } catch (e) {
    console.warn('loadData fail', e);
    if (!plan) plan = JSON.parse(JSON.stringify(DEFAULT_PLAN));
    if (!skillProgress || typeof skillProgress !== 'object') skillProgress = {};
  }

  normalizePlanMediaLinks();
  // Clamp skill progress against the current plan (stages may have been removed/added)
  clampAllSkillProgress();

  // Always ensure measurements has a valid template.
  let measurementsFixed = false;
  if (!measurements || !Array.isArray(measurements.template) || measurements.template.length === 0) {
    measurements = { template: getDefaultMeasurementTemplate(), entries: measurements?.entries || [] };
    measurementsFixed = true;
  }
  if (!Array.isArray(measurements.entries)) {
    measurements.entries = [];
    measurementsFixed = true;
  }
  // If we just synthesised the default template (e.g. after migration wrote an
  // empty template to tempo_data), persist the corrected measurements now.
  if (measurementsFixed) saveData();
}

function saveData() {
  // Sync all standalone variables back into the unified state.
  state.profile = profile;
  state.plan = plan;
  state.history = history;
  state.active = active;
  state.settings = settings;
  state.music = musicPlaylist;
  state.measurements = measurements;
  state.skillProgress = skillProgress;
  state.version = 3;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('saveData fail', e);
  }
}

// Backward-compat wrappers — every existing call site keeps working.
function saveProfile()  { saveData(); }
function savePlan()     { saveData(); }
function saveHistory()  { saveData(); }
function saveActive()   { saveData(); }
function saveSettings() { saveData(); }
function saveMusicData() { saveData(); }

/* ============================================================
   DATE HELPERS
   ============================================================ */
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function todayWeekday() {
  return ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][new Date().getDay()];
}
function formatDateLong(iso) {
  if (!iso) return '—';
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const monthsShort = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(parts[1],10)-1]} ${parseInt(parts[2],10)}, ${parts[0]}`;
}
function formatDateShort(iso) {
  if (!iso) return '—';
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(parts[1],10)-1]} ${parseInt(parts[2],10)}`;
}
function formatDuration(sec) {
  if (!sec || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
function greetingTime() {
  const h = new Date().getHours();
  if (h < 5)  return 'GOOD NIGHT';
  if (h < 12) return 'GOOD MORNING';
  if (h < 18) return 'GOOD AFTERNOON';
  return 'GOOD EVENING';
}
function todayDateLong() {
  const d = new Date();
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`;
}

/* ============================================================
   AUDIO (Web Audio API beep)
   ============================================================ */
let audioCtx = null;
function initAudio() {
  if (audioCtx) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  } catch (e) { /* no audio */ }
}
function playBeep(freq, durationMs, type) {
  if (!settings.soundEnabled) return;
  if (!audioCtx) initAudio();
  if (!audioCtx) return;
  try {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq || 880;
    gain.gain.setValueAtTime(0.001, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.3, audioCtx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + (durationMs || 200) / 1000);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + (durationMs || 200) / 1000 + 0.05);
  } catch (e) { /* ignore */ }
}
function playRestCompleteSound() {
  playBeep(880, 180, 'sine');
  setTimeout(() => playBeep(1175, 240, 'sine'), 200);
}
function vibrate(pattern) {
  if (!settings.vibrateEnabled) return;
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* ignore */ }
}

/* ============================================================
   TOAST
   ============================================================ */
let toastTimer = null;
function showToast(text, type) {
  const t = document.getElementById('toast');
  const txt = document.getElementById('toast-text');
  txt.textContent = text;
  t.classList.remove('warn', 'error');
  if (type === 'warn') t.classList.add('warn');
  else if (type === 'error') t.classList.add('error');
  t.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ============================================================
   MODAL
   ============================================================ */
function showModal(html) {
  const c = document.getElementById('modal-content');
  c.innerHTML = html;
  document.getElementById('modal-backdrop').classList.add('show');
}
function closeModal() {
  document.getElementById('modal-backdrop').classList.remove('show');
}
document.getElementById('modal-backdrop').addEventListener('click', (e) => {
  if (e.target.id === 'modal-backdrop') closeModal();
});

/* ============================================================
   VIEW SWITCHING
   ============================================================ */
function switchView(viewId) {
  currentView = viewId;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const target = document.getElementById('view-' + viewId);
  if (target) target.classList.add('active');
  document.querySelectorAll('.nav-tab').forEach(t => {
    t.classList.toggle('active', t.getAttribute('data-view') === viewId);
  });
  window.scrollTo({ top: 0, behavior: 'instant' });

  // Lazy-render per view
  if (viewId === 'home')      renderDashboard();
  if (viewId === 'history')   renderHistory();
  if (viewId === 'plan')      renderPlan();
  if (viewId === 'measurements') renderMeasurements();
  if (viewId === 'profile')   renderProfile();
}

/* ============================================================
   DASHBOARD RENDER
   ============================================================ */
function findDayInPlan(dayId) {
  if (!plan || !plan.days) return null;
  return plan.days.find(d => d.id === dayId);
}
function dayExerciseCount(day) {
  if (!day) return 0;
  if (day.type === 'cindy') return (day.cindy && day.cindy.scheme ? day.cindy.scheme.length : 0);
  return (day.exercises || []).length;
}
function daySetCount(day) {
  if (!day) return 0;
  if (day.type === 'cindy') return 1;
  return (day.exercises || []).reduce((sum, e) => sum + (parseInt(e.sets,10) || 0), 0);
}
function dayAvgRest(day) {
  if (!day || day.type === 'cindy' || day.type === 'rest') return 0;
  const ex = day.exercises || [];
  if (ex.length === 0) return 0;
  const total = ex.reduce((s, e) => s + (parseInt(e.restSeconds,10) || 0), 0);
  return Math.round(total / ex.length);
}

function renderDashboard() {
  const today = todayWeekday();
  const todayDay = findDayInPlan(today);

  document.getElementById('greeting-time').textContent = greetingTime();
  document.getElementById('greeting-name').textContent = profile ? profile.name : '—';
  document.getElementById('greeting-date').textContent = todayDateLong();

  if (todayDay) {
    document.getElementById('today-name').textContent = todayDay.workoutName;
    document.getElementById('today-sub').textContent = todayDay.type === 'rest'
      ? (todayDay.restNote || 'Recovery day')
      : `${dayExerciseCount(todayDay)} exercises · ${daySetCount(todayDay)} sets`;
    document.getElementById('today-ex-count').textContent = dayExerciseCount(todayDay);
    document.getElementById('today-set-count').textContent = daySetCount(todayDay);
    document.getElementById('btn-start-today').textContent = todayDay.type === 'rest' ? 'Log Recovery' : 'Start Workout';
  } else {
    document.getElementById('today-name').textContent = '—';
  }

  // Resume banner if active workout exists
  const resumeHost = document.getElementById('resume-banner-host');
  resumeHost.innerHTML = '';
  if (active) {
    const ad = findDayInPlan(active.day);
    const banner = document.createElement('div');
    banner.className = 'resume-banner';
    banner.innerHTML = `
      <div class="icon">!</div>
      <div class="text">
        <strong>Workout in progress.</strong><br>
        ${ad ? ad.workoutName : active.day} — resume or start over.
      </div>
      <div class="actions">
        <button class="discard" data-action="discard">Discard</button>
        <button class="resume" data-action="resume">Resume</button>
      </div>
    `;
    banner.querySelector('[data-action="resume"]').addEventListener('click', () => {
      enterWorkoutFromActive();
    });
    banner.querySelector('[data-action="discard"]').addEventListener('click', () => {
      showModal(`
        <div class="modal-title">Discard workout?</div>
        <div class="modal-text">This will delete the in-progress workout. Completed sets in this session will be lost.</div>
        <div class="modal-actions">
          <button class="btn-primary secondary" id="modal-cancel-discard">Cancel</button>
          <button class="btn-primary danger" id="modal-confirm-discard">Discard Workout</button>
        </div>
      `);
      document.getElementById('modal-cancel-discard').addEventListener('click', closeModal);
      document.getElementById('modal-confirm-discard').addEventListener('click', () => {
        active = null;
        saveActive();
        closeModal();
        renderDashboard();
        showToast('Workout discarded', 'warn');
      });
    });
    resumeHost.appendChild(banner);
  }

  // Weekly plan list
  const list = document.getElementById('week-list');
  list.innerHTML = '';
  plan.days.forEach(day => {
    const isToday = day.id === today;
    const isRest = day.type === 'rest';
    const row = document.createElement('div');
    row.className = 'week-row neu-raised-sm' + (isToday ? ' is-today' : '') + (isRest ? ' is-rest' : '');
    row.innerHTML = `
      <div class="week-row-day">${day.day.slice(0,3).toUpperCase()}</div>
      <div class="week-row-name">${day.workoutName}${isToday ? ' <span class="sub">Today</span>' : ''}<span class="sub">${isRest ? (day.id === 'thursday' ? 'Backup day · tap to check' : (day.restNote || 'Recovery')) : (day.type === 'cindy' ? '20-min AMRAP' : `${dayExerciseCount(day)} exercises · ${daySetCount(day)} sets`)}</span></div>
      <div class="week-row-arrow"><svg viewBox="0 0 24 24"><path d="M9 5 L16 12 L9 19"/></svg></div>
    `;
    row.addEventListener('click', () => openDayView(day.id));
    list.appendChild(row);
  });
}

/* ============================================================
   DAY VIEW (overview before workout)
   ============================================================ */
/* ============================================================
   MEDIA LINKS HELPERS
   ============================================================ */
function detectMediaType(url) {
  if (!url) return null;
  const u = url.toLowerCase();
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
  if (u.match(/\.(jpg|jpeg|png|gif|webp|svg|avif)/)) return 'image';
  if (u.match(/\.(mp4|webm|mov|avi|mkv|m4v)/)) return 'video';
  // generic heuristics
  if (u.includes('vimeo.com')) return 'video';
  if (u.startsWith('http')) return 'link';
  return null;
}
function renderMediaChips(mediaLinks) {
  if (!Array.isArray(mediaLinks) || mediaLinks.length === 0) return '';
  const valid = mediaLinks.filter(m => m && m.url && m.url.trim());
  if (valid.length === 0) return '';
  return `<div class="media-chips">` + valid.map(m => {
    const type = m.type || detectMediaType(m.url) || 'link';
    const label = m.label && m.label.trim() ? m.label.trim() : type.toUpperCase();
    const href = m.url.startsWith('http') || m.url.startsWith('//') ? m.url : 'https://' + m.url;
    let icon = '';
    if (type === 'youtube') {
      icon = '<svg viewBox="0 0 24 24"><path d="M2 12 C2 8 4 6 8 6 L16 6 C20 6 22 8 22 12 C22 16 20 18 16 18 L8 18 C4 18 2 16 2 12 Z"/><path d="M10 9 L15 12 L10 15 Z" fill="currentColor" stroke="none"/></svg>';
    } else if (type === 'image') {
      icon = '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="M3 17 L9 13 L13 16 L17 11 L21 14"/></svg>';
    } else if (type === 'video') {
      icon = '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="14" height="14" rx="2"/><path d="M17 9 L21 7 L21 17 L17 15 Z"/></svg>';
    } else {
      icon = '<svg viewBox="0 0 24 24"><path d="M9 15 L15 9"/><path d="M11 7 L9 9 L4 4"/><path d="M13 17 L15 15 L20 20"/></svg>';
    }
    return `<a class="media-chip ${type === 'image' ? 'image' : (type === 'video' ? 'video' : '')}" href="${href}" target="_blank" rel="noopener">${icon}${label}</a>`;
  }).join('') + `</div>`;
}

function openDayView(dayId) {
  currentDayKey = dayId;
  const day = findDayInPlan(dayId);
  if (!day) return;

  document.getElementById('day-hero-tag').textContent = day.day + (day.id === todayWeekday() ? ' · Today' : '');
  document.getElementById('day-hero-title').textContent = day.workoutName;
  document.getElementById('day-hero-sub').textContent = day.type === 'rest'
    ? (day.restNote || 'Recovery day')
    : (day.type === 'cindy' ? '20-minute AMRAP · 5 pull-ups / 10 push-ups / 15 air squats' : 'Strength session');

  document.getElementById('day-hero-ex').textContent = dayExerciseCount(day);
  document.getElementById('day-hero-sets').textContent = daySetCount(day);
  document.getElementById('day-hero-rest').textContent = dayAvgRest(day) + 's';

  const overview = document.getElementById('exercise-overview');
  overview.innerHTML = '';

  if (day.type === 'cindy') {
    const prev = previousCindyRounds();
    day.cindy.scheme.forEach((s, i) => {
      const row = document.createElement('div');
      row.className = 'exercise-overview-row neu-raised-sm';
      const mediaHtml = renderMediaChips(s.mediaLinks);
      row.innerHTML = `
        <div class="exercise-overview-num">${i+1}</div>
        <div class="exercise-overview-info">
          <div class="exercise-overview-name">${s.name}</div>
          <div class="exercise-overview-meta">${s.reps} reps per round${mediaHtml ? '' : ''}</div>
          ${mediaHtml ? `<div class="exercise-overview-media">${mediaHtml}</div>` : ''}
        </div>
      `;
      overview.appendChild(row);
    });
    // Show previous Cindy rounds
    if (prev !== null) {
      const prevRow = document.createElement('div');
      prevRow.className = 'exercise-overview-row neu-raised-sm';
      prevRow.innerHTML = `
        <div class="exercise-overview-num">★</div>
        <div class="exercise-overview-info">
          <div class="exercise-overview-name">Previous Cindy Result</div>
          <div class="exercise-overview-meta">Best rounds to beat</div>
        </div>
        <div class="exercise-overview-prev"><span class="label">Last</span><span class="val">${prev} rounds</span></div>
      `;
      overview.appendChild(prevRow);
    }
  } else if (day.type === 'rest') {
    // Thursday = smart backup day. Detect missed workouts this week.
    const isThursday = day.id === 'thursday';
    const missedDays = isThursday ? findMissedDaysThisWeek() : [];

    if (isThursday && missedDays.length > 0) {
      // Primary suggestion: the FIRST missed day (oldest in the week)
      const primaryDayId = missedDays[0];
      const primaryDay = findDayInPlan(primaryDayId);
      if (primaryDay) {
        const card = document.createElement('div');
        card.className = 'backup-primary-card neu-raised-sm';
        card.innerHTML = `
          <div class="backup-tag">Missed this week</div>
          <div class="backup-day-name">${primaryDay.workoutName}</div>
          <div class="backup-day-sub">You didn't train ${primaryDay.day}. Catch up now — today's the perfect day for it.</div>
          <div class="backup-stats">
            <div class="backup-stat">
              <div class="backup-stat-num">${dayExerciseCount(primaryDay)}</div>
              <div class="backup-stat-label">Exercises</div>
            </div>
            <div class="backup-stat">
              <div class="backup-stat-num">${daySetCount(primaryDay)}</div>
              <div class="backup-stat-label">Sets</div>
            </div>
            <div class="backup-stat">
              <div class="backup-stat-num">${dayAvgRest(primaryDay)}s</div>
              <div class="backup-stat-label">Avg Rest</div>
            </div>
          </div>
          <button class="btn-primary" id="btn-backup-primary" data-missed-day="${primaryDayId}">
            <svg viewBox="0 0 24 24"><path d="M5 3 L5 21 L19 12 Z"/></svg>
            Start ${primaryDay.day} Workout
          </button>
        `;
        overview.appendChild(card);
        card.querySelector('#btn-backup-primary').addEventListener('click', () => {
          startBackupWorkout(primaryDayId);
        });
      }

      // Other missed days as smaller chips
      if (missedDays.length > 1) {
        const altSection = document.createElement('div');
        altSection.className = 'backup-alt-section';
        const altLabel = document.createElement('div');
        altLabel.className = 'backup-alt-label';
        altLabel.textContent = 'Or backup another missed day';
        altSection.appendChild(altLabel);
        const chipsWrap = document.createElement('div');
        chipsWrap.className = 'backup-alt-chips';
        missedDays.slice(1).forEach(missedDayId => {
          const md = findDayInPlan(missedDayId);
          if (!md) return;
          const chip = document.createElement('button');
          chip.className = 'backup-alt-chip';
          chip.innerHTML = `<span class="missed-mark"></span>${md.day.slice(0,3).toUpperCase()} · ${md.workoutName}`;
          chip.addEventListener('click', () => startBackupWorkout(missedDayId));
          chipsWrap.appendChild(chip);
        });
        altSection.appendChild(chipsWrap);
        overview.appendChild(altSection);
      }

      // "Just rest" option
      const restCard = document.createElement('div');
      restCard.className = 'backup-rest-card neu-raised-sm';
      restCard.innerHTML = `
        <div class="backup-tag">Prefer rest?</div>
        <div class="backup-day-sub" style="margin-bottom:12px;">Skip the makeup workout and log a recovery day instead.</div>
        <button class="btn-primary secondary" id="btn-backup-rest">
          <svg viewBox="0 0 24 24"><path d="M5 12 L10 17 L19 7"/></svg>
          Just Rest Today
        </button>
      `;
      overview.appendChild(restCard);
      restCard.querySelector('#btn-backup-rest').addEventListener('click', () => {
        // Trigger the rest-log flow
        active = {
          date: todayStr(),
          day: dayId,
          startedAt: Date.now(),
          type: 'rest',
          restNote: day.restNote || '',
          restActivity: '',
          completed: false,
        };
        saveActive();
        showRestLogScreen();
      });
    } else if (isThursday) {
      // All caught up — no missed days
      const card = document.createElement('div');
      card.className = 'backup-all-caught-up';
      card.innerHTML = `
        <div class="icon">
          <svg viewBox="0 0 24 24"><path d="M5 12 L10 17 L19 7"/></svg>
        </div>
        <div class="title">All caught up this week</div>
        <div class="sub">You've completed every training day. Take a well-earned rest.</div>
        <button class="btn-primary" id="btn-backup-rest-caught">
          <svg viewBox="0 0 24 24"><path d="M5 12 L10 17 L19 7"/></svg>
          Log Recovery
        </button>
      `;
      overview.appendChild(card);
      card.querySelector('#btn-backup-rest-caught').addEventListener('click', () => {
        active = {
          date: todayStr(),
          day: dayId,
          startedAt: Date.now(),
          type: 'rest',
          restNote: day.restNote || '',
          restActivity: '',
          completed: false,
        };
        saveActive();
        showRestLogScreen();
      });
    } else {
      // Friday or other pure rest day
      const card = document.createElement('div');
      card.className = 'exercise-overview-row neu-raised-sm';
      card.innerHTML = `
        <div class="exercise-overview-num">i</div>
        <div class="exercise-overview-info">
          <div class="exercise-overview-name">${day.restNote || 'Recovery day'}</div>
          <div class="exercise-overview-meta">No structured training today</div>
        </div>
      `;
      overview.appendChild(card);
    }
  } else {
    (day.exercises || []).forEach((ex, i) => {
      const prev = previousExerciseResults(dayId, ex.id);
      const row = document.createElement('div');
      row.className = 'exercise-overview-row neu-raised-sm';
      const prevText = prev ? prev.map(p => p.reps).join(' / ') : '—';
      const mediaHtml = renderMediaChips(ex.mediaLinks);
      row.innerHTML = `
        <div class="exercise-overview-num">${i+1}</div>
        <div class="exercise-overview-info">
          <div class="exercise-overview-name">${ex.name}</div>
          <div class="exercise-overview-meta">${ex.sets} sets · ${ex.restSeconds}s rest${ex.note ? ' · ' + ex.note : ''}</div>
          ${mediaHtml ? `<div class="exercise-overview-media">${mediaHtml}</div>` : ''}
        </div>
        <div class="exercise-overview-prev"><span class="label">Last</span><span class="val">${prevText}</span></div>
      `;
      overview.appendChild(row);
    });
  }

  const startBtn = document.getElementById('btn-start-workout');
  // Hide the default Start button on Thursday backup day (we render our own buttons in the overview)
  if (day.id === 'thursday') {
    startBtn.style.display = 'none';
  } else {
    startBtn.style.display = '';
    startBtn.innerHTML = day.type === 'cindy'
      ? '<svg viewBox="0 0 24 24"><path d="M5 3 L5 21 L19 12 Z"/></svg> Start Cindy'
      : day.type === 'rest'
        ? '<svg viewBox="0 0 24 24"><path d="M5 12 L10 17 L19 7"/></svg> Log Recovery'
        : '<svg viewBox="0 0 24 24"><path d="M5 3 L5 21 L19 12 Z"/></svg> Start Workout';
  }

  switchView('day');
}

/* ============================================================
   PREVIOUS RESULTS LOOKUP
   ============================================================ */
function previousWorkoutForDay(dayId) {
  // returns the most recent completed workout for this day, or null
  return history.filter(h => h.day === dayId).sort((a,b) => a.date < b.date ? 1 : -1)[0] || null;
}
function previousExerciseResults(dayId, exId) {
  const prev = previousWorkoutForDay(dayId);
  if (!prev || !prev.exercises) return null;
  const ex = prev.exercises.find(e => e.id === exId);
  return ex && ex.sets ? ex.sets : null;
}
function previousSetResult(dayId, exId, setIdx) {
  const sets = previousExerciseResults(dayId, exId);
  if (!sets || !sets[setIdx]) return null;
  return sets[setIdx].reps;
}
function previousCindyRounds() {
  const prev = previousWorkoutForDay('tuesday');
  if (!prev || !prev.cindy) return null;
  return prev.cindy.rounds;
}

/* ============================================================
   THURSDAY BACKUP — detect missed days this week
   Week starts Saturday. Training days: sat, sun, mon, tue, wed.
   A day is "missed" if there's no history entry for it with a date
   in this week's range (Saturday 00:00 to next Saturday 00:00).
   ============================================================ */
function dateToStr(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function getThisWeekSaturday() {
  // Week starts Saturday. JS getDay(): Sun=0, Mon=1, ..., Sat=6
  // daysSinceSaturday: Sat=0, Sun=1, Mon=2, ..., Fri=6
  const today = new Date();
  const dayOfWeek = today.getDay();
  const daysSinceSat = (dayOfWeek + 1) % 7;
  const sat = new Date(today);
  sat.setDate(today.getDate() - daysSinceSat);
  sat.setHours(0, 0, 0, 0);
  return sat;
}
function findMissedDaysThisWeek() {
  const sat = getThisWeekSaturday();
  const startStr = dateToStr(sat);
  const nextSat = new Date(sat.getTime() + 7 * 86400000);
  const endStr = dateToStr(nextSat);
  // Training days in chronological order
  const trainingDays = ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday'];
  const missed = [];
  for (const dayId of trainingDays) {
    const done = history.some(h => h.day === dayId && h.date >= startStr && h.date < endStr);
    if (!done) missed.push(dayId);
  }
  return missed;
}
function startBackupWorkout(missedDayId) {
  // Start the missed day's workout but keep today's date in the entry
  startWorkout(missedDayId);
}

/* ============================================================
   ACTIVE WORKOUT LIFECYCLE
   ============================================================ */
function startWorkout(dayId) {
  initAudio(); // unlock audio on user gesture
  const day = findDayInPlan(dayId);
  if (!day) return;

  if (day.type === 'rest') {
    // simple recovery log → straight to completion
    active = {
      date: todayStr(),
      day: dayId,
      startedAt: Date.now(),
      type: 'rest',
      restNote: day.restNote || '',
      restActivity: '',
      completed: false,
    };
    saveActive();
    showRestLogScreen();
    return;
  }

  if (day.type === 'cindy') {
    active = {
      date: todayStr(),
      day: dayId,
      startedAt: Date.now(),
      type: 'cindy',
      phase: 'cindy-running',
      cindyStartAt: Date.now(),
      cindyDuration: day.cindy.durationSeconds,
      rounds: 0,
      partial: '',
      completed: false,
    };
    saveActive();
    startCindyTimer();
    switchView('workout');
    renderWorkout();
    return;
  }

  // Strength / skill workout
  active = {
    date: todayStr(),
    day: dayId,
    startedAt: Date.now(),
    type: 'strength',
    exerciseIdx: 0,
    setIdx: 0,
    phase: 'ready', // ready | set-running | rest | done-exercise | complete
    setStartAt: null,
    restEndsAt: null,
    paused: false,
    pauseStartedAt: null,
    exercises: day.exercises.map(ex => ({
      id: ex.id,
      name: ex.name,
      sets: ex.sets,
      restSeconds: ex.restSeconds,
      type: ex.type,
      note: ex.note,
      mediaLinks: Array.isArray(ex.mediaLinks) ? ex.mediaLinks.slice() : [],
      // Skill progression (optional) — copy the stage array so the active workout
      // doesn't drift if the user edits the plan mid-workout.
      progression: Array.isArray(ex.progression) ? ex.progression.map(s => ({ ...s })) : undefined,
      completedSets: [],
    })),
    completed: false,
  };
  saveActive();
  switchView('workout');
  renderWorkout();
}

function enterWorkoutFromActive() {
  if (!active) { switchView('home'); return; }
  if (active.type === 'cindy') {
    // resume cindy timer
    if (active.phase === 'cindy-running') startCindyTimer();
    switchView('workout');
    renderWorkout();
    return;
  }
  switchView('workout');
  renderWorkout();
}

function discardActive() {
  active = null;
  saveActive();
}

/* ============================================================
   TIMERS
   ============================================================ */
let setTimerHandle = null;
let restTimerHandle = null;
let cindyHandle = null;
let lastRender = 0;

function clearAllTimers() {
  if (setTimerHandle) { clearInterval(setTimerHandle); setTimerHandle = null; }
  if (restTimerHandle) { clearInterval(restTimerHandle); restTimerHandle = null; }
  if (cindyHandle) { clearInterval(cindyHandle); cindyHandle = null; }
}

function startSetTimer() {
  if (!active || active.type !== 'strength') return;
  active.setStartAt = Date.now();
  active.phase = 'set-running';
  saveActive();
  if (setTimerHandle) clearInterval(setTimerHandle);
  setTimerHandle = setInterval(() => {
    if (currentView !== 'workout') return;
    // Only update the timer text, don't re-render the entire screen
    const timerEl = document.querySelector('.workout-timer');
    if (timerEl && active.setStartAt) {
      const elapsed = Math.floor((Date.now() - active.setStartAt) / 1000);
      timerEl.textContent = formatDuration(elapsed);
    }
  }, 250);
  renderWorkout();
}

function stopSetTimer() {
  if (setTimerHandle) { clearInterval(setTimerHandle); setTimerHandle = null; }
}

function getRestRemainingMs() {
  if (!active) return 0;
  return Math.max(0, active.paused ? (active.pauseRemainingMs || 0) : active.restEndsAt - Date.now());
}

function getRestDurationMs() {
  return active?.restDurationMs || ((active?.exercises?.[active.exerciseIdx]?.restSeconds || 90) * 1000);
}

function updateTimerRingProgress(id, progress) {
  const ring = document.getElementById(id);
  if (!ring) return;
  const clampedProgress = Math.max(0, Math.min(1, progress));
  ring.style.strokeDashoffset = String(100 * (1 - clampedProgress));
}

function startRestTimer(durationSec) {
  if (!active) return;
  active.phase = 'rest';
  active.restDurationMs = durationSec * 1000;
  active.restEndsAt = Date.now() + durationSec * 1000;
  saveActive();
  if (restTimerHandle) clearInterval(restTimerHandle);
  restTimerHandle = setInterval(() => {
    const remainingMs = getRestRemainingMs();
    const remaining = Math.ceil(remainingMs / 1000);
    if (currentView === 'workout') {
      const timerEl = document.querySelector('.workout-timer.rest');
      if (timerEl) timerEl.textContent = formatDuration(remaining);
      updateTimerRingProgress('rest-timer-progress', remainingMs / getRestDurationMs());
    }
    if (remaining <= 0) {
      clearInterval(restTimerHandle);
      restTimerHandle = null;
      onRestComplete();
    }
  }, 250);
  renderWorkout();
}

function onRestComplete() {
  playRestCompleteSound();
  vibrate([200, 100, 200]);
  // advance to next set
  advanceToNextSet();
}

function adjustRest(deltaSec) {
  if (!active || active.phase !== 'rest') return;
  active.restDurationMs = Math.max(1000, getRestDurationMs() + deltaSec * 1000);
  active.restEndsAt = Math.max(Date.now() + 1000, active.restEndsAt + deltaSec * 1000);
  if (active.paused) active.pauseRemainingMs = Math.max(1000, (active.pauseRemainingMs || 0) + deltaSec * 1000);
  saveActive();
  renderWorkout();
}

function skipRest() {
  if (!active || active.phase !== 'rest') return;
  if (restTimerHandle) { clearInterval(restTimerHandle); restTimerHandle = null; }
  onRestComplete();
}

function pauseRest() {
  if (!active || active.phase !== 'rest') return;
  if (restTimerHandle) { clearInterval(restTimerHandle); restTimerHandle = null; }
  active.paused = true;
  active.pauseRemainingMs = active.restEndsAt - Date.now();
  saveActive();
  renderWorkout();
}

function resumeRest() {
  if (!active || !active.paused) return;
  active.paused = false;
  active.restEndsAt = Date.now() + (active.pauseRemainingMs || 0);
  delete active.pauseRemainingMs;
  saveActive();
  if (restTimerHandle) clearInterval(restTimerHandle);
  restTimerHandle = setInterval(() => {
    const remainingMs = getRestRemainingMs();
    const remaining = Math.ceil(remainingMs / 1000);
    if (currentView === 'workout') {
      const timerEl = document.querySelector('.workout-timer.rest');
      if (timerEl) timerEl.textContent = formatDuration(remaining);
      updateTimerRingProgress('rest-timer-progress', remainingMs / getRestDurationMs());
    }
    if (remaining <= 0) {
      clearInterval(restTimerHandle);
      restTimerHandle = null;
      onRestComplete();
    }
  }, 250);
  renderWorkout();
}

function advanceToNextSet() {
  if (!active) return;
  const curEx = active.exercises[active.exerciseIdx];
  if (!curEx) return;
  active.setIdx++;
  if (active.setIdx >= curEx.sets) {
    // move to next exercise
    active.exerciseIdx++;
    active.setIdx = 0;
    if (active.exerciseIdx >= active.exercises.length) {
      // workout complete
      completeWorkout();
      return;
    }
  }
  active.phase = 'ready';
  active.setStartAt = null;
  saveActive();
  renderWorkout();
}

function startCindyTimer() {
  if (!active || active.type !== 'cindy') return;
  if (cindyHandle) clearInterval(cindyHandle);
  cindyHandle = setInterval(() => {
    const elapsed = Math.floor((Date.now() - active.cindyStartAt) / 1000);
    const remaining = Math.max(0, active.cindyDuration - elapsed);
    if (currentView === 'workout') {
      // Only update the timer text, don't re-render
      const timerEl = document.querySelector('.workout-timer.cindy');
      if (timerEl) timerEl.textContent = formatDuration(remaining);
      updateTimerRingProgress('cindy-timer-progress', remaining / active.cindyDuration);
      // update progress bar
      const fill = document.getElementById('workout-progress-fill');
      if (fill) fill.style.width = Math.min(100, (elapsed / active.cindyDuration) * 100) + '%';
    }
    if (remaining <= 0) {
      clearInterval(cindyHandle);
      cindyHandle = null;
      onCindyComplete();
    }
  }, 250);
}

function onCindyComplete() {
  playRestCompleteSound();
  vibrate([300, 100, 300]);
  active.phase = 'cindy-done';
  saveActive();
  renderWorkout();
}

/* ============================================================
   RENDER WORKOUT (active)
   ============================================================ */
function renderWorkout() {
  if (!active) { switchView('home'); return; }
  const screen = document.getElementById('workout-screen');
  const fill = document.getElementById('workout-progress-fill');

  if (active.type === 'cindy') {
    renderCindy(screen);
    const elapsed = Math.floor((Date.now() - active.cindyStartAt) / 1000);
    const total = active.cindyDuration;
    fill.style.width = Math.min(100, (elapsed / total) * 100) + '%';
    return;
  }

  if (active.type === 'rest') {
    renderRestLog(screen);
    fill.style.width = '0%';
    return;
  }

  // Strength
  const ex = active.exercises[active.exerciseIdx];
  if (!ex) { completeWorkout(); return; }

  const totalSets = active.exercises.reduce((s,e) => s + e.sets, 0);
  const completedSets = active.exercises.reduce((s,e) => s + e.completedSets.length, 0);
  const currentSetProgress = completedSets + (active.phase === 'set-running' || active.phase === 'rest' || active.phase === 'ready' ? (active.setIdx + 1) * 0 : 0);
  // simpler: completed sets / total
  fill.style.width = Math.min(100, (completedSets / totalSets) * 100) + '%';

  // pause button label
  document.getElementById('btn-pause-workout').textContent = active.paused ? 'Resume' : 'Pause';

  let html = '';
  if (active.phase === 'ready') {
    const prevSet = previousSetResult(active.day, ex.id, active.setIdx);
    const mediaHtml = renderMediaChips(ex.mediaLinks);
    const isTimed = ex.type === 'timed';
    // Skill exercise with a progression array gets a custom Get Ready screen.
    const skillStage = getCurrentSkillStage(ex);
    if (ex.type === 'skill' && skillStage) {
      const prog = getSkillProgress(ex.id);
      const stageNum = prog.currentStage || 1;
      const totalStages = ex.progression.length;
      const passedCount = prog.passedStages.length;
      const isSeconds = skillStage.unit === 'seconds';
      const goalText = isSeconds
        ? `Goal: Hold for ${skillStage.requirement} seconds`
        : `Goal: ${skillStage.requirement} strict reps`;
      // Last attempt display: look up most recent saved set for this exercise
      // AT THE CURRENT STAGE (so we don't show a result from a passed stage).
      const lastAttempt = lastSkillAttempt(ex.id, stageNum);
      let lastAttemptHtml = '';
      if (lastAttempt) {
        const lastVal = isSeconds
          ? (lastAttempt.durationSec != null ? lastAttempt.durationSec : Number(lastAttempt.reps) || 0)
          : Number(lastAttempt.reps) || 0;
        const lastLabel = isSeconds ? `${lastVal} seconds` : `${lastVal} reps`;
        lastAttemptHtml = `<div class="workout-previous">Last attempt: <span class="prev-val">${lastLabel}</span></div>`;
      } else {
        lastAttemptHtml = `<div class="workout-previous">First attempt at this stage</div>`;
      }
      // Progress bar showing stages passed vs remaining
      const fillCount = passedCount;
      const barCells = Array.from({ length: totalStages }, (_, i) => {
        const stageI = i + 1;
        const isPassed = prog.passedStages.includes(stageI);
        const isCurrent = stageI === stageNum;
        if (isPassed) return '<span class="bar-cell passed"></span>';
        if (isCurrent) return '<span class="bar-cell current"></span>';
        return '<span class="bar-cell"></span>';
      }).join('');
      // Full stage list with ✅/⏳/🔒 icons
      const stageListHtml = ex.progression.map(s => {
        const sNum = s.stage || 0;
        const isPassed = prog.passedStages.includes(sNum);
        const isCurrent = sNum === stageNum;
        const isLocked = !isPassed && !isCurrent;
        const icon = isPassed ? '✅' : isCurrent ? '⏳' : '🔒';
        const cls = isPassed ? 'skill-stage-passed' : isCurrent ? 'skill-stage-current' : 'skill-stage-locked';
        const reqText = s.unit === 'seconds' ? `${s.requirement}s` : `${s.requirement} reps`;
        return `<div class="skill-stage-item ${cls}">
          <span class="skill-stage-icon">${icon}</span>
          <span class="skill-stage-num">Stage ${sNum}</span>
          <span class="skill-stage-name">${s.name || ''}</span>
          <span class="skill-stage-req">${reqText}</span>
        </div>`;
      }).join('');
      html = `
        <div class="workout-phase-label">Skill Progression · Stage ${stageNum} of ${totalStages}</div>
        <h2 class="workout-exercise-name">${skillStage.name || ex.name}</h2>
        <div class="workout-target">${goalText}</div>
        ${ex.note ? `<div class="workout-target" style="opacity:0.7;">${ex.note}</div>` : ''}
        <div class="skill-progression-bar" title="${passedCount} of ${totalStages} stages passed">
          <div class="bar-cells">${barCells}</div>
          <div class="bar-label">${passedCount}/${totalStages} passed</div>
        </div>
        ${lastAttemptHtml}
        ${mediaHtml ? `<div class="workout-media-row">${mediaHtml}</div>` : ''}
        <button class="btn-primary" id="btn-start-set" style="max-width:280px;margin:0 auto;">
          <svg viewBox="0 0 24 24"><path d="M5 3 L5 21 L19 12 Z"/></svg>
          Start Skill Attempt
        </button>
        <button class="skill-skip-link" id="btn-skip-stage" type="button">Skip Stage</button>
        <details class="skill-stage-details">
          <summary>All stages</summary>
          <div class="skill-stage-list">${stageListHtml}</div>
        </details>
        <div class="workout-totals">
          <span class="workout-total-chip">Exercise <span class="val">${active.exerciseIdx+1}/${active.exercises.length}</span></span>
          <span class="workout-total-chip">Sets done <span class="val">${completedSets}/${totalSets}</span></span>
        </div>
      `;
    } else {
      const prevDisplay = isTimed
        ? (prevSet !== null ? prevSet + 's' : '—')
        : (prevSet !== null ? prevSet + ' reps' : '—');
      const prevLabel = isTimed ? 'Hold for time' : ('Previous: ' + prevDisplay);
      html = `
        <div class="workout-phase-label">Get Ready · Set ${active.setIdx + 1} of ${ex.sets}</div>
        <h2 class="workout-exercise-name">${ex.name}</h2>
        <div class="workout-target">${ex.note || ''}</div>
        <div class="workout-previous">${isTimed ? prevLabel : 'Previous: <span class="prev-val">' + prevDisplay + '</span>'}</div>
        ${mediaHtml ? `<div class="workout-media-row">${mediaHtml}</div>` : ''}
        <button class="btn-primary" id="btn-start-set" style="max-width:280px;margin:0 auto;">
          <svg viewBox="0 0 24 24"><path d="M5 3 L5 21 L19 12 Z"/></svg>
          Start Set
        </button>
        <div class="workout-totals">
          <span class="workout-total-chip">Exercise <span class="val">${active.exerciseIdx+1}/${active.exercises.length}</span></span>
          <span class="workout-total-chip">Sets done <span class="val">${completedSets}/${totalSets}</span></span>
        </div>
      `;
    }
  } else if (active.phase === 'set-running') {
    const elapsed = Math.floor((Date.now() - active.setStartAt) / 1000);
    const prevSet = previousSetResult(active.day, ex.id, active.setIdx);
    const mediaHtml = renderMediaChips(ex.mediaLinks);
    const isTimed = ex.type === 'timed';
    const isSuperset = ex.type === 'superset';
    // Skill exercise with a seconds-based current stage behaves like timed (no reps input).
    const skillStage = getCurrentSkillStage(ex);
    const isSkillSeconds = ex.type === 'skill' && skillStage && skillStage.unit === 'seconds';
    const effectiveTimed = isTimed || isSkillSeconds;
    const prevDisplay = isTimed
      ? (prevSet !== null ? prevSet + 's' : '—')
      : (prevSet !== null ? prevSet + ' reps' : '—');
    let inputHtml = '';
    if (effectiveTimed) {
      // No reps input — just the timer (already rendered above)
      inputHtml = '';
    } else if (isSuperset) {
      // Multiple movement inputs, default 3 (or match previous split if present)
      let movements = ['','',''];
      if (prevSet !== null && typeof prevSet === 'string' && prevSet.includes('/')) {
        const parts = prevSet.split('/');
        movements = parts.concat(movements).slice(0, Math.max(parts.length, 3));
      }
      const rowsHtml = movements.map((val, i) => `
        <div class="superset-input-row" data-mov-idx="${i}">
          <span class="superset-input-label">Movement ${i+1}</span>
          <input type="number" class="workout-reps-input superset-reps-input" min="0" step="1" inputmode="numeric" placeholder="0" autocomplete="off" value="${val}">
          ${movements.length > 1 ? `<button class="superset-remove-btn" data-mov-remove="${i}" aria-label="Remove movement" title="Remove movement">−</button>` : ''}
        </div>
      `).join('');
      inputHtml = `
        <div class="superset-inputs" id="superset-inputs">${rowsHtml}</div>
        <button class="superset-add-btn" id="btn-superset-add-movement">
          <svg viewBox="0 0 24 24"><path d="M12 5 L12 19"/><path d="M5 12 L19 12"/></svg>
          Add movement
        </button>
      `;
    } else {
      inputHtml = `
        <div class="workout-input-wrap">
          <input type="number" class="workout-reps-input" id="reps-input" min="0" step="1" inputmode="numeric" placeholder="0" autocomplete="off">
          <span class="workout-reps-unit">reps</span>
        </div>
      `;
    }
    let prevLine;
    if (effectiveTimed && !isTimed) {
      // Skill seconds-based stage — show the goal reminder instead of "Previous"
      prevLine = `<div class="workout-previous">Goal: Hold for <span class="prev-val">${skillStage.requirement}s</span></div>`;
    } else if (isTimed) {
      prevLine = `<div class="workout-previous">Hold for time</div>`;
    } else {
      prevLine = `<div class="workout-previous">Previous: <span class="prev-val">${prevDisplay}</span></div>`;
    }
    // Phase label shows stage info when in a skill progression
    let phaseLabelLine;
    if (ex.type === 'skill' && skillStage) {
      const prog = getSkillProgress(ex.id);
      const stageNum = prog.currentStage || 1;
      const totalStages = ex.progression.length;
      phaseLabelLine = `Skill · Stage ${stageNum} of ${totalStages} · Set ${active.setIdx + 1} of ${ex.sets}`;
    } else {
      phaseLabelLine = `In Progress · Set ${active.setIdx + 1} of ${ex.sets}`;
    }
    // Exercise name shows the stage name for skill progressions
    const displayName = (ex.type === 'skill' && skillStage) ? (skillStage.name || ex.name) : ex.name;
    html = `
      <div class="workout-phase-label">${phaseLabelLine}</div>
      <h2 class="workout-exercise-name">${displayName}</h2>
      <div class="workout-timer">${formatDuration(elapsed)}</div>
      ${prevLine}
      ${mediaHtml ? `<div class="workout-media-row">${mediaHtml}</div>` : ''}
      ${inputHtml}
      <button class="btn-primary" id="btn-done-set" style="max-width:280px;margin:0 auto;">
        <svg viewBox="0 0 24 24"><path d="M5 12 L10 17 L19 7"/></svg>
        Done
      </button>
    `;
  } else if (active.phase === 'rest') {
    const remainingMs = getRestRemainingMs();
    const remaining = Math.ceil(remainingMs / 1000);
    const restProgress = remainingMs / getRestDurationMs();
    // Compute the NEXT exercise/set that will start after rest ends
    const next = getNextWorkoutStep();
    let phaseLabel = 'Rest';
    let nextName = ex.name;
    let targetText = '';
    if (next) {
      const nextEx = next.exercise;
      const isNextExercise = next.exerciseIdx !== active.exerciseIdx;
      phaseLabel = isNextExercise ? 'Next exercise' : 'Next set';
      nextName = nextEx.name;
      const nextPrev = previousSetResult(active.day, nextEx.id, next.setIdx);
      const nextIsTimed = nextEx.type === 'timed';
      if (nextPrev !== null) {
        targetText = nextIsTimed ? `${nextPrev}s` : `${nextPrev} reps`;
      } else {
        targetText = nextIsTimed ? 'Hold for time' : '—';
      }
    } else {
      // Should not happen because rest is skipped before completion, but guard anyway
      phaseLabel = 'Rest';
    }
    html = `
      <div class="workout-phase-label">${phaseLabel}</div>
      <h2 class="workout-exercise-name" style="font-size:22px;">${nextName}</h2>
      <div class="timer-ring rest">
        <svg viewBox="0 0 160 160" aria-hidden="true">
          <circle class="timer-ring-track" cx="80" cy="80" r="68"></circle>
          <circle class="timer-ring-progress" id="rest-timer-progress" pathLength="100" stroke-dasharray="100" stroke-dashoffset="${100 * (1 - restProgress)}" cx="80" cy="80" r="68"></circle>
        </svg>
        <div class="workout-timer rest">${formatDuration(remaining)}</div>
      </div>
      <div class="workout-previous">Target: <span class="prev-val">${targetText}</span></div>
      <div class="rest-controls">
        <button class="rest-btn" id="btn-rest-minus">-15s</button>
        <button class="rest-btn warn" id="btn-rest-pause">${active.paused ? 'Resume' : 'Pause'}</button>
        <button class="rest-btn" id="btn-rest-plus">+15s</button>
        <button class="rest-btn danger" id="btn-rest-skip">Skip</button>
      </div>
    `;
    if (active.paused) {
      html += `<div class="rest-complete-banner"><div class="title">Paused</div><div class="sub">Tap Resume to continue the rest timer</div></div>`;
    }
  }

  screen.innerHTML = html;
  attachWorkoutHandlers();
}

/* Compute the next exercise/set that will run after the current set finishes.
   Used by the rest phase to show what's coming up next. */
function getNextWorkoutStep() {
  if (!active) return null;
  const curEx = active.exercises[active.exerciseIdx];
  if (!curEx) return null;
  let nextSetIdx = active.setIdx + 1;
  let nextExIdx = active.exerciseIdx;
  if (nextSetIdx >= curEx.sets) {
    nextExIdx++;
    nextSetIdx = 0;
  }
  if (nextExIdx >= active.exercises.length) return null;
  const nextEx = active.exercises[nextExIdx];
  if (!nextEx) return null;
  return { exerciseIdx: nextExIdx, setIdx: nextSetIdx, exercise: nextEx };
}

function attachWorkoutHandlers() {
  const startSetBtn = document.getElementById('btn-start-set');
  if (startSetBtn) startSetBtn.addEventListener('click', startSetTimer);

  const skipStageBtn = document.getElementById('btn-skip-stage');
  if (skipStageBtn) skipStageBtn.addEventListener('click', () => {
    const ex = active.exercises[active.exerciseIdx];
    confirmSkipSkillStage(ex);
  });

  const doneBtn = document.getElementById('btn-done-set');
  if (doneBtn) doneBtn.addEventListener('click', () => {
    const ex = active.exercises[active.exerciseIdx];
    const duration = Math.floor((Date.now() - active.setStartAt) / 1000);
    // Resolve skill stage BEFORE deciding how to compute reps
    const skillStage = getCurrentSkillStage(ex);
    const isSkillSeconds = ex.type === 'skill' && skillStage && skillStage.unit === 'seconds';
    let reps;
    if (ex.type === 'timed' || isSkillSeconds) {
      // Timed exercises (and skill seconds-based stages) save elapsed seconds as the reps value
      reps = duration;
    } else if (ex.type === 'superset') {
      // Collect all movement input values, join with "/"
      const inputs = document.querySelectorAll('.superset-reps-input');
      const vals = [];
      inputs.forEach(inp => {
        let v = inp.value === '' ? 0 : parseInt(inp.value, 10);
        if (isNaN(v) || v < 0) v = 0;
        vals.push(String(v));
      });
      reps = vals.length > 0 ? vals.join('/') : '0';
    } else {
      const input = document.getElementById('reps-input');
      reps = input && input.value !== '' ? parseInt(input.value, 10) : 0;
      if (isNaN(reps) || reps < 0) reps = 0;
    }
    // For skill exercises with a progression, also tag the saved set with the
    // stage number it was attempted at — so the Get Ready screen can show the
    // most recent attempt for the CURRENT stage (rather than a stage the user
    // has already passed).
    const skillSetMeta = (ex.type === 'skill' && skillStage)
      ? { stage: getSkillProgress(ex.id).currentStage || 1 }
      : {};
    ex.completedSets.push({ reps, durationSec: duration, ...skillSetMeta });
    saveActive();
    stopSetTimer();

    // Skill progression: evaluate pass / fail for the current stage.
    if (ex.type === 'skill' && skillStage) {
      evaluateSkillStage(ex, skillStage, reps, duration);
    }

    // Change 10: if this was the LAST set of the LAST exercise, complete workout directly
    const isLastSet = active.setIdx + 1 >= ex.sets;
    const isLastExercise = active.exerciseIdx + 1 >= active.exercises.length;
    if (isLastSet && isLastExercise) {
      completeWorkout();
      return;
    }
    // Otherwise, proceed with rest timer as before
    active.phase = 'rest';
    saveActive();
    startRestTimer(ex.restSeconds || 90);
  });

  // Superset: add/remove movement rows
  const addMovBtn = document.getElementById('btn-superset-add-movement');
  if (addMovBtn) addMovBtn.addEventListener('click', addSupersetMovement);
  document.querySelectorAll('[data-mov-remove]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.getAttribute('data-mov-remove'), 10);
      removeSupersetMovement(idx);
    });
  });

  const restMinus = document.getElementById('btn-rest-minus');
  if (restMinus) restMinus.addEventListener('click', () => adjustRest(-15));
  const restPlus = document.getElementById('btn-rest-plus');
  if (restPlus) restPlus.addEventListener('click', () => adjustRest(15));
  const restSkip = document.getElementById('btn-rest-skip');
  if (restSkip) restSkip.addEventListener('click', skipRest);
  const restPause = document.getElementById('btn-rest-pause');
  if (restPause) restPause.addEventListener('click', () => {
    if (active.paused) resumeRest(); else pauseRest();
  });
}

/* ============================================================
   SKILL PROGRESSION — evaluate stage pass / fail
   Called from the Done handler after the set result is saved.
   Mutates state.skillProgress[exId] and persists.
   ============================================================ */
function evaluateSkillStage(ex, stage, reps, durationSec) {
  if (!ex || !stage) return;
  const requirement = Number(stage.requirement) || 0;
  const unit = stage.unit === 'seconds' ? 'seconds' : 'reps';
  let passed = false;
  let actualVal = 0;
  if (unit === 'seconds') {
    actualVal = Number(durationSec) || 0;
    passed = actualVal >= requirement;
  } else {
    actualVal = Number(reps);
    if (isNaN(actualVal)) actualVal = 0;
    passed = actualVal >= requirement;
  }
  const prog = getSkillProgress(ex.id);
  const stageNum = prog.currentStage || 1;
  const totalStages = (Array.isArray(ex.progression) ? ex.progression.length : 0);

  if (passed) {
    if (!prog.passedStages.includes(stageNum)) {
      prog.passedStages.push(stageNum);
      prog.passedStages.sort((a,b) => a - b);
    }
    const isLastStage = stageNum >= totalStages;
    if (!isLastStage) {
      prog.currentStage = stageNum + 1;
    }
    saveData();
    if (isLastStage) {
      showToast(`🏆 Skill mastered! ${ex.name} complete!`);
    } else {
      const nextStageObj = ex.progression.find(s => s && s.stage === prog.currentStage)
        || ex.progression[prog.currentStage - 1];
      const nextName = nextStageObj ? (nextStageObj.name || 'next stage') : 'next stage';
      showToast(`✓ Stage ${stageNum} complete! Next: ${nextName}`);
    }
  } else {
    // Do NOT advance the stage — user must retry next time.
    const actualLabel = unit === 'seconds' ? `${actualVal} seconds` : `${actualVal} reps`;
    showToast(`Not yet — needed ${requirement} ${unit}, you did ${actualLabel}`, 'warn');
  }
}

/* ============================================================
   SKILL PROGRESSION — skip stage (manual advance with confirmation)
   ============================================================ */
function confirmSkipSkillStage(ex) {
  if (!ex || !Array.isArray(ex.progression) || ex.progression.length === 0) return;
  const prog = getSkillProgress(ex.id);
  const stageNum = prog.currentStage || 1;
  const isLastStage = stageNum >= ex.progression.length;
  showModal(`
    <div class="modal-title">Skip this stage?</div>
    <div class="modal-text">Skip this stage? You can't undo this.</div>
    <div class="modal-actions">
      <button class="btn-primary secondary" id="modal-skip-cancel">Cancel</button>
      <button class="btn-primary danger" id="modal-skip-confirm">Skip Stage</button>
    </div>
  `);
  document.getElementById('modal-skip-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-skip-confirm').addEventListener('click', () => {
    if (!prog.passedStages.includes(stageNum)) {
      prog.passedStages.push(stageNum);
      prog.passedStages.sort((a,b) => a - b);
    }
    if (!isLastStage) {
      prog.currentStage = stageNum + 1;
    }
    saveData();
    closeModal();
    if (isLastStage) {
      showToast(`🏆 Skill mastered! ${ex.name} complete!`);
    } else {
      const nextStageObj = ex.progression.find(s => s && s.stage === prog.currentStage)
        || ex.progression[prog.currentStage - 1];
      const nextName = nextStageObj ? (nextStageObj.name || 'next stage') : 'next stage';
      showToast(`Stage skipped — next: ${nextName}`, 'warn');
    }
    if (active && currentView === 'workout') renderWorkout();
  });
}

/* Add a new movement input row to the superset inputs (preserves existing values) */
function addSupersetMovement() {
  const wrap = document.getElementById('superset-inputs');
  if (!wrap) return;
  const existing = wrap.querySelectorAll('.superset-input-row');
  const newIdx = existing.length;
  // Add remove buttons to all rows when there's more than 1
  rebuildSupersetInputs(wrap, newIdx + 1);
  // Focus the newly added input
  const newRow = wrap.querySelector(`.superset-input-row[data-mov-idx="${newIdx}"]`);
  if (newRow) {
    const inp = newRow.querySelector('input');
    if (inp) inp.focus();
  }
}

/* Remove a movement input row at the given index (preserves the others) */
function removeSupersetMovement(idx) {
  const wrap = document.getElementById('superset-inputs');
  if (!wrap) return;
  const rows = wrap.querySelectorAll('.superset-input-row');
  if (rows.length <= 1) return; // keep at least one
  // Capture current values (excluding the one being removed)
  const vals = [];
  rows.forEach((r, i) => {
    if (i === idx) return;
    const inp = r.querySelector('input');
    vals.push(inp ? inp.value : '');
  });
  // Rebuild with remaining values, ensuring at least 1 row
  const inputs = vals.map(v => `<input type="number" class="workout-reps-input superset-reps-input" min="0" step="1" inputmode="numeric" placeholder="0" autocomplete="off" value="${v}">`);
  while (inputs.length < 1) inputs.push('<input type="number" class="workout-reps-input superset-reps-input" min="0" step="1" inputmode="numeric" placeholder="0" autocomplete="off" value="">');
  rebuildSupersetInputs(wrap, inputs.length, inputs);
}

/* Rebuild the superset inputs container with N rows, preserving provided input values */
function rebuildSupersetInputs(wrap, count, providedInputs) {
  // Capture existing values if not provided
  let existingInputs = providedInputs;
  if (!existingInputs) {
    const cur = wrap.querySelectorAll('.superset-reps-input');
    existingInputs = [];
    cur.forEach(inp => existingInputs.push(`<input type="number" class="workout-reps-input superset-reps-input" min="0" step="1" inputmode="numeric" placeholder="0" autocomplete="off" value="${inp.value}">`));
    while (existingInputs.length < count) existingInputs.push('<input type="number" class="workout-reps-input superset-reps-input" min="0" step="1" inputmode="numeric" placeholder="0" autocomplete="off" value="">');
  }
  const rowsHtml = existingInputs.map((inputHtml, i) => `
    <div class="superset-input-row" data-mov-idx="${i}">
      <span class="superset-input-label">Movement ${i+1}</span>
      ${inputHtml}
      ${existingInputs.length > 1 ? `<button class="superset-remove-btn" data-mov-remove="${i}" aria-label="Remove movement" title="Remove movement">−</button>` : ''}
    </div>
  `).join('');
  wrap.innerHTML = rowsHtml;
  // Re-bind remove buttons
  wrap.querySelectorAll('[data-mov-remove]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.getAttribute('data-mov-remove'), 10);
      removeSupersetMovement(idx);
    });
  });
}

/* ============================================================
   CINDY RENDER
   ============================================================ */
function renderCindy(screen) {
  const elapsed = Math.floor((Date.now() - active.cindyStartAt) / 1000);
  const remaining = Math.max(0, active.cindyDuration - elapsed);
  const day = findDayInPlan(active.day);
  const scheme = day && day.cindy ? day.cindy.scheme : [];

  if (active.phase === 'cindy-done' || remaining <= 0) {
    screen.innerHTML = `
      <div class="rest-complete-banner">
        <div class="title">Cindy Complete</div>
        <div class="sub">20 minutes done. Save your result.</div>
      </div>
      <div class="cindy-rounds-display">
        <div class="cindy-rounds-num">${active.rounds}</div>
        <div class="cindy-rounds-label">Rounds Completed</div>
      </div>
      <button class="btn-primary" id="btn-cindy-save" style="max-width:280px;margin:0 auto;">
        <svg viewBox="0 0 24 24"><path d="M5 12 L10 17 L19 7"/></svg>
        Save Result
      </button>
    `;
    document.getElementById('btn-cindy-save').addEventListener('click', () => {
      saveCindyToHistory();
      discardActive();
      clearAllTimers();
      showCompletionScreen({ type: 'cindy', rounds: active ? 0 : (active ? active.rounds : 0) });
      // Note: active already discarded; we capture rounds before discard via closure issue — fixed below
    });
    // Fix closure: re-read rounds before discard
    document.getElementById('btn-cindy-save').onclick = () => {
      const rounds = active ? active.rounds : 0;
      saveCindyToHistory();
      discardActive();
      clearAllTimers();
      showCompletionScreen({ type: 'cindy', rounds });
    };
    return;
  }

  const cindyProgress = remaining / active.cindyDuration;
  screen.innerHTML = `
    <div class="workout-phase-label">Cindy · 20-min AMRAP</div>
    <div class="timer-ring cindy">
      <svg viewBox="0 0 160 160" aria-hidden="true">
        <circle class="timer-ring-track" cx="80" cy="80" r="68"></circle>
        <circle class="timer-ring-progress" id="cindy-timer-progress" pathLength="100" stroke-dasharray="100" stroke-dashoffset="${100 * (1 - cindyProgress)}" cx="80" cy="80" r="68"></circle>
      </svg>
      <div class="workout-timer cindy">${formatDuration(remaining)}</div>
    </div>
    <div class="cindy-rounds-display">
      <div class="cindy-rounds-num">${active.rounds}</div>
      <div class="cindy-rounds-label">Rounds Completed</div>
    </div>
    <div class="cindy-scheme">
      ${scheme.map(s => `<div class="cindy-scheme-chip"><span class="num">${s.reps}</span> ${s.name}</div>`).join('')}
    </div>
    <div class="cindy-round-controls">
      <button class="cindy-add-btn minus" id="btn-cindy-minus">−</button>
      <button class="cindy-add-btn plus" id="btn-cindy-plus">+</button>
    </div>
    <button class="btn-primary warn" id="btn-cindy-finish" style="max-width:280px;margin:0 auto;">
      <svg viewBox="0 0 24 24"><path d="M5 12 L10 17 L19 7"/></svg>
      Finish Early
    </button>
  `;
  document.getElementById('btn-cindy-plus').addEventListener('click', () => {
    active.rounds = Math.max(0, active.rounds + 1);
    saveActive();
    renderWorkout();
  });
  document.getElementById('btn-cindy-minus').addEventListener('click', () => {
    active.rounds = Math.max(0, active.rounds - 1);
    saveActive();
    renderWorkout();
  });
  document.getElementById('btn-cindy-finish').addEventListener('click', () => {
    onCindyComplete();
  });
}

function saveCindyToHistory() {
  if (!active) return;
  const entry = {
    date: active.date,
    day: active.day,
    workoutName: findDayInPlan(active.day)?.workoutName || 'Cindy',
    durationSec: active.cindyDuration,
    type: 'cindy',
    cindy: { rounds: active.rounds },
    exercises: [],
  };
  history.unshift(entry);
  saveHistory();
}

/* ============================================================
   REST DAY LOG
   ============================================================ */
function showRestLogScreen() {
  // Switch to workout view and render the rest-log screen
  switchView('workout');
  const screen = document.getElementById('workout-screen');
  if (!screen || !active) return;
  renderRestLog(screen);
}
function renderRestLog(screen) {
  screen.innerHTML = `
    <div class="workout-phase-label">Recovery Log</div>
    <h2 class="workout-exercise-name" style="font-size:24px;">${findDayInPlan(active.day)?.workoutName || 'Rest Day'}</h2>
    <div class="workout-target" style="margin-bottom:18px;">${active.restNote || ''}</div>
    <label class="plan-edit-label">Activity (optional)</label>
    <input type="text" class="plan-edit-input" id="rest-activity" placeholder="e.g. 30-min walk, mobility, light stretching" value="${active.restActivity || ''}" style="margin-bottom:14px;">
    <button class="btn-primary" id="btn-save-rest">
      <svg viewBox="0 0 24 24"><path d="M5 12 L10 17 L19 7"/></svg>
      Save Recovery
    </button>
  `;
  document.getElementById('btn-save-rest').addEventListener('click', () => {
    const activity = document.getElementById('rest-activity').value.trim();
    active.restActivity = activity;
    saveRestToHistory();
    discardActive();
    showCompletionScreen({ type: 'rest' });
  });
}
function saveRestToHistory() {
  if (!active) return;
  const entry = {
    date: active.date,
    day: active.day,
    workoutName: findDayInPlan(active.day)?.workoutName || 'Rest',
    durationSec: 0,
    type: 'rest',
    restActivity: active.restActivity || '',
    exercises: [],
  };
  history.unshift(entry);
  saveHistory();
}

/* ============================================================
   WORKOUT COMPLETION
   ============================================================ */
function completeWorkout() {
  if (!active) return;
  const durationSec = Math.floor((Date.now() - active.startedAt) / 1000);

  // Build history entry from completed sets
  const exercises = active.exercises.map(ex => ({
    id: ex.id,
    name: ex.name,
    type: ex.type || 'strength',
    sets: ex.completedSets.slice(),
  }));

  const totalSets = exercises.reduce((s,e) => s + e.sets.length, 0);
  // Only count strength/skill reps toward totalReps (superset reps are slash-joined strings,
  // timed reps are elapsed seconds — neither should be summed)
  const totalReps = exercises.reduce((s,e) => {
    const exType = e.type || 'strength';
    if (exType !== 'strength' && exType !== 'skill') return s;
    return s + e.sets.reduce((ss, x) => ss + (Number(x.reps) || 0), 0);
  }, 0);

  const entry = {
    date: active.date,
    day: active.day,
    workoutName: findDayInPlan(active.day)?.workoutName || 'Workout',
    durationSec,
    type: 'strength',
    exercises,
    totalSets,
    totalReps,
  };

  history.unshift(entry);
  saveHistory();

  const summary = {
    type: 'strength',
    durationSec,
    totalSets,
    totalReps,
    exercises,
    workoutName: entry.workoutName,
  };

  active = null;
  saveActive();
  clearAllTimers();

  playRestCompleteSound();
  vibrate([300, 100, 300, 100, 300]);

  showCompletionScreen(summary);
}

function showCompletionScreen(summary) {
  document.getElementById('completion-sub').textContent = summary.workoutName || (summary.type === 'cindy' ? 'Cindy 20-min AMRAP' : 'Recovery');

  const stats = document.getElementById('completion-stats');
  if (summary.type === 'cindy') {
    stats.innerHTML = `
      <div class="completion-stat wide">
        <div class="completion-stat-num">${summary.rounds} rounds</div>
        <div class="completion-stat-label">Cindy Result</div>
      </div>
      <div class="completion-stat">
        <div class="completion-stat-num">${formatDuration(summary.durationSec || 1200)}</div>
        <div class="completion-stat-label">Duration</div>
      </div>
    `;
  } else if (summary.type === 'rest') {
    stats.innerHTML = `
      <div class="completion-stat wide">
        <div class="completion-stat-num">Recovery logged</div>
        <div class="completion-stat-label">Rest day recorded</div>
      </div>
    `;
  } else {
    // best set (skip superset/timed — only strength/skill reps are comparable numbers)
    let bestSet = null;
    let bestSetExercise = '';
    summary.exercises.forEach(ex => {
      const exType = ex.type || 'strength';
      if (exType !== 'strength' && exType !== 'skill') return;
      ex.sets.forEach(s => {
        const r = Number(s.reps);
        if (isNaN(r)) return;
        if (bestSet === null || r > bestSet) { bestSet = r; bestSetExercise = ex.name; }
      });
    });
    stats.innerHTML = `
      <div class="completion-stat">
        <div class="completion-stat-num">${formatDuration(summary.durationSec)}</div>
        <div class="completion-stat-label">Duration</div>
      </div>
      <div class="completion-stat">
        <div class="completion-stat-num">${summary.totalSets}</div>
        <div class="completion-stat-label">Total Sets</div>
      </div>
      <div class="completion-stat">
        <div class="completion-stat-num">${summary.totalReps}</div>
        <div class="completion-stat-label">Total Reps</div>
      </div>
      <div class="completion-stat">
        <div class="completion-stat-num">${bestSet !== null ? bestSet : '—'}</div>
        <div class="completion-stat-label">Best Set</div>
      </div>
      ${bestSetExercise ? `<div class="completion-stat wide"><div class="completion-stat-num">${bestSetExercise}</div><div class="completion-stat-label">Best Set Exercise</div></div>` : ''}
    `;
  }

  switchView('completion');
}

/* ============================================================
   PAUSE WORKOUT (whole-session pause)
   ============================================================ */
function togglePauseWorkout() {
  if (!active) return;
  if (active.paused) {
    // resume
    active.paused = false;
    if (active.phase === 'rest') {
      active.restEndsAt = Date.now() + (active.pauseRemainingMs || 0);
      delete active.pauseRemainingMs;
      saveActive();
      resumeRest();
    } else if (active.phase === 'set-running' && active.pauseStartedAt) {
      // shift setStartAt forward by paused duration
      const pausedMs = Date.now() - active.pauseStartedAt;
      active.setStartAt += pausedMs;
      delete active.pauseStartedAt;
      saveActive();
      if (setTimerHandle) clearInterval(setTimerHandle);
      setTimerHandle = setInterval(() => {
        if (currentView === 'workout') renderWorkout();
      }, 200);
    }
    showToast('Workout resumed');
  } else {
    // pause
    active.paused = true;
    if (active.phase === 'rest') {
      active.pauseRemainingMs = active.restEndsAt - Date.now();
      if (restTimerHandle) { clearInterval(restTimerHandle); restTimerHandle = null; }
    } else if (active.phase === 'set-running') {
      active.pauseStartedAt = Date.now();
      if (setTimerHandle) { clearInterval(setTimerHandle); setTimerHandle = null; }
    }
    saveActive();
    showToast('Workout paused', 'warn');
  }
  renderWorkout();
}

/* ============================================================
   HISTORY RENDER
   ============================================================ */
function renderHistory() {
  document.getElementById('history-count').textContent = `${history.length} ${history.length === 1 ? 'workout' : 'workouts'} logged`;
  const list = document.getElementById('history-list');
  if (history.length === 0) {
    list.innerHTML = '<div class="history-empty">No workouts yet. Start your first one from the Home tab.</div>';
    return;
  }
  list.innerHTML = '';
  history.forEach((entry, idx) => {
    const card = document.createElement('div');
    card.className = 'history-card neu-raised-sm';

    let exRows = '';
    let detailHtml = '';
    if (entry.type === 'cindy') {
      exRows = `<div class="history-card-ex"><span class="history-card-ex-name">Cindy Rounds</span><span class="history-card-ex-val">${entry.cindy.rounds}</span></div>`;
    } else if (entry.type === 'rest') {
      exRows = `<div class="history-card-ex"><span class="history-card-ex-name">Activity</span><span class="history-card-ex-val">${entry.restActivity || 'Rest'}</span></div>`;
    } else {
      // find previous for delta
      const prev = history.slice(idx+1).find(h => h.day === entry.day && h.type === 'strength');
      entry.exercises.forEach(ex => {
        const exType = ex.type || 'strength';
        const isTimedEx = exType === 'timed';
        const repsStr = ex.sets.map(s => isTimedEx ? (s.reps + 's') : s.reps).join(' / ');
        let deltaHtml = '';
        if (prev) {
          const prevEx = prev.exercises.find(e => e.id === ex.id);
          if (prevEx) {
            const deltas = ex.sets.map((s, i) => {
              const p = prevEx.sets[i];
              if (!p) return '';
              const d = s.reps - p.reps;
              if (d > 0) return `<span class="delta-up">+${d}</span>`;
              if (d < 0) return `<span class="delta-down">${d}</span>`;
              return '<span style="color:var(--c-text-faint)">·</span>';
            }).join(' ');
            deltaHtml = `<br><span style="font-size:10px;color:var(--c-text-faint)">${deltas}</span>`;
          }
        }
        exRows += `<div class="history-card-ex"><span class="history-card-ex-name">${ex.name}</span><span class="history-card-ex-val">${repsStr}${deltaHtml}</span></div>`;
        // detail per set
        detailHtml += `<div style="margin-top:8px;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:var(--c-accent);font-weight:700">${ex.name}</div>`;
        ex.sets.forEach((s, i) => {
          const valStr = isTimedEx ? `${s.reps}s` : `${s.reps} reps`;
          detailHtml += `<div class="history-card-set"><span class="set-num">Set ${i+1}</span> <span>${valStr} · ${formatDuration(s.durationSec)}</span></div>`;
        });
      });
    }

    card.innerHTML = `
      <div class="history-card-head">
        <span class="history-card-date">${formatDateShort(entry.date)}</span>
        <span class="history-card-day">${entry.day}</span>
        <button class="history-card-remove" data-idx="${idx}" aria-label="Delete entry" title="Delete">×</button>
      </div>
      <div class="history-card-name">${entry.workoutName}</div>
      <div class="history-card-meta">
        ${entry.durationSec ? `<span>Duration: <span class="val">${formatDuration(entry.durationSec)}</span></span>` : ''}
        ${entry.type === 'strength' && entry.totalSets ? `<span>Sets: <span class="val">${entry.totalSets}</span></span>` : ''}
        ${entry.type === 'strength' && entry.totalReps ? `<span>Reps: <span class="val">${entry.totalReps}</span></span>` : ''}
      </div>
      ${exRows}
      ${detailHtml ? `<div class="history-card-detail">${detailHtml}</div>` : ''}
    `;
    card.addEventListener('click', (e) => {
      if (e.target.closest('.history-card-remove')) return;
      card.classList.toggle('expanded');
    });
    const removeBtn = card.querySelector('.history-card-remove');
    if (removeBtn) {
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(removeBtn.getAttribute('data-idx'), 10);
        deleteHistoryEntry(idx);
      });
    }
    list.appendChild(card);
  });
}

/* ============================================================
   DELETE HISTORY ENTRY (with confirmation)
   ============================================================ */
function deleteHistoryEntry(idx) {
  if (idx < 0 || idx >= history.length) return;
  showModal(`
    <div class="modal-title">Delete workout?</div>
    <div class="modal-text">This will permanently remove this workout entry from your history. This cannot be undone.</div>
    <div class="modal-actions">
      <button class="btn-primary secondary" id="modal-del-cancel">Cancel</button>
      <button class="btn-primary danger" id="modal-del-confirm">Delete</button>
    </div>
  `);
  document.getElementById('modal-del-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-del-confirm').addEventListener('click', () => {
    history.splice(idx, 1);
    saveHistory();
    closeModal();
    renderHistory();
    showToast('Workout deleted', 'warn');
  });
}

/* ============================================================
   PLAN EDITOR
   ============================================================ */
function renderPlan() {
  document.getElementById('plan-name-display').textContent = plan.name;

  const tabs = document.getElementById('plan-day-tabs');
  tabs.innerHTML = '';
  plan.days.forEach(day => {
    const btn = document.createElement('button');
    btn.className = 'plan-day-tab' + (day.id === planEditDay ? ' active' : '') + (day.type === 'rest' ? ' is-rest' : '') + (day.id === todayWeekday() ? ' is-today' : '');
    btn.textContent = day.day.slice(0,3).toUpperCase();
    btn.addEventListener('click', () => { planEditDay = day.id; renderPlan(); });
    tabs.appendChild(btn);
  });

  const day = findDayInPlan(planEditDay);
  if (!day) return;

  document.getElementById('plan-edit-workout-name').value = day.workoutName;

  const list = document.getElementById('plan-exercise-list');
  list.innerHTML = '';

  if (day.type === 'cindy') {
    const card = document.createElement('div');
    card.className = 'plan-edit-exercise neu-raised-sm';
    card.innerHTML = `
      <div class="plan-edit-exercise-head">
        <div class="plan-edit-exercise-num">★</div>
        <input type="text" class="plan-edit-exercise-name" value="Cindy AMRAP" readonly>
      </div>
      <div class="plan-edit-exercise-fields">
        <div class="plan-edit-field">
          <label class="plan-edit-field-label">Duration (min)</label>
          <input type="number" class="plan-edit-field-input" id="cindy-duration" min="1" step="1" value="${Math.round((day.cindy?.durationSeconds || 1200) / 60)}">
        </div>
        <div class="plan-edit-field">
          <label class="plan-edit-field-label">Rounds to beat</label>
          <input type="text" class="plan-edit-field-input" value="${previousCindyRounds() ?? '—'}" readonly>
        </div>
      </div>
      <div style="font-size:11px;color:var(--c-text-dim);padding:4px 0;">Scheme: 5 Pull-ups · 10 Push-ups · 15 Air Squats per round</div>
    `;
    list.appendChild(card);
  } else if (day.type === 'rest') {
    const card = document.createElement('div');
    card.className = 'plan-edit-exercise neu-raised-sm';
    card.innerHTML = `
      <div class="plan-edit-exercise-head">
        <div class="plan-edit-exercise-num">i</div>
        <input type="text" class="plan-edit-exercise-name" value="Rest / Recovery" readonly>
      </div>
      <label class="plan-edit-label">Rest Note</label>
      <input type="text" class="plan-edit-input text" id="rest-note" value="${day.restNote || ''}" placeholder="Recovery / backup day instructions">
    `;
    list.appendChild(card);
  } else {
    day.exercises.forEach((ex, i) => {
      const card = document.createElement('div');
      card.className = 'plan-edit-exercise neu-raised-sm';
      // Build the skill progression editor section (only for skill-type exercises)
      const isSkill = ex.type === 'skill';
      let progressionHtml = '';
      if (isSkill) {
        const stages = Array.isArray(ex.progression) ? ex.progression : [];
        const stageRows = stages.map((s, si) => {
          const stageNum = s.stage || (si + 1);
          const name = (s.name || '').replace(/"/g, '&quot;');
          const req = s.requirement != null ? s.requirement : '';
          const unit = s.unit === 'seconds' ? 'seconds' : 'reps';
          return `
            <div class="plan-edit-progression-stage" data-stage-idx="${si}" data-ex-idx="${i}">
              <div class="stage-num-cell">${stageNum}</div>
              <input type="text" class="stage-name-input" data-prog-idx="${i}" data-prog-stage="${si}" data-prog-field="name" value="${name}" placeholder="Stage name">
              <input type="number" class="stage-req-input" data-prog-idx="${i}" data-prog-stage="${si}" data-prog-field="requirement" min="1" step="1" inputmode="numeric" value="${req}" placeholder="0">
              <select class="stage-unit-select" data-prog-idx="${i}" data-prog-stage="${si}" data-prog-field="unit">
                <option value="seconds" ${unit === 'seconds' ? 'selected' : ''}>seconds</option>
                <option value="reps" ${unit === 'reps' ? 'selected' : ''}>reps</option>
              </select>
              <button class="plan-edit-progression-remove" data-prog-remove="${i}" data-prog-stage="${si}" type="button" aria-label="Remove stage" title="Remove stage">−</button>
            </div>
          `;
        }).join('');
        progressionHtml = `
          <div class="plan-edit-progression">
            <div class="plan-edit-progression-title">Skill Progression Stages</div>
            <div class="plan-edit-progression-list">${stageRows || '<div style="font-size:11px;color:var(--c-text-faint);padding:6px 0;">No stages yet. Add one below.</div>'}</div>
            <button class="plan-edit-progression-add" data-prog-add="${i}" type="button">+ Add Stage</button>
          </div>
        `;
      }
      card.innerHTML = `
        <div class="plan-edit-exercise-head">
          <div class="plan-edit-exercise-num">${i+1}</div>
          <input type="text" class="plan-edit-exercise-name" data-ex-idx="${i}" data-field="name" value="${ex.name}">
        </div>
        <div class="plan-edit-exercise-fields">
          <div class="plan-edit-field">
            <label class="plan-edit-field-label">Sets</label>
            <input type="number" class="plan-edit-field-input" data-ex-idx="${i}" data-field="sets" min="1" max="20" step="1" value="${ex.sets}">
          </div>
          <div class="plan-edit-field">
            <label class="plan-edit-field-label">Rest (sec)</label>
            <input type="number" class="plan-edit-field-input" data-ex-idx="${i}" data-field="restSeconds" min="0" max="600" step="15" value="${ex.restSeconds}">
          </div>
          <div class="plan-edit-field">
            <label class="plan-edit-field-label">Type</label>
            <select class="plan-edit-field-input select" data-ex-idx="${i}" data-field="type">
              <option value="strength" ${ex.type === 'strength' ? 'selected' : ''}>Strength</option>
              <option value="timed" ${ex.type === 'timed' ? 'selected' : ''}>Timed</option>
              <option value="superset" ${ex.type === 'superset' ? 'selected' : ''}>Superset</option>
              <option value="skill" ${ex.type === 'skill' ? 'selected' : ''}>Skill</option>
            </select>
          </div>
          <div class="plan-edit-field">
            <label class="plan-edit-field-label">ID (stable)</label>
            <input type="text" class="plan-edit-field-input" data-ex-idx="${i}" data-field="id" value="${ex.id}" style="color:var(--c-text-dim);font-family:'JetBrains Mono',monospace;font-size:12px;">
          </div>
        </div>
        <label class="plan-edit-label">Note</label>
        <input type="text" class="plan-edit-input text" data-ex-idx="${i}" data-field="note" value="${ex.note || ''}" placeholder="Form cues / instructions">
        <div class="plan-edit-media">
          <div class="plan-edit-media-label">
            <svg viewBox="0 0 24 24"><path d="M2 12 C2 8 4 6 8 6 L16 6 C20 6 22 8 22 12 C22 16 20 18 16 18 L8 18 C4 18 2 16 2 12 Z"/><path d="M10 9 L15 12 L10 15 Z" fill="currentColor" stroke="none"/></svg>
            Media Links
          </div>
          <div class="plan-edit-media-row">
            <label class="plan-edit-media-label" style="color:var(--c-accent-bright);">YouTube</label>
            <input type="url" class="plan-edit-media-input" data-media-idx="${i}" data-media-type="youtube" value="${(ex.mediaLinks || []).find(m => (m.type || detectMediaType(m.url)) === 'youtube')?.url || ''}" placeholder="https://youtube.com/watch?v=...">
          </div>
          <div class="plan-edit-media-row">
            <label class="plan-edit-media-label" style="color:#a78bfa;">Image</label>
            <input type="url" class="plan-edit-media-input" data-media-idx="${i}" data-media-type="image" value="${(ex.mediaLinks || []).find(m => (m.type || detectMediaType(m.url)) === 'image')?.url || ''}" placeholder="https://example.com/form-photo.jpg">
          </div>
          <div class="plan-edit-media-row">
            <label class="plan-edit-media-label" style="color:var(--c-warn);">Video</label>
            <input type="url" class="plan-edit-media-input" data-media-idx="${i}" data-media-type="video" value="${(ex.mediaLinks || []).find(m => (m.type || detectMediaType(m.url)) === 'video')?.url || ''}" placeholder="https://example.com/demo.mp4">
          </div>
          <div class="plan-edit-media-row">
            <label class="plan-edit-media-label">Link</label>
            <input type="url" class="plan-edit-media-input" data-media-idx="${i}" data-media-type="link" value="${(ex.mediaLinks || []).find(m => (m.type || detectMediaType(m.url)) === 'link')?.url || ''}" placeholder="https://any-other-link.com">
          </div>
        </div>
        ${progressionHtml}
        <div class="plan-edit-exercise-actions">
          <button class="plan-edit-mini-btn" data-move-up="${i}">↑ Up</button>
          <button class="plan-edit-mini-btn" data-move-down="${i}">↓ Down</button>
          <button class="plan-edit-mini-btn danger" data-remove="${i}">Remove</button>
        </div>
      `;
      list.appendChild(card);
    });

    // bind inputs
    list.querySelectorAll('[data-ex-idx]').forEach(input => {
      input.addEventListener('change', () => {
        const idx = parseInt(input.getAttribute('data-ex-idx'), 10);
        const field = input.getAttribute('data-field');
        const ex = day.exercises[idx];
        if (!ex) return;
        let val = input.value;
        if (field === 'sets' || field === 'restSeconds') {
          val = parseInt(val, 10);
          if (isNaN(val) || val < 0) val = 0;
        }
        ex[field] = val;
        // If the user just switched the type to "skill", ensure a progression array
        // exists so the editor renders stages on the next paint.
        if (field === 'type' && val === 'skill' && !Array.isArray(ex.progression)) {
          ex.progression = [];
        }
        // If switching away from skill, leave the progression array in place —
        // it's harmless and switching back keeps the user's edits.
        if (field === 'type') renderPlan();
      });
    });
    // bind media link inputs
    list.querySelectorAll('[data-media-idx]').forEach(input => {
      input.addEventListener('change', () => {
        const idx = parseInt(input.getAttribute('data-media-idx'), 10);
        const type = input.getAttribute('data-media-type');
        const ex = day.exercises[idx];
        if (!ex) return;
        if (!Array.isArray(ex.mediaLinks)) ex.mediaLinks = [];
        const url = input.value.trim();
        // find or create the link entry for this type
        let entry = ex.mediaLinks.find(m => m.type === type);
        if (!url) {
          // empty → remove entry if exists
          if (entry) ex.mediaLinks = ex.mediaLinks.filter(m => m !== entry);
          return;
        }
        if (!entry) {
          entry = { type, label: type.charAt(0).toUpperCase() + type.slice(1), url };
          ex.mediaLinks.push(entry);
        } else {
          entry.url = url;
        }
      });
    });
    // bind skill progression inputs (per-stage)
    list.querySelectorAll('[data-prog-idx]').forEach(input => {
      input.addEventListener('change', () => {
        const exIdx = parseInt(input.getAttribute('data-prog-idx'), 10);
        const stageIdx = parseInt(input.getAttribute('data-prog-stage'), 10);
        const field = input.getAttribute('data-prog-field');
        const ex = day.exercises[exIdx];
        if (!ex) return;
        if (!Array.isArray(ex.progression)) ex.progression = [];
        if (!ex.progression[stageIdx]) return;
        let val = input.value;
        if (field === 'requirement') {
          val = parseInt(val, 10);
          if (isNaN(val) || val < 0) val = 0;
        } else if (field === 'unit') {
          val = val === 'seconds' ? 'seconds' : 'reps';
        }
        ex.progression[stageIdx][field] = val;
      });
    });
    // bind skill progression "Add Stage" buttons
    list.querySelectorAll('[data-prog-add]').forEach(btn => {
      btn.addEventListener('click', () => {
        const exIdx = parseInt(btn.getAttribute('data-prog-add'), 10);
        const ex = day.exercises[exIdx];
        if (!ex) return;
        if (!Array.isArray(ex.progression)) ex.progression = [];
        const nextStageNum = ex.progression.length + 1;
        ex.progression.push({
          stage: nextStageNum,
          name: '',
          requirement: 10,
          unit: 'reps',
        });
        // Renumber stage fields to be safe (1..N)
        ex.progression.forEach((s, si) => { s.stage = si + 1; });
        renderPlan();
      });
    });
    // bind skill progression "Remove Stage" buttons
    list.querySelectorAll('[data-prog-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        const exIdx = parseInt(btn.getAttribute('data-prog-remove'), 10);
        const stageIdx = parseInt(btn.getAttribute('data-prog-stage'), 10);
        const ex = day.exercises[exIdx];
        if (!ex || !Array.isArray(ex.progression)) return;
        ex.progression.splice(stageIdx, 1);
        // Renumber remaining stages
        ex.progression.forEach((s, si) => { s.stage = si + 1; });
        renderPlan();
      });
    });
    list.querySelectorAll('[data-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-remove'), 10);
        day.exercises.splice(idx, 1);
        renderPlan();
      });
    });
    list.querySelectorAll('[data-move-up]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-move-up'), 10);
        if (idx === 0) return;
        const tmp = day.exercises[idx-1];
        day.exercises[idx-1] = day.exercises[idx];
        day.exercises[idx] = tmp;
        renderPlan();
      });
    });
    list.querySelectorAll('[data-move-down]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-move-down'), 10);
        if (idx >= day.exercises.length - 1) return;
        const tmp = day.exercises[idx+1];
        day.exercises[idx+1] = day.exercises[idx];
        day.exercises[idx] = tmp;
        renderPlan();
      });
    });
  }
}

/* ============================================================
   PROFILE RENDER
   ============================================================ */
function renderProfile() {
  if (!profile) { switchView('welcome'); return; }
  const initial = (profile.name || '?').charAt(0).toUpperCase();
  document.getElementById('profile-avatar').textContent = initial;
  document.getElementById('profile-name').textContent = profile.name;
  document.getElementById('profile-meta').textContent = `Member since ${formatDateShort(profile.createdAt || todayStr())}`;

  // count workouts
  document.getElementById('profile-meta').textContent = `${history.length} workouts logged`;

  // toggles
  document.getElementById('toggle-sound').classList.toggle('on', settings.soundEnabled);
  document.getElementById('toggle-vibrate').classList.toggle('on', settings.vibrateEnabled);
  document.getElementById('toggle-theme').classList.toggle('on', settings.theme === 'light');

  // Color swatches — mark active
  document.querySelectorAll('.color-swatch').forEach(s => {
    s.classList.toggle('active', s.getAttribute('data-color').toLowerCase() === (settings.accentColor || '#4FD1C7').toLowerCase());
  });
  document.getElementById('custom-color').value = settings.accentColor || '#4FD1C7';
}

/* ============================================================
   THEME + COLOR
   ============================================================ */
let deferredInstallPrompt = null;

function applyTheme() {
  const theme = settings.theme || 'dark';
  document.documentElement.setAttribute('data-theme', theme);
  // Update meta theme-color for browser chrome
  const metaTheme = document.getElementById('meta-theme-color');
  if (metaTheme) {
    metaTheme.setAttribute('content', theme === 'light' ? '#e8ecef' : '#1a242c');
  }
}

function hexToRgb(hex) {
  const m = hex.replace('#', '').match(/.{2}/g);
  if (!m || m.length !== 3) return { r: 79, g: 209, b: 199 };
  return { r: parseInt(m[0], 16), g: parseInt(m[1], 16), b: parseInt(m[2], 16) };
}
function lighten(rgb, amount) {
  return {
    r: Math.min(255, Math.round(rgb.r + (255 - rgb.r) * amount)),
    g: Math.min(255, Math.round(rgb.g + (255 - rgb.g) * amount)),
    b: Math.min(255, Math.round(rgb.b + (255 - rgb.b) * amount)),
  };
}
function rgbToHex({ r, g, b }) {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function setAccentColor(hex) {
  const rgb = hexToRgb(hex);
  const brightRgb = lighten(rgb, 0.18);
  const accent = hex.toUpperCase();
  const accentBright = rgbToHex(brightRgb);
  const root = document.documentElement;
  root.style.setProperty('--c-accent', accent);
  root.style.setProperty('--c-accent-bright', accentBright);
  root.style.setProperty('--c-accent-glow', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.35)`);
  root.style.setProperty('--c-accent-soft', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.08)`);
  root.style.setProperty('--c-success', accentBright);
  settings.accentColor = accent;
  saveSettings();
  // update theme-color meta for browser chrome
  // (keep theme-color tied to background, not accent)
  // Update active swatch UI
  document.querySelectorAll('.color-swatch').forEach(s => {
    s.classList.toggle('active', s.getAttribute('data-color').toLowerCase() === accent.toLowerCase());
  });
  document.getElementById('custom-color').value = accent;
  showToast(`Color set to ${accent}`);
}

/* ============================================================
   DATA: EXPORT / IMPORT
   ============================================================ */
function downloadJson(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

function exportPlanOnly() {
  const planExport = JSON.parse(JSON.stringify(plan));
  // ensure no personal data sneaks in
  downloadJson(`tempo-plan.json`, planExport);
  showToast('✓ Plan downloaded');
}

/* ============================================================
   AI PROMPT — copy a ready-to-paste schema prompt to clipboard
   ============================================================ */
const AI_PROMPT_TEMPLATE = `You are generating a workout plan for TEMPO, a mobile workout tracker app.

Output ONLY valid JSON (no markdown, no explanations, no code fences) — the user will save your reply as a .json file and import it into the app. Wait for the user to tell you their goal, then output the JSON.

=== TEMPO PLAN SCHEMA ===

ROOT FIELDS:
- format (string, REQUIRED): must be exactly "tempo-workout-plan"
- version (number, REQUIRED): must be 1
- name (string, REQUIRED): display name for the plan
- description (string, OPTIONAL): short description
- days (array, REQUIRED): exactly 7 day objects, one per weekday

DAY TYPES (day.type — pick ONE per day):
- "strength"  → Normal set-by-set workout day. The default.
- "cindy"     → AMRAP (As Many Rounds As Possible) circuit. 20-min countdown + round counter. Define the circuit in the "cindy" object.
- "rest"      → No workout. Recovery / backup day. Add a restNote for instructions.
- "skill"     → Pure skill practice day (mostly semantic — behaves like strength).

EXERCISE TYPES (exercise.type — pick ONE per exercise, OPTIONAL, defaults to "strength"):
- "strength"  → Count reps (Push-ups, Squats, Pull-ups, Bench Press). User enters a number.
- "timed"      → Hold for time (Plank, Wall Sit, Hollow Hold). No reps input — app saves how long the user held the position.
- "skill"      → Skill practice (Handstand, Muscle-up progression, L-sit). Usually 1 set with longer rest.
- "superset"   → Multiple movements in one set (e.g. Bench + Row + Curls). App shows multiple labeled inputs — user enters reps for each movement.

MEDIA TYPES (mediaLinks[].type — pick ONE per media link, OPTIONAL, auto-detected from URL):
- "youtube"   → YouTube URL (youtube.com/watch?v=..., youtu.be/..., /embed/, /shorts/)
- "image"     → Direct image URL (.jpg, .png, .gif, .webp, .svg)
- "video"     → Direct video URL (.mp4, .webm, .mov) or Vimeo
- "link"      → Anything else (articles, blog posts, etc.)

MEDIA LINKS:
For each exercise, add a YouTube SEARCH link (not a specific video — search links never break):
  { "type": "youtube", "label": "Form", "url": "https://www.youtube.com/results?search_query=EXERCISE+NAME+proper+form" }

Replace EXERCISE+NAME with the exercise name using + for spaces. Example:
  Push-ups → https://www.youtube.com/results?search_query=push+ups+proper+form
  Bulgarian Split Squats → https://www.youtube.com/results?search_query=bulgarian+split+squats+proper+form

If you know a specific high-quality tutorial video, you can add it as a SECOND media link:
  { "type": "youtube", "label": "Tutorial", "url": "https://www.youtube.com/watch?v=VIDEO_ID" }

DAY ORDERING:
Order the "days" array based on the user's training week. If they train Saturday→Wednesday, put Saturday first. If they train Monday→Friday, put Monday first. The array order = display order in the app. Do NOT always put Monday first — ask the user or infer from their goal.

REST SECONDS GUIDANCE:
- Heavy compound lifts (Squat, Deadlift, Bench): 120-180 seconds
- Moderate compound (Overhead Press, Row): 90-120 seconds
- Isolation / accessory (Curls, Calf Raises): 60-90 seconds
- Bodyweight exercises: 60-90 seconds
- Skill practice: 60 seconds
- Superset: 90-120 seconds (rest after the entire superset)

DAY OBJECT SHAPE:
{
  "id":           "monday",        // REQUIRED — lowercase, one of: monday tuesday wednesday thursday friday saturday sunday
  "day":          "Monday",        // REQUIRED — display name (capitalized)
  "workoutName":  "Push Day",      // REQUIRED — name of this day's workout
  "type":         "strength",      // REQUIRED — strength | cindy | rest | skill
  "exercises":    [...],           // REQUIRED — array (empty [] for rest/cindy days)
  "note":         "optional",      // OPTIONAL — instructions shown on day overview
  "restNote":     "optional",      // OPTIONAL — for rest days only, recovery instructions
  "cindy":        { ... },         // REQUIRED for cindy days — AMRAP structure (see below)
  "durationSeconds": 1200          // OPTIONAL — for cindy days, total AMRAP duration in seconds
}

EXERCISE OBJECT SHAPE:
{
  "id":           "benchpress",    // REQUIRED — stable identifier (no spaces, lowercase). Use the same id across days for the same exercise.
  "name":         "Bench Press",   // REQUIRED — display name
  "sets":         4,                // REQUIRED — integer ≥ 1
  "restSeconds":  120,              // REQUIRED — integer ≥ 0 (90 typical, 60 accessory, 120+ heavy compound)
  "type":         "strength",      // OPTIONAL — strength | timed | superset | skill (default: strength)
  "note":         "form cues",    // OPTIONAL — coaching notes shown during workout
  "mediaLinks":  [                 // OPTIONAL — array of media attachments shown as tappable chips
    {
      "type":  "youtube",          // OPTIONAL — youtube | image | video | link (auto-detected if omitted)
      "label": "Form Tutorial",    // OPTIONAL — chip label (uses type if omitted)
      "url":   "https://..."       // REQUIRED if mediaLinks entry present
    }
  ]
}

CINDY OBJECT (only for type="cindy" days — defines the AMRAP circuit):
{
  "durationSeconds": 1200,         // REQUIRED — countdown duration in seconds (1200 = 20 min, 600 = 10 min, 1800 = 30 min)
  "scheme": [                      // REQUIRED — array of movements cycled each round
    {
      "id":          "pullups",   // REQUIRED — stable identifier
      "name":        "Pull-ups",   // REQUIRED — display name
      "reps":        5,             // REQUIRED — reps of this movement per round
      "mediaLinks": []              // OPTIONAL — same structure as exercise mediaLinks
    }
  ]
}

RULES:
1. Output must include all 7 days: monday, tuesday, wednesday, thursday, friday, saturday, sunday.
2. Day "type" must be one of: strength, cindy, rest, skill.
3. Exercise "type" must be one of: strength, timed, superset, skill (different from day type!).
4. For cindy days: type="cindy", exercises=[], and include the "cindy" object with durationSeconds and scheme[].
5. For rest days: type="rest", exercises=[], and optionally a restNote string.
6. Every exercise must have id, name, sets, restSeconds.
7. IDs must be stable (no spaces, lowercase). Reuse the same id across days if it's the same exercise (lets history track progression across days).
8. Output ONLY valid JSON — no markdown fences, no surrounding text, no explanation.

=== FULL EXAMPLE ===

{
  "format": "tempo-workout-plan",
  "version": 1,
  "name": "Push Pull Legs Split",
  "description": "6-day PPL hypertrophy split with one rest day.",
  "days": [
    {
      "id": "monday", "day": "Monday", "workoutName": "Push Day", "type": "strength",
      "exercises": [
        { "id": "benchpress", "name": "Bench Press", "sets": 4, "restSeconds": 120, "type": "strength", "note": "Controlled tempo · 2-sec pause at chest", "mediaLinks": [{ "type": "youtube", "label": "Form", "url": "https://www.youtube.com/watch?v=rT7DgCr-3pg" }] },
        { "id": "overheadpress", "name": "Overhead Press", "sets": 3, "restSeconds": 90, "type": "strength", "note": "Strict press · no leg drive" },
        { "id": "inclinepress", "name": "Incline Dumbbell Press", "sets": 3, "restSeconds": 90 }
      ]
    },
    {
      "id": "tuesday", "day": "Tuesday", "workoutName": "Cindy 20-min AMRAP", "type": "cindy",
      "exercises": [],
      "note": "20-minute AMRAP. Track total rounds completed.",
      "durationSeconds": 1200,
      "cindy": {
        "durationSeconds": 1200,
        "scheme": [
          { "id": "cindyPullups", "name": "Pull-ups", "reps": 5, "mediaLinks": [] },
          { "id": "cindyPushups", "name": "Push-ups", "reps": 10, "mediaLinks": [] },
          { "id": "cindySquats", "name": "Air Squats", "reps": 15, "mediaLinks": [] }
        ]
      }
    },
    {
      "id": "wednesday", "day": "Wednesday", "workoutName": "Pull Day", "type": "strength",
      "exercises": [
        { "id": "deadlift", "name": "Deadlift", "sets": 3, "restSeconds": 180, "type": "strength", "note": "Hip hinge · controlled eccentric" },
        { "id": "pullups", "name": "Pull-ups", "sets": 3, "restSeconds": 90 }
      ]
    },
    {
      "id": "thursday", "day": "Thursday", "workoutName": "Leg Day", "type": "strength",
      "exercises": [
        { "id": "squats", "name": "Squats", "sets": 4, "restSeconds": 120 },
        { "id": "lunges", "name": "Lunges", "sets": 3, "restSeconds": 90 },
        { "id": "calfraises", "name": "Calf Raises", "sets": 3, "restSeconds": 60 }
      ]
    },
    {
      "id": "friday", "day": "Friday", "workoutName": "Upper Body", "type": "strength",
      "exercises": [
        { "id": "benchpress", "name": "Bench Press", "sets": 3, "restSeconds": 120 },
        { "id": "barbellrows", "name": "Barbell Rows", "sets": 3, "restSeconds": 90 }
      ]
    },
    {
      "id": "saturday", "day": "Saturday", "workoutName": "Lower Body", "type": "strength",
      "exercises": [
        { "id": "squats", "name": "Squats", "sets": 3, "restSeconds": 120 },
        { "id": "rdl", "name": "Romanian Deadlift", "sets": 3, "restSeconds": 120 }
      ]
    },
    {
      "id": "sunday", "day": "Sunday", "workoutName": "Rest", "type": "rest",
      "exercises": [],
      "restNote": "Full rest. Recovery is when you actually get stronger."
    }
  ]
}

=== END OF SCHEMA ===

SKILL PROGRESSION (optional, for type="skill" exercises only):
For skill exercises, you can define a "progression" array — a sequence of stages the user must pass one by one. Each stage has a requirement (reps or seconds). The user advances only when they meet the requirement.

Example — One-Arm Handstand Push-Up progression:
{
  "type": "skill",
  "progression": [
    { "stage": 1, "name": "Wall-Assisted Handstand Hold", "requirement": 60, "unit": "seconds" },
    { "stage": 2, "name": "Wall-Assisted Handstand Push-Up", "requirement": 10, "unit": "reps" },
    { "stage": 3, "name": "Freestanding Handstand Hold", "requirement": 60, "unit": "seconds" }
  ]
}

When defining a skill with progression, set sets=1 (the user practices the current stage once per session). The app remembers which stage they're on — next time they continue from where they left off.

PROGRESSION STAGE SHAPE (each entry in the progression array):
{
  "stage":       1,                // REQUIRED — 1-indexed stage number (1, 2, 3, ...)
  "name":        "Wall-Assisted Handstand Hold",  // REQUIRED — display name of this stage
  "requirement": 60,                // REQUIRED — integer ≥ 1 (reps or seconds, depending on "unit")
  "unit":        "seconds"          // REQUIRED — "seconds" (timed hold) or "reps" (rep count)
}

PROGRESSION RULES:
1. "progression" is OPTIONAL on skill exercises. If absent, the exercise behaves like a normal skill exercise (backward compatible).
2. Order stages by difficulty — the user must pass each stage in order to advance.
3. Use unit="seconds" for holds/stability work, unit="reps" for movement-based skills.
4. The progression array is keyed by the exercise id — so reuse the same id across days if you want the user's stage progress to carry over.

Now wait for me to tell you my goal. Then output ONLY the JSON plan (no markdown, no explanation). Reply with "READY — tell me your goal" to confirm you understand.`;

function copyAiPrompt() {
  const text = AI_PROMPT_TEMPLATE;
  // Try clipboard API first
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('✓ Prompt copied — paste into ChatGPT');
    }).catch(() => {
      // Fallback: legacy textarea + execCommand
      fallbackCopy(text);
    });
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  ta.style.top = '0';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try {
    document.execCommand('copy');
    showToast('✓ Prompt copied — paste into ChatGPT');
  } catch (e) {
    showToast('Copy failed — open prompt instead', 'warn');
    // Final fallback: show in modal so user can manually copy
    showModal(`
      <div class="modal-title">AI Prompt</div>
      <div class="modal-text">Copy the text below and paste into ChatGPT / Claude / Gemini:</div>
      <textarea style="width:100%; height:50vh; background:var(--c-bg-deep); color:var(--c-text); border:0; padding:14px; border-radius:10px; font-family:'JetBrains Mono',monospace; font-size:11px; line-height:1.5;" readonly>${text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>
      <div class="modal-actions">
        <button class="btn-primary" id="modal-close-prompt">Close</button>
      </div>
    `);
    document.getElementById('modal-close-prompt').addEventListener('click', closeModal);
  }
  document.body.removeChild(ta);
}

function downloadTemplate() {
  // Export the schema reference template (cleaned of internal comments)
  const template = JSON.parse(JSON.stringify(DEFAULT_PLAN));
  downloadJson('plan-template.json', template);
  showToast('✓ Template downloaded');
}

function exportAllData() {
  const backup = {
    format: 'tempo-backup',
    version: 3,
    exportedAt: new Date().toISOString(),
    // The entire app state — mirrors the single `tempo_data` localStorage key.
    profile,
    plan,
    history,
    settings,
    active,
    musicPlaylist,
    measurements,
    skillProgress,
    info: 'Warmup/cooldown videos and progress photos are stored separately in IndexedDB and are NOT included in this backup. They can be re-uploaded after import.',
  };
  downloadJson(`tempo-backup-${todayStr()}.json`, backup);
  showToast('✓ All data exported (incl. measurements & music)');
}

function importAllData(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parsed = JSON.parse(e.target.result);
      if (!parsed || typeof parsed !== 'object') throw new Error('Invalid file format');
      if (parsed.format !== 'tempo-backup') throw new Error('Not a backup file');
      if (parsed.profile)        profile = parsed.profile;
      if (parsed.plan && parsed.plan.days) plan = parsed.plan;
      if (parsed.history && Array.isArray(parsed.history)) history = parsed.history;
      if (parsed.settings)       settings = Object.assign(settings, parsed.settings);
      if (parsed.active !== undefined) active = parsed.active;
      if (parsed.musicPlaylist && Array.isArray(parsed.musicPlaylist)) {
        musicPlaylist = parsed.musicPlaylist;
        updateMusicUI();
      }
      if (parsed.measurements && Array.isArray(parsed.measurements.template)) {
        measurements = parsed.measurements;
        if (!Array.isArray(measurements.entries)) measurements.entries = [];
      }
      // Import skill progression if present (backups made before this feature won't have it).
      if (parsed.skillProgress && typeof parsed.skillProgress === 'object' && !Array.isArray(parsed.skillProgress)) {
        skillProgress = parsed.skillProgress;
      } else {
        skillProgress = {};
      }
      // Persist the entire unified state in one shot.
      saveData();
      normalizePlanMediaLinks();
      // Clamp skill progress against the newly-imported plan in case stage counts differ.
      clampAllSkillProgress();
      // Apply imported theme + accent color
      applyTheme();
      if (settings.accentColor) {
        const rgb = hexToRgb(settings.accentColor);
        const brightRgb = lighten(rgb, 0.18);
        const root = document.documentElement;
        root.style.setProperty('--c-accent', settings.accentColor);
        root.style.setProperty('--c-accent-bright', rgbToHex(brightRgb));
        root.style.setProperty('--c-accent-glow', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.35)`);
        root.style.setProperty('--c-accent-soft', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.08)`);
        root.style.setProperty('--c-success', rgbToHex(brightRgb));
      }
      showToast('✓ All data imported (incl. measurements & music)');
      // re-render current view
      switchView('profile');
      // if active workout, prompt resume
      if (active) {
        showModal(`
          <div class="modal-title">Resume imported workout?</div>
          <div class="modal-text">The imported backup contains an in-progress workout. Resume it, or discard?</div>
          <div class="modal-actions">
            <button class="btn-primary danger" id="modal-import-discard">Discard</button>
            <button class="btn-primary" id="modal-import-resume">Resume</button>
          </div>
        `);
        document.getElementById('modal-import-discard').addEventListener('click', () => {
          active = null; saveActive(); closeModal(); switchView('home');
        });
        document.getElementById('modal-import-resume').addEventListener('click', () => {
          closeModal(); enterWorkoutFromActive();
        });
      }
    } catch (err) {
      showModal(`
        <div class="modal-title">Import failed</div>
        <div class="modal-error">${err.message}</div>
        <div class="modal-actions">
          <button class="btn-primary" id="modal-import-fail-ok">OK</button>
        </div>
      `);
      document.getElementById('modal-import-fail-ok').addEventListener('click', closeModal);
    }
  };
  reader.readAsText(file);
}

function validatePlanJson(parsed) {
  if (!parsed || typeof parsed !== 'object') return 'Invalid JSON';
  if (parsed.format && parsed.format !== 'tempo-workout-plan') return `Wrong format: ${parsed.format}`;
  if (!parsed.days || !Array.isArray(parsed.days)) return 'Missing days array';
  if (parsed.days.length === 0) return 'Days array is empty';
  // Map legacy day types to current types so older exported plans still import cleanly
  const TYPE_MAP = {
    'strength_skill': 'strength',  // legacy: combined strength + skill day
    'amrap':          'cindy',     // legacy: AMRAP day = Cindy-style
    'cardio':         'rest',      // legacy
  };
  for (const day of parsed.days) {
    if (!day.id || !day.day || !day.workoutName) return `Day missing id/day/workoutName`;
    // Normalize legacy types
    if (day.type && TYPE_MAP[day.type]) day.type = TYPE_MAP[day.type];
    if (!['strength','cindy','rest','skill'].includes(day.type || 'strength')) return `Day ${day.id} has invalid type`;
    if (day.exercises && !Array.isArray(day.exercises)) return `Day ${day.id} exercises must be an array`;
    if (day.exercises) {
      for (const ex of day.exercises) {
        if (!ex.name) return `Exercise in ${day.id} missing name`;
        // Cindy-style exercises use targetReps instead of sets — convert to sets=1
        if (typeof ex.sets !== 'number' || ex.sets < 1) {
          if (day.type === 'cindy' && typeof ex.targetReps === 'number') {
            ex.sets = 1;
          } else if (typeof ex.sets !== 'number' || ex.sets < 1) {
            return `Exercise "${ex.name}" has invalid sets`;
          }
        }
        if (typeof ex.restSeconds !== 'number' || ex.restSeconds < 0) {
          // default rest if missing
          ex.restSeconds = 60;
        }
      }
    }
    // Convert legacy Cindy structure: if Tuesday-style AMRAP has exercises but no cindy.scheme,
    // build cindy.scheme from the exercises array
    if (day.type === 'cindy' && !day.cindy && day.exercises && day.exercises.length > 0) {
      day.cindy = {
        durationSeconds: day.durationSeconds || 1200,
        scheme: day.exercises.map(ex => ({
          id: ex.id,
          name: ex.name,
          reps: ex.targetReps || ex.reps || 10,
          mediaLinks: ex.mediaLinks || [],
        })),
      };
      day.exercises = []; // Cindy days have empty exercises array
    }
  }
  return null;
}

function importPlanJson(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    let parsed;
    try {
      parsed = JSON.parse(e.target.result);
    } catch (err) {
      showModal(`
        <div class="modal-title">Import failed</div>
        <div class="modal-error">Invalid JSON: ${err.message}</div>
        <div class="modal-actions"><button class="btn-primary" id="modal-ok">OK</button></div>
      `);
      document.getElementById('modal-ok').addEventListener('click', closeModal);
      return;
    }
    const err = validatePlanJson(parsed);
    if (err) {
      showModal(`
        <div class="modal-title">Invalid workout plan</div>
        <div class="modal-error">${err}</div>
        <div class="modal-actions"><button class="btn-primary" id="modal-ok">OK</button></div>
      `);
      document.getElementById('modal-ok').addEventListener('click', closeModal);
      return;
    }
    // Show preview
    let previewHtml = '';
    parsed.days.forEach(day => {
      previewHtml += `<div class="modal-preview-day"><div class="modal-preview-day-name">${day.day} · ${day.workoutName}</div>`;
      if (day.type === 'cindy') {
        previewHtml += `<div class="modal-preview-day-ex">★ Cindy AMRAP · ${Math.round((day.cindy?.durationSeconds || 1200)/60)} min</div>`;
      } else if (day.type === 'rest') {
        previewHtml += `<div class="modal-preview-day-ex">Rest / Recovery</div>`;
      } else {
        (day.exercises || []).forEach(ex => {
          previewHtml += `<div class="modal-preview-day-ex"><span class="num">${ex.sets}</span> × ${ex.name} · ${ex.restSeconds}s rest</div>`;
        });
      }
      previewHtml += `</div>`;
    });
    showModal(`
      <div class="modal-title">Import this workout plan?</div>
      <div class="modal-text">This will replace your current workout plan. Your profile, history, and personal results will not be affected.</div>
      <div class="modal-preview">${previewHtml}</div>
      <div class="modal-actions">
        <button class="btn-primary secondary" id="modal-plan-cancel">Cancel</button>
        <button class="btn-primary" id="modal-plan-confirm">Import Plan</button>
      </div>
    `);
    document.getElementById('modal-plan-cancel').addEventListener('click', closeModal);
    document.getElementById('modal-plan-confirm').addEventListener('click', () => {
      plan = parsed;
      savePlan();
      closeModal();
      renderPlan();
      showToast('✓ Workout plan imported');
    });
  };
  reader.readAsText(file);
}

/* ============================================================
   PASTE JSON IMPORT (paste plan JSON directly via modal)
   ============================================================ */
function openPasteJsonModal() {
  showModal(`
    <div class="modal-title">Paste Workout Plan JSON</div>
    <div class="modal-text">Paste a valid TEMPO workout plan JSON below. It will be validated and previewed before replacing your current plan.</div>
    <textarea id="paste-json-input" style="width:100%; height:48vh; background:var(--c-bg-deep); color:var(--c-text); border:0; padding:14px; border-radius:10px; font-family:'JetBrains Mono', monospace; font-size:11px; line-height:1.5; resize:vertical; outline:0; box-shadow:var(--shadow-in-dark-sm), var(--shadow-in-light-sm);" placeholder='{\n  "format": "tempo-workout-plan",\n  "version": 1,\n  "name": "...",\n  "days": [...]\n}'></textarea>
    <div id="paste-json-error" style="display:none;" class="modal-error"></div>
    <div class="modal-actions">
      <button class="btn-primary secondary" id="modal-paste-cancel">Cancel</button>
      <button class="btn-primary" id="modal-paste-import">Import</button>
    </div>
  `);
  document.getElementById('modal-paste-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-paste-import').addEventListener('click', () => {
    const raw = document.getElementById('paste-json-input').value;
    const errBox = document.getElementById('paste-json-error');
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      errBox.style.display = 'block';
      errBox.textContent = 'Invalid JSON: ' + err.message;
      return;
    }
    const validationErr = validatePlanJson(parsed);
    if (validationErr) {
      errBox.style.display = 'block';
      errBox.textContent = validationErr;
      return;
    }
    closeModal();
    showImportPreview(parsed);
  });
  setTimeout(() => { document.getElementById('paste-json-input').focus(); }, 100);
}

/* Shared preview-and-confirm UI used by both file import and paste import */
function showImportPreview(parsed) {
  let previewHtml = '';
  parsed.days.forEach(day => {
    previewHtml += `<div class="modal-preview-day"><div class="modal-preview-day-name">${day.day} · ${day.workoutName}</div>`;
    if (day.type === 'cindy') {
      previewHtml += `<div class="modal-preview-day-ex">★ Cindy AMRAP · ${Math.round((day.cindy?.durationSeconds || 1200)/60)} min</div>`;
    } else if (day.type === 'rest') {
      previewHtml += `<div class="modal-preview-day-ex">Rest / Recovery</div>`;
    } else {
      (day.exercises || []).forEach(ex => {
        previewHtml += `<div class="modal-preview-day-ex"><span class="num">${ex.sets}</span> × ${ex.name} · ${ex.restSeconds}s rest</div>`;
      });
    }
    previewHtml += `</div>`;
  });
  showModal(`
    <div class="modal-title">Import this workout plan?</div>
    <div class="modal-text">This will replace your current workout plan. Your profile, history, and personal results will not be affected.</div>
    <div class="modal-preview">${previewHtml}</div>
    <div class="modal-actions">
      <button class="btn-primary secondary" id="modal-plan-cancel">Cancel</button>
      <button class="btn-primary" id="modal-plan-confirm">Import Plan</button>
    </div>
  `);
  document.getElementById('modal-plan-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-plan-confirm').addEventListener('click', () => {
    plan = parsed;
    savePlan();
    closeModal();
    renderPlan();
    showToast('✓ Workout plan imported');
  });
}

/* ============================================================
   RESET APPLICATION
   ============================================================ */
function resetApplication() {
  showModal(`
    <div class="modal-title">Reset application?</div>
    <div class="modal-text">This will permanently delete your profile, workout plan, workout history, measurements, and settings. This cannot be undone.</div>
    <div class="modal-actions">
      <button class="btn-primary secondary" id="modal-reset-cancel">Cancel</button>
      <button class="btn-primary danger" id="modal-reset-confirm">Delete Everything</button>
    </div>
  `);
  document.getElementById('modal-reset-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-reset-confirm').addEventListener('click', () => {
    // Wipe the unified key + any legacy keys still lying around.
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
    Object.values(LEGACY_KEYS).forEach(k => {
      try { localStorage.removeItem(k); } catch (e) { /* ignore */ }
    });
    profile = null;
    plan = JSON.parse(JSON.stringify(DEFAULT_PLAN));
    history = [];
    active = null;
    settings = { soundEnabled: true, vibrateEnabled: true, theme: 'dark', accentColor: '#4FD1C7', unit: 'metric' };
    musicPlaylist = DEFAULT_MUSIC.slice();
    measurements = { template: getDefaultMeasurementTemplate(), entries: [] };
    skillProgress = {};
    state = {
      profile: null,
      plan: plan,
      history: [],
      active: null,
      settings: settings,
      music: musicPlaylist,
      measurements: measurements,
      skillProgress: skillProgress,
      version: 3,
    };
    // Persist the freshly-reset state so tempo_data is never null.
    saveData();
    clearAllTimers();
    applyTheme();
    // Reset accent color to default cyan
    const rgb = hexToRgb('#4FD1C7');
    const brightRgb = lighten(rgb, 0.18);
    const root = document.documentElement;
    root.style.setProperty('--c-accent', '#4FD1C7');
    root.style.setProperty('--c-accent-bright', rgbToHex(brightRgb));
    root.style.setProperty('--c-accent-glow', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.35)`);
    root.style.setProperty('--c-accent-soft', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.08)`);
    root.style.setProperty('--c-success', rgbToHex(brightRgb));
    closeModal();
    showToast('Application reset', 'warn');
    showWelcome();
  });
}

/* ============================================================
   PROFILE EDIT
   ============================================================ */
function editName() {
  showModal(`
    <div class="modal-title">Edit your name</div>
    <input type="text" class="welcome-input" id="edit-name-input" value="${profile?.name || ''}" placeholder="Your name" maxlength="40" autocomplete="off" style="margin-bottom:14px;">
    <div class="modal-actions">
      <button class="btn-primary secondary" id="modal-name-cancel">Cancel</button>
      <button class="btn-primary" id="modal-name-save">Save</button>
    </div>
  `);
  setTimeout(() => { document.getElementById('edit-name-input').focus(); }, 100);
  document.getElementById('modal-name-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-name-save').addEventListener('click', () => {
    const val = document.getElementById('edit-name-input').value.trim();
    if (!val) { showToast('Name cannot be empty', 'warn'); return; }
    if (!profile) profile = {};
    profile.name = val;
    if (!profile.createdAt) profile.createdAt = todayStr();
    saveProfile();
    closeModal();
    renderProfile();
    showToast('✓ Name updated');
  });
}

/* ============================================================
   WELCOME
   ============================================================ */
function showWelcome() {
  // Show the welcome modal ON TOP of the dashboard (which is already visible)
  // Topbar and bottom-nav remain visible so the user can see the app structure
  document.getElementById('topbar').style.display = 'block';
  document.getElementById('bottom-nav').style.display = 'flex';
  switchView('home');
  document.getElementById('welcome-modal').classList.add('show');
  // auto-focus the name input
  setTimeout(() => {
    const input = document.getElementById('welcome-name');
    if (input) input.focus();
  }, 350);
}
function hideWelcome() {
  document.getElementById('welcome-modal').classList.remove('show');
}
function showApp() {
  document.getElementById('topbar').style.display = 'block';
  document.getElementById('bottom-nav').style.display = 'flex';
  switchView('home');
}

/* ============================================================
   BEFOREUNLOAD WARNING DURING WORKOUT
   ============================================================ */
window.addEventListener('beforeunload', (e) => {
  if (active && active.phase !== 'complete') {
    e.preventDefault();
    e.returnValue = 'Workout in progress. Leave anyway?';
    return e.returnValue;
  }
});

/* ============================================================
   MUSIC PLAYER
   Uses YouTube IFrame API for in-app playback.
   Falls back to opening in new tab if API unavailable.
   ============================================================ */
const MUSIC_QUALITY_KEY = 'cb_music_quality_v1';
const PLAYBACK_QUALITIES = new Set(['small', 'medium', 'large', 'hd720', 'hd1080', 'hd1440', 'hd2160', 'highres']);
const PLAYBACK_QUALITY_LABELS = {
  small: '240p', medium: '360p', large: '480p', hd720: '720p',
  hd1080: '1080p', hd1440: '1440p', hd2160: '2160p', highres: 'High quality',
};
let musicPlaylist = [];
let currentTrackIdx = -1;
let ytPlayer = null;
let ytApiReady = false;
let ytPlayerReady = false;
let ytPlayerPromise = null;
let isMusicPlaying = false;
let videoVisible = false;  // false = video hidden, true = video shown
let resumePosition = 0;
let resumeVideoId = null;
let preferredPlaybackQuality = 'medium';
try {
  const savedQuality = localStorage.getItem(MUSIC_QUALITY_KEY);
  if (PLAYBACK_QUALITIES.has(savedQuality)) preferredPlaybackQuality = savedQuality;
} catch (e) { /* local storage may be unavailable */ }

// Default motivational playlist (well-known YouTube mixes — user can replace)
const DEFAULT_MUSIC = [
  { title: 'Workout Music', url: 'https://www.youtube.com/watch?v=D2CKOIiabfg&t' },
];
const LEGACY_DEFAULT_MUSIC_IDS = ['B2FP2BKTSC0', 'PE0MBafyK0M', '8oCkq-FQfTo'];

function loadMusicData() {
  // Music is part of the unified `tempo_data` state, loaded by loadData().
  // Migration from legacy cb_music_v2 is handled there. Here we just make sure
  // musicPlaylist is initialized on first run and upgrade any legacy default
  // track list to the new default.
  if (!Array.isArray(musicPlaylist)) musicPlaylist = [];
  if (musicPlaylist.length === 0) {
    musicPlaylist = DEFAULT_MUSIC.slice();
    saveMusicData();
    return;
  }
  const isLegacyDefaults = musicPlaylist.length === LEGACY_DEFAULT_MUSIC_IDS.length &&
    musicPlaylist.every(track => track && LEGACY_DEFAULT_MUSIC_IDS.includes(extractYouTubeId(track.url)));
  if (isLegacyDefaults) {
    musicPlaylist = DEFAULT_MUSIC.slice();
    saveMusicData();
  }
}
// saveMusicData() is defined in the backward-compat wrappers section above
// (it just calls saveData()).

function updateVideoQualityHint() {
  const hint = document.getElementById('video-hint');
  if (hint && videoVisible) {
    hint.textContent = `Video visible · ${PLAYBACK_QUALITY_LABELS[preferredPlaybackQuality]} requested`;
  }
}

function extractYouTubeId(url) {
  if (!url) return null;
  // Handle: youtu.be/VIDEO_ID, youtube.com/watch?v=VIDEO_ID, youtube.com/embed/VIDEO_ID, youtube.com/shorts/VIDEO_ID
  const patterns = [
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  // If it's already just an ID (11 chars)
  if (/^[a-zA-Z0-9_-]{11}$/.test(url.trim())) return url.trim();
  return null;
}

function loadYouTubeAPI() {
  if (ytApiReady && window.YT && window.YT.Player) return Promise.resolve();
  if (window.YT && window.YT.Player) {
    ytApiReady = true;
    return Promise.resolve();
  }
  if (window._ytApiPromise) return window._ytApiPromise;

  window._ytApiPromise = new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) reject(error);
      else {
        ytApiReady = true;
        resolve();
      }
    };
    const previousCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = function() {
      if (typeof previousCallback === 'function') previousCallback();
      finish();
    };
    const existingScript = document.querySelector('script[src*="youtube.com/iframe_api"]');
    const tag = existingScript || document.createElement('script');
    const timeout = setTimeout(() => finish(new Error('YouTube player took too long to load.')), 12000);
    tag.addEventListener('error', () => finish(new Error('Could not load the YouTube player.')),{ once: true });
    if (!existingScript) {
      tag.src = 'https://www.youtube.com/iframe_api';
      tag.async = true;
      document.head.appendChild(tag);
    }
  });
  window._ytApiPromise.catch(() => { window._ytApiPromise = null; });
  return window._ytApiPromise;
}

function initYouTubePlayer() {
  if (ytPlayerPromise) return ytPlayerPromise;
  ytPlayerPromise = loadYouTubeAPI().then(() => new Promise((resolve, reject) => {
  const host = document.getElementById('yt-player');
  if (!host) throw new Error('YouTube player container is missing.');
  try {
    ytPlayer = new YT.Player('yt-player', {
      height: '270',
      width: '480',
      videoId: '',
      playerVars: {
        autoplay: 0,
        controls: 1,
        disablekb: 0,
        modestbranding: 1,
        playsinline: 1,
        rel: 0,  // don't show related videos at end
      },
      events: {
        onReady: () => {
          ytPlayerReady = true;
          resolve(ytPlayer);
        },
        onStateChange: (e) => {
          if (e.data === YT.PlayerState.ENDED) {
            playTrack((currentTrackIdx + 1) % musicPlaylist.length, 0);
          } else if (e.data === YT.PlayerState.PLAYING) {
            isMusicPlaying = true;
            if (ytPlayer.setPlaybackQuality) {
              try { ytPlayer.setPlaybackQuality(preferredPlaybackQuality); } catch (error) { /* YouTube may ignore quality requests. */ }
            }
            // Fetch real title on first play (if not already set)
            const track = musicPlaylist[currentTrackIdx];
            if (track && (track.title.startsWith('YouTube · ') || track.title === 'Loading…' || track.title === 'Untitled Track')) {
              fetchYouTubeTitle(track.url).then(title => {
                if (title) {
                  track.title = title;
                  saveMusicData();
                  updateMusicUI();
                }
              }).catch(() => {});
            }
            updateMusicPlayPauseIcon();
            showMiniBar();
            hideVideoError();
            // Update now-playing title with track title
            if (track) {
              const npTitle = document.getElementById('music-np-title');
              if (npTitle) npTitle.textContent = track.title;
            }
          } else if (e.data === YT.PlayerState.PAUSED) {
            isMusicPlaying = false;
            try { resumePosition = ytPlayer.getCurrentTime(); } catch (error) { /* ignore */ }
            updateMusicPlayPauseIcon();
          } else if (e.data === YT.PlayerState.BUFFERING) {
            // keep current state icon during buffering
          } else if (e.data === YT.PlayerState.CUED) {
            isMusicPlaying = false;
            updateMusicPlayPauseIcon();
          }
        },
        onPlaybackQualityChange: (e) => {
          if (!PLAYBACK_QUALITIES.has(e.data)) return;
          preferredPlaybackQuality = e.data;
          try { localStorage.setItem(MUSIC_QUALITY_KEY, preferredPlaybackQuality); } catch (error) { /* ignore */ }
          updateVideoQualityHint();
        },
        onError: (e) => {
          console.warn('YT playback error', e);
          const code = e && e.data;
          let msg = 'This track cannot be played.';
          if (code === 2) msg = 'Invalid video ID. Check the link.';
          else if (code === 5) msg = 'HTML5 player error. Try another track.';
          else if (code === 100) msg = 'Video not found or removed.';
          else if (code === 101 || code === 150) msg = 'Embedding disabled by uploader. Try another track.';
          showVideoError(msg);
          isMusicPlaying = false;
          updateMusicPlayPauseIcon();
          if (!ytPlayerReady) reject(new Error(msg));
        },
      },
    });
  } catch (e) {
    console.error('YT player init fail', e);
    reject(e);
  }
  setTimeout(() => {
    if (!ytPlayerReady) reject(new Error('YouTube player did not become ready.'));
  }, 12000);
  })).catch(error => {
    ytPlayerPromise = null;
    throw error;
  });
  return ytPlayerPromise;
}

async function ensureYouTubePlayer() {
  if (ytPlayer && ytPlayerReady) return ytPlayer;
  await initYouTubePlayer();
  // Start a low-frequency poll to keep play/pause icon in sync
  if (!window._ytSyncInterval) {
    window._ytSyncInterval = setInterval(() => {
      if (!ytPlayer || !ytPlayer.getPlayerState) return;
      try {
        const state = ytPlayer.getPlayerState();
        const actuallyPlaying = (state === 1);
        if (actuallyPlaying && currentTrackIdx >= 0) {
          resumePosition = ytPlayer.getCurrentTime();
          resumeVideoId = extractYouTubeId(musicPlaylist[currentTrackIdx]?.url);
        }
        if (actuallyPlaying !== isMusicPlaying) {
          isMusicPlaying = actuallyPlaying;
          updateMusicPlayPauseIcon();
        }
      } catch (e) { /* ignore */ }
    }, 1000);
  }
  return ytPlayer;
}

function primeYouTubePlayer() {
  ensureYouTubePlayer().catch(error => console.warn('YouTube player prewarm failed', error));
}

function positionYouTubePlayer() {
  const host = document.getElementById('yt-player-host');
  const stage = document.getElementById('music-video-stage');
  const panel = document.getElementById('music-panel');
  if (!host || !stage || !panel) return;

  if (!videoVisible || !panel.classList.contains('show') || !stage.classList.contains('show') || stage.querySelector('.music-video-error')) {
    host.style.left = '-10000px';
    host.style.top = '0';
    host.style.opacity = '0';
    host.style.pointerEvents = 'none';
    return;
  }

  const rect = stage.getBoundingClientRect();
  host.style.left = `${rect.left}px`;
  host.style.top = `${rect.top}px`;
  host.style.width = `${rect.width}px`;
  host.style.height = `${rect.height}px`;
  host.style.opacity = '1';
  host.style.pointerEvents = 'auto';
}

function refreshVisibleYouTubePlayer() {
  positionYouTubePlayer();
  setTimeout(() => {
    const panel = document.getElementById('music-panel');
    if (!videoVisible || !panel?.classList.contains('show')) return;
    positionYouTubePlayer();
    if (!ytPlayer || !ytPlayerReady) return;
    try {
      const playerState = ytPlayer.getPlayerState();
      const currentTime = ytPlayer.getCurrentTime();
      if (Number.isFinite(currentTime)) ytPlayer.seekTo(currentTime, true);
      if (playerState === YT.PlayerState.PLAYING) ytPlayer.playVideo();
      if (ytPlayer.setPlaybackQuality) ytPlayer.setPlaybackQuality(preferredPlaybackQuality);
    } catch (error) { /* player may still be restoring */ }
  }, 350);
}

function playTrack(idx, startSeconds) {
  if (idx < 0 || idx >= musicPlaylist.length) return;
  const track = musicPlaylist[idx];
  const videoId = extractYouTubeId(track.url);
  if (!videoId) {
    showToast('Not a valid YouTube link', 'warn');
    return;
  }
  if (videoId !== resumeVideoId) resumePosition = 0;
  currentTrackIdx = idx;
  resumeVideoId = videoId;
  const startAt = Number.isFinite(startSeconds) ? startSeconds : resumePosition;
  // Show loading state in now-playing title only
  showVideoLoading();
  updateMusicUI();
  ensureYouTubePlayer().then(player => {
    if (player && player.loadVideoById) {
      try {
        player.loadVideoById({ videoId, startSeconds: startAt, suggestedQuality: preferredPlaybackQuality });
        player.playVideo();
        if (player.setPlaybackQuality) {
          try { player.setPlaybackQuality(preferredPlaybackQuality); } catch (e) { /* YouTube may ignore quality requests. */ }
        }
      } catch (e) {
        console.error('loadVideoById error', e);
        showVideoError('Could not load this video. Try another track.');
      }
    } else {
      showVideoError('YouTube player is unavailable. Check your connection, then retry.');
    }
  }).catch(err => {
    console.error('playTrack error', err);
    showVideoError(err.message || 'Could not start playback. Check your connection.');
  });
  // Fetch real title for YouTube links (async, non-blocking)
  if (!track.title || track.title.startsWith('YouTube · ') || track.title === 'Loading…' || track.title === 'Untitled Track') {
    fetchYouTubeTitle(track.url).then(realTitle => {
      if (realTitle) {
        const t = musicPlaylist.find(t => t.url === track.url);
        if (t) {
          t.title = realTitle;
          saveMusicData();
          updateMusicUI();
        }
      }
      // If fetch failed, keep existing title — don't get stuck on "Loading…"
    }).catch(() => {});
  }
}

function playNextTrack() {
  if (musicPlaylist.length === 0) return;
  const next = (currentTrackIdx + 1) % musicPlaylist.length;
  playTrack(next);
}

function playPrevTrack() {
  if (musicPlaylist.length === 0) return;
  const prev = (currentTrackIdx - 1 + musicPlaylist.length) % musicPlaylist.length;
  playTrack(prev);
}

function togglePlayPause() {
  if (!ytPlayer || !ytPlayer.getPlayerState) {
    // No player yet — start first track
    if (musicPlaylist.length > 0) playTrack(currentTrackIdx < 0 ? 0 : currentTrackIdx);
    return;
  }
  try {
    const state = ytPlayer.getPlayerState();
    // YT states: -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued
    if (state === 1) {
      // Playing → pause
      ytPlayer.pauseVideo();
      isMusicPlaying = false;
    } else if (state === 2) {
      // Paused → play
      ytPlayer.playVideo();
      isMusicPlaying = true;
    } else if (state === 0 || state === 5 || state === -1) {
      // Resume stopped playback from its last saved position.
      if (currentTrackIdx >= 0) {
        playTrack(currentTrackIdx);
      } else if (musicPlaylist.length > 0) {
        playTrack(0);
      }
    } else {
      // Buffering (3) — try play anyway
      ytPlayer.playVideo();
    }
    // Update icon immediately for responsiveness (will be corrected by onStateChange if wrong)
    updateMusicPlayPauseIcon();
  } catch (e) {
    console.warn('togglePlayPause error', e);
    // Player in weird state — reload track
    if (currentTrackIdx >= 0) playTrack(currentTrackIdx);
  }
}

function toggleVideo() {
  videoVisible = !videoVisible;
  const stage = document.getElementById('music-video-stage');
  const toggleBtn = document.getElementById('btn-toggle-video');
  const label = document.getElementById('video-toggle-label');
  const hint = document.getElementById('video-hint');

  if (!toggleBtn || !label || !hint) return;

  if (videoVisible) {
    if (stage) {
      stage.innerHTML = '';
      stage.classList.add('show');
    }
    toggleBtn.classList.add('active');
    toggleBtn.setAttribute('aria-pressed', 'true');
    toggleBtn.setAttribute('aria-label', 'Video On');
    label.textContent = 'Video On';
    updateVideoQualityHint();
    hint.classList.remove('warn');
    showToast('Video on');
  } else {
    if (stage) stage.classList.remove('show');
    toggleBtn.classList.remove('active');
    toggleBtn.setAttribute('aria-pressed', 'false');
    toggleBtn.setAttribute('aria-label', 'Video Off');
    label.textContent = 'Video Off';
    hint.textContent = 'Video hidden · audio continues';
    hint.classList.remove('warn');
    showToast('Video hidden');
  }
  positionYouTubePlayer();
}

function updateMusicPlayPauseIcon() {
  const playIcon = document.getElementById('music-play-icon');
  const pauseIcon = document.getElementById('music-pause-icon');
  const miniPlayIcon = document.getElementById('mini-play-icon');
  const miniPauseIcon = document.getElementById('mini-pause-icon');
  const miniToggle = document.getElementById('mini-play-toggle');
  const miniStatus = document.getElementById('mini-status');
  if (isMusicPlaying) {
    if (playIcon) playIcon.style.display = 'none';
    if (pauseIcon) pauseIcon.style.display = '';
    if (miniPlayIcon) miniPlayIcon.style.display = 'none';
    if (miniPauseIcon) miniPauseIcon.style.display = '';
    if (miniToggle) miniToggle.setAttribute('aria-label', 'Pause music');
    if (miniToggle) miniToggle.setAttribute('aria-pressed', 'true');
    if (miniStatus) miniStatus.textContent = 'Now Playing';
  } else {
    if (playIcon) playIcon.style.display = '';
    if (pauseIcon) pauseIcon.style.display = 'none';
    if (miniPlayIcon) miniPlayIcon.style.display = '';
    if (miniPauseIcon) miniPauseIcon.style.display = 'none';
    if (miniToggle) miniToggle.setAttribute('aria-label', 'Resume music');
    if (miniToggle) miniToggle.setAttribute('aria-pressed', 'false');
    if (miniStatus) miniStatus.textContent = 'Paused';
  }
}

function updateMusicUI() {
  const npTitle = document.getElementById('music-np-title');
  const miniTitle = document.getElementById('mini-title');
  const miniBar = document.getElementById('music-mini-bar');
  const trackList = document.getElementById('music-track-list');
  const countEl = document.getElementById('music-list-count');

  if (currentTrackIdx >= 0 && musicPlaylist[currentTrackIdx]) {
    const t = musicPlaylist[currentTrackIdx];
    if (npTitle) npTitle.textContent = t.title;
    if (miniTitle) miniTitle.textContent = t.title;
    miniBar?.classList.add('show');
  } else {
    if (npTitle) npTitle.textContent = 'No track selected';
    if (miniTitle) miniTitle.textContent = '—';
    miniBar?.classList.remove('show');
  }
  updateMusicPlayPauseIcon();

  if (countEl) countEl.textContent = `${musicPlaylist.length} ${musicPlaylist.length === 1 ? 'track' : 'tracks'}`;

  // Render track list
  if (trackList) {
    if (musicPlaylist.length === 0) {
      trackList.innerHTML = '<div class="music-empty">No tracks yet. Paste a YouTube link below to add your first track.</div>';
    } else {
      trackList.innerHTML = musicPlaylist.map((t, i) => {
        const isCurrent = i === currentTrackIdx;
        const source = extractYouTubeId(t.url) ? 'YouTube' : (t.url.includes('telegram') ? 'Telegram' : 'Link');
        return `
          <div class="music-track ${isCurrent ? 'playing' : ''}" data-track-idx="${i}">
            <div class="music-track-num">${isCurrent && isMusicPlaying ? '♪' : (i+1)}</div>
            <div class="music-track-info">
              <div class="music-track-title">${escapeHtml(t.title)}</div>
              <div class="music-track-source">${source}</div>
            </div>
            <button class="music-track-remove" data-remove-idx="${i}" aria-label="Remove">×</button>
          </div>
        `;
      }).join('');
      // Attach click handlers
      trackList.querySelectorAll('[data-track-idx]').forEach(el => {
        el.addEventListener('click', (e) => {
          if (e.target.closest('.music-track-remove')) return;
          const idx = parseInt(el.getAttribute('data-track-idx'), 10);
          playTrack(idx);
        });
      });
      trackList.querySelectorAll('[data-remove-idx]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const idx = parseInt(btn.getAttribute('data-remove-idx'), 10);
          removeTrack(idx);
        });
      });
    }
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
}

function showMiniBar() {
  const miniBar = document.getElementById('music-mini-bar');
  if (miniBar && currentTrackIdx >= 0) {
    miniBar.classList.add('show');
  }
}
function hideMiniBar() {
  const miniBar = document.getElementById('music-mini-bar');
  if (miniBar) miniBar.classList.remove('show');
}

function closeMiniBar() {
  if (ytPlayer && ytPlayer.getCurrentTime) {
    try { resumePosition = ytPlayer.getCurrentTime(); } catch (error) { /* ignore */ }
  }
  resumeVideoId = extractYouTubeId(musicPlaylist[currentTrackIdx]?.url) || resumeVideoId;
  if (ytPlayer && ytPlayer.stopVideo) ytPlayer.stopVideo();
  isMusicPlaying = false;
  updateMusicPlayPauseIcon();
  hideMiniBar();
  closeMusicPanel();
}

/* ============================================================
   YOUTUBE TITLE FETCH + VIDEO ERROR UI
   ============================================================ */
async function fetchYouTubeTitle(url) {
  const videoId = extractYouTubeId(url);
  if (!videoId) return null;
  try {
    // YouTube oEmbed — no API key required, returns title + author_name
    const resp = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
    if (!resp.ok) return null;
    const data = await resp.json();
    if (data && data.title) {
      // Include author if available, e.g. "Track Name — Author"
      return data.author_name ? `${data.title} — ${data.author_name}` : data.title;
    }
    return null;
  } catch (e) {
    console.warn('fetchYouTubeTitle failed', e);
    return null;
  }
}

function showVideoLoading() {
  // Just update the now-playing title to show loading state.
  // Do NOT force videoVisible or show the video stage — respect user's toggle choice.
  const npTitle = document.getElementById('music-np-title');
  if (npTitle) npTitle.textContent = 'Loading…';
  // Only show the video stage if the user explicitly has video ON
  const stage = document.getElementById('music-video-stage');
  if (stage && videoVisible) {
    stage.classList.add('show');
    // Don't overwrite stage content — the player iframe will fill it once loaded
  }
  positionYouTubePlayer();
}

function showVideoError(msg) {
  // Show error in the now-playing area, NOT by forcing the video stage visible
  const npTitle = document.getElementById('music-np-title');
  if (npTitle) npTitle.textContent = '⚠ ' + msg;

  // If video IS visible, show error in the stage with retry/skip buttons
  const stage = document.getElementById('music-video-stage');
  if (stage && videoVisible) {
    stage.classList.add('show');
    stage.innerHTML = `
      <div class="music-video-error">
        <div class="error-icon">!</div>
        <div class="error-msg">${escapeHtml(msg)}</div>
        <div class="error-actions">
          <button class="error-retry-btn" id="btn-retry-track">Retry</button>
          <button class="error-skip-btn" id="btn-error-skip">Skip</button>
        </div>
      </div>
    `;
    document.getElementById('btn-retry-track')?.addEventListener('click', () => {
      if (currentTrackIdx >= 0) playTrack(currentTrackIdx);
    });
    document.getElementById('btn-error-skip')?.addEventListener('click', playNextTrack);
  } else {
    // Video is hidden — show error as a toast with action hint
    showToast(msg + ' — tap Retry in now-playing', 'error');
  }
  positionYouTubePlayer();
}

function hideVideoError() {
  const stage = document.getElementById('music-video-stage');
  if (stage) {
    stage.innerHTML = '';
    stage.classList.toggle('show', videoVisible);
  }
  positionYouTubePlayer();
}

function addTrack(url) {
  const trimmed = (url || '').trim();
  if (!trimmed) { showToast('Paste a URL first', 'warn'); return; }
  // Generate a placeholder title — will be replaced by real YouTube title once fetched
  const ytId = extractYouTubeId(trimmed);
  let title;
  if (ytId) {
    title = `YouTube · ${ytId}`;  // placeholder, will be replaced by real title
  } else if (trimmed.includes('telegram')) {
    title = 'Telegram Music Link';
  } else {
    try {
      const u = new URL(trimmed.startsWith('http') ? trimmed : 'https://' + trimmed);
      title = u.hostname.replace('www.', '');
    } catch (e) { title = 'Custom Track'; }
  }
  musicPlaylist.push({ title, url: trimmed });
  saveMusicData();
  updateMusicUI();
  showToast('✓ Track added');
  // Auto-play the newly added track
  playTrack(musicPlaylist.length - 1);
  // Fetch real title for YouTube links (async, replaces placeholder once it arrives)
  if (ytId) {
    fetchYouTubeTitle(trimmed).then(realTitle => {
      const track = musicPlaylist.find(t => t.url === trimmed);
      if (track && realTitle) {
        track.title = realTitle;
        saveMusicData();
        updateMusicUI();
      }
      // If fetch failed, keep the "YouTube · {id}" placeholder — don't get stuck
    }).catch(() => {});
  }
}

function removeTrack(idx) {
  if (idx < 0 || idx >= musicPlaylist.length) return;
  const wasCurrent = idx === currentTrackIdx;
  musicPlaylist.splice(idx, 1);
  if (wasCurrent) {
    currentTrackIdx = -1;
    if (ytPlayer && ytPlayer.stopVideo) ytPlayer.stopVideo();
    isMusicPlaying = false;
    hideMiniBar();
  } else if (idx < currentTrackIdx) {
    currentTrackIdx--;
  }
  saveMusicData();
  updateMusicUI();
  showToast('Track removed', 'warn');
}

function openMusicPanel() {
  initAudio(); // unlock audio context on user gesture
  document.getElementById('music-panel').classList.add('show');
  if (videoVisible) document.getElementById('music-video-stage').classList.add('show');
  refreshVisibleYouTubePlayer();
  updateMusicUI();
}
function closeMusicPanel() {
  document.getElementById('music-panel').classList.remove('show');
  positionYouTubePlayer();
}

/* ============================================================
   VIDEO LIBRARY — warmup / cooldown clips stored in IndexedDB
   ============================================================ */
const VIDEO_DB_NAME = 'tempo_videos';
const VIDEO_STORE = 'videos';
const PHOTO_STORE = 'photos';
const VIDEO_DB_VERSION = 2;  // bumped from 1 → 2 to add the `photos` store
const VIDEO_CATEGORIES = [
  { id: 'warmup', label: 'Warmup' },
  { id: 'cooldown', label: 'Cooldown' },
];
let videoDb = null;
let videoCurrentCat = 'warmup';
let videoListCache = [];

function openVideoDb() {
  return new Promise((resolve, reject) => {
    if (videoDb) { resolve(videoDb); return; }
    try {
      const req = indexedDB.open(VIDEO_DB_NAME, VIDEO_DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(VIDEO_STORE)) {
          const store = db.createObjectStore(VIDEO_STORE, { keyPath: 'id', autoIncrement: true });
          store.createIndex('category', 'category', { unique: false });
        }
        // Add a `photos` store for progress photos (added in v2).
        if (!db.objectStoreNames.contains(PHOTO_STORE)) {
          db.createObjectStore(PHOTO_STORE, { keyPath: 'id', autoIncrement: true });
        }
      };
      req.onsuccess = (e) => { videoDb = e.target.result; resolve(videoDb); };
      req.onerror = () => reject(req.error);
    } catch (e) { reject(e); }
  });
}

function videoDbAdd(entry) {
  return openVideoDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(VIDEO_STORE, 'readwrite');
    const req = tx.objectStore(VIDEO_STORE).add(entry);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}
function videoDbGetAllByCat(cat) {
  return openVideoDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(VIDEO_STORE, 'readonly');
    const idx = tx.objectStore(VIDEO_STORE).index('category');
    const req = idx.getAll(cat);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  }));
}
function videoDbGet(id) {
  return openVideoDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(VIDEO_STORE, 'readonly');
    const req = tx.objectStore(VIDEO_STORE).get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}
function videoDbDelete(id) {
  return openVideoDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(VIDEO_STORE, 'readwrite');
    const req = tx.objectStore(VIDEO_STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  }));
}

function formatFileSize(bytes) {
  if (!bytes || bytes < 0) return '0 B';
  const KB = 1024, MB = KB * 1024;
  if (bytes < KB) return bytes + ' B';
  if (bytes < MB) return (bytes / KB).toFixed(1) + ' KB';
  return (bytes / MB).toFixed(1) + ' MB';
}

function renderVideoList() {
  const listEl = document.getElementById('video-track-list');
  const countEl = document.getElementById('video-list-count');
  const titleEl = document.getElementById('video-list-title');
  if (!listEl) return;
  const catObj = VIDEO_CATEGORIES.find(c => c.id === videoCurrentCat) || VIDEO_CATEGORIES[0];
  if (titleEl) titleEl.textContent = catObj.label + ' Videos';
  videoDbGetAllByCat(videoCurrentCat).then(items => {
    videoListCache = items;
    if (countEl) countEl.textContent = `${items.length} ${items.length === 1 ? 'video' : 'videos'}`;
    if (items.length === 0) {
      listEl.innerHTML = '<div class="music-empty">No videos yet. Add a title below and pick a video file.</div>';
      return;
    }
    listEl.innerHTML = items.map(v => {
      const sizeStr = formatFileSize(v.size);
      const title = escapeHtml(v.title || 'Untitled');
      return `
        <div class="video-item" data-vid="${v.id}">
          <button class="video-item-play" data-play-vid="${v.id}" aria-label="Play ${title}">
            <svg viewBox="0 0 24 24"><path d="M6 4 L20 12 L6 20 Z"/></svg>
          </button>
          <div class="video-item-info">
            <div class="video-item-title">${title}</div>
            <div class="video-item-meta">${sizeStr} · ${(v.type || 'video').replace('video/', '')}</div>
          </div>
          <button class="video-item-remove" data-remove-vid="${v.id}" aria-label="Remove video">×</button>
        </div>
      `;
    }).join('');
    listEl.querySelectorAll('[data-play-vid]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = parseInt(btn.getAttribute('data-play-vid'), 10);
        openVideoPlayer(id);
      });
    });
    listEl.querySelectorAll('[data-remove-vid]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = parseInt(btn.getAttribute('data-remove-vid'), 10);
        removeVideo(id);
      });
    });
  }).catch(err => {
    console.warn('video list fail', err);
    listEl.innerHTML = '<div class="music-empty">Could not load videos. Your browser may not support IndexedDB.</div>';
  });
}

function setVideoCategory(cat) {
  videoCurrentCat = cat;
  document.querySelectorAll('.video-cat-tab').forEach(t => {
    t.classList.toggle('active', t.getAttribute('data-cat') === cat);
  });
  renderVideoList();
}

function addVideoFromFile() {
  const titleInput = document.getElementById('video-add-input');
  const title = (titleInput.value || '').trim() || 'Untitled';
  const fileInput = document.getElementById('file-video-add');
  // Reset and trigger picker
  fileInput.value = '';
  // Remember the pending title in a closure so the change handler can use it
  pendingVideoTitle = title;
  fileInput.click();
}

let pendingVideoTitle = '';

function handleVideoFilePicked(file) {
  if (!file) return;
  if (!file.type.startsWith('video/')) {
    showToast('Please pick a video file', 'warn');
    return;
  }
  const title = pendingVideoTitle || (file.name || 'Untitled');
  pendingVideoTitle = '';
  const entry = {
    title,
    category: videoCurrentCat,
    blob: file,
    type: file.type,
    size: file.size,
    addedAt: Date.now(),
  };
  videoDbAdd(entry).then(() => {
    const titleInput = document.getElementById('video-add-input');
    if (titleInput) titleInput.value = '';
    renderVideoList();
    showToast('✓ Video added');
  }).catch(err => {
    console.error('video add fail', err);
    showToast('Could not save video', 'error');
  });
}

function removeVideo(id) {
  showModal(`
    <div class="modal-title">Delete video?</div>
    <div class="modal-text">This will permanently remove this video from your library.</div>
    <div class="modal-actions">
      <button class="btn-primary secondary" id="modal-vid-cancel">Cancel</button>
      <button class="btn-primary danger" id="modal-vid-confirm">Delete</button>
    </div>
  `);
  document.getElementById('modal-vid-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-vid-confirm').addEventListener('click', () => {
    videoDbDelete(id).then(() => {
      closeModal();
      renderVideoList();
      showToast('Video deleted', 'warn');
    }).catch(err => {
      console.error('video delete fail', err);
      showToast('Could not delete video', 'error');
    });
  });
}

function openVideoPlayer(id) {
  videoDbGet(id).then(v => {
    if (!v || !v.blob) { showToast('Video not found', 'error'); return; }
    const url = URL.createObjectURL(v.blob);
    const wrap = document.getElementById('video-player-wrap');
    wrap.innerHTML = '';
    const video = document.createElement('video');
    video.src = url;
    video.controls = true;
    video.autoplay = true;
    video.playsInline = true;
    wrap.appendChild(video);
    document.getElementById('video-player-modal').classList.add('show');
    video._objUrl = url;
    video.play().catch(() => { /* autoplay may be blocked — user can press play */ });
  }).catch(err => {
    console.error('video play fail', err);
    showToast('Could not play video', 'error');
  });
}

function closeVideoPlayer() {
  const modal = document.getElementById('video-player-modal');
  const wrap = document.getElementById('video-player-wrap');
  if (wrap) {
    const v = wrap.querySelector('video');
    if (v) {
      try { v.pause(); } catch (e) { /* ignore */ }
      if (v._objUrl) URL.revokeObjectURL(v._objUrl);
    }
    wrap.innerHTML = '';
  }
  modal.classList.remove('show');
}

function openVideoPanel() {
  initAudio();
  document.getElementById('video-panel').classList.add('show');
  setVideoCategory(videoCurrentCat);
}
function closeVideoPanel() {
  document.getElementById('video-panel').classList.remove('show');
}

/* ============================================================
   MEASUREMENTS — PRs, progress photos, body metric logs
   ============================================================ */

/* Auto-calculate max reps per exercise + best Cindy rounds from history.
   Returns an object keyed by exercise id (or "cindy" for the Cindy PR). */
function calculatePRs() {
  const prs = {};
  history.forEach(entry => {
    if (entry.type === 'cindy' && entry.cindy) {
      if (!prs.cindy || entry.cindy.rounds > prs.cindy.rounds) {
        prs.cindy = { rounds: entry.cindy.rounds, date: entry.date };
      }
    }
    if (Array.isArray(entry.exercises)) {
      entry.exercises.forEach(ex => {
        if (!Array.isArray(ex.sets)) return;
        const exType = ex.type || 'strength';
        ex.sets.forEach(set => {
          // Supersets & timed reps are stored as strings/seconds — skip for "max reps".
          if (exType !== 'strength' && exType !== 'skill') return;
          const reps = typeof set.reps === 'number' ? set.reps : (Number(set.reps) || 0);
          if (!Number.isFinite(reps) || reps <= 0) return;
          if (!prs[ex.id] || reps > prs[ex.id].reps) {
            prs[ex.id] = { name: ex.name, reps, date: entry.date };
          }
        });
      });
    }
  });
  return prs;
}

/* Display-unit conversion. Stored values are always metric (cm, kg, L).
   When settings.unit === 'imperial', convert for display only. */
function displayUnitFor(metricUnit) {
  if (!metricUnit) return '';
  const u = metricUnit.toLowerCase();
  if (settings.unit !== 'imperial') return metricUnit;
  if (u === 'cm') return 'in';
  if (u === 'kg') return 'lb';
  if (u === 'l')  return 'fl oz';
  return metricUnit;
}
function convertMeasurementValue(value, metricUnit) {
  if (value === null || value === undefined || value === '') return '';
  const num = Number(value);
  if (!Number.isFinite(num)) return value;
  if (settings.unit !== 'imperial') return num;
  const u = (metricUnit || '').toLowerCase();
  if (u === 'cm') return num * 0.3937;
  if (u === 'kg') return num * 2.2046;
  if (u === 'l')  return num * 33.814;
  return num;
}
function formatMeasurementValue(value, metricUnit) {
  if (value === null || value === undefined || value === '') return '—';
  const converted = convertMeasurementValue(value, metricUnit);
  if (typeof converted !== 'number' || !Number.isFinite(converted)) return String(converted);
  // Trim to 1 decimal place if not a whole number.
  const rounded = Math.round(converted * 10) / 10;
  const displayUnit = displayUnitFor(metricUnit);
  return `${rounded}<span class="unit">${displayUnit ? ' ' + escapeHtml(displayUnit) : ''}</span>`;
}

/* ---- IndexedDB photo ops (reuses tempo_videos database, `photos` store) ---- */
function photoDbAdd(entry) {
  return openVideoDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, 'readwrite');
    const req = tx.objectStore(PHOTO_STORE).add(entry);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}
function photoDbGetAll() {
  return openVideoDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, 'readonly');
    const req = tx.objectStore(PHOTO_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  }));
}
function photoDbGet(id) {
  return openVideoDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, 'readonly');
    const req = tx.objectStore(PHOTO_STORE).get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}
function photoDbDelete(id) {
  return openVideoDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, 'readwrite');
    const req = tx.objectStore(PHOTO_STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  }));
}

/* ---- Main render ---- */
function renderMeasurements() {
  // Unit toggle label
  const unitLabel = document.getElementById('measure-unit-label');
  if (unitLabel) {
    unitLabel.textContent = settings.unit === 'imperial' ? 'Imperial · in/lb' : 'Metric · cm/kg';
  }
  renderMeasurementPRs();
  renderProgressPhotos();
  renderMeasurementEntries();
  renderMeasurementTemplate();
}

function renderMeasurementPRs() {
  const grid = document.getElementById('measure-pr-grid');
  if (!grid) return;
  const prs = calculatePRs();
  const keys = Object.keys(prs);
  if (keys.length === 0) {
    grid.innerHTML = '<div class="measure-empty">Complete some workouts to see your PRs here.</div>';
    return;
  }
  let html = '';
  // Cindy PR first if present.
  if (prs.cindy) {
    html += `
      <div class="measure-pr-card is-cindy neu-raised-sm">
        <div class="measure-pr-num">${prs.cindy.rounds}<span class="unit">rounds</span></div>
        <div class="measure-pr-label">Cindy AMRAP</div>
        <div class="measure-pr-sub">Best · ${formatDateShort(prs.cindy.date)}</div>
      </div>
    `;
  }
  keys.filter(k => k !== 'cindy').forEach(k => {
    const pr = prs[k];
    html += `
      <div class="measure-pr-card neu-raised-sm">
        <div class="measure-pr-num">${pr.reps}<span class="unit">reps</span></div>
        <div class="measure-pr-label">${escapeHtml(pr.name)}</div>
        <div class="measure-pr-sub">Best · ${formatDateShort(pr.date)}</div>
      </div>
    `;
  });
  grid.innerHTML = html;
}

function renderProgressPhotos() {
  const timeline = document.getElementById('measure-photo-timeline');
  const countEl = document.getElementById('measure-photos-count');
  if (!timeline) return;
  photoDbGetAll().then(photos => {
    if (countEl) countEl.textContent = `${photos.length} ${photos.length === 1 ? 'photo' : 'photos'}`;
    if (photos.length === 0) {
      timeline.innerHTML = '<div class="measure-empty">No photos yet. Tap upload to add your first progress shot.</div>';
      return;
    }
    // Sort newest first.
    photos.sort((a, b) => (b.id || 0) - (a.id || 0));
    timeline.innerHTML = '';
    photos.forEach(p => {
      const url = URL.createObjectURL(p.blob);
      const thumb = document.createElement('div');
      thumb.className = 'measure-photo-thumb';
      thumb.innerHTML = `
        <img src="${url}" alt="Progress photo ${p.date}">
        <div class="measure-photo-thumb-date">${escapeHtml(formatDateShort(p.date))}</div>
        <button class="measure-photo-remove" data-photo-id="${p.id}" data-photo-url="${url}" aria-label="Delete photo">×</button>
      `;
      thumb.addEventListener('click', (e) => {
        if (e.target.closest('.measure-photo-remove')) return;
        openPhotoViewer(p.id);
      });
      thumb.querySelector('.measure-photo-remove').addEventListener('click', (e) => {
        e.stopPropagation();
        const id = parseInt(e.currentTarget.getAttribute('data-photo-id'), 10);
        const objUrl = e.currentTarget.getAttribute('data-photo-url');
        removeProgressPhoto(id, objUrl);
      });
      timeline.appendChild(thumb);
    });
  }).catch(err => {
    console.warn('photo list fail', err);
    timeline.innerHTML = '<div class="measure-empty">Could not load photos. Your browser may not support IndexedDB.</div>';
  });
}

function addProgressPhoto() {
  const fileInput = document.getElementById('file-progress-photo');
  if (!fileInput) return;
  fileInput.value = '';
  fileInput.click();
}

function handleProgressPhotoPicked(file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    showToast('Please pick an image file', 'warn');
    return;
  }
  const entry = {
    blob: file,
    type: file.type,
    size: file.size,
    date: todayStr(),
    note: '',
  };
  photoDbAdd(entry).then(() => {
    renderProgressPhotos();
    showToast('✓ Photo added');
  }).catch(err => {
    console.error('photo add fail', err);
    showToast('Could not save photo', 'error');
  });
}

function removeProgressPhoto(id, objUrl) {
  showModal(`
    <div class="modal-title">Delete photo?</div>
    <div class="modal-text">This will permanently remove this progress photo.</div>
    <div class="modal-actions">
      <button class="btn-primary secondary" id="modal-photo-cancel">Cancel</button>
      <button class="btn-primary danger" id="modal-photo-confirm">Delete</button>
    </div>
  `);
  document.getElementById('modal-photo-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-photo-confirm').addEventListener('click', () => {
    photoDbDelete(id).then(() => {
      if (objUrl) try { URL.revokeObjectURL(objUrl); } catch (e) { /* ignore */ }
      closeModal();
      renderProgressPhotos();
      showToast('Photo deleted', 'warn');
    }).catch(err => {
      console.error('photo delete fail', err);
      showToast('Could not delete photo', 'error');
    });
  });
}

function openPhotoViewer(id) {
  photoDbGet(id).then(p => {
    if (!p || !p.blob) { showToast('Photo not found', 'error'); return; }
    const url = URL.createObjectURL(p.blob);
    // Remove any existing viewer first.
    const existing = document.querySelector('.measure-photo-viewer');
    if (existing) existing.remove();
    const viewer = document.createElement('div');
    viewer.className = 'measure-photo-viewer';
    viewer.innerHTML = `
      <button class="measure-photo-viewer-close" aria-label="Close">×</button>
      <img src="${url}" alt="Progress photo ${p.date}">
      <div class="measure-photo-viewer-info">${escapeHtml(formatDateLong(p.date))}</div>
    `;
    document.body.appendChild(viewer);
    viewer._objUrl = url;
    const close = () => {
      try { URL.revokeObjectURL(viewer._objUrl); } catch (e) { /* ignore */ }
      viewer.remove();
    };
    viewer.querySelector('.measure-photo-viewer-close').addEventListener('click', close);
    viewer.addEventListener('click', (e) => {
      if (e.target === viewer) close();
    });
  }).catch(err => {
    console.error('photo view fail', err);
    showToast('Could not open photo', 'error');
  });
}

function renderMeasurementEntries() {
  const list = document.getElementById('measure-entries-list');
  if (!list) return;
  const entries = Array.isArray(measurements.entries) ? measurements.entries : [];
  if (entries.length === 0) {
    list.innerHTML = '<div class="measure-empty">No entries yet. Log your first measurement to start tracking.</div>';
    return;
  }
  // Newest first.
  const sorted = entries.slice().sort((a, b) => (a.date < b.date ? 1 : -1));
  list.innerHTML = '';
  sorted.forEach(entry => {
    const origIdx = entries.indexOf(entry);
    const card = document.createElement('div');
    card.className = 'measure-entry';
    const dateStr = formatDateLong(entry.date.split('T')[0]) + ' · ' + (entry.date.split('T')[1] || '').slice(0, 5);
    const values = entry.values || {};
    const template = measurements.template || [];
    let valuesHtml = '';
    template.forEach(field => {
      const raw = values[field.id];
      if (raw === undefined || raw === null || raw === '') return;
      valuesHtml += `
        <div class="measure-entry-value">
          <div class="measure-entry-value-label">${escapeHtml(field.label)}</div>
          <div class="measure-entry-value-num">${formatMeasurementValue(raw, field.unit)}</div>
        </div>
      `;
    });
    if (!valuesHtml) {
      valuesHtml = '<div class="measure-empty" style="padding:6px 0;">No values recorded.</div>';
    }
    card.innerHTML = `
      <div class="measure-entry-head">
        <span class="measure-entry-date">${escapeHtml(dateStr)}</span>
        <button class="measure-entry-remove" data-entry-idx="${origIdx}" aria-label="Delete entry">×</button>
      </div>
      <div class="measure-entry-values">${valuesHtml}</div>
    `;
    card.querySelector('.measure-entry-remove').addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(e.currentTarget.getAttribute('data-entry-idx'), 10);
      deleteMeasurementEntry(idx);
    });
    list.appendChild(card);
  });
}

function openMeasurementEntryForm() {
  const template = measurements.template || [];
  if (template.length === 0) {
    showToast('Add template fields first', 'warn');
    return;
  }
  // Group fields by likely category (body / nutrition) for the form layout.
  const isNutrition = (id) => ['proteinTarget', 'calorieTarget', 'waterTarget'].includes(id);
  const bodyFields = template.filter(f => !isNutrition(f.id));
  const nutritionFields = template.filter(f => isNutrition(f.id));

  const renderFields = (fields) => fields.map(f => `
    <div class="measure-form-field">
      <label>${escapeHtml(f.label)}</label>
      <input type="number" step="any" inputmode="decimal" data-field-id="${f.id}" placeholder="—">
      <span class="field-unit">${escapeHtml(displayUnitFor(f.unit) || f.unit || '')}</span>
    </div>
  `).join('');

  let formHtml = '';
  if (bodyFields.length > 0) {
    formHtml += `<div class="measure-form-section-title">Body Metrics</div>`;
    formHtml += `<div class="measure-form-grid">${renderFields(bodyFields)}</div>`;
  }
  if (nutritionFields.length > 0) {
    formHtml += `<div class="measure-form-section-title">Daily Targets</div>`;
    formHtml += `<div class="measure-form-grid">${renderFields(nutritionFields)}</div>`;
  }

  showModal(`
    <div class="modal-title">Log New Measurement</div>
    <div class="modal-text">Enter your current measurements. Leave any field blank to skip it. Values are stored in metric units — imperial input is converted on save.</div>
    ${formHtml}
    <div class="modal-actions">
      <button class="btn-primary secondary" id="modal-measure-cancel">Cancel</button>
      <button class="btn-primary" id="modal-measure-save">Save Entry</button>
    </div>
  `);
  document.getElementById('modal-measure-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-measure-save').addEventListener('click', () => {
    saveMeasurementEntryFromForm();
  });
}

function saveMeasurementEntryFromForm() {
  const template = measurements.template || [];
  const values = {};
  let anyValue = false;
  template.forEach(field => {
    const input = document.querySelector(`[data-field-id="${field.id}"]`);
    if (!input) return;
    const raw = input.value === '' ? null : parseFloat(input.value);
    if (raw === null || isNaN(raw)) return;
    anyValue = true;
    // Stored value is always metric. If user is in imperial mode, convert back.
    const u = (field.unit || '').toLowerCase();
    let metricVal = raw;
    if (settings.unit === 'imperial') {
      if (u === 'cm') metricVal = raw / 0.3937;
      else if (u === 'kg') metricVal = raw / 2.2046;
      else if (u === 'l') metricVal = raw / 33.814;
    }
    // Round to 2 decimals to avoid float noise.
    values[field.id] = Math.round(metricVal * 100) / 100;
  });
  if (!anyValue) {
    showToast('Enter at least one value', 'warn');
    return;
  }
  if (!Array.isArray(measurements.entries)) measurements.entries = [];
  const entry = {
    date: new Date().toISOString().slice(0, 16),
    values,
  };
  measurements.entries.unshift(entry);
  saveData();
  closeModal();
  renderMeasurementEntries();
  showToast('✓ Measurement logged');
}

function deleteMeasurementEntry(idx) {
  if (!Array.isArray(measurements.entries) || idx < 0 || idx >= measurements.entries.length) return;
  showModal(`
    <div class="modal-title">Delete measurement entry?</div>
    <div class="modal-text">This will permanently remove this measurement entry.</div>
    <div class="modal-actions">
      <button class="btn-primary secondary" id="modal-measure-del-cancel">Cancel</button>
      <button class="btn-primary danger" id="modal-measure-del-confirm">Delete</button>
    </div>
  `);
  document.getElementById('modal-measure-del-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-measure-del-confirm').addEventListener('click', () => {
    measurements.entries.splice(idx, 1);
    saveData();
    closeModal();
    renderMeasurementEntries();
    showToast('Entry deleted', 'warn');
  });
}

function renderMeasurementTemplate() {
  const wrap = document.getElementById('measure-template-fields');
  if (!wrap) return;
  const template = measurements.template || [];
  if (template.length === 0) {
    wrap.innerHTML = '<div class="measure-empty">No template fields.</div>';
    return;
  }
  wrap.innerHTML = template.map(f => `
    <div class="measure-template-chip">
      <span class="label">${escapeHtml(f.label)}</span>
      <span class="unit">${escapeHtml(displayUnitFor(f.unit) || f.unit || '')}</span>
    </div>
  `).join('');
}

function exportMeasurementTemplate() {
  const template = measurements.template || [];
  const text = JSON.stringify(template, null, 2);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('✓ Template copied to clipboard');
    }).catch(() => {
      fallbackCopy(text);
      showToast('✓ Template copied to clipboard');
    });
  } else {
    fallbackCopy(text);
    showToast('✓ Template copied to clipboard');
  }
}

function importMeasurementTemplate() {
  const placeholder = JSON.stringify(getDefaultMeasurementTemplate(), null, 2).slice(0, 220) + '\n  ...\n]';
  showModal(`
    <div class="modal-title">Import Measurement Template</div>
    <div class="modal-text">Paste a JSON array of template field objects. Each field needs: id, label, unit, type.</div>
    <textarea id="import-template-input" style="width:100%; height:48vh; background:var(--c-bg-deep); color:var(--c-text); border:0; padding:14px; border-radius:10px; font-family:'JetBrains Mono', monospace; font-size:11px; line-height:1.5; resize:vertical; outline:0; box-shadow:var(--shadow-in-dark-sm), var(--shadow-in-light-sm);" placeholder='${escapeHtml(placeholder)}'></textarea>
    <div id="import-template-error" style="display:none;" class="modal-error"></div>
    <div class="modal-actions">
      <button class="btn-primary secondary" id="modal-template-cancel">Cancel</button>
      <button class="btn-primary" id="modal-template-import">Import</button>
    </div>
  `);
  document.getElementById('modal-template-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-template-import').addEventListener('click', () => {
    const raw = document.getElementById('import-template-input').value;
    const errBox = document.getElementById('import-template-error');
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      errBox.style.display = 'block';
      errBox.textContent = 'Invalid JSON: ' + err.message;
      return;
    }
    const validationErr = validateMeasurementTemplate(parsed);
    if (validationErr) {
      errBox.style.display = 'block';
      errBox.textContent = validationErr;
      return;
    }
    measurements.template = parsed;
    saveData();
    closeModal();
    renderMeasurementTemplate();
    renderMeasurementEntries();
    showToast('✓ Template imported');
  });
  setTimeout(() => { document.getElementById('import-template-input').focus(); }, 100);
}

function validateMeasurementTemplate(parsed) {
  if (!Array.isArray(parsed)) return 'Template must be a JSON array';
  if (parsed.length === 0) return 'Template cannot be empty';
  for (const f of parsed) {
    if (!f || typeof f !== 'object') return 'Each field must be an object';
    if (!f.id || typeof f.id !== 'string') return 'Each field needs a string "id"';
    if (!f.label || typeof f.label !== 'string') return `Field "${f.id || '?'}" needs a string "label"`;
    if (typeof f.unit !== 'string') return `Field "${f.id}" needs a string "unit"`;
    if (f.type && !['number', 'image'].includes(f.type)) return `Field "${f.id}" type must be "number" or "image"`;
  }
  return null;
}

function toggleMeasurementUnit() {
  settings.unit = settings.unit === 'imperial' ? 'metric' : 'imperial';
  saveData();
  renderMeasurements();
  showToast(settings.unit === 'imperial' ? 'Displaying in imperial (in/lb)' : 'Displaying in metric (cm/kg)');
}

/* ============================================================
   INIT & EVENT BINDING
   ============================================================ */
function init() {
  loadData();

  // Apply saved theme + accent color on startup
  applyTheme();
  if (settings.accentColor) {
    const rgb = hexToRgb(settings.accentColor);
    const brightRgb = lighten(rgb, 0.18);
    const root = document.documentElement;
    root.style.setProperty('--c-accent', settings.accentColor);
    root.style.setProperty('--c-accent-bright', rgbToHex(brightRgb));
    root.style.setProperty('--c-accent-glow', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.35)`);
    root.style.setProperty('--c-accent-soft', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.08)`);
    root.style.setProperty('--c-success', rgbToHex(brightRgb));
  }

  // Welcome flow
  const welcomeInput = document.getElementById('welcome-name');
  const welcomeContinue = document.getElementById('btn-welcome-continue');
  welcomeContinue.addEventListener('click', () => {
    const name = welcomeInput.value.trim();
    if (!name) { showToast('Enter your name', 'warn'); welcomeInput.focus(); return; }
    profile = { name, createdAt: todayStr() };
    saveProfile();
    hideWelcome();
    renderDashboard();
    renderProfile();
    showToast(`Welcome, ${name}`);
  });
  welcomeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') welcomeContinue.click();
  });

  // Bottom nav
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.getAttribute('data-view');
      if (active && (active.phase === 'set-running' || active.phase === 'rest' || active.phase === 'cindy-running')) {
        // allow but warn
        if (target !== 'home') {
          showModal(`
            <div class="modal-title">Workout in progress</div>
            <div class="modal-text">You have a workout running. Leaving it will pause your timers but keep your progress. Resume from the Home tab anytime.</div>
            <div class="modal-actions">
              <button class="btn-primary" id="modal-leave-ok">OK</button>
            </div>
          `);
          document.getElementById('modal-leave-ok').addEventListener('click', closeModal);
        }
      }
      switchView(target);
    });
  });

  // Day view back
  document.getElementById('btn-day-back').addEventListener('click', () => switchView('home'));

  // Workout back
  document.getElementById('btn-workout-back').addEventListener('click', () => {
    if (active) {
      showModal(`
        <div class="modal-title">Leave workout?</div>
        <div class="modal-text">Your progress is saved automatically. You can resume from the Home tab.</div>
        <div class="modal-actions">
          <button class="btn-primary secondary" id="modal-leave-cancel">Stay</button>
          <button class="btn-primary" id="modal-leave-confirm">Leave</button>
        </div>
      `);
      document.getElementById('modal-leave-cancel').addEventListener('click', closeModal);
      document.getElementById('modal-leave-confirm').addEventListener('click', () => {
        closeModal();
        clearAllTimers();
        switchView('home');
      });
    } else {
      switchView('home');
    }
  });

  // Pause button
  document.getElementById('btn-pause-workout').addEventListener('click', togglePauseWorkout);

  // Start workout buttons
  document.getElementById('btn-start-today').addEventListener('click', () => {
    if (currentDayKey && currentDayKey !== todayWeekday()) {
      startWorkout(currentDayKey);
    } else {
      startWorkout(todayWeekday());
    }
  });
  document.getElementById('btn-start-workout').addEventListener('click', () => {
    if (currentDayKey) startWorkout(currentDayKey);
  });

  // Completion done
  document.getElementById('btn-completion-done').addEventListener('click', () => switchView('home'));

  // Plan editor
  document.getElementById('plan-edit-workout-name').addEventListener('change', (e) => {
    const day = findDayInPlan(planEditDay);
    if (day) { day.workoutName = e.target.value; }
  });
  document.getElementById('btn-plan-add-exercise').addEventListener('click', () => {
    const day = findDayInPlan(planEditDay);
    if (!day || day.type === 'cindy' || day.type === 'rest') return;
    const newId = 'ex' + Date.now();
    day.exercises.push({ id: newId, name: 'New Exercise', sets: 3, restSeconds: 90, type: 'strength', note: '' });
    renderPlan();
    showToast('Exercise added');
  });
  document.getElementById('btn-plan-save').addEventListener('click', () => {
    savePlan();
    showToast('✓ Workout plan saved');
    renderDashboard();
  });
  document.getElementById('btn-plan-download').addEventListener('click', exportPlanOnly);
  document.getElementById('btn-plan-import').addEventListener('click', () => {
    document.getElementById('file-plan-import').click();
  });
  document.getElementById('file-plan-import').addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) importPlanJson(file);
    e.target.value = '';
  });
  document.getElementById('btn-plan-paste').addEventListener('click', openPasteJsonModal);
  document.getElementById('btn-ask-ai').addEventListener('click', copyAiPrompt);
  document.getElementById('btn-download-template').addEventListener('click', downloadTemplate);

  // Profile
  document.getElementById('btn-edit-name').addEventListener('click', editName);
  document.getElementById('toggle-sound').addEventListener('click', () => {
    settings.soundEnabled = !settings.soundEnabled;
    saveSettings();
    renderProfile();
    if (settings.soundEnabled) { initAudio(); playBeep(880, 100); }
  });
  document.getElementById('toggle-vibrate').addEventListener('click', () => {
    settings.vibrateEnabled = !settings.vibrateEnabled;
    saveSettings();
    renderProfile();
    if (settings.vibrateEnabled) vibrate(100);
  });

  // Theme toggle (dark / light)
  document.getElementById('toggle-theme').addEventListener('click', () => {
    settings.theme = settings.theme === 'light' ? 'dark' : 'light';
    saveSettings();
    applyTheme();
    renderProfile();
    showToast(settings.theme === 'light' ? 'Light mode' : 'Dark mode');
  });

  // Color swatches
  document.querySelectorAll('.color-swatch').forEach(swatch => {
    swatch.addEventListener('click', () => {
      const color = swatch.getAttribute('data-color');
      setAccentColor(color);
    });
  });
  // Custom color picker
  document.getElementById('custom-color').addEventListener('input', (e) => {
    setAccentColor(e.target.value);
  });

  // PWA install
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    document.getElementById('install-row').style.display = 'flex';
    showToast('Install TEMPO from Profile', 'warn');
  });
  document.getElementById('btn-install-app').addEventListener('click', async () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      const choice = await deferredInstallPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        showToast('✓ TEMPO installed');
      }
      deferredInstallPrompt = null;
      document.getElementById('install-row').style.display = 'none';
    } else {
      showToast('Use browser menu → Install / Add to Home Screen', 'warn');
    }
  });
  window.addEventListener('appinstalled', () => {
    document.getElementById('install-row').style.display = 'none';
    showToast('✓ TEMPO installed');
  });

  // Data management
  document.getElementById('btn-export-all').addEventListener('click', exportAllData);
  document.getElementById('btn-import-all').addEventListener('click', () => {
    document.getElementById('file-import-all').click();
  });
  document.getElementById('file-import-all').addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) importAllData(file);
    e.target.value = '';
  });
  document.getElementById('btn-reset-app').addEventListener('click', resetApplication);

  // Top-bar sound toggle removed — sound toggle lives in Profile settings card

  // Music player
  loadMusicData();
  primeYouTubePlayer();
  document.getElementById('btn-toggle-video').querySelector('#video-toggle-label').textContent = 'Video Off';
  document.getElementById('btn-music-top').addEventListener('click', openMusicPanel);
  document.getElementById('btn-close-music').addEventListener('click', closeMusicPanel);
  document.getElementById('btn-music-play').addEventListener('click', togglePlayPause);
  document.getElementById('btn-music-next').addEventListener('click', playNextTrack);
  document.getElementById('btn-music-prev').addEventListener('click', playPrevTrack);
  document.getElementById('btn-toggle-video').addEventListener('click', toggleVideo);
  window.addEventListener('resize', positionYouTubePlayer);
  window.addEventListener('scroll', positionYouTubePlayer, true);

  // Video library (warmup / cooldown)
  document.getElementById('btn-video-top').addEventListener('click', openVideoPanel);
  document.getElementById('btn-close-video-panel').addEventListener('click', closeVideoPanel);
  document.getElementById('video-panel').addEventListener('click', (e) => {
    if (e.target.id === 'video-panel') closeVideoPanel();
  });
  document.querySelectorAll('.video-cat-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      setVideoCategory(tab.getAttribute('data-cat'));
    });
  });
  document.getElementById('btn-video-add').addEventListener('click', addVideoFromFile);
  document.getElementById('file-video-add').addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) handleVideoFilePicked(file);
    e.target.value = '';
  });
  document.getElementById('video-add-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      addVideoFromFile();
    }
  });
  document.getElementById('btn-close-video-player').addEventListener('click', closeVideoPlayer);
  document.getElementById('video-player-modal').addEventListener('click', (e) => {
    if (e.target.id === 'video-player-modal') closeVideoPlayer();
  });
  // Initialize the video library DB in the background so the panel is ready when opened
  // (also creates the `photos` store used by the Measurements tab)
  openVideoDb().catch(err => console.warn('video db init fail', err));

  // Measurements tab
  document.getElementById('btn-measure-unit-toggle').addEventListener('click', toggleMeasurementUnit);
  document.getElementById('btn-log-measurement').addEventListener('click', openMeasurementEntryForm);
  document.getElementById('btn-add-progress-photo').addEventListener('click', addProgressPhoto);
  document.getElementById('file-progress-photo').addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) handleProgressPhotoPicked(file);
    e.target.value = '';
  });
  document.getElementById('btn-export-measure-template').addEventListener('click', exportMeasurementTemplate);
  document.getElementById('btn-import-measure-template').addEventListener('click', importMeasurementTemplate);

  document.getElementById('btn-music-add').addEventListener('click', () => {
    const input = document.getElementById('music-add-input');
    addTrack(input.value);
    input.value = '';
  });
  document.getElementById('music-add-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      addTrack(e.target.value);
      e.target.value = '';
    }
  });
  document.getElementById('music-panel').addEventListener('click', (e) => {
    if (e.target.id === 'music-panel') closeMusicPanel();
  });
  document.getElementById('music-mini-bar').addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    openMusicPanel();
  });
  document.getElementById('mini-play-toggle').addEventListener('click', (e) => {
    e.stopPropagation();
    togglePlayPause();
  });
  document.getElementById('mini-close').addEventListener('click', (e) => {
    e.stopPropagation();
    closeMiniBar();
  });
  // Initial music UI render (in case panel is opened later)
  updateMusicUI();

  // Listen for storage events (other tabs) — single unified `tempo_data` key.
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) {
      loadData();
      if (currentView === 'home') renderDashboard();
      if (currentView === 'history') renderHistory();
      if (currentView === 'plan') renderPlan();
      if (currentView === 'measurements') renderMeasurements();
      if (currentView === 'profile') renderProfile();
      updateMusicUI();
    }
  });

  // Resume if active workout exists at startup
  if (active) {
    if (!profile) {
      // shouldn't happen, but safety
      showWelcome();
      return;
    }
    showApp();
    // Auto-prompt resume on dashboard via renderDashboard
  } else {
    if (profile) showApp();
    else showWelcome();
  }
}

document.addEventListener('DOMContentLoaded', init);
