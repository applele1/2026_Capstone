import {request} from './api.js';
import {initializeMap, showRestaurant, showSchool, relayout} from './map.js';
import {initDeep, deepAuthChanged} from './deep.js';
const $ = s => document.querySelector(s),
  $$ = s => [...document.querySelectorAll(s)];
const money = n => Number(n).toLocaleString('ko-KR') + '원';
const escape = value =>
  String(value ?? '').replace(
    /[&<>"']/g,
    c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]
  );
const PAGE_SIZE = 3,
  BUDGET_STEP = 500,
  BUDGET_MIN = 3000,
  BUDGET_MAX = 30000;
const isMobile = () => window.matchMedia('(max-width:900px)').matches;
const state = {
  user: null,
  category: 'all',
  sort: 'recommend',
  rows: [],
  page: 0,
  favorites: [],
  recent: [],
  detailId: null,
  selectedKey: null,
  signup: false
};
let abort, lastFocused;

function toast(text) {
  $('#toast').textContent = text;
  $('#toast').classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => $('#toast').classList.remove('show'), 3200);
}
function openDialog(id) {
  if (!$(id).open) lastFocused = document.activeElement;
  $(id).showModal();
}
const walkText = r => `도보 약 ${r.walkMinutes}분`;
const ratingText = r => (r.rating === null ? '아직 평점이 없어요' : `★ ${r.rating.toFixed(1)}`);

// ===== 계정 =====
// 로그인 상태에서는 버튼을 눌러도 바로 로그아웃되지 않고 '내 계정' 창이 열립니다.
function account() {
  const btn = $('#loginOpen');
  btn.textContent = state.user ? `${state.user.name}님 ▾` : '로그인 / 회원가입';
  btn.setAttribute('aria-haspopup', state.user ? 'dialog' : 'false');
}
function switchAuth(signup) {
  state.signup = signup;
  $('#authTitle').textContent = signup ? '밥잇 회원가입' : '밥잇에 오신 것을 환영해요!';
  $('#nameField').hidden = !signup;
  $('#authName').required = signup;
  $('#agreeField').hidden = !signup;
  $('#authAgree').required = signup;
  $('#authSubmit').textContent = signup ? '회원가입' : '로그인';
  $('#authPassword').autocomplete = signup ? 'new-password' : 'current-password';
  $('#switchAuth').textContent = signup ? '이미 회원인가요? 로그인' : '처음 오셨나요? 회원가입';
  $('#authError').textContent = '';
}
function loginPrompt() {
  switchAuth(false);
  openDialog('#authDialog');
}
$('#authDialog').addEventListener('close', () => {
  if (!state.user) state.afterLogin = null;
});
function openAccount() {
  $('#accountTitle').textContent = `${state.user.name}님`;
  $('#accountEmail').textContent = state.user.email;
  $$('#accountDialog details').forEach(d => (d.open = false));
  $('#passwordForm').reset();
  $('#deleteForm').reset();
  $('#passwordError').textContent = $('#deleteError').textContent = '';
  openDialog('#accountDialog');
}
async function afterAuthChange(message) {
  account();
  await Promise.all([loadAll(), deepAuthChanged(state.user)]);
  if (state.detailId && $('#detailDialog').open) await showDetail(state.detailId, {reopen: false});
  if (message) toast(message);
}
$('#loginOpen').addEventListener('click', () => (state.user ? openAccount() : loginPrompt()));
$('#logoutBtn').addEventListener('click', async () => {
  try {
    await request('/auth/logout', {method: 'POST', body: {}});
    state.user = null;
    $('#accountDialog').close();
    await afterAuthChange('로그아웃했어요.');
  } catch (e) {
    toast(e.message);
  }
});
$('#passwordForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = e.submitter;
  btn.disabled = true;
  $('#passwordError').textContent = '';
  try {
    const data = await request('/auth/password', {
      method: 'PUT',
      body: {currentPassword: $('#currentPassword').value, newPassword: $('#newPassword').value}
    });
    $('#passwordForm').reset();
    $('#accountDialog').close();
    toast(data.message);
  } catch (err) {
    $('#passwordError').textContent = err.message;
  } finally {
    btn.disabled = false;
  }
});
$('#deleteForm').addEventListener('submit', async e => {
  e.preventDefault();
  if (!confirm('정말 탈퇴할까요? 찜·최근 기록·후기가 모두 삭제됩니다.')) return;
  const btn = e.submitter;
  btn.disabled = true;
  $('#deleteError').textContent = '';
  try {
    const data = await request('/auth/account', {method: 'DELETE', body: {password: $('#deletePassword').value}});
    state.user = null;
    $('#accountDialog').close();
    await afterAuthChange(data.message);
  } catch (err) {
    $('#deleteError').textContent = err.message;
  } finally {
    btn.disabled = false;
  }
});
$('#switchAuth').addEventListener('click', () => switchAuth(!state.signup));
$('#authForm').addEventListener('submit', async e => {
  e.preventDefault();
  $('#authSubmit').disabled = true;
  $('#authError').textContent = '';
  try {
    const data = await request('/auth/' + (state.signup ? 'signup' : 'login'), {
      method: 'POST',
      body: {
        email: $('#authEmail').value,
        password: $('#authPassword').value,
        name: $('#authName').value,
        agree: $('#authAgree').checked
      }
    });
    state.user = data.user;
    $('#authDialog').close();
    $('#authForm').reset();
    await afterAuthChange('반가워요, ' + state.user.name + '님!');
    if (state.afterLogin) {
      const key = state.afterLogin;
      state.afterLogin = null;
      openMyList(key);
    }
  } catch (err) {
    $('#authError').textContent = err.message;
  } finally {
    $('#authSubmit').disabled = false;
  }
});

