'use strict';
/* ---------- утилиты ---------- */
const KEY = 'routine-diary-v1';
const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const MONTHS_GEN = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
const WD = ['П','В','С','Ч','П','С','В'];
const WD_SHORT = ['пн','вт','ср','чт','пт','сб','вс'];
const $ = s => document.querySelector(s);
const pad = n => String(n).padStart(2, '0');
const ds = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const strOf = dt => ds(dt.getFullYear(), dt.getMonth(), dt.getDate());
const dateOf = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const wdOf = dt => (dt.getDay() + 6) % 7;            // пн = 0
const todayStr = () => strOf(new Date());
const uid = () => Math.random().toString(36).slice(2, 9);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtNum = v => String(Math.round(v * 100) / 100).replace('.', ',');
const plRaz = n => { const a = n % 100, b = n % 10; return (a > 10 && a < 20) ? 'раз' : (b > 1 && b < 5 ? 'раза' : 'раз'); };

/* ---------- данные ---------- */
function seed() {
  const n = new Date(), from = ds(n.getFullYear(), n.getMonth(), 1);
  const all = [0,1,2,3,4,5,6];
  const mk = (name, type, o) => Object.assign({ id: uid(), name, type, target: 1, unit: '', step: 1, sched: { mode: 'days', days: all }, tags: [], from, to: null }, o);
  return {
    v: 1,
    habits: [
      mk('Чистка зубов', 'num', { target: 2, unit: 'раза', step: 1, tags: ['Режим'] }),
      mk('Ранний подъём', 'bool', { tags: ['Режим'] }),
      mk('Ранний отбой', 'bool', { tags: ['Режим'] }),
      mk('Зал', 'bool', { sched: { mode: 'week', n: 3 }, tags: ['Тело'] }),
      mk('Вода', 'num', { target: 2, unit: 'л', step: 0.5, tags: ['Тело'] }),
      mk('БАДы', 'bool', { tags: ['Тело'] }),
      mk('Чтение', 'num', { target: 5, unit: 'стр', step: 1, tags: ['Учёба'] })
    ],
    metrics: [{ id: uid(), name: 'Сон' }],
    log: { h: {}, m: {} },
    lastExport: null
  };
}
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const o = JSON.parse(raw); if (o && Array.isArray(o.habits)) { o.metrics = o.metrics || []; o.log = o.log || { h: {}, m: {} }; o.log.h = o.log.h || {}; o.log.m = o.log.m || {}; return o; } }
  } catch (e) {}
  return seed();
}
let S = load();
let saveFailed = false;
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); saveFailed = false; } catch (e) { saveFailed = true; } }
save();

const now0 = new Date();
let view = { y: now0.getFullYear(), m: now0.getMonth() };
let filterTag = null;

const getH = (id, d) => (S.log.h[id] || {})[d];
const getM = (id, d) => (S.log.m[id] || {})[d];
function setH(id, d, v) { const o = S.log.h[id] || (S.log.h[id] = {}); if (v == null || v <= 0) delete o[d]; else o[d] = v; save(); }
function setM(id, d, v) { const o = S.log.m[id] || (S.log.m[id] = {}); if (v == null) delete o[d]; else o[d] = v; save(); }
const isDone = (h, d) => { const v = getH(h.id, d); return h.type === 'bool' ? v === 1 : (v != null && v >= h.target); };
const activeOn = (h, d) => d >= h.from && (!h.to || d <= h.to);
const scheduled = (h, d) => activeOn(h, d) && (h.sched.mode === 'week' || h.sched.days.includes(wdOf(dateOf(d))));

