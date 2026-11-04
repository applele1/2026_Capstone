// ===== 심층 추천 화면 =====
// 조건(버튼 또는 한 문장) → /api/recommend/deep → 이유가 붙은 TOP 10
// 결과를 누르면 행동 기록(recommend_click)을 남기고 상세 창을 엽니다. 관리자는 다른 회원 입장에서 결과와 점수를 볼 수 있어요.
import {request} from './api.js';
const $ = s => document.querySelector(s),
  $$ = s => [...document.querySelectorAll(s)];
const money = n => Number(n).toLocaleString('ko-KR') + '원';
const escape = v =>
  String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]);
const BUDGETS = [6000, 8000, 10000, 15000, 20000];
const PART_LABEL = {
  condition: '조건',
  taste: '취향',
  price: '가격',
  distance: '거리',
  rating: '평점',
  popularity: '인기',
  novelty: '새로움'
};
const SHOW_MORE = 3;
const DEFAULTS = () => ({budget: 10000, types: [], spicy: 'any', portion: 'any', tags: [], walk: 0, categories: []});
const st = {options: null, form: DEFAULTS(), user: null, last: null, asUser: '', expanded: false};
let hooks = {},
  abort;

// ---------- 버튼 그리기 ----------
function chip(group, value, label, emoji, multi) {
  const on = multi ? st.form[group].includes(value) : st.form[group] === value;
  return `<button type="button" class="category${on ? ' active' : ''}" data-chip="${group}" data-value="${escape(value)}" ${multi ? `aria-pressed="${on}"` : `role="radio" aria-checked="${on}"`}>${emoji ? `<span>${emoji}</span>` : ''}${escape(label)}</button>`;
}
function renderChips() {
  const o = st.options,
    put = (g, html) => {
      $(`#deepForm [data-group="${g}"]`).innerHTML = html;
    };
  const budgets = BUDGETS.includes(st.form.budget) ? BUDGETS : [...BUDGETS, st.form.budget].sort((a, b) => a - b); // 한 문장에서 1.2만원처럼 다른 금액이 나오면 버튼을 하나 더 만듭니다.
  put(
    'budget',
    budgets.map(b => chip('budget', b, b >= 10000 ? `${b / 10000}만원` : `${b / 1000}천원`, '', false)).join('')
  );
  put('types', o.types.map(t => chip('types', t.key, t.label, t.emoji, true)).join(''));
  put('spicy', o.spicy.map(t => chip('spicy', t.key, t.label, t.emoji, false)).join(''));
  put('portion', o.portion.map(t => chip('portion', t.key, t.label, t.emoji, false)).join(''));
  put('tags', o.tags.map(t => chip('tags', t.id, t.name, t.emoji, true)).join(''));
  put('walk', o.walk.map(w => chip('walk', w, w ? `도보 ${w}분 이내` : '상관없음', w ? '🚶' : '', false)).join(''));
  put('categories', o.categories.map(c => chip('categories', c.id, c.name, c.emoji, true)).join(''));
  $('#deepCatCount').textContent = st.form.categories.length ? `${st.form.categories.length}개 선택` : '';
}
$('#deepForm').addEventListener('click', e => {
  const b = e.target.closest('[data-chip]');
  if (!b) return;
  const g = b.dataset.chip,
    raw = b.dataset.value,
    v = ['budget', 'walk', 'tags', 'categories'].includes(g) ? Number(raw) : raw;
  if (Array.isArray(st.form[g]))
    st.form[g] = st.form[g].includes(v) ? st.form[g].filter(x => x !== v) : [...st.form[g], v];
  else st.form[g] = v;
  renderChips();
});