// ===== 목록 카드 (한 줄 = 메뉴 한 개) =====
const cardKey = r => `${r.restaurantId ?? r.id}-${r.menuId ?? 0}`;
function rowHtml(r, opts) {
  const rid = r.restaurantId ?? r.id;
  return `<article class="restaurant-card menu-card${state.selectedKey === cardKey(r) ? ' selected' : ''}" data-focus="${rid}" data-key="${cardKey(r)}" tabindex="0" role="button" aria-label="${escape(r.menuName)} ${r.price != null ? money(r.price) : ''}, ${escape(r.name)}, ${walkText(r)}"><div class="food-image" aria-hidden="true">${escape(r.emoji)}</div><div class="restaurant-info"><h3>${escape(r.menuName)} <b class="menu-price">${r.price != null ? money(r.price) : ''}</b>${opts?.search === true && $('#keyword').value.trim() && r.price > budgetValue() ? ' <span class="shared-tag">예산 초과</span>' : ''}</h3><div class="menu-place">${escape(r.name)}</div><div class="meta">${r.categoryName ? escape(r.categoryName) + ' · ' : ''}<b class="walk">${walkText(r)}</b> <span class="straight">(직선 ${r.distance.toLocaleString()}m)</span>${r.score !== undefined ? ` · 추천 점수 ${r.score}` : ''}</div></div><div class="rating"><div>${r.rating === null ? '평점 없음' : '★ ' + r.rating.toFixed(1)}</div><small>후기 ${r.reviewCount}개</small><button class="heart ${r.saved ? 'saved' : ''}" data-save="${rid}" aria-label="${escape(r.name)} ${r.saved ? '찜 해제' : '찜하기'}" aria-pressed="${!!r.saved}">${r.saved ? '♥' : '♡'}</button><div class="card-actions"><button class="review-open" data-detail="${rid}" aria-label="${escape(r.name)} 상세 정보와 후기">상세·후기</button></div></div></article>`;
}

// ===== 지도 / 모바일 목록·지도 탭 =====
function setView(view) {
  $('#resultLayout').dataset.view = view;
  $$('[data-view][role=tab]').forEach(t => t.setAttribute('aria-selected', String(t.dataset.view === view)));
  if (view === 'map') requestAnimationFrame(relayout);
}
$$('[data-view][role=tab]').forEach(t => t.addEventListener('click', () => setView(t.dataset.view)));
function markSelected() {
  $$('#resultList [data-focus]').forEach(c => c.classList.toggle('selected', c.dataset.key === state.selectedKey));
}
function selectRow(row, {toMap = true} = {}) {
  if (!row) return;
  state.selectedKey = cardKey(row);
  markSelected();
  if (!showRestaurant(row)) {
    if (toMap) toast('지도를 불러온 뒤 위치를 확인할 수 있어요.');
    return;
  }
  if (toMap && isMobile()) {
    setView('map');
    $('#mapPanel').scrollIntoView({behavior: 'smooth', block: 'center'});
  }
}
// 추천 목록에 있는 식당이면 그 카드가 있는 페이지로 이동해 선택하고 마커를 옮깁니다.
function selectRestaurant(id) {
  const index = state.rows.findIndex(r => r.restaurantId === id);
  if (index < 0) return;
  setPage(Math.floor(index / PAGE_SIZE));
  selectRow(state.rows[index], {toMap: false});
}

