/* MediCare+ — all data is kept in this browser's localStorage. */
(() => {
  "use strict";

  const KEY = "medicare_plus_v1";
  const $ = (id) => document.getElementById(id);

  // ---------- State ----------
  const defaults = {
    patient: "",
    unit: "C",
    bp: [],      // {id, t (ms), sys, dia}
    temp: [],    // {id, t (ms), c}
    meds: [],    // {id, name, dose, time "HH:MM"}
    taken: {},   // { "YYYY-MM-DD": { medId: true } }
    notified: {} // { "YYYY-MM-DD": { medId: true } }
  };
  let state = load();
  let range = "7";
  let histType = "bp";

  function load() {
    try {
      return Object.assign({}, defaults, JSON.parse(localStorage.getItem(KEY)) || {});
    } catch { return { ...defaults }; }
  }
  function save() { localStorage.setItem(KEY, JSON.stringify(state)); }
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  // ---------- Helpers ----------
  const pad = (n) => String(n).padStart(2, "0");
  const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const localInput = (d = new Date()) => `${dayKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const fmtDate = (ms) => new Date(ms).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  const cToF = (c) => c * 9 / 5 + 32;
  const fToC = (f) => (f - 32) * 5 / 9;
  const fmtTime12 = (hhmm) => {
    const [h, m] = hhmm.split(":").map(Number);
    return `${h % 12 || 12}:${pad(m)} ${h >= 12 ? "PM" : "AM"}`;
  };
  const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function toast(msg, alert = false) {
    const el = document.createElement("div");
    el.className = "toast" + (alert ? " alert" : "");
    el.textContent = msg;
    $("toasts").appendChild(el);
    setTimeout(() => el.remove(), alert ? 9000 : 4000);
  }

  // ---------- Categories ----------
  function bpCategory(sys, dia) {
    if (sys > 180 || dia > 120) return { label: "Hypertensive crisis", cls: "bad" };
    if (sys >= 140 || dia >= 90) return { label: "High (Stage 2)", cls: "bad" };
    if (sys >= 130 || dia >= 80) return { label: "High (Stage 1)", cls: "warn" };
    if (sys >= 120 && dia < 80) return { label: "Elevated", cls: "warn" };
    if (sys < 90 || dia < 60) return { label: "Low", cls: "warn" };
    return { label: "Normal", cls: "ok" };
  }
  function tempCategory(c) {
    if (c < 35) return { label: "Low", cls: "warn" };
    if (c <= 37.5) return { label: "Normal", cls: "ok" };
    if (c < 38) return { label: "Slightly raised", cls: "warn" };
    if (c < 40) return { label: "Fever", cls: "bad" };
    return { label: "High fever", cls: "bad" };
  }
  function setBadge(el, cat) {
    el.className = "badge " + cat.cls;
    el.textContent = cat.label;
  }

  // ---------- Patient ----------
  function renderPatient() {
    const name = state.patient || "Patient";
    $("patientBtn").textContent = state.patient ? state.patient : "Add patient";
    $("patientLine").textContent = state.patient ? `Patient record · ${name}` : "Patient record";
  }
  $("patientBtn").addEventListener("click", () => {
    const n = prompt("Patient name:", state.patient);
    if (n !== null) { state.patient = n.trim(); save(); renderPatient(); }
  });

  // ---------- Vitals forms ----------
  $("bpTime").value = localInput();
  $("tempTime").value = localInput();

  function updateBpBadge() {
    const s = +$("sys").value, d = +$("dia").value;
    if (s && d) setBadge($("bpCategory"), bpCategory(s, d));
    else { $("bpCategory").className = "badge"; $("bpCategory").textContent = "Category appears as you type"; }
  }
  $("sys").addEventListener("input", updateBpBadge);
  $("dia").addEventListener("input", updateBpBadge);

  $("bpForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const sys = +$("sys").value, dia = +$("dia").value;
    if (sys <= dia) return toast("Systolic should be higher than diastolic.", true);
    state.bp.push({ id: uid(), t: new Date($("bpTime").value).getTime(), sys, dia });
    save();
    e.target.reset();
    $("bpTime").value = localInput();
    updateBpBadge();
    toast("Blood pressure saved.");
    renderAll();
  });

  function applyUnit() {
    $("unitC").classList.toggle("active", state.unit === "C");
    $("unitF").classList.toggle("active", state.unit === "F");
    $("tempRange").textContent = state.unit === "C" ? "25–45 °C" : "77–113 °F";
    $("temp").min = state.unit === "C" ? 25 : 77;
    $("temp").max = state.unit === "C" ? 45 : 113;
    $("temp").placeholder = state.unit === "C" ? "36.6" : "98.0";
  }
  $("unitC").addEventListener("click", () => { state.unit = "C"; save(); applyUnit(); renderAll(); });
  $("unitF").addEventListener("click", () => { state.unit = "F"; save(); applyUnit(); renderAll(); });

  function currentTempC() {
    const v = parseFloat($("temp").value);
    if (isNaN(v)) return null;
    return state.unit === "C" ? v : fToC(v);
  }
  $("temp").addEventListener("input", () => {
    const c = currentTempC();
    if (c === null) { $("tempCategory").className = "badge"; $("tempCategory").textContent = "Category appears as you type"; }
    else setBadge($("tempCategory"), tempCategory(c));
  });

  $("tempForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const c = currentTempC();
    if (c === null || c < 25 || c > 45) return toast("Temperature is out of the allowed range.", true);
    state.temp.push({ id: uid(), t: new Date($("tempTime").value).getTime(), c: Math.round(c * 10) / 10 });
    save();
    e.target.reset();
    $("tempTime").value = localInput();
    $("tempCategory").className = "badge";
    $("tempCategory").textContent = "Category appears as you type";
    toast("Temperature saved.");
    renderAll();
  });

  const showTemp = (c) => state.unit === "C" ? `${c.toFixed(1)} °C` : `${cToF(c).toFixed(1)} °F`;

  // ---------- Medicines ----------
  document.querySelectorAll(".slots button").forEach((b) =>
    b.addEventListener("click", () => { $("medTime").value = b.dataset.time; })
  );

  $("medForm").addEventListener("submit", (e) => {
    e.preventDefault();
    state.meds.push({
      id: uid(),
      name: $("medName").value.trim(),
      dose: $("medDose").value.trim(),
      time: $("medTime").value
    });
    state.meds.sort((a, b) => a.time.localeCompare(b.time));
    save();
    e.target.reset();
    $("medTime").value = "08:00";
    toast("Medicine added to schedule.");
    renderAll();
  });

  function isTaken(id) { return !!(state.taken[dayKey()] && state.taken[dayKey()][id]); }

  function renderMeds() {
    const list = $("medList");
    if (!state.meds.length) {
      list.innerHTML = '<li class="empty">No medicines yet. Add one to get started.</li>';
      return;
    }
    list.innerHTML = state.meds.map((m) => `
      <li class="${isTaken(m.id) ? "done" : ""}">
        <span class="time">${fmtTime12(m.time)}</span>
        <div class="info"><strong>${escapeHtml(m.name)}</strong><span>${escapeHtml(m.dose || "No dose set")}</span></div>
        ${isTaken(m.id)
          ? `<button data-undo="${m.id}">Undo</button>`
          : `<button class="take" data-take="${m.id}">Mark taken</button>`}
        <button class="del" data-del="${m.id}" title="Remove">✕</button>
      </li>`).join("");
  }

  $("medList").addEventListener("click", (e) => {
    const t = e.target;
    const k = dayKey();
    if (t.dataset.take) {
      (state.taken[k] ||= {})[t.dataset.take] = true;
    } else if (t.dataset.undo) {
      if (state.taken[k]) delete state.taken[k][t.dataset.undo];
    } else if (t.dataset.del) {
      if (!confirm("Remove this medicine?")) return;
      state.meds = state.meds.filter((m) => m.id !== t.dataset.del);
    } else return;
    save();
    renderAll();
  });

  // ---------- Overview ----------
  function renderOverview() {
    const total = state.meds.length;
    const done = state.meds.filter((m) => isTaken(m.id)).length;
    $("dosesTaken").textContent = `${done} / ${total}`;
    $("dosesBar").style.width = total ? `${(done / total) * 100}%` : "0";

    const now = new Date();
    const nowStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const pending = state.meds.filter((m) => !isTaken(m.id));
    const upcoming = pending.find((m) => m.time >= nowStr) || pending[0];
    if (upcoming) {
      $("nextDose").textContent = fmtTime12(upcoming.time);
      $("nextDoseSub").textContent = `${upcoming.name}${upcoming.dose ? " · " + upcoming.dose : ""}`;
    } else {
      $("nextDose").textContent = total ? "All done" : "—";
      $("nextDoseSub").textContent = total ? "Every dose taken today" : "No medicines scheduled";
    }

    const lastBP = [...state.bp].sort((a, b) => b.t - a.t)[0];
    if (lastBP) {
      $("latestBP").textContent = `${lastBP.sys}/${lastBP.dia}`;
      $("latestBPSub").textContent = `${bpCategory(lastBP.sys, lastBP.dia).label} · ${fmtDate(lastBP.t)}`;
    } else { $("latestBP").textContent = "—"; $("latestBPSub").textContent = "No readings yet"; }

    const lastT = [...state.temp].sort((a, b) => b.t - a.t)[0];
    if (lastT) {
      $("latestTemp").textContent = showTemp(lastT.c);
      $("latestTempSub").textContent = `${tempCategory(lastT.c).label} · ${fmtDate(lastT.t)}`;
    } else { $("latestTemp").textContent = "—"; $("latestTempSub").textContent = "No readings yet"; }
  }

  // ---------- History ----------
  function filtered(arr) {
    const sorted = [...arr].sort((a, b) => a.t - b.t);
    if (range === "all") return sorted;
    const since = Date.now() - Number(range) * 86400000;
    return sorted.filter((r) => r.t >= since);
  }

  function renderHistory() {
    const rows = filtered(histType === "bp" ? state.bp : state.temp);
    const head = $("histHead"), body = $("histBody");

    if (histType === "bp") {
      head.innerHTML = "<tr><th>Date &amp; time</th><th>Systolic</th><th>Diastolic</th><th>Category</th><th></th></tr>";
      body.innerHTML = [...rows].reverse().map((r) => {
        const c = bpCategory(r.sys, r.dia);
        return `<tr><td>${fmtDate(r.t)}</td><td>${r.sys}</td><td>${r.dia}</td>
          <td><span class="badge ${c.cls}">${c.label}</span></td>
          <td><button class="chip" style="color:#c0392b;border-color:#dbe5e6;background:#fff" data-rm="${r.id}">Delete</button></td></tr>`;
      }).join("");
    } else {
      head.innerHTML = "<tr><th>Date &amp; time</th><th>Temperature</th><th>Category</th><th></th></tr>";
      body.innerHTML = [...rows].reverse().map((r) => {
        const c = tempCategory(r.c);
        return `<tr><td>${fmtDate(r.t)}</td><td>${showTemp(r.c)}</td>
          <td><span class="badge ${c.cls}">${c.label}</span></td>
          <td><button class="chip" style="color:#c0392b;border-color:#dbe5e6;background:#fff" data-rm="${r.id}">Delete</button></td></tr>`;
      }).join("");
    }
    $("chartEmpty").style.display = rows.length ? "none" : "block";
    drawChart(rows);
  }

  $("histBody").addEventListener("click", (e) => {
    const id = e.target.dataset.rm;
    if (!id) return;
    state.bp = state.bp.filter((r) => r.id !== id);
    state.temp = state.temp.filter((r) => r.id !== id);
    save(); renderAll();
  });

  document.querySelectorAll("#rangeSeg button").forEach((b) =>
    b.addEventListener("click", () => {
      range = b.dataset.range;
      document.querySelectorAll("#rangeSeg button").forEach((x) => x.classList.toggle("active", x === b));
      renderHistory();
    })
  );
  document.querySelectorAll("#typeSeg button").forEach((b) =>
    b.addEventListener("click", () => {
      histType = b.dataset.type;
      document.querySelectorAll("#typeSeg button").forEach((x) => x.classList.toggle("active", x === b));
      renderHistory();
    })
  );

  // Simple canvas line chart (no libraries)
  function drawChart(rows) {
    const cv = $("chart");
    const dpr = window.devicePixelRatio || 1;
    const W = cv.clientWidth, H = 260;
    cv.width = W * dpr; cv.height = H * dpr;
    const ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (!rows.length) return;

    const series = histType === "bp"
      ? [{ name: "Systolic", color: "#c0392b", vals: rows.map((r) => r.sys) },
         { name: "Diastolic", color: "#1f5f66", vals: rows.map((r) => r.dia) }]
      : [{ name: "Temperature", color: "#c98a12",
           vals: rows.map((r) => state.unit === "C" ? r.c : cToF(r.c)) }];

    const all = series.flatMap((s) => s.vals);
    let min = Math.min(...all), max = Math.max(...all);
    const padv = (max - min || 4) * 0.2;
    min -= padv; max += padv;

    const L = 44, R = 14, T = 16, B = 36;
    const x = (i) => rows.length === 1 ? (L + W - R) / 2 : L + (i / (rows.length - 1)) * (W - L - R);
    const y = (v) => T + (1 - (v - min) / (max - min)) * (H - T - B);

    ctx.font = "12px Segoe UI, sans-serif";
    ctx.fillStyle = "#627578"; ctx.strokeStyle = "#dbe5e6"; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const v = min + ((max - min) * i) / 4, yy = y(v);
      ctx.beginPath(); ctx.moveTo(L, yy); ctx.lineTo(W - R, yy); ctx.stroke();
      ctx.textAlign = "right"; ctx.fillText(v.toFixed(histType === "bp" ? 0 : 1), L - 6, yy + 4);
    }
    ctx.textAlign = "center";
    const step = Math.max(1, Math.ceil(rows.length / 6));
    rows.forEach((r, i) => {
      if (i % step === 0) {
        const d = new Date(r.t);
        ctx.fillText(`${d.getDate()}/${d.getMonth() + 1}`, x(i), H - 14);
      }
    });

    series.forEach((s) => {
      ctx.strokeStyle = s.color; ctx.fillStyle = s.color; ctx.lineWidth = 2.5;
      ctx.beginPath();
      s.vals.forEach((v, i) => (i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v))));
      ctx.stroke();
      s.vals.forEach((v, i) => { ctx.beginPath(); ctx.arc(x(i), y(v), 3.5, 0, Math.PI * 2); ctx.fill(); });
    });

    // Legend
    ctx.textAlign = "left";
    series.forEach((s, i) => {
      ctx.fillStyle = s.color; ctx.fillRect(L + i * 100, 2, 10, 10);
      ctx.fillStyle = "#627578"; ctx.fillText(s.name, L + i * 100 + 15, 12);
    });
  }
  window.addEventListener("resize", renderHistory);

  // ---------- Export / Clear ----------
  $("exportBtn").addEventListener("click", () => {
    const lines = ["type,date_time,value_1,value_2,category"];
    state.bp.forEach((r) => lines.push(`BP,${new Date(r.t).toISOString()},${r.sys},${r.dia},${bpCategory(r.sys, r.dia).label}`));
    state.temp.forEach((r) => lines.push(`Temperature,${new Date(r.t).toISOString()},${r.c},C,${tempCategory(r.c).label}`));
    if (lines.length === 1) return toast("Nothing to export yet.");
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `medicare-history-${dayKey()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  $("clearBtn").addEventListener("click", () => {
    if (!confirm("Delete all saved BP and temperature readings? This cannot be undone.")) return;
    state.bp = []; state.temp = [];
    save(); renderAll();
    toast("History cleared.");
  });

  // ---------- Reminders ----------
  function updateNotifBtn() {
    const b = $("notifBtn");
    if (!("Notification" in window)) { b.textContent = "Alerts (in-app)"; b.disabled = true; return; }
    b.textContent = Notification.permission === "granted" ? "Reminders on" : "Enable reminders";
  }
  $("notifBtn").addEventListener("click", async () => {
    if (!("Notification" in window)) return;
    await Notification.requestPermission();
    updateNotifBtn();
  });

  function checkReminders() {
    const now = new Date();
    const hhmm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const k = dayKey();
    // Drop old days
    Object.keys(state.notified).forEach((d) => { if (d !== k) delete state.notified[d]; });
    Object.keys(state.taken).forEach((d) => { if (d < dayKey(new Date(Date.now() - 60 * 86400000))) delete state.taken[d]; });

    state.meds.forEach((m) => {
      const already = state.notified[k] && state.notified[k][m.id];
      if (m.time <= hhmm && !isTaken(m.id) && !already && m.time === hhmm) {
        (state.notified[k] ||= {})[m.id] = true;
        save();
        const msg = `Time for ${m.name}${m.dose ? " (" + m.dose + ")" : ""}`;
        toast(msg, true);
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification("MediCare+ reminder", { body: msg });
        }
      }
    });
  }

  // ---------- Render ----------
  function renderAll() {
    renderPatient();
    renderOverview();
    renderMeds();
    renderHistory();
  }

  applyUnit();
  updateNotifBtn();
  renderAll();
  checkReminders();
  setInterval(() => { checkReminders(); renderOverview(); }, 20000);
})();
