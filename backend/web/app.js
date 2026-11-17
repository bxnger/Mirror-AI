/* MIRROR AI · Future Self — single-page client for the Decision-to-Outcome loop. */
"use strict";

const $ = (sel, el = document) => el.querySelector(sel);
const state = {
  userId: null, health: null, twin: null, gap: null, scenarios: [], comparison: null,
  plans: [], checks: [], proposals: [], memory: null, loop: null, selected: new Set(),
};
const COLORS = ["var(--g1)", "var(--g2)", "var(--g3)", "var(--g4)", "var(--g5)"];
const DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const STAGE_ANCHOR = {
  understand: "#sec-twin", simulate: "#sec-whatif", decide: "#sec-whatif",
  execute: "#sec-plan", measure: "#sec-reality", adapt: "#sec-adapt",
};
const EVENT_RU = {
  goal_changed: "Изменение цели", skill_changed: "Изменение навыка", scenario_chosen: "Выбор сценария",
  plan_generated: "План создан", task_completed: "Задача выполнена", reality_check: "Reality Check",
  feedback: "Обратная связь", availability_changed: "Доступное время", scenario_created: "Сценарий создан",
  comparison_run: "Сравнение сценариев", proposal_resolved: "Решение по адаптации", milestone_completed: "Этап завершён",
};
const STATUS_RU = {
  open: ["Разрыв есть", "badge-future"], achieved: ["Достигнуто", "badge-ok"],
  no_current_data: ["Нет текущих данных", "badge-warn"], no_target: ["Нет цели", "badge-warn"],
};
const ADAPT_RU = {
  allocation_confirmed: "подтверждённое распределение", shorter_sessions: "короче занятия",
  carry_over: "перенос задач", pending_proposals: "есть неподтверждённые предложения",
};
const SOURCE_RU = { self_assessment: "самооценка", mock_test: "пробный тест", official_test: "официальный результат", demo: "DEMO" };

// ------------------------------------------------------------------ helpers
function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
const fmtH = (h) => `${Number(h).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ч`;
const fmtMin = (m) => {
  const h = Math.floor(m / 60), r = Math.round(m % 60);
  return h ? `${h} ч${r ? ` ${r} мин` : ""}` : `${r} мин`;
};
const pct = (x) => (x == null ? "—" : `${Math.round(x * 100)}%`);
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" }) : "—");

function goalColor(goalId) {
  const ids = (state.twin?.current_self.skills || []).map((s) => s.goal_id);
  const i = ids.indexOf(goalId);
  return COLORS[(i < 0 ? goalId : i) % COLORS.length];
}

function storage(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value);
  } catch { return null; }
  return null;
}

let toastTimer;
function toast(msg, error = false) {
  const t = $("#toast");
  t.textContent = msg;
  t.className = "toast" + (error ? " error" : "");
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), error ? 6000 : 3000);
}

async function api(method, path, body) {
  const res = await fetch("/api" + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = Array.isArray(data.detail) ? data.detail.map((d) => d.msg).join("; ") : data.detail;
    throw new Error(detail || `Ошибка ${res.status}`);
  }
  return data;
}

async function withBusy(btn, fn) {
  const label = btn?.innerHTML;
  if (btn) { btn.disabled = true; btn.innerHTML = `<span class="spinner"></span> ${label}`; }
  try { await fn(); } catch (e) { toast(e.message, true); } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = label; }
  }
}

// ------------------------------------------------------------------ data
async function loadAll() {
  const u = state.userId;
  const [twin, gap, scenarios, plans, checks, proposals, memory, loop] = await Promise.all([
    api("GET", `/users/${u}/twin`), api("GET", `/users/${u}/gap`), api("GET", `/users/${u}/scenarios`),
    api("GET", `/users/${u}/plans`), api("GET", `/users/${u}/reality-checks`), api("GET", `/users/${u}/proposals`),
    api("GET", `/users/${u}/memory?limit=150`), api("GET", `/users/${u}/loop`),
  ]);
  Object.assign(state, { twin, gap, scenarios, plans, checks, proposals, memory, loop });
  const compRef = loop.stages.find((s) => s.key === "simulate")?.ref;
  if (compRef && state.comparison?.id !== compRef) {
    state.comparison = await api("GET", `/users/${u}/comparisons/${compRef}`);
  } else if (!compRef) state.comparison = null;
  renderAll();
}

async function openUser(id) {
  state.userId = Number(id);
  state.selected = new Set();
  state.comparison = null;
  storage("mirror.user", String(id));
  history.replaceState(null, "", `?user=${id}`);
  await loadAll();
  $("#start").hidden = true;
  $("#workspace").hidden = false;
  $("#btn-exit").hidden = false;
}

// ------------------------------------------------------------------ render
function renderAll() {
  const demo = state.twin.user.is_demo;
  $("#demo-badge").hidden = !demo;
  $("#user-label").textContent = `${state.twin.user.name} · ID ${state.twin.user.id}`;
  renderLoop(); renderTwin(); renderGap(); renderScenarios(); renderScenarioForm(); renderComparison();
  renderPlan(); renderReality(); renderAdapt(); renderMemory();
}

function renderLoop() {
  const el = $("#loop");
  if (!state.loop) { el.innerHTML = ""; return; }
  el.innerHTML = state.loop.stages.map((s, i) => `
    ${i ? '<span class="arrow" aria-hidden="true">→</span>' : ""}
    <a href="${STAGE_ANCHOR[s.key]}" class="${s.done ? "done" : s.key === state.loop.next ? "next" : ""}">
      <span class="dot"></span>${i + 1}. ${esc(s.title)}</a>`).join("");
}

function stateText(item, which) {
  // which: "current" | "target"
  const v = which === "current" ? item.value : item.value;
  if (item.metric_type === "numeric") return v == null ? "—" : `${v} ${esc(item.unit || "")}`;
  if (item.metric_type === "level") return item.level ? esc(item.level.charAt(0).toUpperCase() + item.level.slice(1)) : "—";
  return "—";
}

