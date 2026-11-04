(() => {
  const { $, escapeHtml, categoryEmoji, schoolRouteLink, toast, auth, api } = window.bapit;

  $('#menuToggle').addEventListener('click', () => $('.nav').classList.toggle('open'));

  function showGuest() {
    $('#favoritesContent').hidden = true;
    $('#logoutBtn').hidden = true;
    $('#mypageLink').hidden = true;
    $('#guestState').hidden = false;
  }

  window.bapit.setUnauthorizedHandler(showGuest);

  $('#logoutBtn').addEventListener('click', () => {
    auth.set(null);
    location.href = 'index.html';
  });

  function renderFavorites(favorites) {
    $('#favoriteCount').textContent = `${favorites.length}곳`;
    $('#favoriteSummary').textContent = favorites.length
      ? `${favorites.length}곳을 찜해 두었어요.`
      : '아직 찜한 맛집이 없어요.';
    $('#favoriteList').innerHTML = favorites.length
      ? favorites
          .map(
            (f) => `
        <article class="my-item">
          <a class="my-item-link" href="index.html?restaurant=${f.id}#results">
            <div class="my-thumb">${categoryEmoji(f.category)}</div>
            <div class="my-body">
              <h3>${escapeHtml(f.name)}</h3>
              <p>${escapeHtml(f.category || '')}${f.address ? ` · ${escapeHtml(f.address)}` : ''}</p>
            </div>
          </a>
          <div class="my-actions">
            <a href="${schoolRouteLink(f)}" target="_blank" rel="noopener">🚶 길찾기</a>
          </div>
        </article>`
          )
          .join('')
      : '<p class="my-empty">아직 찜한 맛집이 없어요. <a href="index.html#recommend">맛집 찾으러 가기 →</a></p>';
  }

  async function init() {
    if (!auth.get()) return showGuest();
    try {
      const [{ user }, { favorites }] = await Promise.all([api('/api/me'), api('/api/favorites')]);
      $('#profileName').textContent = user.nickname || user.email;
      renderFavorites(favorites);
      $('#guestState').hidden = true;
      $('#logoutBtn').hidden = false;
      $('#mypageLink').hidden = false;
      $('#favoritesContent').hidden = false;
    } catch (err) {
      if (!auth.get()) return;
      toast(err.message);
    }
  }

  init();
})();
