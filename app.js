
---

# 2. 確定版 app.js

```js
const STORAGE_KEY = "relative-alert-v01";
const ACTIVE_KEY = "relative-alert-active-v01";

const els = {
  baseTime: document.getElementById("baseTime"),
  setNowBtn: document.getElementById("setNowBtn"),
  presetSelect: document.getElementById("presetSelect"),
  previewBtn: document.getElementById("previewBtn"),
  previewList: document.getElementById("previewList"),
  requestPermBtn: document.getElementById("requestPermBtn"),
  test10Btn: document.getElementById("test10Btn"),
  test20Btn: document.getElementById("test20Btn"),
  test30Btn: document.getElementById("test30Btn"),
  activeList: document.getElementById("activeList"),
  cancelAllBtn: document.getElementById("cancelAllBtn"),
  status: document.getElementById("status")
};

const state = { timers: [] };

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
  return `fallback-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
  } catch (_) {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function saveState() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      baseTime: els.baseTime.value.trim(),
      presetId: els.presetSelect.value
    })
  );
}

function clearUnrecoverableActive() {
  const raw = localStorage.getItem(ACTIVE_KEY);
  if (!raw) return;

  try {
    const saved = JSON.parse(raw);

    if (Array.isArray(saved) && saved.length > 0) {
      localStorage.removeItem(ACTIVE_KEY);
      setStatus("再読み込み後の通知復元は v0.1 では未対応です。保存済み予定をクリアしました。");
    }
  } catch (_) {
    localStorage.removeItem(ACTIVE_KEY);
  }
}

function getSelectedPreset() {
  return window.RELATIVE_PRESETS.find((p) => p.id === els.presetSelect.value);
}

function buildCalculatedAlerts() {
  const parsed = parseTimeInput(els.baseTime.value);
  if (!parsed) {
    return { error: "時刻形式は HH:mm です（例 08:20, 9:05）。" };
  }

  const preset = getSelectedPreset();
  if (!preset) {
    return { error: "プリセットを選択してください。" };
  }

  const baseDate = resolveBaseDate(parsed.hh, parsed.mm);

  const items = preset.alerts
    .map((a) => {
      const t = new Date(baseDate.getTime() + a.offsetMinutes * 60000);
      return { ...a, at: t, timestamp: t.getTime() };
    })
    .sort((a, b) => a.timestamp - b.timestamp);

  return { baseDate, items };
}

function renderPreview() {
  const calc = buildCalculatedAlerts();
  els.previewList.innerHTML = "";

  if (calc.error) {
    setStatus(calc.error);
    return;
  }

  calc.items.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = `${formatDateTime(item.at)} (${item.offsetMinutes}分): ${item.message}`;
    els.previewList.appendChild(li);
  });

  setStatus(`基準: ${formatDateTime(calc.baseDate)} / ${calc.items.length}件`);
  saveState();
}

async function ensureNotificationPermission() {
  if (!("Notification" in window)) {
    setStatus("このブラウザは Notification API 非対応です。");
    return false;
  }

  if (Notification.permission === "granted") return true;

  const p = await Notification.requestPermission();
  setStatus(`通知権限: ${p}`);

  return p === "granted";
}

function fallbackNotification(message) {
  if (Notification.permission !== "granted") {
    setStatus("通知権限が許可されていません。");
    return;
  }

  try {
    new Notification("相対アラート", { body: message });
  } catch (_) {
    setStatus("通知表示に失敗しました。");
  }
}

function showNotification(message) {
  if (navigator.serviceWorker) {
    navigator.serviceWorker.ready
      .then((reg) => reg.showNotification("相対アラート", { body: message }))
      .catch(() => {
        fallbackNotification(message);
      });
    return;
  }

  fallbackNotification(message);
}

function scheduleTest(seconds) {
  ensureNotificationPermission().then((ok) => {
    if (!ok) return;

    const id = createId();
    const fireAt = Date.now() + seconds * 1000;

    const timerId = setTimeout(() => {
      showNotification(`${seconds}秒テスト通知`);
      removeActive(id);
    }, seconds * 1000);

    state.timers.push({
      id,
      timerId,
      fireAt,
      message: `${seconds}秒テスト通知`
    });

    persistActive();
    renderActive();
    setStatus(`${seconds}秒後のテスト通知をセットしました。`);
  });
}

function persistActive() {
  localStorage.setItem(
    ACTIVE_KEY,
    JSON.stringify(
      state.timers.map((t) => ({
        id: t.id,
        fireAt: t.fireAt,
        message: t.message
      }))
    )
  );
}

function removeActive(id) {
  state.timers = state.timers.filter((t) => t.id !== id);
  persistActive();
  renderActive();
}

function cancelAll() {
  state.timers.forEach((t) => clearTimeout(t.timerId));
  state.timers = [];
  persistActive();
  renderActive();
  setStatus("すべてキャンセルしました。");
}

function renderActive() {
  els.activeList.innerHTML = "";

  if (!state.timers.length) {
    const li = document.createElement("li");
    li.textContent = "現在セット中の通知はありません。";
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

function boot() {
  populatePresets();
  loadState();
  clearUnrecoverableActive();

  if (!els.presetSelect.value && window.RELATIVE_PRESETS[0]) {
    els.presetSelect.value = window.RELATIVE_PRESETS[0].id;
  }

  renderActive();

  els.setNowBtn.addEventListener("click", () => {
    const n = new Date();
    els.baseTime.value = `${pad2(n.getHours())}:${pad2(n.getMinutes())}`;
    saveState();
    renderPreview();
  });

  els.previewBtn.addEventListener("click", renderPreview);
  els.requestPermBtn.addEventListener("click", ensureNotificationPermission);
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