// ===== 예산 입력: 숫자만 허용, 500원 단위 증감 =====
const budgetInput = $('#budget');
const digitsOnly = v =>
  String(v)
    .replace(/\D/g, '')
    .replace(/^0+(?=\d)/, '')
    .slice(0, 5);
function budgetValue() {
  return Number(budgetInput.value) || 0;
}
function syncChips() {
  $$('[data-budget]').forEach(x => x.classList.toggle('active', Number(x.dataset.budget) === budgetValue()));
}
function setBudget(v) {
  budgetInput.value = String(Math.min(BUDGET_MAX, Math.max(BUDGET_MIN, v)));
  syncChips();
}
// 500원 단위가 아니면 가까운 500원 단위로 먼저 맞춥니다. (예: 7,300원 ▲ → 7,500원, ▼ → 7,000원)
function stepBudget(dir) {
  const v = budgetValue();
  setBudget(
    dir > 0
      ? Math.floor(v / BUDGET_STEP) * BUDGET_STEP + BUDGET_STEP
      : Math.ceil(v / BUDGET_STEP) * BUDGET_STEP - BUDGET_STEP
  );
}
budgetInput.addEventListener('beforeinput', e => {
  if (e.data && /\D/.test(e.data) && e.inputType !== 'insertFromPaste') e.preventDefault();
});
budgetInput.addEventListener('input', () => {
  const clean = digitsOnly(budgetInput.value);
  if (clean !== budgetInput.value) budgetInput.value = clean;
  syncChips();
});
budgetInput.addEventListener('keydown', e => {
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    e.preventDefault();
    stepBudget(e.key === 'ArrowUp' ? 1 : -1);
  }
});
$$('[data-step]').forEach(b =>
  b.addEventListener('click', () => {
    stepBudget(Number(b.dataset.step));
    load();
  })
);

