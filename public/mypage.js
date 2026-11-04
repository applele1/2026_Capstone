(() => {
  const {
    $,
    $$,
    escapeHtml,
    categoryEmoji,
    schoolRouteLink,
    formatDate,
    toast,
    auth,
    api,
    memberPage,
    recentViews
  } = window.bapit;

  const PANELS = ['account', 'favorites', 'reviews', 'recent'];
  const PREVIEW_WIDE = 7;
  const PREVIEW_NARROW = 4;
  const narrowScreen = window.matchMedia('(max-width: 760px)');
  const state = {
    user: null,
    favorites: [],
    reviews: [],
    editingId: null,
    editStar: 0,
    batches: { favorites: 1, reviews: 1, recent: 1 }
  };
  const stars = (n) => `${'★'.repeat(n)}${'☆'.repeat(5 - n)}`;

  function panelId(name) {
    return `#panel${name[0].toUpperCase()}${name.slice(1)}`;
  }

  function showPanel(name, { scroll = true } = {}) {
    const panel = PANELS.includes(name) ? name : 'account';
    PANELS.forEach((id) => {
      const el = $(panelId(id));
      if (el) el.hidden = id !== panel;
    });
    $$('.profile-links a').forEach((link) => link.classList.toggle('active', link.dataset.panel === panel));
    if (location.hash !== `#${panel}`) history.replaceState(null, '', `#${panel}`);
    if (scroll) $(panelId(panel))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function saveUser(next) {
    state.user = next;
    const stored = auth.get();
    if (stored) auth.set({ ...stored, user: next });
    $('#profileName').textContent = next.nickname || next.email;
    $('#profileMeta').textContent = `${next.email}${next.created_at ? ` · ${formatDate(next.created_at)} 가입` : ''}`;
    $('#emailInput').value = next.email;
    $('#nicknameInput').value = next.nickname;
  }

  function restaurantItemHtml(item, extra = '') {
    return `
      <article class="my-item" data-id="${item.id}">
        <a class="my-item-link" href="index.html?restaurant=${item.id}#results">
          <div class="my-thumb">${categoryEmoji(item.category)}</div>
          <div class="my-body">
            <h3>${escapeHtml(item.name)}</h3>
            <p>${escapeHtml(item.category || '')}${item.address ? ` · ${escapeHtml(item.address)}` : ''}${
              item.viewedAt ? ` · ${formatDate(item.viewedAt)} 확인` : ''
            }</p>
          </div>
        </a>
        ${extra}
      </article>`;
  }

  function previewLimit() {
    return narrowScreen.matches ? PREVIEW_NARROW : PREVIEW_WIDE;
  }

  function visibleItems(items, key) {
    const step = previewLimit();
    const maxBatches = Math.max(1, Math.ceil(items.length / step));
    if (state.batches[key] > maxBatches) state.batches[key] = maxBatches;
    if (state.batches[key] < 1) state.batches[key] = 1;
    return items.slice(0, state.batches[key] * step);
  }

  function syncMore(key, count) {
    const btn = $(`[data-more="${key}"]`);
    const shown = Math.min(count, state.batches[key] * previewLimit());
    const folded = count > previewLimit() && shown >= count;
    btn.hidden = count === 0 || (!folded && count <= shown);
    btn.textContent = `${folded ? '접기' : '더보기'} (${shown}/${count})`;
    btn.dataset.mode = folded ? 'fold' : 'more';
  }

  function renderFavorites() {
    $('#favoriteCount').textContent = `${state.favorites.length}곳`;
    const view = visibleItems(state.favorites, 'favorites');
    syncMore('favorites', state.favorites.length);
    $('#myFavorites').innerHTML = state.favorites.length
      ? view
          .map((f) =>
            restaurantItemHtml(
              f,
              `<div class="my-actions"><a href="${schoolRouteLink(f)}" target="_blank" rel="noopener">🚶 길찾기</a><button data-action="unfavorite">찜 해제</button></div>`
            )
          )
          .join('')
      : '<p class="my-empty">아직 찜한 맛집이 없어요. <a href="index.html#recommend">맛집 찾으러 가기 →</a></p>';
  }

  function renderRecent() {
    const recent = recentViews.list();
    const view = visibleItems(recent, 'recent');
    $('#recentCount').textContent = recent.length ? `${recent.length}곳` : '';
    $('#clearRecent').hidden = recent.length === 0;
    syncMore('recent', recent.length);
    $('#recentList').innerHTML = recent.length
      ? view.map((item) => restaurantItemHtml(item)).join('')
      : '<p class="my-empty">아직 본 식당이 없어요. <a href="index.html#recommend">맛집 찾으러 가기 →</a></p>';
  }

  function reviewEditHtml(r) {
    const picker = [1, 2, 3, 4, 5]
      .map((n) => `<button type="button" data-star="${n}" class="${n <= state.editStar ? 'on' : ''}" aria-label="${n}점">★</button>`)
      .join('');
    return `
      <form class="review-edit">
        <div class="star-picker" role="radiogroup" aria-label="별점 선택">${picker}</div>
        <textarea maxlength="300" rows="3" required>${escapeHtml(r.content)}</textarea>
        <div class="my-actions">
          <button type="button" data-action="cancel">취소</button>
          <button type="submit" class="primary-action">저장</button>
        </div>
      </form>`;
  }

  function renderReviews() {
    $('#reviewCount').textContent = `${state.reviews.length}개`;
    const view = visibleItems(state.reviews, 'reviews');
    syncMore('reviews', state.reviews.length);
    $('#myReviews').innerHTML = state.reviews.length
      ? view
          .map(
            (r) => `
        <article class="my-review" data-id="${r.id}">
          <header>
            <b>${escapeHtml(r.restaurant_name)}</b>
            <time>${formatDate(r.created_at)}</time>
          </header>
          ${
            r.id === state.editingId
              ? reviewEditHtml(r)
              : `<p><span class="stars">${stars(r.rating)}</span></p>
                 <p>${escapeHtml(r.content)}</p>
                 <div class="my-actions">
                   <button data-action="edit">수정</button>
                   <button data-action="delete" class="danger-action">삭제</button>
                 </div>`
          }
        </article>`
          )
          .join('')
      : '<p class="my-empty">아직 작성한 후기가 없어요. 다녀온 식당에 후기를 남겨 보세요!</p>';
  }

  $('.profile-links').addEventListener('click', (e) => {
    const link = e.target.closest('a[data-panel]');
    if (!link) return;
    e.preventDefault();
    showPanel(link.dataset.panel);
  });

  $('#nicknameForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nickname = $('#nicknameInput').value.trim();
    if (nickname === state.user.nickname) return toast('지금과 같은 닉네임이에요.');
    const submit = e.target.querySelector('button');
    submit.disabled = true;
    try {
      const { user } = await api('/api/me', { method: 'PATCH', body: { nickname } });
      saveUser(user);
      toast('닉네임을 바꿨어요.');
    } catch (err) {
      toast(err.message);
    } finally {
      submit.disabled = false;
    }
  });

  $('#passwordForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const currentPassword = $('#currentPassword').value;
    const newPassword = $('#newPassword').value;
    const confirmPassword = $('#confirmPassword').value;
    if (newPassword !== confirmPassword) return toast('새 비밀번호가 서로 달라요.');
    const submit = e.target.querySelector('button');
    submit.disabled = true;
    try {
      await api('/api/me/password', { method: 'PATCH', body: { currentPassword, newPassword } });
      e.target.reset();
      toast('비밀번호를 바꿨어요.');
    } catch (err) {
      toast(err.message);
    } finally {
      submit.disabled = false;
    }
  });

  $('#withdrawForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!confirm('정말 탈퇴할까요?\n찜한 맛집과 작성한 후기가 모두 삭제되고 되돌릴 수 없어요.')) return;
    const submit = e.target.querySelector('button');
    submit.disabled = true;
    try {
      await api('/api/me', { method: 'DELETE', body: { password: $('#withdrawPassword').value } });
      auth.set(null);
      toast('탈퇴가 완료됐어요. 그동안 이용해 주셔서 고마워요.');
      setTimeout(() => (location.href = 'index.html'), 1500);
    } catch (err) {
      submit.disabled = false;
      toast(err.message);
    }
  });

  $('#myFavorites').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action="unfavorite"]');
    if (!btn) return;
    const id = Number(btn.closest('.my-item').dataset.id);
    btn.disabled = true;
    try {
      await api(`/api/favorites/${id}`, { method: 'DELETE' });
      state.favorites = state.favorites.filter((f) => f.id !== id);
      renderFavorites();
      toast('찜을 해제했어요.');
    } catch (err) {
      btn.disabled = false;
      toast(err.message);
    }
  });

  $('#myReviews').addEventListener('click', async (e) => {
    const card = e.target.closest('.my-review');
    if (!card) return;
    const id = Number(card.dataset.id);
    const review = state.reviews.find((r) => r.id === id);
    const star = e.target.closest('[data-star]');
    if (star) {
      state.editStar = Number(star.dataset.star);
      $$('[data-star]', card).forEach((b) => b.classList.toggle('on', Number(b.dataset.star) <= state.editStar));
      return;
    }
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'edit') {
      state.editingId = id;
      state.editStar = review.rating;
      renderReviews();
      $('.review-edit textarea', $(`.my-review[data-id="${id}"]`)).focus();
    } else if (action === 'cancel') {
      state.editingId = null;
      renderReviews();
    } else if (action === 'delete') {
      if (!confirm(`${review.restaurant_name} 후기를 삭제할까요?`)) return;
      try {
        await api(`/api/me/reviews/${id}`, { method: 'DELETE' });
        state.reviews = state.reviews.filter((r) => r.id !== id);
        renderReviews();
        toast('후기를 삭제했어요.');
      } catch (err) {
        toast(err.message);
      }
    }
  });

  $('#myReviews').addEventListener('submit', async (e) => {
    e.preventDefault();
    const card = e.target.closest('.my-review');
    const id = Number(card.dataset.id);
    const content = $('textarea', card).value;
    const submit = $('button[type="submit"]', card);
    submit.disabled = true;
    try {
      const { review } = await api(`/api/me/reviews/${id}`, {
        method: 'PATCH',
        body: { rating: state.editStar, content }
      });
      Object.assign(state.reviews.find((r) => r.id === id), { rating: review.rating, content: review.content });
      state.editingId = null;
      renderReviews();
      toast('후기를 수정했어요.');
    } catch (err) {
      submit.disabled = false;
      toast(err.message);
    }
  });

  document.querySelectorAll('.list-more').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.more;
      const list = key === 'favorites' ? $('#myFavorites') : key === 'reviews' ? $('#myReviews') : $('#recentList');
      const render = key === 'favorites' ? renderFavorites : key === 'reviews' ? renderReviews : renderRecent;
      if (btn.dataset.mode === 'fold') {
        state.batches[key] = 1;
        render();
        const panel = btn.closest('section');
        panel.style.scrollMarginTop = '90px';
        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      const from = state.batches[key] * previewLimit();
      state.batches[key] += 1;
      render();
      const target = list.children[from];
      if (!target) return;
      target.style.scrollMarginTop = '96px';
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  narrowScreen.addEventListener('change', () => {
    renderFavorites();
    renderReviews();
    renderRecent();
  });

  $('#clearRecent').addEventListener('click', () => {
    recentViews.clear();
    renderRecent();
    toast('최근 본 식당 기록을 지웠어요.');
  });

  window.addEventListener('hashchange', () => showPanel(location.hash.slice(1)));

  memberPage(async () => {
    const [{ user }, { favorites }, { reviews }] = await Promise.all([
      api('/api/me'),
      api('/api/favorites'),
      api('/api/me/reviews')
    ]);
    saveUser(user);
    state.favorites = favorites;
    state.reviews = reviews;
    renderFavorites();
    renderReviews();
    renderRecent();
    showPanel(location.hash.slice(1) || 'account', { scroll: false });
  });
})();
