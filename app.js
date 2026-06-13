const STORAGE_KEY = "relative-alarm-v03";
const DB_NAME = "relative-alarm-db";
const DB_VERSION = 1;
const SOUND_STORE = "sounds";
const CUSTOM_SOUND_KEY = "custom-alarm-sound";

const els = {
  baseTime: document.getElementById("baseTime"),
  setNowBtn: document.getElementById("setNowBtn"),
  presetSelect: document.getElementById("presetSelect"),
  previewBtn: document.getElementById("previewBtn"),
  schedulePreviewBtn: document.getElementById("schedulePreviewBtn"),
  previewList: document.getElementById("previewList"),
  alarmSoundSelect: document.getElementById("alarmSoundSelect"),
  customSoundFile: document.getElementById("customSoundFile"),
  customSoundName: document.getElementById("customSoundName"),
  enableSoundBtn: document.getElementById("enableSoundBtn"),
  stopSoundBtn: document.getElementById("stopSoundBtn"),
  test10Btn: document.getElementById("test10Btn"),
  test20Btn: document.getElementById("test20Btn"),
  test30Btn: document.getElementById("test30Btn"),
  activeList: document.getElementById("activeList"),
  cancelAllBtn: document.getElementById("cancelAllBtn"),
  status: document.getElementById("status")
};

const state = {
  timers: [],
  audioContext: null,
  ringing: null,
  customSoundUrl: null
};

function setStatus(msg) {
  els.status.textContent = msg;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `alarm-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function parseTimeInput(raw) {
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;

  const hh = Number(m[1]);
  const mm = Number(m[2]);

  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return { hh, mm };
}

function resolveBaseDate(hh, mm) {
  const now = new Date();
  const base = new Date(now);

  base.setSeconds(0, 0);
  base.setHours(hh, mm, 0, 0);

  if (base.getTime() < now.getTime()) {
    base.setDate(base.getDate() + 1);
  }

  return base;
}

function formatDateTime(d) {
  return `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;

  try {
    const saved = JSON.parse(raw);
    if (saved.baseTime) els.baseTime.value = saved.baseTime;
    if (saved.presetId) els.presetSelect.value = saved.presetId;
    if (saved.soundId) els.alarmSoundSelect.value = saved.soundId;
    if (saved.customSoundName) els.customSoundName.textContent = saved.customSoundName;
  } catch (_) {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function saveState() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      baseTime: els.baseTime.value.trim(),
      presetId: els.presetSelect.value,
      soundId: els.alarmSoundSelect.value,
      customSoundName: els.customSoundName.textContent
    })
  );
}

function getSelectedPreset() {
  return window.RELATIVE_PRESETS.find((p) => p.id === els.presetSelect.value);
}

function getPresetItems(preset) {
  return preset.alarms || preset.alerts || [];
}

function buildCalculatedAlarms() {
  const parsed = parseTimeInput(els.baseTime.value);
  if (!parsed) {
    return { error: "時刻形式は HH:mm です（例 08:20, 9:05）。" };
  }

  const preset = getSelectedPreset();
  if (!preset) {
    return { error: "プリセットを選択してください。" };
  }

  const baseDate = resolveBaseDate(parsed.hh, parsed.mm);
  const items = getPresetItems(preset)
    .map((item) => {
      const at = new Date(baseDate.getTime() + item.offsetMinutes * 60000);
      return { ...item, at, timestamp: at.getTime() };
    })
    .sort((a, b) => a.timestamp - b.timestamp);

  return { baseDate, items };
}

function renderPreview() {
  const calc = buildCalculatedAlarms();
  els.previewList.innerHTML = "";

  if (calc.error) {
    setStatus(calc.error);
    return null;
  }

  calc.items.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = `${formatDateTime(item.at)} (${item.offsetMinutes}分): ${item.message}`;
    els.previewList.appendChild(li);
  });

  setStatus(`基準: ${formatDateTime(calc.baseDate)} / ${calc.items.length}件`);
  saveState();
  return calc;
}