/* ---------- статистика ---------- */
function stats(h, y, m) {
  const t = todayStr(), dim = new Date(y, m + 1, 0).getDate();
  let done = 0, total = 0;
  if (h.sched.mode === 'week') {
    const N = h.sched.n, seen = new Set();
    for (let d = 1; d <= dim; d++) {
      const mon = new Date(y, m, d - wdOf(new Date(y, m, d)));
      const ms = strOf(mon); if (seen.has(ms)) continue; seen.add(ms);
      if (new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 3).getMonth() !== m) continue; // неделя относится к месяцу четверга
      const se = strOf(new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6));
      if (ms > t || se < h.from || (h.to && ms > h.to)) continue;
      let cnt = 0;
      for (let i = 0; i < 7; i++) if (isDone(h, strOf(new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i)))) cnt++;
      if (se <= t) { total += 1; done += Math.min(cnt, N) / N; }
      else {                                              // текущая неделя: считаем только то, что уже нельзя наверстать
        const left = 6 - wdOf(dateOf(t)), req = N - left;
        if (req > 0) { total += 1; done += Math.min(cnt, req) / req; }
        else if (cnt > 0) { total += 1; done += 1; }
      }
    }
  } else {
    for (let d = 1; d <= dim; d++) {
      const x = ds(y, m, d);
      if (x > t || !scheduled(h, x)) continue;
      total++; if (isDone(h, x)) done++;
    }
  }
  return { done, total };
}
const habitsOfMonth = (y, m) => {
  const first = ds(y, m, 1), last = ds(y, m, new Date(y, m + 1, 0).getDate());
  return S.habits.filter(h => h.from <= last && (!h.to || h.to >= first));
};
const pctOf = a => a.total ? Math.round(a.done / a.total * 100) : null;
const sumStats = list => list.reduce((a, h) => { const s = stats(h, view.y, view.m); a.done += s.done; a.total += s.total; return a; }, { done: 0, total: 0 });
const showPct = p => p == null ? '—' : p + '%';