// ===== 추천 목록: PAGE_SIZE(3)개씩 한 페이지, < > 버튼이나 옆으로 밀어서 넘기기 =====
$('#prevPage').setAttribute('aria-label', `이전 추천 메뉴 ${PAGE_SIZE}개`);
$('#nextPage').setAttribute('aria-label', `다음 추천 메뉴 ${PAGE_SIZE}개`);
const pageCount = () => Math.max(1, Math.ceil(state.rows.length / PAGE_SIZE));
const pageRows = (page = state.page) => state.rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
const listEl = $('#resultList');
// 페이지마다 카드 수가 달라도 빈 공간이 생기지 않도록 목록 높이를 현재 페이지에 맞춥니다.
function fitHeight() {
  const page = listEl.children[state.page];
  listEl.style.height = page && page.classList.contains('result-page') ? page.offsetHeight + 'px' : '';
}
function updateKeywordChip() {
  const q = $('#keyword').value.trim();
  $('#resultTitle').innerHTML = q ? '검색한 <em>메뉴·식당</em>' : '예산 안의 <em>추천 메뉴</em>';
  $('#keywordClear').hidden = !$('#keyword').value;
  const chip = $('#keywordChip');
  chip.hidden = !q;
  chip.innerHTML = q
    ? `🔍 ‘${escape(q)}’ 검색 결과 <small>(예산·카테고리와 상관없이 전체에서 찾았어요)</small> <button type="button" class="chip-clear" data-keyword-clear>검색어 지우기 ×</button>`
    : '';
}
function updatePager() {
  fitHeight();
  const total = pageCount();
  $('#pager').hidden = state.rows.length <= PAGE_SIZE;
  $('#pageInfo').textContent = `${state.page + 1} / ${total}`;
  $('#prevPage').disabled = state.page <= 0;
  $('#nextPage').disabled = state.page >= total - 1;
  $('#resultCount').textContent = state.rows.length
    ? `식당 ${state.rows.length}곳의 추천 메뉴 · ${state.page + 1}/${total}페이지`
    : '식당 0곳의 추천 메뉴';
  $('#randomPick').disabled = !state.rows.length;
}
function setPage(page, {scroll = true, smooth = true} = {}) {
  const next = Math.min(pageCount() - 1, Math.max(0, page));
  state.page = next;
  if (scroll) listEl.scrollTo({left: next * listEl.clientWidth, behavior: smooth ? 'smooth' : 'auto'});
  updatePager();
}
function renderSearch(keepPage = false) {
  if (!keepPage) state.page = 0;
  state.page = Math.min(state.page, pageCount() - 1);
  if (!state.rows.length) {
    const q = $('#keyword').value.trim();
    listEl.innerHTML = `<div class="empty-state"><b>${q ? `‘${escape(q)}’에 맞는 메뉴나 식당이 없어요.` : '조건에 맞는 메뉴가 없어요.'}</b><p>${q ? '다른 이름으로 검색해 보세요. 예: 버거, 국밥, 돈까스' : '예산을 높이거나 다른 카테고리를 선택해 보세요.'}</p></div>`;
  } else {
    const pages = [];
    for (let i = 0; i < pageCount(); i++)
      pages.push(
        `<div class="result-page" role="group" aria-label="${pageCount()}페이지 중 ${i + 1}페이지">${pageRows(i)
          .map(r => rowHtml(r, {search: true}))
          .join('')}</div>`
      );
    listEl.innerHTML = pages.join('');
  }
  listEl.scrollLeft = state.page * listEl.clientWidth;
  updatePager();
}
function showSearchError(message) {
  $('#resultCount').textContent = '식당을 불러오지 못했어요';
  $('#pager').hidden = true;
  state.rows = [];
  listEl.innerHTML = `<div class="empty-state"><b>${escape(message)}</b><button class="ghost-btn error-retry" data-retry>다시 시도</button></div>`;
  showSchool();
}
async function load({keep = false} = {}) {
  abort?.abort();
  abort = new AbortController();
  const current = abort;
  listEl.setAttribute('aria-busy', 'true');
  try {
    const budget = budgetValue();
    if (budget < BUDGET_MIN || budget > BUDGET_MAX) {
      showSearchError('예산은 3,000~30,000원 사이로 입력해 주세요.');
      budgetInput.focus();
      return;
    }
    const params = {budget, category: state.category, sort: state.sort};
    const q = $('#keyword').value.trim();
    if (q) params.q = q;
    updateKeywordChip();
    const data = await request('/restaurants?' + new URLSearchParams(params), {signal: current.signal});
    if (current !== abort) return;
    state.rows = data.items;
    if (keep) {
      renderSearch(true);
      const row = state.rows.find(r => cardKey(r) === state.selectedKey);
      if (row) selectRow(row, {toMap: false});
      return;
    }
    // 새로 검색하면 선택을 풀고 마커를 학교로 되돌립니다. 메뉴를 누르면 그 식당으로 옮겨갑니다.
    state.selectedKey = null;
    renderSearch();
    showSchool();
  } catch (e) {
    if (e.name === 'AbortError') return;
    showSearchError(e.message);
  } finally {
    if (current === abort) listEl.removeAttribute('aria-busy');
  }
}
// '다시 시도': 지금 선택한 조건 그대로 다시 불러옵니다.
const retrySearch = () => load({keep: true});
$('#prevPage').addEventListener('click', () => setPage(state.page - 1));
$('#nextPage').addEventListener('click', () => setPage(state.page + 1));
// 손가락으로 옆으로 밀어서 넘긴 경우에도 현재 페이지를 맞춰 줍니다.
listEl.addEventListener('scroll', () => {
  clearTimeout(listEl.timer);
  listEl.timer = setTimeout(() => {
    if (!state.rows.length) return;
    const page = Math.round(listEl.scrollLeft / listEl.clientWidth);
    if (page !== state.page) setPage(page, {scroll: false});
  }, 120);
});
listEl.addEventListener('keydown', e => {
  if (e.target.closest?.('input,textarea,select')) return;
  if (e.key === 'ArrowRight' && state.page < pageCount() - 1) {
    e.preventDefault();
    setPage(state.page + 1);
  }
  if (e.key === 'ArrowLeft' && state.page > 0) {
    e.preventDefault();
    setPage(state.page - 1);
  }
});
window.addEventListener('resize', () => {
  listEl.scrollLeft = state.page * listEl.clientWidth;
  fitHeight();
});
// 🎲 오늘 뭐 먹지?: 지금 추천 목록 중 하나를 무작위로 골라 보여줍니다.
$('#randomPick').addEventListener('click', () => {
  if (!state.rows.length) return;
  let i = Math.floor(Math.random() * state.rows.length);
  if (state.rows.length > 1 && cardKey(state.rows[i]) === state.selectedKey) i = (i + 1) % state.rows.length;
  const row = state.rows[i];
  setPage(Math.floor(i / PAGE_SIZE));
  selectRow(row, {toMap: false});
  listEl.querySelector(`[data-key="${cardKey(row)}"]`)?.classList.add('picked');
  toast(`오늘은 ${row.name}의 ${row.menuName} 어때요? 🍽️`);
});

