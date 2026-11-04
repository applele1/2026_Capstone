(() => {
  const { $, $$, escapeHtml, categoryEmoji, kakaoMapLink, kakaoRouteLink, toast, api } = window.bapit;
  const SORT_LABELS = { recommend: '추천순', random: '랜덤 추천', distance: '거리순', rating: '평점순', price: '가격순' };
  const SPICE_LABELS = ['안 매움', '약간 매움', '보통 매움', '매움'];
  const WALK_LABELS = { 10: '도보 10분 이내', 15: '도보 15분 이내' };
  const MENU_PREVIEW = 3;
  const PAGE_SIZE = 3;
  const PAGE_NUMBER_WINDOW = 5;

  const state = {
    config: { kakaoKey: null, school: { name: '경인여자대학교', lat: 37.5484997, lng: 126.7228094 } },
    budget: 10000,
    categories: ['all'],
    spice: 'any',
    traits: [],
    walk: 'any',
    sort: 'recommend',
    results: [],
    page: 1,
    selectedId: null,
    expandedIds: new Set(),
    menuExpandedIds: new Set(),
    favorites: new Map(),
    auth: window.bapit.auth.get(),
    authMode: 'login',
    reviewTarget: null,
    reviewStar: 0
  };

  const map = { kakao: null, instance: null, markers: [], overlay: null };

  // ---------- utils ----------
  const won = (n) => `${Number(n).toLocaleString('ko-KR')}원`;
  const formatDistance = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${m}m`);

  // ---------- header ----------
  $('#menuToggle').addEventListener('click', () => $('.nav').classList.toggle('open'));
  $$('.nav a').forEach((a) => a.addEventListener('click', () => $('.nav').classList.remove('open')));

  // ---------- finder ----------
  const budgetInput = $('#budget');

  function syncBudgetChips() {
    $$('#budgetChips button').forEach((b) => b.classList.toggle('active', Number(b.dataset.budget) === Number(budgetInput.value)));
  }

  $('#budgetChips').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-budget]');
    if (!btn) return;
    budgetInput.value = btn.dataset.budget;
    syncBudgetChips();
  });
  function sanitizeBudget() {
    const digits = budgetInput.value.replace(/\D/g, '');
    if (digits !== budgetInput.value) {
      budgetInput.value = digits;
      toast('예산은 숫자만 입력해 주세요.');
    }
    syncBudgetChips();
  }

  function stepBudget(delta) {
    const current = /^\d+$/.test(budgetInput.value) ? Number(budgetInput.value) : 0;
    const stepped = Math.round(current / 1000) * 1000 + delta;
    const next = Math.min(30000, Math.max(3000, stepped));
    if (delta > 0 && current >= 30000) return toast('예산은 30,000원까지 입력할 수 있어요.');
    if (delta < 0 && current <= 3000) return toast('예산은 3,000원부터 입력할 수 있어요.');
    budgetInput.value = String(next);
    syncBudgetChips();
  }

  $('#budgetUp').addEventListener('click', () => stepBudget(1000));
  $('#budgetDown').addEventListener('click', () => stepBudget(-1000));

  budgetInput.addEventListener('input', sanitizeBudget);
  // Korean IME may keep the composing character until composition ends.
  budgetInput.addEventListener('compositionend', sanitizeBudget);

  $('#categoryGrid').addEventListener('click', (e) => {
    const btn = e.target.closest('.category');
    if (!btn) return;
    const category = btn.dataset.category;
    if (category === 'all') {
      state.categories = ['all'];
    } else {
      const picked = state.categories.filter((item) => item !== 'all');
      state.categories = picked.includes(category)
        ? picked.filter((item) => item !== category)
        : [...picked, category];
      if (state.categories.length === 0) state.categories = ['all'];
    }
    $$('#categoryGrid .category').forEach((button) => {
      button.classList.toggle('active', state.categories.includes(button.dataset.category));
    });
  });

  function selectOne(container, attr, value) {
    $$(`${container} button`).forEach((button) => button.classList.toggle('active', button.dataset[attr] === value));
  }

  $('#spiceChips').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-spice]');
    if (!btn) return;
    state.spice = btn.dataset.spice;
    selectOne('#spiceChips', 'spice', state.spice);
  });

  $('#walkChips').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-walk]');
    if (!btn) return;
    state.walk = btn.dataset.walk;
    selectOne('#walkChips', 'walk', state.walk);
  });

  $('#traitChips').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-trait]');
    if (!btn) return;
    const trait = btn.dataset.trait;
    if (state.traits.includes(trait)) state.traits = state.traits.filter((item) => item !== trait);
    else state.traits = [...state.traits, trait];
    btn.classList.toggle('active', state.traits.includes(trait));
  });

  $('#resetFilters').addEventListener('click', () => {
    budgetInput.value = '10000';
    syncBudgetChips();
    state.budget = 10000;
    state.categories = ['all'];
    state.spice = 'any';
    state.traits = [];
    state.walk = 'any';
    selectOne('#categoryGrid', 'category', 'all');
    selectOne('#spiceChips', 'spice', state.spice);
    selectOne('#walkChips', 'walk', state.walk);
    $$('#traitChips button').forEach((button) => button.classList.remove('active'));
    toast('조건을 처음 상태로 되돌렸어요.');
  });

  $('#searchBtn').addEventListener('click', async () => {
    if (!/^\d+$/.test(budgetInput.value)) {
      toast('예산은 숫자만 입력해 주세요.');
      budgetInput.focus();
      return;
    }
    const budget = Number(budgetInput.value);
    if (budget < 3000 || budget > 30000) {
      toast('예산은 3,000원 ~ 30,000원 사이로 입력해 주세요.');
      budgetInput.focus();
      return;
    }
    state.budget = budget;
    if (state.sort === 'random') {
      state.sort = 'recommend';
      $$('.result-controls .sort').forEach((button) => button.classList.toggle('active', button.dataset.sort === 'recommend'));
    }
    await search();
    $('#results').scrollIntoView({ behavior: 'smooth' });
  });

  $('.result-controls').addEventListener('click', (e) => {
    const btn = e.target.closest('.sort');
    if (!btn) return;
    if (btn.dataset.sort === state.sort && state.sort !== 'random') return;
    $$('.result-controls .sort').forEach((b) => b.classList.toggle('active', b === btn));
    state.sort = btn.dataset.sort;
    search();
    if (state.sort === 'random') $('#results').scrollIntoView({ behavior: 'smooth' });
  });

  async function search({ focusId = null } = {}) {
    const list = $('#resultList');
    list.innerHTML = '<div class="empty-state"><span>🍳</span>맛집을 찾고 있어요...</div>';
    try {
      const params = new URLSearchParams({
        budget: state.budget,
        category: state.categories.join(','),
        sort: state.sort,
        spice: state.spice,
        walk: state.walk
      });
      if (state.traits.length) params.set('traits', state.traits.join(','));
      if (focusId) params.set('id', String(focusId));
      const { results } = await api(`/api/restaurants?${params}`);
      state.results = results;
      state.expandedIds.clear();
      state.menuExpandedIds.clear();
      state.page = 1;
      if (focusId && results.some((r) => r.id === focusId)) {
        state.selectedId = focusId;
        state.page = pageOf(focusId);
        window.bapit.recentViews.add(results.find((r) => r.id === focusId));
      }
      else if (!results.some((r) => r.id === state.selectedId)) state.selectedId = null;
      renderResults();
      renderMapMarkers();
      if (focusId && state.selectedId === focusId) {
        $(`.result-card[data-id="${state.selectedId}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    } catch (err) {
      list.innerHTML = `<div class="empty-state"><span>😥</span>${escapeHtml(err.message)}</div>`;
    }
  }

  function pageCount() {
    return Math.max(1, Math.ceil(state.results.length / PAGE_SIZE));
  }

  function pageOf(id) {
    const index = state.results.findIndex((r) => r.id === id);
    return index < 0 ? 1 : Math.floor(index / PAGE_SIZE) + 1;
  }

  function visiblePageNumbers(current, total) {
    const size = Math.min(PAGE_NUMBER_WINDOW, total);
    let start = current - Math.floor((size - 1) / 2);
    if (start < 1) start = 1;
    let end = start + size - 1;
    if (end > total) {
      end = total;
      start = Math.max(1, end - size + 1);
    }
    const pages = [];
    for (let n = start; n <= end; n += 1) pages.push(n);
    return pages;
  }

  function goToPage(next) {
    const total = pageCount();
    if (!Number.isInteger(next) || next < 1 || next > total || next === state.page) return;
    state.page = next;
    renderResults();
    renderMapMarkers();
  }

  function renderResults() {
    const list = $('#resultList');
    if (state.results.length === 0) {
      list.innerHTML = `<div class="empty-state"><span>🍽️</span>선택한 예산, 입맛, 거리에 맞는 식당이 없어요.<br />조건을 조금 넓혀 보세요.</div>`;
      return;
    }
    const total = pageCount();
    if (state.page > total) state.page = total;
    if (state.page < 1) state.page = 1;
    const start = (state.page - 1) * PAGE_SIZE;
    const pageItems = state.results.slice(start, start + PAGE_SIZE);
    const from = start + 1;
    const to = start + pageItems.length;
    const rankEnd = Math.min(to, 3);
    const rangeLabel = from > 3 ? '' : from === rankEnd ? `${from}위` : `${from}–${rankEnd}위`;
    const filters = state.sort === 'random'
      ? []
      : [
          ...(state.categories.includes('all') ? ['전체'] : state.categories),
          `${won(state.budget)} 이하`,
          state.spice === 'any' ? '' : SPICE_LABELS[Number(state.spice)],
          ...state.traits,
          WALK_LABELS[state.walk] || ''
        ].filter(Boolean);
    const summary = [...filters, SORT_LABELS[state.sort]].map((text) => escapeHtml(text)).join(' · ');
    const pages = visiblePageNumbers(state.page, total)
      .map(
        (n) =>
          `<button type="button" class="page-btn${n === state.page ? ' active' : ''}" data-page="${n}" aria-label="${n}페이지"${
            n === state.page ? ' aria-current="page"' : ''
          }>${n}</button>`
      )
      .join('');
    list.innerHTML =
      `<p class="result-summary">${summary} · 조건에 맞는 <b>${state.results.length}곳</b>${rangeLabel ? ` 중 ${rangeLabel}` : ''}</p>` +
      `<div class="result-page">${pageItems.map((r, i) => resultCardHtml(r, start + i)).join('')}</div>` +
      `<nav class="result-pager" aria-label="추천 맛집 페이지">` +
      `<button type="button" class="page-btn page-nav" data-page="${state.page - 1}" aria-label="이전 페이지"${state.page === 1 ? ' disabled' : ''}>이전</button>` +
      pages +
      `<button type="button" class="page-btn page-nav" data-page="${state.page + 1}" aria-label="다음 페이지"${state.page === total ? ' disabled' : ''}>다음</button>` +
      `</nav>`;
    requestAnimationFrame(fitMapToCards);
  }

  function menuItemHtml(menu, recommended) {
    const tags = [SPICE_LABELS[Number(menu.spice)] || '', ...(menu.traits || [])].filter(Boolean).join(' · ');
    return `<li class="${recommended ? 'recommended' : ''}"><span>${
      recommended ? '<em class="menu-badge">추천 메뉴</em>' : ''
    }${escapeHtml(menu.name)}${recommended ? `<small class="menu-tags">${escapeHtml(tags)}</small>` : ''}</span><b>${won(menu.price)}</b></li>`;
  }

  function resultCardHtml(r, index) {
    const fav = state.favorites.has(r.id);
    const open = state.expandedIds.has(r.id);
    const menusOpen = state.menuExpandedIds.has(r.id);
    const recommended = r.recommendedMenu || r.menus[0];
    const ordered = recommended
      ? [recommended, ...r.menus.filter((menu) => menu.id !== recommended.id)]
      : r.menus;
    const menus = !open ? ordered.slice(0, 1) : menusOpen ? ordered : ordered.slice(0, MENU_PREVIEW);
    const more = ordered.length - MENU_PREVIEW;
    const ranked = index < 3;
    return `
      <article class="result-card${open ? ' open' : ''}${r.id === state.selectedId ? ' selected' : ''}" data-id="${r.id}">
        <div class="result-thumb">${categoryEmoji(r.category)}${ranked ? `<span class="rank">${index + 1}</span>` : ''}</div>
        <div class="result-body">
          <div class="result-top">
            ${ranked ? `<span class="place">${index + 1}위</span>` : ''}<h3>${escapeHtml(r.name)}</h3><span class="tag">${escapeHtml(r.category || '')}</span>
            <button type="button" class="detail-toggle" data-action="detail" aria-expanded="${open}" aria-label="${open ? '세부 내용 접기' : '세부 내용 보기'}">${open ? '−' : '+'}</button>
          </div>
          ${open && r.address ? `<p class="result-desc">${escapeHtml(r.address)}</p>` : ''}
          <div class="result-meta">
            <span>📍 ${formatDistance(r.distance)} · 도보 ${r.walkMinutes}분</span>
            <span class="star">★ ${r.rating ?? '-'} <small>(${r.reviewCount})</small></span>
          </div>
          <ul class="menu-list${open && menusOpen ? ' expanded' : ''}">
            ${menus.map((menu) => menuItemHtml(menu, recommended && menu.id === recommended.id)).join('')}
          </ul>
          ${
            open && more > 0
              ? `<button class="menu-more" data-action="menus" aria-expanded="${menusOpen}">${
                  menusOpen ? '메뉴 접기 ▲' : `외 예산 내 메뉴 ${more}개 더 보기 ▼`
                }</button>`
              : ''
          }
          <div class="result-actions">
            <button class="fav-btn${fav ? ' on' : ''}" data-action="favorite">${fav ? '♥ 찜함' : '♡ 찜하기'}</button>
            <button data-action="review">★ 후기 보기</button>
            <a href="${kakaoRouteLink(state.config.school, r)}" target="_blank" rel="noopener">🚶 길찾기</a>
          </div>
        </div>
      </article>`;
  }

  $('#resultList').addEventListener('click', (e) => {
    const pageBtn = e.target.closest('.page-btn');
    if (pageBtn) {
      if (!pageBtn.disabled) goToPage(Number(pageBtn.dataset.page));
      return;
    }
    const card = e.target.closest('.result-card');
    if (!card || e.target.closest('a')) return;
    const restaurant = state.results.find((r) => r.id === Number(card.dataset.id));
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'favorite') return toggleFavorite(restaurant);
    if (action === 'review') return openReview(restaurant);
    if (action === 'detail') return toggleDetail(restaurant.id);
    if (action === 'menus') return toggleMenus(restaurant.id);
    selectRestaurant(restaurant.id, { scrollMap: true });
  });

  function rerenderKeepingScroll() {
    const page = document.querySelector('.result-page');
    const scrollTop = page ? page.scrollTop : 0;
    renderResults();
    const next = document.querySelector('.result-page');
    if (next) next.scrollTop = scrollTop;
  }

  function toggleDetail(id) {
    if (!state.expandedIds.delete(id)) state.expandedIds.add(id);
    else state.menuExpandedIds.delete(id);
    rerenderKeepingScroll();
  }

  function toggleMenus(id) {
    if (!state.menuExpandedIds.delete(id)) state.menuExpandedIds.add(id);
    rerenderKeepingScroll();
  }

  function selectRestaurant(id, { scrollMap = false } = {}) {
    state.selectedId = id;
    $$('.result-card').forEach((c) => c.classList.toggle('selected', Number(c.dataset.id) === id));
    const restaurant = state.results.find((r) => r.id === id);
    if (restaurant) {
      renderMapMarkers();
      window.bapit.recentViews.add(restaurant);
    }
    if (scrollMap && window.matchMedia('(max-width: 760px)').matches) {
      $('.map-panel').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  // ---------- Kakao Map ----------
  function loadKakaoSdk(key) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&autoload=false`;
      script.onload = () => window.kakao.maps.load(() => resolve(window.kakao));
      script.onerror = () => reject(new Error('Kakao Map SDK를 불러오지 못했어요.'));
      document.head.appendChild(script);
    });
  }

  async function initMap() {
    if (!state.config.kakaoKey) return;
    try {
      const kakao = await loadKakaoSdk(state.config.kakaoKey);
      const container = $('#kakaoMap');
      container.innerHTML = '';
      const { lat, lng, name } = state.config.school;
      const schoolPos = new kakao.maps.LatLng(lat, lng);
      map.kakao = kakao;
      map.instance = new kakao.maps.Map(container, { center: schoolPos, level: 4 });
      map.instance.addControl(new kakao.maps.ZoomControl(), kakao.maps.ControlPosition.RIGHT);

      new kakao.maps.Marker({
        map: map.instance,
        position: schoolPos,
        image: new kakao.maps.MarkerImage(
          'https://t1.daumcdn.net/localimg/localimages/07/mapapidoc/markerStar.png',
          new kakao.maps.Size(24, 35)
        ),
        title: name
      });
      new kakao.maps.CustomOverlay({
        map: map.instance,
        position: schoolPos,
        content: `<div class="kakao-school-label">🏫 ${escapeHtml(name)}</div>`,
        yAnchor: 1
      });
      window.addEventListener('resize', () => fitMapToCards());
      renderMapMarkers();
    } catch (err) {
      console.error(err);
      $('.map-note').innerHTML = `Kakao Map 연결 실패<br /><small>JavaScript 키와 플랫폼 도메인 등록을 확인해 주세요.</small>`;
    }
  }

  function placeMap() {
    const column = document.querySelector('.map-sticky');
    const panel = document.querySelector('.map-panel');
    const canvas = $('#kakaoMap');
    if (!column || !panel || !canvas) return;
    const cards = document.querySelector('.result-page');
    const firstCard = cards?.querySelector('.result-card');
    const section = document.querySelector('#results');
    panel.style.position = '';
    panel.style.left = '';
    panel.style.width = '';
    panel.style.height = '';
    panel.style.zIndex = '';
    column.style.minHeight = '';
    if (window.matchMedia('(max-width: 760px)').matches || !firstCard || !section) {
      panel.style.top = '';
      return;
    }
    const scrollPad = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
    const offsetInSection = firstCard.getBoundingClientRect().top - section.getBoundingClientRect().top;
    panel.style.top = `${Math.round(scrollPad + offsetInSection)}px`;
  }

  function fitMapToCards() {
    const canvas = $('#kakaoMap');
    if (!canvas) return;
    const cards = document.querySelector('.result-page');
    const list = document.querySelector('.result-list');
    const narrow = window.matchMedia('(max-width: 760px)').matches;
    if (narrow || !cards || !list) {
      canvas.style.height = '';
      canvas.style.marginTop = '';
      const column = document.querySelector('.map-sticky');
      if (column) column.style.paddingTop = '';
    } else {
      const firstCard = cards.querySelector('.result-card');
      const pageBox = cards.getBoundingClientRect();
      const alignBox = (firstCard || cards).getBoundingClientRect();
      const offset = alignBox.top - list.getBoundingClientRect().top;
      const column = document.querySelector('.map-sticky');
      if (column) column.style.paddingTop = `${Math.max(0, Math.round(offset))}px`;
      canvas.style.marginTop = '';
      canvas.style.height = `${Math.round(pageBox.height)}px`;
    }
    placeMap();
    if (!map.instance) return;
    const center = map.instance.getCenter();
    const level = map.instance.getLevel();
    map.instance.relayout();
    map.instance.setLevel(level);
    map.instance.setCenter(center);
  }

  window.addEventListener('scroll', () => placeMap(), { passive: true });

  function renderMapMarkers() {
    fitMapToCards();
    if (!map.instance) return;
    const { kakao } = map;
    map.markers.forEach((m) => m.setMap(null));
    map.overlay?.setMap(null);
    map.markers = [];

    const bounds = new kakao.maps.LatLngBounds();
    bounds.extend(new kakao.maps.LatLng(state.config.school.lat, state.config.school.lng));

    const start = (state.page - 1) * PAGE_SIZE;
    const visible = state.results.slice(start, start + PAGE_SIZE);
    const places = state.selectedId && visible.some((r) => r.id === state.selectedId)
      ? visible.filter((r) => r.id === state.selectedId)
      : visible;
    places.forEach((r) => {
      const position = new kakao.maps.LatLng(r.lat, r.lng);
      const marker = new kakao.maps.Marker({ map: map.instance, position, title: r.name });
      kakao.maps.event.addListener(marker, 'click', () => {
        const page = pageOf(r.id);
        if (page !== state.page) {
          state.page = page;
          renderResults();
        }
        selectRestaurant(r.id);
        $(`.result-card[data-id="${r.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
      map.markers.push(marker);
      bounds.extend(position);
    });

    if (places.length) map.instance.setBounds(bounds, 40, 40, 40, 40);
    const selected = visible.find((r) => r.id === state.selectedId);
    if (selected) focusOnMap(selected);
  }

  function focusOnMap(place) {
    if (!map.instance) {
      $('.map-note').innerHTML =
        `${categoryEmoji(place.category)} ${escapeHtml(place.name)}` +
        (place.distance != null ? ` · ${formatDistance(place.distance)}` : '') +
        `<br /><small><a href="${kakaoMapLink(place)}" target="_blank" rel="noopener">카카오맵에서 위치 보기</a> · ` +
        `<a href="${kakaoRouteLink(state.config.school, place)}" target="_blank" rel="noopener">길찾기</a></small>`;
      return;
    }
    const { kakao } = map;
    const position = new kakao.maps.LatLng(place.lat, place.lng);
    map.overlay?.setMap(null);
    map.overlay = new kakao.maps.CustomOverlay({
      map: map.instance,
      position,
      yAnchor: 1,
      content:
        `<div class="kakao-overlay">${escapeHtml(place.name)}` +
        (place.distance != null ? `<small>학교에서 ${formatDistance(place.distance)} · 도보 ${place.walkMinutes}분</small>` : '') +
        `<a href="${kakaoMapLink(place)}" target="_blank" rel="noopener">카카오맵에서 크게 보기 ›</a></div>`
    });
    if (map.instance.getLevel() > 3) map.instance.setLevel(3);
    map.instance.panTo(position);
  }

  // ---------- auth ----------
  const loginModal = $('#loginModal');

  function setAuth(auth) {
    state.auth = auth;
    window.bapit.auth.set(auth);
    renderAuth();
    loadFavorites();
  }

  function renderAuth() {
    const loggedIn = Boolean(state.auth);
    $('#mypageLink').hidden = !loggedIn;
    $('#loginOpen').textContent = loggedIn ? '로그아웃' : '로그인';
    $('#quickLogin').textContent = loggedIn ? '찜한 맛집 보기' : '회원가입하고 찜하기';
  }

  function setAuthMode(mode) {
    state.authMode = mode;
    const signup = mode === 'signup';
    $('#loginTitle').innerHTML = signup ? '밥잇 회원가입하고<br /><em>맛집을 찜해보세요!</em>' : '밥잇에 오신 것을<br /><em>환영해요!</em>';
    $('#loginSubmit').innerHTML = `${signup ? '회원가입' : '로그인'} <span>→</span>`;
    $('#signupDemo').innerHTML = signup ? '이미 회원이라면 <b>로그인</b>' : '아직 회원이 아니라면 <b>회원가입</b>';
    $('#loginPassword').autocomplete = signup ? 'new-password' : 'current-password';
    $('#nicknameField').hidden = !signup;
    $('#passwordConfirmField').hidden = !signup;
    $('#signupNickname').required = signup;
    if (!signup) {
      $('#signupNickname').value = '';
      $('#signupPasswordConfirm').value = '';
    }
    clearAuthErrors();
  }

  function showFieldError(id, message) {
    const el = $(id);
    el.hidden = !message;
    el.textContent = message || '';
    const input = el.previousElementSibling;
    if (!message || !input) return;
    input.focus();
    const end = input.value.length;
    try {
      input.setSelectionRange(end, end);
    } catch {
      // 일부 브라우저에서는 비밀번호 칸의 커서 위치 지정이 막혀 있습니다.
    }
  }

  function clearAuthErrors() {
    showFieldError('#emailError', '');
    showFieldError('#passwordError', '');
    showFieldError('#passwordConfirmError', '');
    showFieldError('#nicknameError', '');
  }

  function placeAuthError(message) {
    if (message.includes('닉네임')) return showFieldError('#nicknameError', message);
    if (message.includes('비밀번호') && !message.includes('이메일')) return showFieldError('#passwordError', message);
    if (message.includes('이메일') && !message.includes('비밀번호')) return showFieldError('#emailError', message);
    if (message.includes('이메일') && message.includes('비밀번호')) return showFieldError('#passwordError', message);
    toast(message);
  }

  function openLogin(mode = 'login') {
    setAuthMode(mode);
    loginModal.hidden = false;
    $('#loginEmail').focus();
  }

  function logout() {
    setAuth(null);
    toast('로그아웃했어요.');
  }

  $('#loginOpen').addEventListener('click', () => (state.auth ? logout() : openLogin()));
  $('#quickLogin').addEventListener('click', () =>
    state.auth ? (location.href = 'favorites.html') : openLogin('signup')
  );
  $('#loginClose').addEventListener('click', () => (loginModal.hidden = true));
  $('#signupDemo').addEventListener('click', () => setAuthMode(state.authMode === 'login' ? 'signup' : 'login'));

  ['#loginEmail', '#loginPassword', '#signupPasswordConfirm', '#signupNickname'].forEach((id) =>
    $(id).addEventListener('input', () => {
      if (id === '#loginEmail') showFieldError('#emailError', '');
      if (id === '#loginPassword') showFieldError('#passwordError', '');
      if (id === '#signupPasswordConfirm') showFieldError('#passwordConfirmError', '');
      if (id === '#signupNickname') showFieldError('#nicknameError', '');
    })
  );

  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAuthErrors();
    const email = $('#loginEmail').value.trim();
    const password = $('#loginPassword').value;
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    const passwordOk = password.length >= 6;
    if (!emailOk) {
      showFieldError('#emailError', '올바른 이메일을 입력해 주세요.');
      return;
    }
    if (!passwordOk) {
      showFieldError('#passwordError', '비밀번호는 6자 이상이어야 해요.');
      return;
    }
    if (state.authMode === 'signup') {
      const confirm = $('#signupPasswordConfirm').value;
      if (!confirm) {
        showFieldError('#passwordConfirmError', '비밀번호를 한 번 더 입력해 주세요.');
        return;
      }
      if (confirm !== password) {
        showFieldError('#passwordConfirmError', '비밀번호가 서로 달라요.');
        return;
      }
      const nickname = $('#signupNickname').value.trim();
      if (!nickname || nickname.length > 20) {
        showFieldError('#nicknameError', '닉네임은 1~20자로 입력해 주세요.');
        return;
      }
    }
    const submit = $('#loginSubmit');
    submit.disabled = true;
    try {
      const endpoint = state.authMode === 'signup' ? '/api/auth/signup' : '/api/auth/login';
      const auth = await api(endpoint, {
        method: 'POST',
        body: {
          email,
          password,
          ...(state.authMode === 'signup' ? { nickname: $('#signupNickname').value.trim() } : {})
        }
      });
      setAuth(auth);
      loginModal.hidden = true;
      e.target.reset();
      toast(state.authMode === 'signup' ? '회원가입 완료! 환영해요 🍚' : '로그인했어요!');
    } catch (err) {
      placeAuthError(err.message);
    } finally {
      submit.disabled = false;
    }
  });

  // ---------- favorites ----------
  async function loadFavorites() {
    state.favorites.clear();
    if (state.auth) {
      try {
        const { favorites } = await api('/api/favorites');
        favorites.forEach((f) => state.favorites.set(f.id, f));
      } catch (err) {
        toast(err.message);
      }
    }
    renderResults();
  }

  async function toggleFavorite(restaurant) {
    if (!state.auth) {
      toast('로그인하면 맛집을 찜할 수 있어요.');
      return openLogin();
    }
    const on = state.favorites.has(restaurant.id);
    try {
      await api(`/api/favorites/${restaurant.id}`, { method: on ? 'DELETE' : 'POST' });
      if (on) state.favorites.delete(restaurant.id);
      else state.favorites.set(restaurant.id, restaurant);
      renderResults();
      toast(on ? '찜을 해제했어요.' : `${restaurant.name}을(를) 찜했어요 ♥`);
    } catch (err) {
      toast(err.message);
    }
  }

  // ---------- reviews ----------
  const reviewModal = $('#reviewModal');

  function setStar(n) {
    state.reviewStar = n;
    $$('#starPicker button').forEach((b) => {
      const on = Number(b.dataset.star) <= n;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(Number(b.dataset.star) === n));
    });
  }
  $('#starPicker').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-star]');
    if (btn) setStar(Number(btn.dataset.star));
  });

  async function openReview(restaurant) {
    state.reviewTarget = restaurant;
    setStar(0);
    $('#reviewForm').reset();
    $('#reviewNickname').value = state.auth?.user.nickname || '';
    $('#reviewTitle').textContent = `${restaurant.name} 후기`;
    $('#reviewRestaurantMeta').textContent =
      `${restaurant.category} · 학교에서 ${formatDistance(restaurant.distance)} · 도보 ${restaurant.walkMinutes}분`;
    $('#reviewSummary').innerHTML = '';
    $('#reviewList').innerHTML = '<p class="review-empty">후기를 불러오는 중...</p>';
    $('#reviewForm').hidden = false;
    $('#reviewOnce').hidden = true;
    reviewModal.hidden = false;
    await loadReviews();
  }

  async function loadReviews() {
    try {
      const { reviews } = await api(`/api/restaurants/${state.reviewTarget.id}/reviews`);
      renderReviews(reviews);
    } catch (err) {
      $('#reviewList').innerHTML = `<p class="review-empty">${escapeHtml(err.message)}</p>`;
    }
  }

  function renderReviews(reviews) {
    const count = reviews.length;
    const avg = count ? reviews.reduce((s, r) => s + r.rating, 0) / count : 0;
    const bars = [5, 4, 3, 2, 1]
      .map((n) => {
        const c = reviews.filter((r) => r.rating === n).length;
        const pct = count ? Math.round((c / count) * 100) : 0;
        return `<div>${n}점<i style="--w:${pct}%"></i>${c}</div>`;
      })
      .join('');
    $('#reviewSummary').innerHTML =
      `<div class="summary-score"><b>${count ? avg.toFixed(1) : '-'}</b><span>후기 ${count}개</span></div><div class="summary-bars">${bars}</div>`;
    const alreadyReviewed = reviews.some((r) => r.mine);
    $('#reviewForm').hidden = alreadyReviewed;
    $('#reviewOnce').hidden = !alreadyReviewed;
    $('#reviewList').innerHTML = count
      ? reviews
          .map(
            (r) => `
          <article class="review-item">
            <header><span><b>${escapeHtml(r.nickname)}</b> <span class="stars">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span></span>
            <time>${new Date(r.created_at).toLocaleDateString('ko-KR')}</time></header>
            <p>${escapeHtml(r.content)}</p>
          </article>`
          )
          .join('')
      : '<p class="review-empty">아직 후기가 없어요. 첫 후기를 남겨주세요!</p>';
  }

  $('#reviewForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.auth) {
      toast('로그인하면 후기를 남길 수 있어요.');
      return openLogin();
    }
    if (!state.reviewStar) return toast('별점을 선택해 주세요.');
    const submit = e.target.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      await api(`/api/restaurants/${state.reviewTarget.id}/reviews`, {
        method: 'POST',
        body: { rating: state.reviewStar, content: $('#reviewText').value }
      });
      $('#reviewText').value = '';
      setStar(0);
      toast('후기를 등록했어요. 고마워요!');
      await loadReviews();
      search();
    } catch (err) {
      toast(err.message);
    } finally {
      submit.disabled = false;
    }
  });

  $('#reviewClose').addEventListener('click', () => (reviewModal.hidden = true));

  // ---------- init ----------
  window.bapit.setUnauthorizedHandler(() => setAuth(null));

  // 마이페이지에서 바꾼 닉네임 등 최신 회원 정보로 저장된 로그인 정보를 갱신합니다.
  async function refreshUser() {
    if (!state.auth) return;
    try {
      const { user } = await api('/api/me');
      state.auth = { ...state.auth, user };
      window.bapit.auth.set(state.auth);
      renderAuth();
    } catch {
      /* 만료된 경우 setUnauthorizedHandler 가 로그아웃 처리 */
    }
  }

  async function init() {
    try {
      state.config = await api('/api/config');
    } catch {
      /* 기본 설정 사용 */
    }
    if (state.config.mode === 'memory') {
      $('#authNote').textContent = '현재 Supabase 미연결 데모 모드예요. 서버를 재시작하면 회원·후기 데이터가 초기화됩니다.';
    }
    renderAuth();
    if (location.hash === '#login' && !state.auth) openLogin();
    initMap();
    await refreshUser();
    const focusId = Number(new URLSearchParams(location.search).get('restaurant'));
    await search({ focusId: Number.isInteger(focusId) && focusId > 0 ? focusId : null });
    if (focusId && !state.results.some((r) => r.id === focusId)) toast('식당을 찾을 수 없어요.');
    loadFavorites();
  }

  init();
})();