function renderTwin() {
  const t = state.twin;
  const cs = t.current_self, fs = t.future_self;
  const targets = Object.fromEntries(fs.targets.map((x) => [x.goal_id, x]));
  const rows = cs.skills.map((s) => {
    const tg = targets[s.goal_id] || {};
    const msDone = (tg.milestones || []).filter((m) => m.done).length;
    return `<div class="twin-row">
      <div class="self-card current">
        <div class="goal-title"><span><i style="color:${goalColor(s.goal_id)}">●</i> ${esc(s.title)}</span>
          <span class="badge badge-current">факт</span></div>
        <div class="big">${stateText(s, "current")}</div>
        <div class="small muted">Источник: ${esc(SOURCE_RU[s.source] || s.source || "—")}${s.evidence ? " · " + esc(s.evidence) : ""}</div>
        <div class="small muted">Зафиксировано: ${fmtDate(s.recorded_at)}</div>
        ${skillHistory(s)}
        <button class="link-btn" data-toggle="f-cur-${s.goal_id}">Обновить факт</button>
        <form class="mini-form" id="f-cur-${s.goal_id}" data-form="current" data-goal="${s.goal_id}" hidden>
          ${valueInput(s, s.metric_type === "numeric" ? s.value : s.level)}
          <select name="source" aria-label="Источник">
            <option value="mock_test">Пробный тест</option><option value="official_test">Официальный результат</option>
            <option value="self_assessment">Самооценка</option><option value="teacher">Оценка преподавателя</option>
          </select>
          <input name="evidence" placeholder="Подтверждение (необязательно)" aria-label="Подтверждение">
          <button class="btn btn-sm btn-primary">Сохранить факт</button>
        </form>
      </div>
      <div class="self-card future">
        <div class="goal-title"><span>${esc(s.title)}</span><span class="badge badge-future">желаемое · приоритет ${tg.priority ?? "—"}</span></div>
        <div class="big">${tg.value != null || tg.level ? stateText({ ...tg, metric_type: s.metric_type, unit: s.unit }, "target") : "—"}</div>
        <div class="small muted">${esc(tg.desired_outcome || "")}</div>
        <div class="small muted">К дате: ${fmtDate(tg.target_date)} · этапов: ${msDone}/${(tg.milestones || []).length}</div>
        <button class="link-btn" data-toggle="f-tgt-${s.goal_id}">Изменить цель</button>
        <form class="mini-form" id="f-tgt-${s.goal_id}" data-form="target" data-goal="${s.goal_id}" hidden>
          ${valueInput(s, s.metric_type === "numeric" ? tg.value : tg.level)}
          <input name="target_date" type="date" value="${esc(tg.target_date || "")}" aria-label="Целевая дата">
          <label class="inline">Приоритет <input name="priority" type="number" min="1" max="5" value="${tg.priority ?? 3}"></label>
          <div class="small muted">Future Self меняется только по вашему решению — система этого не делает.</div>
          <button class="btn btn-sm btn-primary">Сохранить цель</button>
        </form>
      </div></div>`;
  }).join("");
  $("#twin").innerHTML = `
    <div class="facts">
      <div class="self-card current">
        <div class="goal-title">Current Self — факты <span class="badge badge-current">сейчас</span></div>
        <div><b>${fmtH(cs.weekly_hours_available ?? 0)}</b> свободного времени в неделю ·
          дни: ${(cs.study_days || []).map((d) => DAYS[d]).join(", ")} · занятие до ${cs.max_session_minutes} мин</div>
        ${cs.constraints.length ? `<ul class="small muted">${cs.constraints.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>` : ""}
        <div class="small muted">Выполнено задач: ${cs.completed_tasks} · ${fmtH(cs.completed_hours)} · достижений: ${cs.achievements.length}</div>
        <button class="link-btn" data-toggle="f-hours">Изменить доступное время</button>
        <form class="mini-form" id="f-hours" data-form="hours" hidden>
          <label class="inline">Часов в неделю <input name="hours" type="number" min="0" max="112" step="0.5" value="${cs.weekly_hours_available ?? 0}"></label>
          <button class="btn btn-sm btn-primary">Сохранить</button>
        </form>
      </div>
      <div class="self-card future">
        <div class="goal-title">Future Self — желаемое состояние <span class="badge badge-future">не прогноз</span></div>
        <div>${esc(fs.vision || "Видение не задано")}</div>
        ${fs.desired_achievements.length ? `<ul class="small muted">${fs.desired_achievements.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>` : ""}
        <div class="small muted">Горизонт: ${fmtDate(fs.horizon_date)}</div>
      </div>
    </div>
    <div class="twin-head">
      <div class="twin-col-title">Current Self</div><div class="twin-col-title">Future Self</div>
    </div>
    ${rows || '<div class="empty">Добавьте первую цель: текущее состояние и желаемое.</div>'}`;
}

const SCALES = {
  cefr: ["A1", "A2", "B1", "B2", "C1", "C2"],
  proficiency: ["none", "beginner", "elementary", "intermediate", "advanced", "expert"],
};

function valueInput(skill, current) {
  if (skill.metric_type === "numeric") {
    return `<input name="value" type="number" required value="${esc(current ?? "")}" aria-label="Значение">`;
  }
  const opts = SCALES[skill.scale] || [];
  return `<select name="level" aria-label="Уровень">${opts.map((l) =>
    `<option value="${l}" ${l === current ? "selected" : ""}>${l}</option>`).join("")}</select>`;
}

function skillHistory(skill) {
  const evs = (state.memory?.events || [])
    .filter((e) => e.event_type === "skill_changed" && e.goal_id === skill.goal_id && e.payload?.to)
    .reverse();
  if (evs.length < 2) return "";
  const v = (x) => (x.value ?? x.level);
  const chain = evs.map((e) => esc(v(e.payload.to))).join(" → ");
  return `<div class="small history">История факта: ${chain}</div>`;
}

function numericTrack(g) {
  const [lo, hi] = g.gap.scale || [Math.min(g.gap.current, g.gap.target) * 0.8, Math.max(g.gap.current, g.gap.target) * 1.1];
  const pos = (v) => Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100));
  const a = pos(g.gap.current), b = pos(g.gap.target);
  return `<div class="track" role="img" aria-label="Сейчас ${g.gap.current}, цель ${g.gap.target}">
    <div class="fill" style="left:${Math.min(a, b)}%;width:${Math.abs(b - a)}%"></div>
    <div class="marker current" style="left:${a}%"></div><div class="label current" style="left:${a}%">сейчас ${g.gap.current}</div>
    <div class="marker future" style="left:${b}%"></div><div class="label future" style="left:${b}%">цель ${g.gap.target}</div>
    <div class="tick" style="left:0">${lo}</div><div class="tick" style="right:0">${hi}</div>
  </div>`;
}