// ===== 찜한 맛집 / 최근 본 식당: 상단 메뉴를 누르면 각각의 확인창으로 열립니다 =====
const myLists = {
  favorites: {list: '#favoritesList', count: '#favoritesCount', empty: '아직 찜한 식당이 없어요.'},
  recent: {list: '#recentList', count: '#recentCount', empty: '아직 확인한 식당이 없어요.'}
};
async function loadMine(which = ['favorites', 'recent']) {
  for (const key of which) {
    const cfg = myLists[key];
    const el = $(cfg.list);
    if (!state.user) {
      state[key] = [];
      $(cfg.count).textContent = '내 식당 목록';
      el.innerHTML = '<div class="empty-state"><b>로그인하면 내 식당 목록을 볼 수 있어요.</b></div>';
      continue;
    }
    el.setAttribute('aria-busy', 'true');
    try {
      const data = await request('/me/' + key);
      state[key] = data.items;
      $(cfg.count).textContent = `${data.items.length}개의 식당`;
      el.innerHTML = data.items.length
        ? data.items.map(rowHtml).join('')
        : `<div class="empty-state"><b>${cfg.empty}</b><p>맛집 찾기에서 관심 있는 식당을 확인해 보세요.</p><button class="ghost-btn" data-close-list>맛집 찾으러 가기</button></div>`;
    } catch (e) {
      $(cfg.count).textContent = '목록을 불러오지 못했어요';
      el.innerHTML = `<div class="empty-state"><b>${escape(e.message)}</b><button class="ghost-btn error-retry" data-retry>다시 시도</button></div>`;
    } finally {
      el.removeAttribute('aria-busy');
    }
  }
}
const loadAll = () => Promise.all([load({keep: true}), loadMine()]);
// 로그인 전이면 로그인 창을 먼저 열고, 로그인하면 바로 그 목록 창을 열어 줍니다.
function openMyList(key) {
  $('#mainNav').classList.remove('open');
  $('#menuToggle').setAttribute('aria-expanded', 'false');
  if (!state.user) {
    state.afterLogin = key;
    toast(key === 'favorites' ? '찜한 맛집은 로그인 후 볼 수 있어요.' : '최근 본 식당은 로그인 후 볼 수 있어요.');
    return loginPrompt();
  }
  openDialog('#' + key + 'Dialog');
  loadMine([key]);
}
$$('[data-mylist]').forEach(b => b.addEventListener('click', () => openMyList(b.dataset.mylist)));

// ===== 상세 + 후기 (한 창) =====
const fmtDate = d => new Date(d).toLocaleDateString('ko-KR', {timeZone: 'Asia/Seoul'});
const reviewItems = reviews =>
  reviews.length
    ? reviews
        .map(
          v =>
            `<article class="review-item${v.userId === state.user?.id ? ' mine' : ''}"><div class="review-item-top"><div><b>${escape(v.name)}${v.userId === state.user?.id ? ' <span class="mine-tag">내 후기</span>' : ''}</b><span aria-label="${v.rating}점">${'★'.repeat(v.rating)}${'☆'.repeat(5 - v.rating)}</span></div><small>${fmtDate(v.createdAt)}${v.updatedAt ? ' · 수정됨' : ''}</small></div><p>${escape(v.comment)}</p></article>`
        )
        .join('')
    : '<div class="review-empty">첫 번째 후기를 남겨보세요.</div>';