function openSoundDb() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB unavailable"));
      return;
    }

    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(SOUND_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveCustomSound(file) {
  const db = await openSoundDb();

  await new Promise((resolve, reject) => {
    const tx = db.transaction(SOUND_STORE, "readwrite");
    tx.objectStore(SOUND_STORE).put(
      {
        blob: file,
        name: file.name,
        type: file.type,
        updatedAt: Date.now()
      },
      CUSTOM_SOUND_KEY
    );
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });

  db.close();
}

async function loadCustomSound() {
  const db = await openSoundDb();

  const record = await new Promise((resolve, reject) => {
    const tx = db.transaction(SOUND_STORE, "readonly");
    const req = tx.objectStore(SOUND_STORE).get(CUSTOM_SOUND_KEY);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });

  db.close();
  return record;
}

async function handleCustomSoundPicked() {
  const file = els.customSoundFile.files?.[0];
  if (!file) return;

  try {
    await saveCustomSound(file);
    els.customSoundName.textContent = file.name;
    els.alarmSoundSelect.value = "custom";
    saveState();
    setStatus("スマホ内の音声ファイルをアラーム音に設定しました。");
  } catch (_) {
    setStatus("音声ファイルの保存に失敗しました。別の音を選んでください。");
  }
}

async function ensureAudioContext() {
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) {
    setStatus("このブラウザは音声再生に対応していません。");
    return null;
  }

  if (!state.audioContext) {
    state.audioContext = new AudioCtor();
  }

  if (state.audioContext.state === "suspended") {
    await state.audioContext.resume();
  }

  return state.audioContext;
}

async function enableSound() {
  const ok = await playSelectedSoundPreview();
  if (!ok) return false;

  setStatus("音を有効化しました。選択中の音が短く鳴っていれば準備OKです。");
  return true;
}

async function playSelectedSoundPreview() {
  if (els.alarmSoundSelect.value === "custom") {
    const played = await playCustomSound({ preview: true });
    if (played) return true;
    setStatus("選択した音声ファイルを読み込めません。内蔵音に戻します。");
    els.alarmSoundSelect.value = "classic";
  }

  const ctx = await ensureAudioContext();
  if (!ctx) return false;

  playBuiltInPattern(ctx, els.alarmSoundSelect.value, { preview: true });
  return true;
}

function playBuiltInPattern(ctx, soundId, options = {}) {
  const preview = Boolean(options.preview);
  const gain = ctx.createGain();
  const frequencies = soundId === "urgent" ? [880, 1175] : soundId === "slow" ? [440, 660] : [660, 880];
  const pulseMs = soundId === "slow" ? 760 : soundId === "urgent" ? 280 : 420;
  const maxGain = soundId === "urgent" ? 0.24 : 0.18;

  gain.gain.value = 0.0001;
  gain.connect(ctx.destination);

  const oscillators = frequencies.map((freq) => {
    const osc = ctx.createOscillator();
    osc.type = soundId === "slow" ? "sine" : "square";
    osc.frequency.value = freq;
    osc.connect(gain);
    osc.start();
    return osc;
  });

  let on = false;
  const pulse = window.setInterval(() => {
    on = !on;
    const t = ctx.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setTargetAtTime(on ? maxGain : 0.0001, t, 0.03);
  }, pulseMs);

  if (preview) {
    window.setTimeout(() => {
      stopBuiltInSound({ gain, oscillators, pulse });
    }, 1600);
    return null;
  }

  return { type: "built-in", gain, oscillators, pulse };
}

function stopBuiltInSound(sound) {
  window.clearInterval(sound.pulse);
  sound.oscillators.forEach((osc) => {
    try {
      osc.stop();
      osc.disconnect();
    } catch (_) {}
  });
  sound.gain.disconnect();
}

async function playCustomSound(options = {}) {
  try {
    const record = await loadCustomSound();
    if (!record?.blob) return null;

    if (state.customSoundUrl) {
      URL.revokeObjectURL(state.customSoundUrl);
    }

    state.customSoundUrl = URL.createObjectURL(record.blob);
    const audio = new Audio(state.customSoundUrl);
    audio.loop = !options.preview;
    audio.volume = 1;

    await audio.play();

    if (options.preview) {
      window.setTimeout(() => {
        audio.pause();
        audio.currentTime = 0;
      }, 2200);
      return { type: "custom-preview", audio };
    }

    return { type: "custom", audio };
  } catch (_) {
    return null;
  }
}

async function startAlarmSound(message) {
  stopAlarmSound();

  let sound = null;
  if (els.alarmSoundSelect.value === "custom") {
    sound = await playCustomSound();
  }

  if (!sound) {
    const ctx = await ensureAudioContext();
    if (!ctx) return;
    sound = playBuiltInPattern(ctx, els.alarmSoundSelect.value);
  }

  state.ringing = sound;
  setStatus(`アラーム鳴動中: ${message}`);

  if ("vibrate" in navigator) {
    navigator.vibrate([400, 200, 400, 200, 800]);
  }
}