// ---------- 조건 요약 ----------
function describe(f) {
  const o = st.options,
    out = [];
  out.push(money(f.budget) + ' 이하');
  for (const k of f.types) {
    const t = o.types.find(x => x.key === k);
    if (t) out.push(t.emoji + ' ' + t.label);
  }
  if (f.spicy !== 'any') out.push(o.spicy.find(x => x.key === f.spicy).label);
  if (f.portion !== 'any') out.push(o.portion.find(x => x.key === f.portion).label);
  for (const id of f.tags) {
    const t = o.tags.find(x => x.id === id);
    if (t) out.push('#' + t.name);
  }
  for (const id of f.categories) {
    const c = o.categories.find(x => x.id === id);
    if (c) out.push(c.name);
  }
  if (f.walk) out.push(`도보 ${f.walk}분 이내`);
  return out.join(' · ');
}
$('#deepReset').addEventListener('click', () => {
  st.form = DEFAULTS();
  renderChips();
});

// ---------- 추천 실행 ----------
function query() {
  const f = st.form,
    p = {budget: f.budget, spicy: f.spicy, portion: f.portion, walk: f.walk};
  for (const k of ['types', 'tags', 'categories']) if (f[k].length) p[k] = f[k].join(',');
  if (st.asUser) p.asUser = st.asUser;
  return new URLSearchParams(p);
}
async function run({scroll = true} = {}) {
  abort?.abort();
  abort = new AbortController();
  const current = abort;
  const box = $('#deepResults');
  box.setAttribute('aria-busy', 'true');
  $('#deepSubmit').disabled = true;
  try {
    const data = await request('/recommend/deep?' + query(), {signal: current.signal});
    if (current !== abort) return;
    st.last = data;
    st.expanded = false;
    render();
    if (scroll) $('#deepSummary').scrollIntoView({behavior: 'smooth', block: 'start'});
  } catch (e) {
    if (e.name === 'AbortError') return;
    box.innerHTML = `<div class="empty-state"><b>${escape(e.message)}</b></div>`;
  } finally {
    if (current === abort) {
      box.removeAttribute('aria-busy');
      $('#deepSubmit').disabled = false;
    }
  }
}
$('#deepForm').addEventListener('submit', e => {
  e.preventDefault();
  run();
});

// ---------- 한 문장 → 조건 ----------
// 서버(/recommend/parse)가 키워드 규칙으로 조건만 뽑고, 그 조건을 버튼에 채운 뒤 평소처럼 추천합니다.
async function runText() {
  const text = $('#deepText').value.trim(),
    help = $('#deepTextHelp');
  if (!text) {
    $('#deepText').focus();
    return;
  }
  $('#deepTextSubmit').disabled = true;
  try {
    const {options: p} = await request('/recommend/parse?' + new URLSearchParams({text}));
    const found =
      p.types.length ||
      p.tags.length ||
      p.categories.length ||
      ['spicy', 'portion', 'walk', 'budget'].some(k => k in p);
    help.classList.toggle('warn', !found);
    if (!found) {
      help.textContent = '알아들은 조건이 없어요. ‘국물’, ‘안 맵게’, ‘가까운’, ‘8천원’처럼 말해 보세요.';
      return;
    }
    // 예산은 말하지 않았으면 지금 고른 값을 그대로 씁니다.
    st.form = {...DEFAULTS(), budget: st.form.budget, ...p};
    renderChips();
    help.textContent = '알아들은 조건: ' + describe(st.form);
    await run();
  } catch (e) {
    help.classList.add('warn');
    help.textContent = e.message;
  } finally {
    $('#deepTextSubmit').disabled = false;
  }
}
$('#deepTextForm').addEventListener('submit', e => {
  e.preventDefault();
  runText();
});
$('#deepTextForm').addEventListener('click', e => {
  const b = e.target.closest('[data-example]');
  if (b) {
    $('#deepText').value = b.textContent;
    runText();
  }
});