const menuRows = menus =>
  menus
    .map(
      m =>
        `<tr${m.shared ? ' class="shared"' : ''}><td>${escape(m.name)}${m.shared ? ' <span class="shared-tag">여럿이</span>' : ''}${m.categories.length ? `<small>${m.categories.map(escape).join(' · ')}</small>` : ''}</td><td>${money(m.price)}</td></tr>`
    )
    .join('');
async function showDetail(id, {reopen = true} = {}) {
  state.detailId = id;
  $('#reviewError').textContent = '';
  if (reopen) {
    $('#reviewForm').reset();
    $('#reviewForm').hidden = true;
    $('#reviewLogin').hidden = true;
    $('#detailBody').innerHTML = '<p class="loading">식당 정보를 불러오고 있어요.</p>';
    openDialog('#detailDialog');
  }
  try {
    const data = await request('/restaurants/' + id);
    if (state.detailId !== id) return;
    const r = data.restaurant;
    const budget = budgetValue();
    $('#detailBody').innerHTML =
      `<div class="detail-head"><span class="eyebrow">${r.emoji} ${escape(r.categoryName)}</span><h2 id="detailTitle">${escape(r.name)}</h2><p class="detail-meta">${escape(r.address)}<br>학교에서 ${walkText(r)} (직선 ${r.distance.toLocaleString()}m)</p></div>
  <div class="detail-actions"><button type="button" class="ghost-btn" data-detail-save="${r.id}" aria-pressed="${r.saved}">${r.saved ? '♥ 찜 해제' : '♡ 찜하기'}</button><button type="button" class="ghost-btn" data-detail-map="${r.id}">🗺️ 지도에서 보기</button><button type="button" class="ghost-btn" data-detail-reviews>💬 후기 ${r.reviewCount}개 보기</button></div>
  <table class="menu-table"><caption>메뉴와 가격 <small>(${r.menus.length}개 · 예산 ${money(budget)} 초과는 흐리게)</small></caption><tbody>${menuRows(r.menus)}</tbody></table>
  <h3 class="review-heading" id="reviewHeading">후기</h3><div class="detail-summary">${ratingText(r)} · 후기 ${r.reviewCount}개</div><div class="review-list">${reviewItems(data.reviews)}</div>`;
    $$('#detailBody .menu-table tr').forEach((tr, i) => tr.classList.toggle('over-budget', r.menus[i].price > budget));
    state.detail = r;
    const own = data.reviews.find(v => v.userId === state.user?.id);
    $('#reviewForm').hidden = !state.user;
    $('#reviewLogin').hidden = !!state.user;
    $('#deleteReview').hidden = !own;
    $('#reviewFormTitle').textContent = own ? '내 후기 수정하기' : '나도 후기 남기기';
    if (reopen && own) {
      $('#rating').value = own.rating;
      $('#comment').value = own.comment;
    }
  } catch (e) {
    $('#detailBody').textContent = e.message;
  }
}
$('#detailDialog').addEventListener('click', async e => {
  const save = e.target.closest('[data-detail-save]'),
    onMap = e.target.closest('[data-detail-map]');
  if (e.target.closest('[data-detail-reviews]'))
    return $('#reviewHeading')?.scrollIntoView({behavior: 'smooth', block: 'start'});
  if (e.target.closest('[data-login]')) {
    $('#detailDialog').close();
    return loginPrompt();
  }
  if (save) {
    if (!state.user) {
      $('#detailDialog').close();
      return loginPrompt();
    }
    save.disabled = true;
    try {
      const saved = !state.detail.saved;
      await request('/restaurants/' + state.detail.id + '/favorite', {method: 'PUT', body: {saved}});
      toast(saved ? '찜한 맛집에 저장했어요.' : '찜 목록에서 삭제했어요.');
      await Promise.all([showDetail(state.detail.id, {reopen: false}), refreshSaved()]);
    } catch (err) {
      toast(err.message);
    } finally {
      save.disabled = false;
    }
  }
  if (onMap) {
    const r = state.detail;
    $('#detailDialog').close();
    $$('.list-modal[open]').forEach(d => d.close());
    const row = state.rows.find(x => x.restaurantId === r.id);
    if (row) {
      selectRestaurant(r.id);
    } else if (!showRestaurant(r)) {
      return toast('지도를 불러온 뒤 위치를 확인할 수 있어요.');
    }
    if (isMobile()) setView('map');
    $('#mapPanel').scrollIntoView({behavior: 'smooth', block: 'center'});
  }
});
$('#reviewForm').addEventListener('submit', async e => {
  e.preventDefault();
  if (!state.user) {
    $('#detailDialog').close();
    loginPrompt();
    return;
  }
  const button = e.submitter;
  button.disabled = true;
  try {
    await request('/restaurants/' + state.detailId + '/reviews', {
      method: 'POST',
      body: {rating: Number($('#rating').value), comment: $('#comment').value}
    });
    await showDetail(state.detailId, {reopen: false});
    await Promise.all([load({keep: true}), loadMine()]);
    toast('후기를 저장했어요.');
  } catch (err) {
    $('#reviewError').textContent = err.message;
  } finally {
    button.disabled = false;
  }
});
$('#deleteReview').addEventListener('click', async e => {
  if (!confirm('내 후기를 삭제할까요?')) return;
  const button = e.currentTarget;
  button.disabled = true;
  try {
    await request('/restaurants/' + state.detailId + '/reviews', {method: 'DELETE', body: {}});
    $('#reviewForm').reset();
    await showDetail(state.detailId, {reopen: false});
    await Promise.all([load({keep: true}), loadMine()]);
    toast('후기를 삭제했어요.');
  } catch (err) {
    $('#reviewError').textContent = err.message;
  } finally {
    button.disabled = false;
  }
});