function stopAlarmSound() {
  if (!state.ringing) return;

  if (state.ringing.type === "custom") {
    state.ringing.audio.pause();
    state.ringing.audio.currentTime = 0;
  } else {
    stopBuiltInSound(state.ringing);
  }

  state.ringing = null;

  if ("vibrate" in navigator) {
    navigator.vibrate(0);
  }
}

function scheduleAlarmAt(timestamp, message) {
  const delay = timestamp - Date.now();
  if (delay < 0) return false;

  const id = createId();
  const timerId = window.setTimeout(() => {
    startAlarmSound(message);
    removeActive(id);
  }, delay);

  state.timers.push({ id, timerId, fireAt: timestamp, message });
  renderActive();
  return true;
}

async function scheduleTest(seconds) {
  const ok = await enableSound();
  if (!ok) return;

  const fireAt = Date.now() + seconds * 1000;
  scheduleAlarmAt(fireAt, `${seconds}秒テストアラーム`);
  setStatus(`${seconds}秒後のテストアラームをセットしました。鳴ったら停止ボタンで止めてください。`);
}

async function schedulePreviewAlarms() {
  const ok = await enableSound();
  if (!ok) return;

  const calc = renderPreview();
  if (!calc) return;

  let count = 0;
  calc.items.forEach((item) => {
    if (scheduleAlarmAt(item.timestamp, item.message)) {
      count += 1;
    }
  });

  setStatus(`${count}件のアラームをセットしました。ページを閉じずに待機してください。`);
}

function removeActive(id) {
  state.timers = state.timers.filter((t) => t.id !== id);
  renderActive();
}

function cancelAll() {
  state.timers.forEach((t) => window.clearTimeout(t.timerId));
  state.timers = [];
  stopAlarmSound();
  renderActive();
  setStatus("すべてキャンセルしました。");
}

function renderActive() {
  els.activeList.innerHTML = "";

  if (!state.timers.length) {
    const li = document.createElement("li");
    li.textContent = "現在セット中のアラームはありません。";
    els.activeList.appendChild(li);
    return;
  }

  [...state.timers]
    .sort((a, b) => a.fireAt - b.fireAt)
    .forEach((t) => {
      const li = document.createElement("li");
      li.textContent = `${formatDateTime(new Date(t.fireAt))}: ${t.message}`;
      els.activeList.appendChild(li);
    });
}

function populatePresets() {
  window.RELATIVE_PRESETS.forEach((p) => {
    const option = document.createElement("option");
    option.value = p.id;
    option.textContent = p.name;
    els.presetSelect.appendChild(option);
  });
}

function onBaseInputChanged() {
  saveState();

  if (els.baseTime.value.trim()) {
    renderPreview();
  }
}

function onPresetChanged() {
  saveState();

  if (els.baseTime.value.trim()) {
    renderPreview();
  }
}

async function showSavedCustomSoundName() {
  try {
    const record = await loadCustomSound();
    if (record?.name) {
      els.customSoundName.textContent = record.name;
    }
  } catch (_) {}
}

function boot() {
  populatePresets();
  loadState();
  showSavedCustomSoundName();

  if (!els.presetSelect.value && window.RELATIVE_PRESETS[0]) {
    els.presetSelect.value = window.RELATIVE_PRESETS[0].id;
  }

  renderActive();

  els.enableSoundBtn.addEventListener("click", enableSound);
  els.stopSoundBtn.addEventListener("click", () => {
    stopAlarmSound();
    setStatus("音を止めました。");
  });
  els.alarmSoundSelect.addEventListener("change", saveState);
  els.customSoundFile.addEventListener("change", handleCustomSoundPicked);

  els.setNowBtn.addEventListener("click", () => {
    const n = new Date();
    els.baseTime.value = `${pad2(n.getHours())}:${pad2(n.getMinutes())}`;
    saveState();
    renderPreview();
  });

  els.previewBtn.addEventListener("click", renderPreview);
  els.schedulePreviewBtn.addEventListener("click", schedulePreviewAlarms);
  els.test10Btn.addEventListener("click", () => scheduleTest(10));
  els.test20Btn.addEventListener("click", () => scheduleTest(20));
  els.test30Btn.addEventListener("click", () => scheduleTest(30));
  els.cancelAllBtn.addEventListener("click", cancelAll);
  els.baseTime.addEventListener("change", onBaseInputChanged);
  els.presetSelect.addEventListener("change", onPresetChanged);

  if (els.baseTime.value.trim()) {
    renderPreview();
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .register("./sw.js")
      .catch(() => setStatus("Service Worker 登録に失敗しました。"));
  }
}

boot();