/* ---------- отрисовка ---------- */
function schedText(h) {
  const s = h.sched;
  if (s.mode === 'week') return `${s.n} ${plRaz(s.n)} в неделю`;
  if (s.days.length === 7) return 'каждый день';
  if (s.days.length === 5 && [0,1,2,3,4].every(i => s.days.includes(i))) return 'по будням';
  return s.days.slice().sort().map(i => WD_SHORT[i]).join(', ') || 'не назначено';
}
function weekCount(h) {
  const t = dateOf(todayStr()), mon = new Date(t.getFullYear(), t.getMonth(), t.getDate() - wdOf(t));
  let c = 0; for (let i = 0; i < 7; i++) if (isDone(h, strOf(new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i)))) c++;
  return c;
}
function render() {
  const { y, m } = view, dim = new Date(y, m + 1, 0).getDate(), t = todayStr();
  const isCur = y === now0.getFullYear() && m === now0.getMonth() || (y === new Date().getFullYear() && m === new Date().getMonth());
  $('#mlabel').textContent = `${MONTHS[m]} ${y}`;
  $('#next').disabled = isCur || ds(y, m, 1) > t;
  document.documentElement.style.setProperty('--days', dim);

  const all = habitsOfMonth(y, m);
  const rows = filterTag ? all.filter(h => h.tags.includes(filterTag)) : all;

  /* итоги */
  const tot = pctOf(sumStats(all));
  const tagNames = [...new Set(all.flatMap(h => h.tags))];
  if (filterTag && !tagNames.includes(filterTag)) filterTag = null;
  $('#summary').innerHTML =
    `<div class="total"><b>${showPct(tot)}</b><small>выполнено за месяц</small></div>` +
    `<div class="tags">` + tagNames.map(tg => {
      const p = pctOf(sumStats(all.filter(h => h.tags.includes(tg))));
      return `<button class="tagbtn${filterTag === tg ? ' on' : ''}" data-tag="${esc(tg)}" aria-pressed="${filterTag === tg}"><b>${showPct(p)}</b><small>${esc(tg)}</small></button>`;
    }).join('') + `</div>`;

  /* шапка */
  let head = `<colgroup><col style="width:var(--name-w)"><col style="width:var(--pct-w)">` + '<col style="width:var(--cell)">'.repeat(dim) + `</colgroup>`;
  head += `<thead><tr><th class="name" style="cursor:default"></th><th class="pct"></th>`;
  for (let d = 1; d <= dim; d++) {
    const w = wdOf(new Date(y, m, d));
    head += `<th class="d${w >= 5 ? ' we' : ''}${ds(y, m, d) === t ? ' today' : ''}${w === 0 && d > 1 ? ' mon' : ''}"><i>${WD[w]}</i><b>${d}</b></th>`;
  }
  head += `</tr></thead>`;

  /* метрики */
  let body = `<tbody>`;
  if (S.metrics.length) {
    body += `<tr class="sec"><td colspan="${dim + 2}">Состояние дня</td></tr>`;
    for (const mt of S.metrics) {
      const vals = []; for (let d = 1; d <= dim; d++) { const v = getM(mt.id, ds(y, m, d)); if (v != null) vals.push(v); }
      const avg = vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length) : null;
      body += `<tr><td class="name" data-edit-m="${mt.id}"><span class="n">${esc(mt.name)}</span><span class="s">оценка 1–10</span></td>` +
        `<td class="pct${avg == null ? ' low' : ''}">${avg == null ? '—' : fmtNum(Math.round(avg * 10) / 10)}<small>среднее</small></td>`;
      for (let d = 1; d <= dim; d++) {
        const x = ds(y, m, d), v = getM(mt.id, x), w = wdOf(new Date(y, m, d));
        body += `<td class="c m${v == null ? ' empty' : ''}${x > t ? ' fut' : ''}${x === t ? ' today' : ''}${w === 0 && d > 1 ? ' mon' : ''}" data-k="m" data-id="${mt.id}" data-d="${x}"${v != null ? ` style="--i:${v / 10}"` : ''}><span>${v != null ? v : ''}</span></td>`;
      }
      body += `</tr>`;
    }
  }

  /* привычки */
  body += `<tr class="sec"><td colspan="${dim + 2}">Привычки${filterTag ? ` · тег «${esc(filterTag)}»` : ''}</td></tr>`;
  for (const h of rows) {
    const st = stats(h, y, m), p = pctOf(st);
    const sub = [];
    if (h.type === 'num') sub.push(`${fmtNum(h.target)}${h.unit ? ' ' + esc(h.unit) : ''}`);
    sub.push(schedText(h));
    if (h.sched.mode === 'week' && isCur) sub.push(`на неделе ${weekCount(h)}/${h.sched.n}`);
    body += `<tr><td class="name" data-edit-h="${h.id}"><span class="n">${esc(h.name)}</span><span class="s">${sub.join(' · ')}${h.tags.length ? ' · <i>' + h.tags.map(esc).join(', ') + '</i>' : ''}</span></td>` +
      `<td class="pct${p == null ? ' low' : ''}">${showPct(p)}</td>`;
    for (let d = 1; d <= dim; d++) {
      const x = ds(y, m, d), v = getH(h.id, x), w = wdOf(new Date(y, m, d));
      let cls = 'c';
      const done = isDone(h, x);
      if (done) cls += ' done';
      else if (h.type === 'num' && v) cls += ' part';
      if (!scheduled(h, x)) cls += ' off';
      if (x > t) cls += ' fut';
      if (x === t) cls += ' today';
      if (w === 0 && d > 1) cls += ' mon';
      const style = (cls.includes('part')) ? ` style="--p:${Math.min(v / h.target, 1)}"` : '';
      body += `<td class="${cls}" data-k="h" data-id="${h.id}" data-d="${x}"${style}><span>${h.type === 'num' && v ? fmtNum(v) : ''}</span></td>`;
    }
    body += `</tr>`;
  }
  if (!rows.length) body += `<tr><td colspan="${dim + 2}"><div class="empty-note"><b>Здесь пока пусто</b>Нажми «Добавить привычку», чтобы начать.</div></td></tr>`;
  body += `</tbody>`;

  const g = $('#grid');
  g.style.width = `calc(var(--name-w) + var(--pct-w) + var(--cell) * ${dim})`;
  g.innerHTML = head + body;

  /* подвал */
  let info = 'Данные хранятся только в этом браузере.';
  let warn = saveFailed;
  if (saveFailed) info = 'Не удалось сохранить: браузер блокирует хранилище. Сделай экспорт.';
  else if (S.lastExport) {
    const days = Math.floor((new Date() - dateOf(S.lastExport)) / 864e5);
    info += ` Последний экспорт: ${dateOf(S.lastExport).getDate()} ${MONTHS_GEN[dateOf(S.lastExport).getMonth()]}.`;
    if (days > 14) warn = true;
  } else { info += ' Экспорта ещё не было.'; warn = true; }
  const si = $('#saveInfo'); si.textContent = info; si.className = warn ? 'warn' : '';
}

