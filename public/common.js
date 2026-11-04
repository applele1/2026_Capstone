// index.html, mypage.html 이 함께 쓰는 도구 모음
window.bapit = (() => {
  const AUTH_KEY = 'bapit_auth';
  const RECENT_LIMIT = 20;
  const CATEGORY_EMOJI = {
    한식: '🍚', 일식: '🍣', 중식: '🥟', 분식: '🍢', 양식: '🍝', 패스트푸드: '🍔', 면: '🍜', 덮밥: '🍛', '샐러드&포케': '🥗'
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const escapeHtml = (value) =>
    String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const categoryEmoji = (category) => CATEGORY_EMOJI[category] || '🍽️';
  const SCHOOL = { name: '경인여자대학교', lat: 37.5484997, lng: 126.7228094 };
  const kakaoPlace = (p) => `${encodeURIComponent(p.name)},${p.lat},${p.lng}`;
  const kakaoMapLink = (r) => `https://map.kakao.com/link/map/${kakaoPlace(r)}`;
  // 카카오 지도 URL 규칙: /link/by/{car|traffic|walk|bicycle}/출발지/도착지
  const kakaoRouteLink = (from, to) =>
    `https://map.kakao.com/link/by/walk/${kakaoPlace(from)}/${kakaoPlace({
      name: to.address || to.name,
      lat: to.lat,
      lng: to.lng
    })}`;
  const schoolRouteLink = (restaurant) => kakaoRouteLink(SCHOOL, restaurant);
  const formatDate = (iso) => new Date(iso).toLocaleDateString('ko-KR');

  let toastTimer;
  function toast(message) {
    const el = $('#toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
  }

  const auth = {
    get: () => JSON.parse(localStorage.getItem(AUTH_KEY) || 'null'),
    set: (value) => (value ? localStorage.setItem(AUTH_KEY, JSON.stringify(value)) : localStorage.removeItem(AUTH_KEY))
  };

  function recentKey() {
    const userId = auth.get()?.user?.id;
    return userId ? `bapit_recent_${userId}` : null;
  }

  const recentViews = {
    list() {
      const key = recentKey();
      if (!key) return [];
      try {
        const rows = JSON.parse(localStorage.getItem(key) || '[]');
        return Array.isArray(rows) ? rows : [];
      } catch {
        return [];
      }
    },
    add(restaurant) {
      const key = recentKey();
      if (!key || !restaurant?.id) return;
      const next = [
        {
          id: restaurant.id,
          name: restaurant.name,
          category: restaurant.category || '',
          address: restaurant.address || '',
          viewedAt: new Date().toISOString()
        },
        ...this.list().filter((item) => item.id !== restaurant.id)
      ].slice(0, RECENT_LIMIT);
      localStorage.setItem(key, JSON.stringify(next));
    },
    clear() {
      const key = recentKey();
      if (key) localStorage.removeItem(key);
    }
  };

  let onUnauthorized = () => {};

  async function api(path, { method = 'GET', body } = {}) {
    const headers = {};
    const token = auth.get()?.token;
    if (body) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401 && token) {
        auth.set(null);
        onUnauthorized();
        throw new Error('로그인이 만료되었어요. 다시 로그인해 주세요.');
      }
      throw new Error(data.error || '요청에 실패했어요.');
    }
    return data;
  }

  // 로그인 회원 전용 페이지의 메뉴, 게스트 안내, 로그아웃을 공통으로 처리합니다.
  function memberPage(load) {
    $('#menuToggle').addEventListener('click', () => $('.nav').classList.toggle('open'));
    const showGuest = () => {
      $('#memberContent').hidden = true;
      $('#logoutBtn').hidden = true;
      $('#guestState').hidden = false;
    };
    onUnauthorized = showGuest;
    $('#logoutBtn').addEventListener('click', () => {
      auth.set(null);
      location.href = 'index.html';
    });
    if (!auth.get()) return showGuest();
    load()
      .then(() => {
        $('#guestState').hidden = true;
        $('#logoutBtn').hidden = false;
        $('#memberContent').hidden = false;
      })
      .catch((err) => {
        if (!auth.get()) return;
        toast(err.message);
      });
  }

  return {
    $, $$, escapeHtml, categoryEmoji, kakaoMapLink, kakaoRouteLink, schoolRouteLink, formatDate, toast, auth, api, recentViews, SCHOOL,
    setUnauthorizedHandler: (fn) => (onUnauthorized = fn),
    memberPage
  };
})();