function levelChips(g) {
  const ci = g.gap.scale.indexOf(g.gap.current), ti = g.gap.scale.indexOf(g.gap.target);
  return `<div class="levels">${g.gap.scale.map((l, i) => {
    const cls = i === ci ? "current" : i === ti ? "future" : i > ci && i < ti ? "between" : "";
    return `<span class="${cls}">${esc(l)}</span>`;
  }).join("")}</div>`;
}

function renderGap() {
  const items = state.gap.goals.map((g) => {
    const [label, cls] = STATUS_RU[g.status] || [g.status, ""];
    let gapText = "—", visual = "";
    if (g.gap?.kind === "numeric") {
      gapText = `${g.gap.absolute > 0 ? "+" : ""}${g.gap.absolute} ${esc(g.unit || "")}`;
      if (g.gap.share_of_scale != null) gapText += ` <span class="muted small">(${pct(g.gap.share_of_scale)} шкалы)</span>`;
      visual = numericTrack(g);
    } else if (g.gap?.kind === "level") {
      gapText = g.gap.steps ? `${g.gap.steps} ур. · ${g.gap.path.map(esc).join(", ")}` : "уровень достигнут";
      visual = levelChips(g);
    } else if (g.gap?.kind === "milestones") {
      gapText = `${g.gap.remaining} из ${g.gap.total} этапов`;
    }
    const target = state.twin.future_self.targets.find((x) => x.goal_id === g.goal_id);
    const ms = (target?.milestones || []).map((m) =>
      `<button class="ms ${m.done ? "done" : ""}" data-ms="${m.id}" data-done="${m.done}" title="Отметить этап как факт">${esc(m.title)}</button>`).join("");
    const t = g.time || {};
    return `<div class="gap-item">
      <div class="gap-top">
        <div><b style="color:${goalColor(g.goal_id)}">●</b> <b>${esc(g.title)}</b> <span class="badge ${cls}">${label}</span></div>
        <div class="gap-value">Разрыв: ${gapText}</div>
      </div>
      ${visual}
      ${ms ? `<div class="small muted">Промежуточные этапы (Future Self), отметка — факт:</div><div class="ms-list">${ms}</div>` : ""}
      <div class="meta-row">
        <span>До цели: <b>${t.weeks_left ?? "—"}</b> нед.</span>
        <span>Выделено: <b>${t.allocated_hours_per_week != null ? fmtH(t.allocated_hours_per_week) + "/нед" : "сценарий не выбран"}</b></span>
        ${t.allocated_hours_until_target != null ? `<span>Запланировано до даты: <b>${fmtH(t.allocated_hours_until_target)}</b></span>` : ""}
      </div>
      ${g.next_actions.length ? `<ul class="notes">${g.next_actions.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>` : ""}
      <details><summary class="small">Допущения и недостающие данные</summary>
        <ul class="notes">${g.assumptions.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>
        ${g.missing_data.length ? `<ul class="notes missing">${g.missing_data.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>` : ""}
      </details>
    </div>`;
  }).join("");
  $("#gap").innerHTML = (items || '<div class="empty">Целей пока нет.</div>') +
    `<p class="disclaimer">${esc(state.gap.disclaimer)}</p>`;
}

function stackBar(allocations, available) {
  const total = allocations.reduce((s, a) => s + a.hours_per_week, 0);
  const base = Math.max(total, available || 0) || 1;
  const segs = allocations.filter((a) => a.hours_per_week > 0).map((a) =>
    `<div style="width:${(a.hours_per_week / base) * 100}%;background:${goalColor(a.goal_id)}" title="${esc(a.title)}: ${fmtH(a.hours_per_week)}">${a.hours_per_week}</div>`).join("");
  const free = available && total < available ? `<div class="free" style="width:${((available - total) / base) * 100}%">${+(available - total).toFixed(2)}</div>` : "";
  return `<div class="stack" role="img" aria-label="Распределение часов">${segs}${free}</div>`;
}

function legend() {
  return `<div class="legend">${state.twin.current_self.skills.map((s) =>
    `<span><i style="background:${goalColor(s.goal_id)}"></i>${esc(s.title)}</span>`).join("")}<span><i style="background:var(--surface-2)"></i>свободно</span></div>`;
}

function renderScenarios() {
  const avail = state.twin.current_self.weekly_hours_available;
  if (!state.selected.size) {
    state.scenarios.filter((s) => s.status !== "superseded").slice(0, 2).forEach((s) => state.selected.add(s.id));
  }
  const cards = state.scenarios.map((s) => {
    const st = s.status === "chosen" ? '<span class="badge badge-ok">выбран</span>'
      : s.status === "superseded" ? '<span class="badge">заменён</span>' : '<span class="badge">черновик</span>';
    return `<div class="scn ${s.status}">
      <div class="scn-head"><div><div class="scn-name">${esc(s.name)}</div>
        <div class="small muted">${esc(s.description || "")}</div></div>${st}</div>
      ${stackBar(s.allocations, avail)}
      <div class="small">${s.allocations.map((a) => `${esc(a.title)} ${fmtH(a.hours_per_week)}`).join(" · ")}</div>
      <div class="small muted">Итого ${fmtH(s.total_hours)} из ${fmtH(avail)}</div>
      <label class="small" style="flex-direction:row;align-items:center;gap:6px;color:var(--text)">
        <input type="checkbox" style="width:auto" data-select="${s.id}" ${state.selected.has(s.id) ? "checked" : ""}> в сравнение</label>
    </div>`;
  }).join("");
  $("#scenarios").innerHTML = state.scenarios.length
    ? `${legend()}<div class="scenario-grid" style="margin-top:10px">${cards}</div>
       <button id="btn-compare" class="btn btn-primary">Сравнить выбранные (${state.selected.size})</button>`
    : '<div class="empty">Сценариев пока нет — соберите первый ниже.</div>';
}

function renderScenarioForm() {
  const skills = state.twin.current_self.skills;
  const avail = state.twin.current_self.weekly_hours_available || 0;
  const max = Math.max(12, Math.ceil(avail));
  $("#scenario-form").innerHTML = skills.length ? `
    <label>Название<input name="name" required value="Сценарий ${String.fromCharCode(65 + state.scenarios.length)}"></label>
    ${skills.map((s) => `<div class="slider-row">
      <span><i style="color:${goalColor(s.goal_id)}">●</i> ${esc(s.title)}</span>
      <input type="range" min="0" max="${max}" step="0.5" value="${(avail / skills.length).toFixed(1) * 1}" data-goal="${s.goal_id}" aria-label="${esc(s.title)}, часов в неделю">
      <output>0 ч</output></div>`).join("")}
    <div class="total-line" id="sf-total"></div>
    <button class="btn btn-primary">Создать сценарий</button>` : '<div class="empty">Сначала добавьте цели.</div>';
  updateScenarioTotal();
}

function updateScenarioTotal() {
  const form = $("#scenario-form");
  const avail = state.twin?.current_self.weekly_hours_available || 0;
  let total = 0;
  form.querySelectorAll("input[type=range]").forEach((r) => {
    total += Number(r.value);
    r.nextElementSibling.textContent = fmtH(Number(r.value));
  });
  const el = $("#sf-total");
  if (el) {
    el.textContent = `Итого: ${fmtH(total)} из ${fmtH(avail)} · ${total > avail ? "превышает доступное время" : `запас ${fmtH(avail - total)}`}`;
    el.classList.toggle("over", total > avail);
  }
}

function renderComparison() {
  const c = state.comparison;
  if (!c) { $("#comparison").innerHTML = ""; return; }
  const sc = c.metrics.scenarios;
  const diffs = Object.fromEntries((c.metrics.comparison.diffs || []).map((d) => [d.scenario_id, d]));
  const goals = sc[0].allocations.map((r) => r.goal_id);
  const chosenId = state.scenarios.find((s) => s.status === "chosen")?.id;
  const cell = (m, gid) => {
    const r = m.allocations.find((x) => x.goal_id === gid);
    const d = diffs[m.scenario_id]?.goals.find((x) => x.goal_id === gid);
    const delta = d && d.hours_delta ? ` <span class="${d.hours_delta > 0 ? "delta-pos" : "delta-neg"}">${d.hours_delta > 0 ? "+" : ""}${d.hours_delta}</span>` : "";
    return `<td class="num">${fmtH(r.hours_per_week)}${delta}<div class="small muted">${pct(r.share)} · ${r.hours_until_target != null ? fmtH(r.hours_until_target) + " до даты" : ""}</div></td>`;
  };
  const gtitle = (gid) => sc[0].allocations.find((r) => r.goal_id === gid);
  const ex = c.explanation;
  const exById = Object.fromEntries((ex.scenarios || []).map((x) => [x.scenario_id, x]));
  const list = (arr, cls) => (arr && arr.length ? `<ul class="${cls}">${arr.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : '<div class="small muted">—</div>');

  $("#comparison").innerHTML = `
    <h3 style="margin-top:18px">Расчёт системы</h3>
    <div class="table-wrap"><table>
      <thead><tr><th>Цель (приоритет)</th>${sc.map((m) => `<th class="num">${esc(m.name)}</th>`).join("")}</tr></thead>
      <tbody>
        ${goals.map((gid) => `<tr><td><b style="color:${goalColor(gid)}">●</b> ${esc(gtitle(gid).title)} <span class="muted">(${gtitle(gid).priority})</span>
          <div class="small muted">до цели ${gtitle(gid).weeks_left ?? "—"} нед.</div></td>${sc.map((m) => cell(m, gid)).join("")}</tr>`).join("")}
        <tr><td>Суммарная нагрузка</td>${sc.map((m) => `<td class="num"><b>${fmtH(m.total_hours)}</b> / ${fmtH(m.available_hours)}<div class="small muted">загрузка ${pct(m.utilization)} · запас ${fmtH(m.slack_hours)}</div></td>`).join("")}</tr>
        <tr><td>Соответствие приоритетам<div class="small muted">эвристика, не вероятность</div></td>${sc.map((m) => `<td class="num"><b>${m.priority_alignment ?? "—"}</b></td>`).join("")}</tr>
        <tr><td>Риски (правила)</td>${sc.map((m) => `<td>${m.risks.length ? m.risks.map((r) => `<div class="small"><span class="badge ${r.severity === "high" ? "badge-danger" : r.severity === "medium" ? "badge-warn" : ""}">${r.severity}</span> ${esc(r.message)}</div>`).join("") : '<span class="small muted">нет</span>'}</td>`).join("")}</tr>
      </tbody></table></div>
    ${legend()}
    <div style="display:grid;gap:6px;margin-top:8px">${sc.map((m) => `<div class="small"><b>${esc(m.name)}</b>${stackBar(m.allocations, m.available_hours)}</div>`).join("")}</div>

    <div class="ai-box">
      <div class="ai-head">AI-объяснение компромиссов ${generatorBadges(ex)}</div>
      <p>${esc(ex.summary)}</p>
      <p><b>Соответствие приоритетам:</b> ${esc(ex.priority_fit)}</p>
    </div>
    <div class="explain">
      ${sc.map((m) => {
        const e = exById[m.scenario_id] || {};
        const isChosen = chosenId === m.scenario_id;
        return `<div class="explain-card">
          <h3>${esc(m.name)} ${isChosen ? '<span class="badge badge-ok">выбран</span>' : ""}</h3>
          <h4>Преимущества</h4>${list(e.strengths, "pro")}
          <h4>Компромиссы</h4>${list(e.tradeoffs, "con")}
          <h4>Риски</h4>${list(e.risks, "risk")}
          <div class="decide-row">
            <input placeholder="Почему этот вариант? (необязательно)" data-rationale="${m.scenario_id}" aria-label="Обоснование выбора">
            <button class="btn ${isChosen ? "" : "btn-ok"}" data-decide="${m.scenario_id}" ${m.over_capacity ? "disabled title='Превышает доступное время'" : ""}>${isChosen ? "Выбрать снова" : "Выбрать"}</button>
          </div>
        </div>`;
      }).join("")}
    </div>
    <div class="explain">
      <div class="explain-card"><h4>Каких данных не хватает</h4>${list(ex.missing_data, "con")}</div>
      <div class="explain-card"><h4>Допущения</h4>${list(ex.assumptions, "")}<h4>Вопросы к вам</h4>${list(ex.questions_for_user, "")}</div>
    </div>
    <p class="disclaimer">${esc(ex.disclaimer)}</p>`;
}

function latestPlan() { return state.plans[state.plans.length - 1]; }

function renderPlan() {
  const p = latestPlan();
  const demo = state.twin.user.is_demo;
  $("#btn-simulate").hidden = !(demo && p && p.status === "active");
  $("#btn-plan").textContent = p ? (p.status === "reviewed" ? "Сгенерировать следующий план" : "План активен") : "Сгенерировать план недели";
  $("#btn-plan").disabled = !!(p && p.status !== "reviewed");
  if (!p) {
    const chosen = state.scenarios.find((s) => s.status === "chosen");
    $("#plan").innerHTML = `<div class="empty">${chosen ? `План будет построен из сценария «${esc(chosen.name)}».` : "Сначала выберите сценарий в What If Lab — план строится только из принятого решения."}</div>`;
    return;
  }
  const locked = p.status === "reviewed";
  const byDay = DAYS.map((d, i) => p.tasks.filter((t) => t.day_of_week === i));
  $("#plan").innerHTML = `
    <div class="plan-summary">
      <span>Неделя <b>${p.week_index}</b>: ${fmtDate(p.week_start)} — ${fmtDate(p.week_end)}</span>
      <span>Сценарий: <b>${esc(p.scenario_name)}</b> (решение #${p.decision_id})</span>
      <span>План: <b>${fmtMin(p.planned_minutes_total)}</b> · факт: <b>${fmtMin(p.actual_minutes_total)}</b></span>
      ${locked ? '<span class="badge badge-ok">Reality Check проведён</span>' : '<span class="badge badge-future">в работе</span>'}
    </div>
    ${p.adaptation_notes.length ? `<div class="notes-box"><b>Что адаптировано в этом плане</b><ul>${p.adaptation_notes.map((n) => `<li>${esc(n.text)}</li>`).join("")}</ul></div>` : ""}
    <div class="week">${byDay.map((tasks, i) => `
      <div class="day"><div class="day-head"><span>${DAYS[i]}</span><span>${fmtMin(tasks.reduce((s, t) => s + t.planned_minutes, 0))}</span></div>
        ${tasks.map((t) => `<div class="task ${t.status}" style="border-left-color:${goalColor(t.goal_id)}">
          <div class="t-title">${esc(t.title)}</div>
          <div class="t-meta">${t.planned_minutes} мин${t.status !== "pending" ? ` · факт ${t.actual_minutes} мин` : ""}${t.is_carry_over ? " · перенос" : ""}</div>
          ${locked ? "" : `<div class="task-actions">
            <button data-task="${t.id}" data-status="done" class="${t.status === "done" ? "on" : ""}" title="Выполнено">✓</button>
            <button data-task="${t.id}" data-status="partial" class="${t.status === "partial" ? "on" : ""}" title="Частично">½</button>
            <button data-task="${t.id}" data-status="skipped" class="${t.status === "skipped" ? "on" : ""}" title="Пропущено">✕</button>
            ${t.status !== "pending" ? `<button data-task="${t.id}" data-status="pending" title="Сбросить">↺</button>` : ""}
          </div>`}
        </div>`).join("") || '<div class="small muted">—</div>'}
      </div>`).join("")}
    </div>`;
}

function proposalHtml(pr) {
  const title = pr.kind === "adjust_allocation"
    ? `${esc(pr.payload.goal_title)}: ${pr.payload.from_hours} → ${pr.payload.to_hours} ч/нед`
    : `Свободное время: ${pr.payload.from_hours} → ${pr.payload.to_hours} ч/нед`;
  const st = { pending: ["ждёт вашего решения", "badge-warn"], accepted: ["принято", "badge-ok"], rejected: ["отклонено", ""], superseded: ["заменено новым", ""] }[pr.status];
  return `<div class="proposal"><div class="p-head"><span>${title}</span><span class="badge ${st[1]}">${st[0]}</span></div>
    <div class="small">${esc(pr.reason)}</div>
    ${pr.status === "pending" ? `<div class="actions"><button class="btn btn-ok btn-sm" data-accept="${pr.id}">Подтвердить</button>
      <button class="btn btn-sm" data-reject="${pr.id}">Оставить как есть</button></div>` : ""}</div>`;
}

function generatorBadges(ex) {
  const gen = ex.generator || {};
  const g = gen.source === "llm"
    ? `<span class="badge badge-future">Claude · ${esc(gen.model || "")}</span>`
    : `<span class="badge" title="${esc(gen.reason || "")}">Шаблон (LLM недоступен)</span>`;
  const nc = ex.numbers_check || {};
  const n = nc.ok ? '<span class="badge badge-ok">числа сверены с расчётом</span>'
    : `<span class="badge badge-warn">непроверенные числа: ${esc((nc.unverified_numbers || []).join(", "))}</span>`;
  return g + " " + n;
}

function commentaryHtml(c) {
  if (!c) return "";
  const list = (arr, cls) => (arr?.length ? `<ul class="${cls}">${arr.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : '<div class="small muted">—</div>');
  return `<div class="ai-box">
      <div class="ai-head">AI-разбор недели ${generatorBadges(c)}</div>
      <p>${esc(c.summary)}</p>
    </div>
    <div class="explain">
      <div class="explain-card"><h4>Что сработало</h4>${list(c.what_worked, "pro")}</div>
      <div class="explain-card"><h4>Что мешало</h4>${list(c.obstacles, "con")}</div>
      <div class="explain-card"><h4>Фокус следующей недели</h4>${list(c.next_week_focus, "")}
        ${c.questions_for_user?.length ? `<h4>Вопросы к вам</h4>${list(c.questions_for_user, "")}` : ""}</div>
    </div>`;
}

function renderReality() {
  const p = latestPlan();
  const form = $("#reality-form");
  const canCheck = p && p.status === "active";
  form.querySelectorAll("textarea,input,button").forEach((el) => (el.disabled = !canCheck));
  form.hidden = !canCheck;
  const rc = state.checks[state.checks.length - 1];
  if (!rc) {
    $("#reality").innerHTML = `<div class="empty">${p ? "Отметьте задачи недели и проведите Reality Check." : "Reality Check появится после первого плана."}</div>`;
    return;
  }
  const max = Math.max(...rc.per_goal.map((g) => Math.max(g.planned_minutes, g.actual_minutes)), 1);
  $("#reality").innerHTML = `
    <div class="plan-summary"><span>План #${rc.plan_id} · сценарий #${rc.scenario_id} · решение #${rc.decision_id}</span>
      <span>Выполнено <b>${fmtH(rc.actual_hours)}</b> из ${fmtH(rc.planned_hours)} (${pct(rc.completion_rate)})</span></div>
    <div class="bars">${rc.per_goal.map((g) => `
      <div class="bar-row"><b>${esc(g.title)}</b>
        <div class="bar" role="img" aria-label="${esc(g.title)}: ${g.actual_hours} из ${g.planned_hours} ч">
          <div class="plan-line" style="width:${(g.planned_minutes / max) * 100}%"></div>
          <div class="act" style="width:${(g.actual_minutes / max) * 100}%;background:${goalColor(g.goal_id)}"></div></div>
        <span class="num small">${fmtH(g.actual_hours)} / ${fmtH(g.planned_hours)} · ${pct(g.completion)}</span></div>`).join("")}
    </div>
    <ul class="notes" style="color:var(--text)">${rc.insights.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>
    ${rc.user_feedback ? `<p class="small muted">Ваш отзыв: «${esc(rc.user_feedback)}» · сложность ${rc.perceived_difficulty ?? "—"}/5</p>` : ""}
    ${commentaryHtml(rc.ai_commentary)}
    <h3 style="margin-top:14px">Предложения по адаптации <span class="muted small">— применяются только после вашего подтверждения</span></h3>
    ${rc.proposals.length ? rc.proposals.map((pr) => proposalHtml(state.proposals.find((x) => x.id === pr.id) || pr)).join("") : '<div class="empty">Изменений не требуется — план соответствует фактическому темпу.</div>'}`;
}

function renderAdapt() {
  const plans = state.plans;
  if (plans.length < 2) {
    $("#adapt").innerHTML = '<div class="empty">После Reality Check сгенерируйте следующий план — здесь появится сравнение недель.</div>';
    return;
  }
  const prev = plans[plans.length - 2], cur = plans[plans.length - 1];
  const ids = [...new Set([...prev.by_goal, ...cur.by_goal].map((g) => g.goal_id))];
  const find = (p, id) => p.by_goal.find((g) => g.goal_id === id) || { planned_minutes: 0, actual_minutes: 0, tasks: 0 };
  const title = (id) => (cur.by_goal.find((g) => g.goal_id === id) || prev.by_goal.find((g) => g.goal_id === id)).title;
  $("#adapt").innerHTML = `
    <p class="small muted">Цепочка: решение #${prev.decision_id} → план #${prev.id} → Reality Check → ${cur.decision_id !== prev.decision_id ? `подтверждённая адаптация (решение #${cur.decision_id})` : "решение без изменений"} → план #${cur.id}</p>
    <div class="table-wrap"><table class="compare-weeks">
      <thead><tr><th>Цель</th><th class="num">Неделя ${prev.week_index}: план</th><th class="num">Неделя ${prev.week_index}: факт</th><th class="num">Неделя ${cur.week_index}: план</th><th class="num">Сессий</th></tr></thead>
      <tbody>${ids.map((id) => {
        const a = find(prev, id), b = find(cur, id);
        const d = b.planned_minutes - a.planned_minutes;
        return `<tr><td class="goal"><b style="color:${goalColor(id)}">●</b> ${esc(title(id))}</td>
          <td class="num">${fmtMin(a.planned_minutes)}</td><td class="num">${fmtMin(a.actual_minutes)}</td>
          <td class="num">${fmtMin(b.planned_minutes)} ${d ? `<span class="${d > 0 ? "delta-pos" : "delta-neg"}">${d > 0 ? "+" : ""}${fmtMin(Math.abs(d)).replace(/^/, d > 0 ? "" : "−")}</span>` : ""}</td>
          <td class="num">${a.tasks} → ${b.tasks}</td></tr>`;
      }).join("")}</tbody></table></div>
    ${cur.adaptation_notes.length ? `<div class="notes-box"><b>Почему план изменился</b><ul>${cur.adaptation_notes.map((n) => `<li>${esc(n.text)}</li>`).join("")}</ul></div>` : ""}`;
}

function eventSummary(e) {
  const p = e.payload || {};
  switch (e.event_type) {
    case "availability_changed": return `${p.from ?? "—"} → ${p.to} ч/нед`;
    case "goal_changed": return p.title ? `${p.action === "created" ? "Создана цель" : "Изменена цель"} «${esc(p.title)}»` : esc(p.action || p.scope || "");
    case "skill_changed": return p.to ? `${esc(p.to.level ?? p.to.value)} (${esc(SOURCE_RU[p.to.source] || p.to.source)})` : esc(p.milestone || "");
    case "scenario_chosen": return p.source === "adaptation" ? `адаптация: ${p.from_hours} → ${p.to_hours} ч` : `«${esc(p.name)}»${p.rationale ? " — " + esc(p.rationale) : ""}`;
    case "plan_generated": return `неделя ${p.week_index}, ${p.planned_hours} ч${p.adaptations?.length ? ", адаптации: " + p.adaptations.map((a) => ADAPT_RU[a] || a).join(", ") : ""}`;
    case "task_completed": return `${p.status}, ${p.actual_minutes}/${p.planned_minutes} мин (${p.weekday})`;
    case "reality_check": return `${p.actual_hours} из ${p.planned_hours} ч (${pct(p.completion)})`;
    case "feedback": return `«${esc(p.text)}»`;
    case "proposal_resolved": return p.accepted ? "подтверждено пользователем" : "отклонено пользователем";
    case "comparison_run": return `сценарии ${p.scenario_ids?.join(", ")}, объяснение: ${p.explanation_source}`;
    case "scenario_created": return esc(p.name);
    case "milestone_completed": return esc(p.milestone);
    default: return "";
  }
}

function renderMemory() {
  const { context, events } = state.memory;
  $("#memory").innerHTML = `<div class="mem-grid">
    <div><h3>Текущий контекст для рекомендаций</h3>
      <ul class="facts-list">${context.facts.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
      <h3 style="margin-top:14px">Записи по типам</h3>
      <div class="legend">${Object.entries(context.event_counts).map(([k, v]) => `<span class="badge">${esc(EVENT_RU[k] || k)}: ${v}</span>`).join("")}</div>
      <h3 style="margin-top:14px">Обратная связь</h3>
      <form class="mini-form" data-form="feedback" style="display:grid">
        <textarea name="text" rows="2" required placeholder="Что важно учесть в следующих рекомендациях?" aria-label="Отзыв"></textarea>
        <button class="btn btn-sm btn-primary">Сохранить в память</button>
      </form>
    </div>
    <div><h3>Журнал (новые сверху)</h3>
      <ul class="timeline">${events.map((e) => `<li><div><div class="ev-type">${esc(EVENT_RU[e.event_type] || e.event_type)}</div>
        <div class="small muted">${new Date(e.created_at).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}${e.is_demo ? " · DEMO" : ""}</div></div>
        <div>${eventSummary(e)}</div></li>`).join("")}</ul></div></div>`;
}

// ------------------------------------------------------------------ actions
async function refresh(msg) { await loadAll(); if (msg) toast(msg); }

document.addEventListener("click", (ev) => {
  const t = ev.target.closest("button, [data-toggle]");
  if (!t) return;
  if (t.dataset.toggle) {
    const el = document.getElementById(t.dataset.toggle);
    el.hidden = !el.hidden;
    if (!el.hidden) el.querySelector("input, select, textarea")?.focus();
    return;
  }
  const u = state.userId;
  if (t.id === "btn-exit") {
    storage("mirror.user", null);
    history.replaceState(null, "", location.pathname);
    state.userId = null;
    $("#workspace").hidden = true; $("#start").hidden = false; $("#btn-exit").hidden = true;
    $("#loop").innerHTML = ""; $("#demo-badge").hidden = true; $("#user-label").textContent = "";
    return;
  }
  if (t.id === "btn-demo") return withBusy(t, async () => {
    const r = await api("POST", "/demo/seed");
    await openUser(r.user_id);
    toast("DEMO-пользователь создан: Current Self и Future Self заполнены");
  });
  if (t.id === "btn-compare") return withBusy(t, async () => {
    if (state.selected.size < 2) throw new Error("Выберите минимум два сценария");
    state.comparison = await api("POST", `/users/${u}/whatif/compare`, { scenario_ids: [...state.selected] });
    await refresh("Сценарии сравнены");
    $("#comparison").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  if (t.dataset.decide) return withBusy(t, async () => {
    const id = Number(t.dataset.decide);
    const rationale = document.querySelector(`[data-rationale="${id}"]`)?.value || null;
    await api("POST", `/users/${u}/decisions`, { scenario_id: id, comparison_id: state.comparison?.id ?? null, rationale });
    await refresh("Решение сохранено. Теперь можно генерировать план.");
  });
  if (t.id === "btn-plan") return withBusy(t, async () => {
    await api("POST", `/users/${u}/plans`, {});
    await refresh("План недели построен из выбранного сценария");
    $(state.plans.length > 1 ? "#sec-adapt" : "#sec-plan").scrollIntoView({ behavior: "smooth" });
  });
  if (t.id === "btn-simulate") return withBusy(t, async () => {
    await api("POST", `/demo/users/${u}/plans/${latestPlan().id}/simulate-week`);
    await refresh("Отметки выполнения заполнены DEMO-данными");
  });
  if (t.dataset.task) return withBusy(null, async () => {
    const status = t.dataset.status;
    let actual = null;
    if (status === "partial") {
      const task = latestPlan().tasks.find((x) => x.id === Number(t.dataset.task));
      const v = prompt(`Сколько минут из ${task.planned_minutes} фактически?`, String(Math.round(task.planned_minutes / 2)));
      if (v === null) return;
      actual = Math.max(0, parseInt(v, 10) || 0);
    }
    await api("PATCH", `/users/${u}/tasks/${t.dataset.task}`, { status, actual_minutes: actual });
    await refresh();
  });
  if (t.dataset.accept || t.dataset.reject) return withBusy(t, async () => {
    const accept = !!t.dataset.accept;
    await api("POST", `/users/${u}/proposals/${t.dataset.accept || t.dataset.reject}/${accept ? "accept" : "reject"}`, {});
    await refresh(accept ? "Изменение подтверждено — следующий план учтёт его" : "Предложение отклонено, решение сохранено в памяти");
  });
  if (t.dataset.ms) return withBusy(null, async () => {
    await api("PUT", `/users/${u}/milestones/${t.dataset.ms}`, { done: t.dataset.done !== "true" });
    await refresh("Этап обновлён");
  });
});

document.addEventListener("change", (ev) => {
  const sel = ev.target.dataset?.select;
  if (sel) {
    const id = Number(sel);
    ev.target.checked ? state.selected.add(id) : state.selected.delete(id);
    const b = $("#btn-compare");
    if (b) b.textContent = `Сравнить выбранные (${state.selected.size})`;
  }
});
document.addEventListener("input", (ev) => { if (ev.target.closest("#scenario-form")) updateScenarioTotal(); });

document.addEventListener("submit", (ev) => {
  const f = ev.target;
  const kind = f.dataset?.form;
  if (!kind) return;
  ev.preventDefault();
  const u = state.userId;
  const valueBody = () => (f.value ? { value: Number(f.value.value) } : { level: f.level.value });
  withBusy(ev.submitter, async () => {
    if (kind === "current") {
      await api("PUT", `/users/${u}/goals/${f.dataset.goal}/current`, {
        ...valueBody(), source: f.source.value, evidence: f.evidence.value || null,
      });
      await refresh("Факт обновлён — разрыв пересчитан, изменение записано в память");
    } else if (kind === "target") {
      await api("PUT", `/users/${u}/goals/${f.dataset.goal}/target`, {
        ...valueBody(), target_date: f.target_date.value || null, priority: Number(f.priority.value),
      });
      await refresh("Цель изменена по вашему решению — записано в память");
    } else if (kind === "hours") {
      await api("PUT", `/users/${u}/current-self`, { weekly_hours_available: Number(f.hours.value) });
      await refresh("Доступное время обновлено — What If учтёт его при следующем сравнении");
    } else if (kind === "feedback") {
      await api("POST", `/users/${u}/feedback`, { text: f.text.value });
      await refresh("Отзыв сохранён в памяти");
    }
  });
});

$("#scenario-form").addEventListener("submit", (ev) => {
  ev.preventDefault();
  withBusy(ev.submitter, async () => {
    const f = ev.target;
    const allocations = [...f.querySelectorAll("input[type=range]")].map((r) => ({ goal_id: Number(r.dataset.goal), hours_per_week: Number(r.value) }));
    const sc = await api("POST", `/users/${state.userId}/scenarios`, { name: f.name.value, allocations });
    state.selected.add(sc.id);
    await refresh("Сценарий создан и добавлен в сравнение");
  });
});

$("#reality-form").addEventListener("submit", (ev) => {
  ev.preventDefault();
  withBusy(ev.submitter, async () => {
    const f = ev.target;
    await api("POST", `/users/${state.userId}/plans/${latestPlan().id}/reality-check`, {
      feedback: f.feedback.value || null, perceived_difficulty: Number(f.difficulty.value) || null,
    });
    f.reset();
    await refresh("Reality Check проведён — результаты записаны в память");
  });
});

$("#form-open").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const id = $("#open-id").value;
  if (id) openUser(id).catch((e) => toast(e.message, true));
});

$("#form-user").addEventListener("submit", (ev) => {
  ev.preventDefault();
  withBusy(ev.submitter, async () => {
    const f = ev.target;
    const u = await api("POST", "/users", { name: f.name.value, country: f.country.value || null });
    await api("PUT", `/users/${u.id}/current-self`, { weekly_hours_available: Number(f.hours.value) });
    await openUser(u.id);
    $("#goal-form").hidden = false;
    toast("Пользователь создан. Добавьте цели: текущее и желаемое состояние.");
  });
});

$("#goal-form").addEventListener("submit", (ev) => {
  ev.preventDefault();
  withBusy(ev.submitter, async () => {
    const f = ev.target;
    const numeric = f.metric_type.value === "numeric";
    const val = (s) => (numeric ? { value: Number(s) } : { level: s.trim() });
    const body = {
      title: f.title.value, domain: f.domain.value, metric_type: f.metric_type.value,
      scale: numeric ? null : f.scale.value, unit: numeric ? "баллов" : null,
      min_value: numeric && f.min_value.value ? Number(f.min_value.value) : null,
      max_value: numeric && f.max_value.value ? Number(f.max_value.value) : null,
      current: { ...val(f.current.value), source: f.source.value },
      target: {
        ...val(f.target.value), target_date: f.target_date.value || null, priority: Number(f.priority.value) || 3,
        milestones: f.milestones.value.split(";").map((s) => s.trim()).filter(Boolean).map((title) => ({ title })),
      },
    };
    await api("POST", `/users/${state.userId}/goals`, body);
    f.reset();
    await refresh("Цель добавлена: Current Self и Future Self разделены");
  });
});

// ------------------------------------------------------------------ boot
(async function boot() {
  try {
    state.health = await api("GET", "/health");
    const llm = state.health.llm;
    $("#llm-badge").textContent = llm.enabled ? `AI: ${llm.model}` : "AI: шаблонные объяснения";
    $("#llm-badge").className = "badge " + (llm.enabled ? "badge-future" : "");
  } catch { /* backend is down: errors will show on actions */ }
  const fromUrl = new URLSearchParams(location.search).get("user");
  const saved = fromUrl || storage("mirror.user");
  if (saved) {
    try { await openUser(saved); } catch { storage("mirror.user", null); history.replaceState(null, "", location.pathname); }
  }
})();