/* ---------- всплывающее окно значения ---------- */
const pop = $('#pop');
let popCtx = null;
function closePop() { pop.classList.remove('open'); popCtx = null; }
function placePop(td) {
  const r = td.getBoundingClientRect();
  pop.style.left = '0px'; pop.style.top = '0px'; pop.classList.add('open');
  const w = pop.offsetWidth, h = pop.offsetHeight;
  let left = r.left + window.scrollX + r.width / 2 - w / 2;
  left = Math.max(8 + window.scrollX, Math.min(left, window.scrollX + document.documentElement.clientWidth - w - 8));
  let top = r.bottom + window.scrollY + 8;
  if (r.bottom + h + 16 > window.innerHeight) top = r.top + window.scrollY - h - 8;
  pop.style.left = left + 'px'; pop.style.top = top + 'px';
}
const dayLabel = d => { const dt = dateOf(d); return `${dt.getDate()} ${MONTHS_GEN[dt.getMonth()]}`; };
function openNum(td, h, d) {
  const v = getH(h.id, d) || 0;
  popCtx = { type: 'h', h, d };
  pop.innerHTML = `<h4>${esc(h.name)} <em>· ${dayLabel(d)}</em></h4>
    <div class="prow"><button data-a="dec" aria-label="Меньше">−</button><input id="pv" type="number" step="any" min="0" inputmode="decimal" value="${v || ''}" placeholder="0"><button data-a="inc" aria-label="Больше">+</button></div>
    <div class="prow"><button class="grow" data-a="goal">Цель ${fmtNum(h.target)}</button><button data-a="clear">Сбросить</button></div>
    <div class="prow"><button class="grow neon" data-a="ok">Готово</button></div>`;
  placePop(td); const i = $('#pv'); i.focus(); i.select();
}
function openScale(td, mt, d) {
  const v = getM(mt.id, d);
  popCtx = { type: 'm', mt, d };
  pop.innerHTML = `<h4>${esc(mt.name)} <em>· ${dayLabel(d)}</em></h4>
    <div class="scale">${[1,2,3,4,5,6,7,8,9,10].map(n => `<button data-n="${n}" class="${v === n ? 'cur' : ''}">${n}</button>`).join('')}</div>
    <div class="prow"><button class="grow" data-a="clear">Сбросить</button></div>`;
  placePop(td);
}
function applyPopNum() {
  const raw = $('#pv').value.replace(',', '.'); const v = parseFloat(raw);
  setH(popCtx.h.id, popCtx.d, isNaN(v) ? null : Math.round(v * 100) / 100);
  closePop(); render();
}
pop.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b || !popCtx) return;
  if (popCtx.type === 'm') {
    if (b.dataset.n) setM(popCtx.mt.id, popCtx.d, +b.dataset.n); else if (b.dataset.a === 'clear') setM(popCtx.mt.id, popCtx.d, null);
    closePop(); render(); return;
  }
  const h = popCtx.h, i = $('#pv'), cur = parseFloat(i.value.replace(',', '.')) || 0, a = b.dataset.a;
  if (a === 'inc') i.value = Math.round((cur + h.step) * 100) / 100;
  else if (a === 'dec') i.value = Math.max(0, Math.round((cur - h.step) * 100) / 100) || '';
  else if (a === 'goal') { i.value = h.target; applyPopNum(); }
  else if (a === 'clear') { i.value = ''; applyPopNum(); }
  else if (a === 'ok') applyPopNum();
});
pop.addEventListener('keydown', e => { if (e.key === 'Enter' && popCtx && popCtx.type === 'h' && e.target.id === 'pv') { e.preventDefault(); applyPopNum(); } });
document.addEventListener('mousedown', e => { if (popCtx && !pop.contains(e.target) && !e.target.closest('td.c')) closePop(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closePop(); });
$('#scroll').addEventListener('scroll', closePop);

/* ---------- клики по сетке ---------- */
$('#grid').addEventListener('click', e => {
  const c = e.target.closest('td.c');
  if (c) {
    const d = c.dataset.d; if (d > todayStr()) return;
    if (c.dataset.k === 'm') { const mt = S.metrics.find(x => x.id === c.dataset.id); closePop(); return openScale(c, mt, d); }
    const h = S.habits.find(x => x.id === c.dataset.id);
    if (h.type === 'bool') { setH(h.id, d, isDone(h, d) ? null : 1); closePop(); render(); }
    else { closePop(); openNum(c, h, d); }
    return;
  }
  const nh = e.target.closest('[data-edit-h]'); if (nh) return openHabit(S.habits.find(x => x.id === nh.dataset.editH));
  const nm = e.target.closest('[data-edit-m]'); if (nm) return openMetric(S.metrics.find(x => x.id === nm.dataset.editM));
});
$('#summary').addEventListener('click', e => {
  const b = e.target.closest('.tagbtn'); if (!b) return;
  filterTag = filterTag === b.dataset.tag ? null : b.dataset.tag; render();
});

/* ---------- навигация по месяцам ---------- */
function shift(n) {
  const dt = new Date(view.y, view.m + n, 1), cur = new Date();
  if (dt > new Date(cur.getFullYear(), cur.getMonth(), 1)) return;
  view = { y: dt.getFullYear(), m: dt.getMonth() }; closePop(); render();
}
$('#prev').onclick = () => shift(-1);
$('#next').onclick = () => shift(1);
$('#today').onclick = () => { const c = new Date(); view = { y: c.getFullYear(), m: c.getMonth() }; closePop(); render(); };
document.addEventListener('keydown', e => {
  if (e.target.closest('input,select,textarea,dialog') || e.metaKey || e.ctrlKey) return;
  if (e.key === 'ArrowLeft') shift(-1); if (e.key === 'ArrowRight') shift(1);
});

/* ---------- диалог привычки ---------- */
const hdlg = $('#hdlg');
let editH = null, pickDays = new Set(), tagSet = [];
function renderDayChips() {
  $('#daysf').innerHTML = WD_SHORT.map((n, i) => `<button type="button" class="chip${pickDays.has(i) ? ' on' : ''}" data-i="${i}">${n}</button>`).join('');
}
function parseTags() { return [...new Set($('#htags').value.split(',').map(s => s.trim().replace(/^#/, '')).filter(Boolean))]; }
function renderTagChips() {
  const known = [...new Set(S.habits.flatMap(h => h.tags))], cur = parseTags();
  $('#tagchips').innerHTML = known.map(t => `<button type="button" class="chip${cur.includes(t) ? ' on' : ''}" data-t="${esc(t)}">${esc(t)}</button>`).join('');
}
function syncHForm() {
  $('#numf').classList.toggle('hide', $('#htype').value !== 'num');
  const sm = $('#hsched').value;
  $('#daysf').classList.toggle('hide', sm !== 'custom');
  $('#weekf').classList.toggle('hide', sm !== 'week');
}
function openHabit(h) {
  editH = h || null;
  $('#htitle').textContent = h ? 'Изменить привычку' : 'Новая привычка';
  $('#hname').value = h ? h.name : '';
  $('#htype').value = h ? h.type : 'bool';
  $('#htarget').value = h ? h.target : 1;
  $('#hunit').value = h ? h.unit : '';
  $('#hstep').value = h ? h.step : 1;
  let sm = 'daily', days = [0,1,2,3,4,5,6], n = 3;
  if (h) {
    if (h.sched.mode === 'week') { sm = 'week'; n = h.sched.n; }
    else { days = h.sched.days; sm = days.length === 7 ? 'daily' : (days.length === 5 && [0,1,2,3,4].every(i => days.includes(i)) ? 'weekdays' : 'custom'); }
  }
  $('#hsched').value = sm; $('#hweek').value = n; pickDays = new Set(days);
  $('#htags').value = h ? h.tags.join(', ') : '';
  $('#hdel').classList.toggle('hide', !h); $('#harch').classList.toggle('hide', !h); $('#harchhint').classList.toggle('hide', !h);
  renderDayChips(); renderTagChips(); syncHForm();
  hdlg.showModal(); $('#hname').focus();
}
$('#htype').onchange = syncHForm;
$('#hsched').onchange = syncHForm;
$('#htags').oninput = renderTagChips;
$('#daysf').onclick = e => { const b = e.target.closest('.chip'); if (!b) return; const i = +b.dataset.i; pickDays.has(i) ? pickDays.delete(i) : pickDays.add(i); renderDayChips(); };
$('#tagchips').onclick = e => {
  const b = e.target.closest('.chip'); if (!b) return;
  const cur = parseTags(), t = b.dataset.t, i = cur.indexOf(t);
  if (i >= 0) cur.splice(i, 1); else cur.push(t);
  $('#htags').value = cur.join(', '); renderTagChips();
};
$('#hcancel').onclick = () => hdlg.close();
$('#hform').addEventListener('submit', e => {
  const name = $('#hname').value.trim();
  if (!name) { e.preventDefault(); $('#hname').focus(); $('#hname').style.borderColor = '#b4493f'; return; }
  const type = $('#htype').value, sm = $('#hsched').value;
  let sched;
  if (sm === 'week') sched = { mode: 'week', n: Math.max(1, Math.min(7, parseInt($('#hweek').value) || 3)) };
  else if (sm === 'weekdays') sched = { mode: 'days', days: [0,1,2,3,4] };
  else if (sm === 'custom') { if (!pickDays.size) { e.preventDefault(); return; } sched = { mode: 'days', days: [...pickDays].sort() }; }
  else sched = { mode: 'days', days: [0,1,2,3,4,5,6] };
  const target = Math.max(0.1, parseFloat(String($('#htarget').value).replace(',', '.')) || 1);
  const step = Math.max(0.1, parseFloat(String($('#hstep').value).replace(',', '.')) || 1);
  const data = { name, type, target: type === 'num' ? target : 1, unit: type === 'num' ? $('#hunit').value.trim() : '', step: type === 'num' ? step : 1, sched, tags: parseTags() };
  if (editH) Object.assign(editH, data);
  else { const n = new Date(); S.habits.push(Object.assign({ id: uid(), from: ds(n.getFullYear(), n.getMonth(), 1), to: null }, data)); }
  save(); render();
});
$('#hname').oninput = () => { $('#hname').style.borderColor = ''; };
$('#hdel').onclick = () => {
  if (!editH || !confirm(`Удалить «${editH.name}» вместе со всей историей? Это нельзя отменить.`)) return;
  S.habits = S.habits.filter(x => x !== editH); delete S.log.h[editH.id]; save(); hdlg.close(); render();
};
$('#harch').onclick = () => { if (!editH) return; editH.to = todayStr(); save(); hdlg.close(); render(); };
$('#addHabit').onclick = () => openHabit(null);

/* ---------- диалог метрики ---------- */
const mdlg = $('#mdlg'); let editM = null;
function openMetric(mt) {
  editM = mt || null;
  $('#mtitle').textContent = mt ? 'Изменить метрику' : 'Новая метрика';
  $('#mname').value = mt ? mt.name : '';
  $('#mdel').classList.toggle('hide', !mt);
  mdlg.showModal(); $('#mname').focus();
}
$('#addMetric').onclick = () => openMetric(null);
$('#mcancel').onclick = () => mdlg.close();
$('#mform').addEventListener('submit', e => {
  const name = $('#mname').value.trim();
  if (!name) { e.preventDefault(); $('#mname').focus(); return; }
  if (editM) editM.name = name; else S.metrics.push({ id: uid(), name });
  save(); render();
});
$('#mdel').onclick = () => {
  if (!editM || !confirm(`Удалить метрику «${editM.name}» вместе со всей историей? Это нельзя отменить.`)) return;
  S.metrics = S.metrics.filter(x => x !== editM); delete S.log.m[editM.id]; save(); mdlg.close(); render();
};
[hdlg, mdlg].forEach(d => d.addEventListener('mousedown', e => { if (e.target === d) d.close(); }));

/* ---------- экспорт / импорт ---------- */
$('#export').onclick = () => {
  S.lastExport = todayStr(); save();
  const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `routine-backup-${todayStr()}.json`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  render();
};
$('#import').onclick = () => $('#file').click();
$('#file').onchange = e => {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const o = JSON.parse(r.result);
      if (!o || !Array.isArray(o.habits) || !o.log) throw new Error('bad');
      if (!confirm('Заменить текущие данные данными из файла?')) return;
      S = o; S.metrics = S.metrics || []; save(); render();
    } catch (err) { alert('Не получилось прочитать файл. Нужен JSON, сохранённый через «Экспорт».'); }
  };
  r.readAsText(f); e.target.value = '';
};

render();

/* ---------- приложение: офлайн и защита данных от очистки ---------- */
try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
try { if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {}); } catch (e) {}