// ===== 창 공통 =====
$$('[data-close]').forEach(b => b.addEventListener('click', () => $('#' + b.dataset.close).close()));
$$('dialog').forEach(d => {
  d.addEventListener('close', () => {
    lastFocused?.focus();
    if (d.id === 'detailDialog') {
      state.detailId = null;
      if (state.user) loadMine(['recent']);
    }
  }); // 창 바깥(어두운 배경)을 눌렀다 뗐을 때만 닫습니다. 입력칸에서 글자를 드래그하다 바깥에서 마우스를 놓은 경우는 닫지 않습니다.
  const outside = e => {
    const rect = d.getBoundingClientRect();
    return (
      e.target === d &&
      (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom)
    );
  };
  let pressedOutside = false;
  d.addEventListener('pointerdown', e => {
    pressedOutside = outside(e);
  });
  d.addEventListener('click', e => {
    if (pressedOutside && outside(e)) d.close();
    pressedOutside = false;
  });
});

// ===== 상단 메뉴: 해당 섹션으로 부드럽게 스크롤 =====
$$('[data-nav]').forEach(a =>
  a.addEventListener('click', e => {
    const target = document.getElementById(a.dataset.nav);
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({behavior: 'smooth', block: 'start'});
    history.replaceState(null, '', '#' + target.id);
    $('#mainNav').classList.remove('open');
    $('#menuToggle').setAttribute('aria-expanded', 'false');
  })
);
$('#menuToggle').addEventListener('click', () => {
  const opened = $('#mainNav').classList.toggle('open');
  $('#menuToggle').setAttribute('aria-expanded', String(opened));
});