function headline(d) {
  const wants =
    d.options.types.length || d.options.tags.length || d.options.spicy !== 'any' || d.options.portion !== 'any';
  if (wants && d.personalized) return '🔥 지금 조건과 내 취향에 가장 잘 맞아요';
  if (wants) return '🔥 지금 조건에 가장 잘 맞아요';
  if (d.personalized) return '💛 내 취향에 가장 잘 맞아요';
  return '⭐ 학생들이 많이 찾는 메뉴예요';
}
function breakdownHtml(x) {
  if (!x.breakdown || !$('#deepShowScore').checked) return '';
  const rows = Object.entries(x.breakdown)
    .filter(([, v]) => v.weight > 0)
    .map(
      ([k, v]) =>
        `<div class="bd-row"><span>${PART_LABEL[k]} <small>${v.weight}%</small></span><span class="bd-bar"><i style="width:${v.value}%"></i></span><b>${v.points}</b></div>`
    )
    .join('');
  return `<div class="deep-breakdown" aria-label="점수 상세"><div class="bd-total">총점 <b>${x.score}</b> · 조건 일치 ${x.match}%</div>${rows}</div>`;
}
const MEDAL = ['🥇', '🥈', '🥉'];
function itemHtml(x, i, d) {
  const top = i < 3,
    place = `${escape(x.name)} · 도보 약 ${x.walkMinutes}분${x.rating !== null ? ` · ★ ${x.rating.toFixed(1)}` : ''}`;
  return `<article class="deep-item${top ? ' top' : ''}${i === 0 ? ' first' : ''}" data-deep="${i}" tabindex="0" role="button" aria-label="${i + 1}위 ${escape(x.menuName)} ${money(x.price)}, ${escape(x.name)}. 상세 보기">
  <div class="deep-rank" aria-hidden="true">${MEDAL[i] || i + 1}</div><div class="food-image" aria-hidden="true">${escape(x.emoji)}</div>
  <div class="deep-body">${i === 0 ? `<span class="deep-headline">${headline(d)}</span>` : ''}
   <h3>${escape(x.menuName)} <b class="menu-price">${money(x.price)}</b></h3><div class="menu-place">${place}</div>
   ${x.reasons.length ? `<ul class="deep-reasons">${x.reasons.map(r => `<li>${r.emoji} ${escape(r.text)}</li>`).join('')}</ul>` : ''}
   ${breakdownHtml(x)}</div>
  <button type="button" class="review-open" data-deep-detail="${i}" tabindex="-1" aria-hidden="true">상세 보기</button></article>`;
}
function render() {
  const d = st.last;
  if (!d) return;
  const who = d.asUser ? `<b>${escape(d.asUser.name)}</b>님 입장에서 본 결과예요. ` : '';
  let summary;
  if (d.personalized)
    summary = `${who}💛 취향 반영 중: ${d.profile.liked.map(l => `<span class="taste-chip">${l.emoji} ${escape(l.text)}</span>`).join('') || '특징을 찾는 중이에요'} <small>(기록 ${d.profile.signals}개)</small>`;
  else if (d.asUser || st.user)
    summary = `${who}아직 기록이 적어서 평점·인기 위주로 추천했어요. 식당을 둘러보고 찜·후기를 남기면 점점 내 취향에 맞춰져요.`;
  else
    summary =
      '로그인하지 않아 평점·인기 위주로 추천했어요. <button type="button" class="chip-clear" data-deep-login>로그인하고 취향 반영하기</button>';
  $('#deepSummary').innerHTML =
    `<p>${summary}</p><p class="deep-cond">조건: ${escape(describe(d.options))}${d.relaxed ? ' · <b>딱 맞는 메뉴가 적어서 비슷한 메뉴까지 보여 드려요.</b>' : ''}</p>`;
  const box = $('#deepResults');
  if (!d.items.length) {
    box.innerHTML =
      '<div class="empty-state"><b>조건에 맞는 메뉴가 없어요.</b><p>예산을 높이거나 거리·카테고리·‘안 맵게’ 조건을 풀어 보세요.</p></div>';
    return;
  }
  const visible = st.expanded ? d.items : d.items.slice(0, SHOW_MORE);
  box.innerHTML =
    `<div class="deep-list">${visible.map((x, i) => itemHtml(x, i, d)).join('')}</div>` +
    (d.items.length > SHOW_MORE
      ? `<button type="button" class="ghost-btn deep-more-btn" data-deep-more>${st.expanded ? '접기' : `다른 추천 ${d.items.length - SHOW_MORE}개 더 보기`}</button>`
      : '');
}
async function open(i) {
  const x = st.last?.items[i];
  if (!x) return;
  // 관리자가 다른 회원으로 보는 중에는 내 기록에 남기지 않습니다.
  if (st.user && !st.last.asUser)
    request('/interactions', {
      method: 'POST',
      body: {restaurantId: x.restaurantId, menuId: x.menuId, type: 'recommend_click'}
    }).catch(() => {});
  hooks.showDetail?.(x.restaurantId);
}
$('#deepResults').addEventListener('click', e => {
  if (e.target.closest('[data-deep-more]')) {
    st.expanded = !st.expanded;
    render();
    return;
  }
  const card = e.target.closest('[data-deep]');
  if (card) open(Number(card.dataset.deep));
});
$('#deepResults').addEventListener('keydown', e => {
  const card = e.target.closest?.('[data-deep]');
  if (card && e.target === card && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    open(Number(card.dataset.deep));
  }
});
$('#deepSummary').addEventListener('click', e => {
  if (e.target.closest('[data-deep-login]')) hooks.loginPrompt?.();
});

// ---------- 관리자 ----------
$('#deepAsUser').addEventListener('change', () => {
  st.asUser = $('#deepAsUser').value;
  run({scroll: false});
});
$('#deepShowScore').addEventListener('change', render);
async function loadAdmin() {
  const admin = st.user?.role === 'admin';
  $('#deepAdmin').hidden = !admin;
  if (!admin) {
    st.asUser = '';
    return;
  }
  try {
    const [users, stats] = await Promise.all([request('/admin/users'), request('/admin/stats')]);
    const sel = $('#deepAsUser'),
      keep = st.asUser;
    sel.innerHTML =
      '<option value="">나 (관리자)</option>' +
      users.items
        .filter(u => u.id !== st.user.id)
        .map(
          u =>
            `<option value="${u.id}">${escape(u.name)} · ${escape(u.email)} · 기록 ${u.signals}${u.liked.length ? ' · ' + escape(u.liked.join(', ')) : ''}</option>`
        )
        .join('');
    sel.value = keep;
    const it = stats.interactions || {};
    $('#deepStats').textContent =
      `회원 ${stats.users}명 · 후기 ${stats.reviews} · 찜 ${stats.favorites} · 조회 ${it.view || 0} · 클릭 ${it.click || 0} · 추천 클릭 ${it.recommend_click || 0}`;
  } catch (e) {
    $('#deepStats').textContent = e.message;
  }
}

// ---------- 앱과 연결 ----------
function hint() {
  $('#deepPersonalHint').textContent = st.user
    ? `${st.user.name}님이 본 식당·고른 메뉴·찜·후기로 취향을 반영해요`
    : '로그인하면 내가 본 식당·찜·후기로 취향을 반영해요';
}
export async function initDeep(h) {
  hooks = h;
  st.user = h.user || null;
  hint();
  try {
    st.options = await request('/recommend/options');
    renderChips();
  } catch (e) {
    $('#deepForm').innerHTML = `<div class="empty-state"><b>${escape(e.message)}</b></div>`;
    return;
  }
  await loadAdmin();
}
// 로그인·로그아웃하면 안내 문구, 관리자 도구, 이미 보던 결과를 새로 고칩니다.
export async function deepAuthChanged(user) {
  st.user = user || null;
  hint();
  await loadAdmin();
  if (st.last) await run({scroll: false});
}