// ===== 검색 조건 =====
$('#searchForm').addEventListener('submit', e => {
  e.preventDefault();
  load();
});
$('#keywordForm').addEventListener('submit', e => {
  e.preventDefault();
  load();
  $('#results').scrollIntoView({behavior: 'smooth', block: 'start'});
});
$('#keyword').addEventListener('input', () => {
  $('#keywordClear').hidden = !$('#keyword').value;
});
$('#keyword').addEventListener('search', () => {
  if (!$('#keyword').value) load();
});
function clearKeyword() {
  $('#keyword').value = '';
  load();
}
$('#keywordClear').addEventListener('click', () => {
  clearKeyword();
  $('#keyword').focus();
});
$('#keywordChip').addEventListener('click', e => {
  if (e.target.closest('[data-keyword-clear]')) clearKeyword();
});
$$('[data-budget]').forEach(b =>
  b.addEventListener('click', () => {
    setBudget(Number(b.dataset.budget));
    load();
  })
);
$$('[data-category]').forEach(b =>
  b.addEventListener('click', () => {
    state.category = b.dataset.category;
    $$('[data-category]').forEach(x => {
      x.classList.toggle('active', x === b);
      x.setAttribute('aria-pressed', String(x === b));
    });
    load();
  })
);
$$('[data-sort]').forEach(b =>
  b.addEventListener('click', () => {
    state.sort = b.dataset.sort;
    $$('[data-sort]').forEach(x => {
      x.classList.toggle('active', x === b);
      x.setAttribute('aria-pressed', String(x === b));
    });
    load();
  })
);

// 카드 클릭: 추천 목록은 지도에서 위치 보기, 찜/최근 목록은 상세 열기
// 추천 목록에서 메뉴를 고르면 행동 기록(click)을 남깁니다. (심층 추천의 개인 취향에 사용)
function trackClick(row) {
  if (state.user && row?.menuId)
    request('/interactions', {
      method: 'POST',
      body: {restaurantId: row.restaurantId, menuId: row.menuId, type: 'click'}
    }).catch(() => {});
}
function activateCard(card) {
  if (card.closest('[data-list]')?.dataset.list === 'search') {
    const row = state.rows.find(r => cardKey(r) === card.dataset.key);
    trackClick(row);
    selectRow(row);
  } else showDetail(Number(card.dataset.focus));
}
const rowsOf = list => (list === 'search' ? state.rows : state[list]);
$$('[data-list]').forEach(el => {
  el.addEventListener('keydown', e => {
    const card = e.target.closest?.('[data-focus]');
    if (card && e.target === card && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      activateCard(card);
    }
  });
  el.addEventListener('click', async e => {
    const btn = e.target.closest('button');
    if (!btn) {
      const card = e.target.closest('[data-focus]');
      if (card) activateCard(card);
      return;
    }
    if (btn.hasAttribute('data-login')) return loginPrompt();
    if (btn.hasAttribute('data-close-list')) {
      btn.closest('dialog')?.close();
      return $('#recommend').scrollIntoView({behavior: 'smooth', block: 'start'});
    }
    if (btn.hasAttribute('data-retry'))
      return el.dataset.list === 'search' ? retrySearch() : loadMine([el.dataset.list]);
    if (btn.dataset.detail) return showDetail(Number(btn.dataset.detail));
    if (btn.dataset.save) {
      if (!state.user) return loginPrompt();
      btn.disabled = true;
      try {
        const id = Number(btn.dataset.save);
        const row = rowsOf(el.dataset.list).find(r => (r.restaurantId ?? r.id) === id);
        await request('/restaurants/' + id + '/favorite', {method: 'PUT', body: {saved: !row.saved}});
        toast(row.saved ? '찜 목록에서 삭제했어요.' : '찜한 맛집에 저장했어요.');
        await refreshSaved();
      } catch (err) {
        toast(err.message);
        btn.disabled = false;
      }
    }
  });
});
// 찜 상태가 바뀌면 추천 목록은 현재 페이지·선택을 유지한 채 하트만 갱신하고, 내 목록은 다시 불러옵니다.
async function refreshSaved() {
  await loadMine();
  const ids = new Set(state.favorites.map(r => r.restaurantId ?? r.id));
  state.rows = state.rows.map(r => ({...r, saved: ids.has(r.restaurantId)}));
  renderSearch(true);
  markSelected();
}

// ===== 시작 =====
try {
  state.user = (await request('/auth/me')).user;
  account();
} catch (e) {
  toast(e.message);
}
// 지도는 처음에 경인여자대학교에 마커 1개만 표시합니다.
const mapPromise = initializeMap({onDetail: id => showDetail(id)});
await Promise.all([load(), loadMine(), initDeep({user: state.user, showDetail: id => showDetail(id), loginPrompt})]);
await mapPromise;
