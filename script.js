// script.js — 완전 복원 + 인기아티스트 목록 모달(7개) 추가
/* 전역 변수 (DOM 요소 참조) */
let audioPlayer;
let searchModal;
let searchNavLink;
let searchInput;
let searchBtn;
let searchResults;
let playBtnLarge;
let progressBar;
let volumeSlider;
let currentIndex = -1; // 현재 재생 중인 재생목록 인덱스

/* Skip buttons (동적 생성) */
let skipPrevBtn = null;
let skipNextBtn = null;

/* 캐시: 인기 아티스트 데이터 (renderPopularArtists에서 채움) */
let popularArtistsCache = []; // [{ name, count, img }]

/* 영속성 키 */
const PLAYLIST_STORAGE_KEY = 'music_app_playlist_v1';
const PLAYBACK_STATE_KEY = 'music_app_playback_state_v1';

/* 유틸 함수 */
function formatTime(seconds) {
    if (seconds == null || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    Object.keys(props).forEach(k => {
        if (k === 'className') node.className = props[k];
        else if (k === 'text') node.textContent = props[k];
        else node.setAttribute(k, props[k]);
    });
    children.forEach(c => node.appendChild(c));
    return node;
}

function escapeHtml(str) {
    if (typeof str !== 'string') return str || '';
    return str.replace(/[&<>"']/g, function (m) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
}

/* 추천(Top) 블록 표시/숨김 유틸 */
function getTopRecommendationsContainer() {
    return document.getElementById('top100-recommendations');
}

function showTopRecommendations() {
    const c = getTopRecommendationsContainer();
    if (!c) return;
    c.style.display = '';
}

function hideTopRecommendations() {
    const c = getTopRecommendationsContainer();
    if (!c) return;
    c.style.display = 'none';
}

/* Home initialization and rendering */

// 카테고리 목록 (요청한 순서)
const HOME_CATEGORIES = [
    { key: 'today-highlight', label: '오늘의 하이라이트' },
    { key: 'new-music', label: '새로운음악' },
    { key: 'energetic', label: '에너제틱음악' },
    { key: 'workout', label: '운동음악' },
    { key: 'musical', label: '뮤지컬음악' },
    { key: 'drama-ost', label: '드라마OST' }
];

// 홈 초기화: DOMContentLoaded 이후 호출
async function initHome() {
    renderStaticNowPlaying();
    await initRecommendedGrid(); // 추천(당신이 좋아할 곡들)
    renderCategoryBlocks();       // 카테고리 블록(빈 상태)
    await populateCategoryCards(); // 각 카테고리에 3x2 카드 채우기
    await renderPopularArtists();  // 인기 아티스트 API 기반 렌더
}

// 지금 재생중 영역 기본 렌더(간단한 플레이스홀더, 실제 업데이트는 playPreview에서)
function renderStaticNowPlaying() {
    const elNow = document.getElementById('home-now-playing');
    if (!elNow) return;
    const inner = elNow.querySelector('.now-playing-inner') || elNow.appendChild(document.createElement('div'));
    inner.innerHTML = `
    <div style="display:flex; gap:12px; align-items:center;">
      <div style="width:72px; height:72px; border-radius:8px; overflow:hidden; background:linear-gradient(135deg,#333,#111);" class="now-art"><img src="" alt="" style="width:100%;height:100%;object-fit:cover;display:block;" /></div>
      <div style="flex:1; min-width:0;">
        <div style="font-weight:700; font-size:14px;">곡 제목</div>
        <div style="color:var(--muted); font-size:13px; margin-top:6px;">아티스트</div>
      </div>
    </div>
  `;
}

// 추천 그리드 초기화: 기본적으로 Top50(또는 Top10)에서 채움
async function initRecommendedGrid() {
    const grid = document.getElementById('recommended-grid');
    if (!grid) return;
    grid.innerHTML = '<div style="color:var(--muted); padding:12px;">로딩 중...</div>';
    // 기본 추천: iTunes에서 인기곡(Top 50) 검색
    try {
        const results = await searchMusicRaw('top songs', 50);
        // render first 8~12 items as 추천
        const items = results.slice(0, 12);
        grid.innerHTML = '';
        items.forEach(r => {
            const artwork = (r.artworkUrl100 || '').replace('100x100', '300x300');
            const card = document.createElement('div');
            card.className = 'search-result-card';
            card.innerHTML = `
        <div class="search-result-image"><img src="${artwork}" alt="${escapeHtml(r.trackName || '')}" /></div>
        <div class="search-result-info">
          <h3>${escapeHtml(r.trackName || '')}</h3>
          <p>${escapeHtml(r.artistName || '')}</p>
          <div class="search-result-controls">
            <button class="search-result-preview" aria-label="미리듣기">▶</button>
            <button class="search-result-add">재생목록추가</button>
          </div>
        </div>
      `;
            // 버튼 바인딩
            const previewBtn = card.querySelector('.search-result-preview');
            const addBtn = card.querySelector('.search-result-add');
            if (previewBtn && r.previewUrl) previewBtn.addEventListener('click', (e) => { e.stopPropagation(); playPreview(r.previewUrl, r.trackName, r.artistName, artwork); });
            else if (previewBtn) previewBtn.disabled = true;
            if (addBtn) addBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const newItem = { title: r.trackName, artist: r.artistName, album: r.collectionName || '', time: r.trackTimeMillis ? formatTime(Math.floor(r.trackTimeMillis / 1000)) : '', previewUrl: r.previewUrl || '', artwork: artwork || '' };
                appPlaylist.push(newItem);
                renderAppPlaylist();
                savePlaylistToStorage();
                addBtn.textContent = '추가됨'; addBtn.disabled = true; addBtn.classList.add('added');
                updateSkipButtonsState();
            });
            grid.appendChild(card);
        });
    } catch (e) {
        grid.innerHTML = '<div style="color:var(--muted); padding:12px;">추천을 불러올 수 없습니다.</div>';
        console.warn('initRecommendedGrid failed', e);
    }
}

// 카테고리 블록 기본 구조 렌더
function renderCategoryBlocks() {
    const container = document.getElementById('category-grid');
    if (!container) return;
    container.innerHTML = '';
    HOME_CATEGORIES.forEach(cat => {
        const block = document.createElement('div');
        block.className = 'category-block';
        block.id = `cat-${cat.key}`;
        block.innerHTML = `
      <div class="category-title">${escapeHtml(cat.label)}</div>
      <div class="category-cards" id="cards-${cat.key}"></div>
    `;
        container.appendChild(block);
    });
}

// 각 카테고리에 3x2 카드(총 6개) 채우기
async function populateCategoryCards() {
    // 카테고리별 기본 검색어(간단 매핑)
    const map = {
        'today-highlight': 'today hits',
        'new-music': 'new music',
        'energetic': 'energetic songs',
        'workout': 'workout music',
        'musical': 'musical songs',
        'drama-ost': 'drama ost'
    };
    for (const cat of HOME_CATEGORIES) {
        const key = cat.key;
        const q = map[key] || cat.label;
        try {
            const results = await searchMusicRaw(q, 12); // 12개 가져와서 3x2 구성
            const slice = results.slice(0, 6);
            const cardsEl = document.getElementById(`cards-${key}`);
            if (!cardsEl) continue;
            cardsEl.innerHTML = '';
            slice.forEach(r => {
                const artwork = (r.artworkUrl100 || '').replace('100x100', '300x300');
                const c = document.createElement('div');
                c.className = 'category-card';
                c.innerHTML = `<img src="${artwork}" alt="${escapeHtml(r.trackName || '')}" />
                       <div style="font-weight:700; font-size:13px; width:100%; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(r.trackName || '')}</div>
                       <div style="color:var(--muted); font-size:12px; width:100%; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(r.artistName || '')}</div>`;
                c.addEventListener('click', () => {
                    if (r.previewUrl) playPreview(r.previewUrl, r.trackName, r.artistName, artwork);
                });
                cardsEl.appendChild(c);
            });
        } catch (e) {
            console.warn('populateCategoryCards failed for', key, e);
        }
    }
}

/* 인기 아티스트 구현 (API 방식) */
async function renderPopularArtists(limit = 8) {
    const container = document.getElementById('popular-artists');
    if (!container) return;
    container.innerHTML = '<div style="color:var(--muted); padding:12px;">로딩 중...</div>';

    try {
        // 1) 인기 트랙(Top 50) 가져오기
        const tracks = await searchMusicRaw('top songs', 50);
        // 2) 아티스트 빈도 집계
        const counts = {};
        tracks.forEach(t => {
            const name = (t.artistName || 'Unknown').trim();
            if (!name) return;
            counts[name] = (counts[name] || 0) + 1;
        });
        // 3) 상위 아티스트 정렬
        const artists = Object.keys(counts).map(name => ({ name, count: counts[name] }));
        artists.sort((a, b) => b.count - a.count);
        const top = artists.slice(0, limit);

        // 4) 렌더: 각 아티스트에 대해 대표 이미지(첫 트랙의 artwork) 찾기
        container.innerHTML = '';
        popularArtistsCache = []; // reset cache
        for (const a of top) {
            const firstTrack = tracks.find(t => t.artistName === a.name) || {};
            const img = (firstTrack.artworkUrl100 || '').replace('100x100', '300x300') || '';
            const card = document.createElement('div');
            card.className = 'artist-card';
            // artist-info 구조로 렌더 (CSS에서 가로 정렬 기대)
            card.innerHTML = `<img src="${img}" alt="${escapeHtml(a.name)}" />
                        <div class="artist-info">
                          <div class="artist-name">${escapeHtml(a.name)}</div>
                          <div class="artist-count">${a.count}곡</div>
                        </div>`;
            // 클릭 시 인기아티스트 목록 모달 열기
            card.addEventListener('click', (e) => {
                e.stopPropagation();
                showPopularArtistsList();
            });
            container.appendChild(card);

            // 캐시에 저장 (모달에서 재사용)
            popularArtistsCache.push({ name: a.name, count: a.count, img });
        }

        // "모두보기" 링크가 있으면 바인딩 (섹션 헤더 내 .see-all)
        const headerSeeAll = container.closest('.section') ? container.closest('.section').querySelector('.see-all') : null;
        if (headerSeeAll) {
            headerSeeAll.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                showPopularArtistsList();
            });
        }
    } catch (e) {
        container.innerHTML = '<div style="color:var(--muted); padding:12px;">인기 아티스트를 불러올 수 없습니다.</div>';
        console.warn('renderPopularArtists failed', e);
    }
}

/* 인기 아티스트 목록 모달 생성 및 표시 (7개) */
function ensurePopularArtistsModal() {
    let modal = document.getElementById('popular-artists-list-modal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'popular-artists-list-modal';
    modal.className = 'popular-artists-list-modal';
    modal.setAttribute('aria-hidden', 'true');
    modal.style.position = 'fixed';
    modal.style.inset = '0';
    modal.style.display = 'none';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.zIndex = '10050';
    modal.style.background = 'rgba(0,0,0,0.6)';

    modal.innerHTML = `
      <div class="popular-artists-modal-card" role="dialog" aria-modal="true" aria-labelledby="popular-artists-title" style="width:min(920px,95%); max-height:80vh; overflow:auto; border-radius:12px; padding:18px; background:linear-gradient(180deg, rgba(20,20,20,0.98), rgba(10,10,10,0.95)); border:2px solid rgba(255,255,255,0.04); box-shadow:0 18px 48px rgba(0,0,0,0.6);">
        <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
          <h3 id="popular-artists-title" style="margin:0; font-size:18px; font-weight:800; color:var(--text);">인기 아티스트</h3>
          <div style="margin-left:auto;"></div>
          <button class="popular-artists-modal-close" aria-label="닫기" style="background:transparent; border:none; color:var(--muted); font-size:18px; cursor:pointer;">✕</button>
        </div>
        <div class="popular-artists-list-grid" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap:12px;"></div>
      </div>
    `;

    document.body.appendChild(modal);

    const closeBtn = modal.querySelector('.popular-artists-modal-close');
    closeBtn.addEventListener('click', () => closePopularArtistsModal());
    modal.addEventListener('click', (e) => { if (e.target === modal) closePopularArtistsModal(); });

    // ESC로 닫기
    modal._onKey = function (e) {
        if (e.key === 'Escape') closePopularArtistsModal();
    };

    return modal;
}

function openPopularArtistsModal() {
    const modal = ensurePopularArtistsModal();
    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
    document.addEventListener('keydown', modal._onKey);
    // focus management: focus first close button
    setTimeout(() => {
        const btn = modal.querySelector('.popular-artists-modal-close');
        if (btn) btn.focus();
    }, 50);
}

function closePopularArtistsModal() {
    const modal = document.getElementById('popular-artists-list-modal');
    if (!modal) return;
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
    if (modal._onKey) document.removeEventListener('keydown', modal._onKey);
}

/* showPopularArtistsList: 캐시에서 최대 7개를 가져와 모달에 렌더 */
function showPopularArtistsList() {
    const modal = ensurePopularArtistsModal();
    const grid = modal.querySelector('.popular-artists-list-grid');
    if (!grid) return;

    // use cached artists if available; otherwise fetch fresh
    const items = (Array.isArray(popularArtistsCache) && popularArtistsCache.length > 0) ? popularArtistsCache.slice(0, 7) : [];

    // If cache empty, try to fetch quickly (non-blocking)
    if (items.length === 0) {
        // show loading and trigger renderPopularArtists to populate cache
        grid.innerHTML = `<div style="color:var(--muted); padding:18px;">로딩 중...</div>`;
        renderPopularArtists(7).then(() => {
            // after renderPopularArtists, popularArtistsCache should be filled
            const items2 = (Array.isArray(popularArtistsCache) && popularArtistsCache.length > 0) ? popularArtistsCache.slice(0, 7) : [];
            renderPopularArtistsModalGrid(items2, grid);
            openPopularArtistsModal();
        }).catch(() => {
            grid.innerHTML = `<div style="color:var(--muted); padding:18px;">불러올 수 없습니다.</div>`;
            openPopularArtistsModal();
        });
        return;
    }

    renderPopularArtistsModalGrid(items, grid);
    openPopularArtistsModal();
}

/* 실제 모달 그리드 렌더 (artist-card 동일 구조) */
function renderPopularArtistsModalGrid(items, gridEl) {
    gridEl.innerHTML = '';
    if (!items || items.length === 0) {
        gridEl.innerHTML = `<div style="color:var(--muted); padding:18px;">아티스트를 불러올 수 없습니다.</div>`;
        return;
    }

    items.forEach(a => {
        const card = document.createElement('div');
        card.className = 'artist-card';
        card.style.cursor = 'pointer';
        card.innerHTML = `<img src="${a.img || ''}" alt="${escapeHtml(a.name)}" />
                          <div class="artist-info">
                            <div class="artist-name">${escapeHtml(a.name)}</div>
                            <div class="artist-count">${a.count}곡</div>
                          </div>`;
        // 클릭 시 페이지 검색으로 이동 (기존 renderPopularArtists와 동일 동작)
        card.addEventListener('click', () => {
            closePopularArtistsModal();
            const pageInput = document.getElementById('page-search-input');
            const pageResults = document.getElementById('page-search-results');
            if (pageInput && pageResults) {
                pageInput.value = a.name;
                searchMusicForPage(a.name, pageResults);
                switchPage('page-search');
            } else {
                // fallback: perform global search and show search page if available
                if (typeof searchMusic === 'function') searchMusic(a.name);
                switchPage('page-search');
            }
        });
        gridEl.appendChild(card);
    });
}

/* 전역 상태: 플레이리스트 */
const appPlaylist = []; // { title, artist, album, time, previewUrl, artwork }

/* 앨범 아트 유틸 (img 요소 사용) */
function setAlbumArtImage(url) {
    const albumArt = document.querySelector('.album-art');
    if (!albumArt) return;
    albumArt.style.backgroundImage = '';
    let img = albumArt.querySelector('img');
    if (!img) {
        img = document.createElement('img');
        img.alt = '앨범 아트';
        albumArt.appendChild(img);
    }
    if (url) img.src = url;
    else img.removeAttribute('src');
}

/* 로컬 저장/복원 */
function savePlaylistToStorage() {
    try {
        localStorage.setItem(PLAYLIST_STORAGE_KEY, JSON.stringify(appPlaylist));
    } catch (e) { console.warn('플레이리스트 저장 실패', e); }
}

function loadPlaylistFromStorage() {
    try {
        const raw = localStorage.getItem(PLAYLIST_STORAGE_KEY);
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return false;
        appPlaylist.length = 0;
        parsed.forEach(it => { if (it && (it.title || it.previewUrl)) appPlaylist.push(it); });
        return true;
    } catch (e) { console.warn('플레이리스트 복원 실패', e); return false; }
}

function savePlaybackState(index, currentTime) {
    try {
        const state = { index: Number(index) || 0, time: Number(currentTime) || 0, ts: Date.now() };
        localStorage.setItem(PLAYBACK_STATE_KEY, JSON.stringify(state));
    } catch (e) { console.warn('재생 상태 저장 실패', e); }
}

function loadPlaybackState() {
    try {
        const raw = localStorage.getItem(PLAYBACK_STATE_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch (e) { return null; }
}

/* 모달 유틸 (이미 DOM에 있으면 재생성 안함) */
(function modalBootstrap() {
    if (document.getElementById('ui-modal-backdrop')) return;

    const backdrop = document.createElement('div');
    backdrop.id = 'ui-modal-backdrop';
    backdrop.className = 'ui-modal-backdrop';
    backdrop.style.display = 'none';
    backdrop.setAttribute('aria-hidden', 'true');
    backdrop.innerHTML = `
    <div class="ui-modal" role="document" aria-labelledby="ui-modal-title" aria-describedby="ui-modal-desc">
      <div class="ui-modal-header"><h3 id="ui-modal-title">알림</h3></div>
      <div id="ui-modal-desc" class="ui-modal-body"><p class="ui-modal-message">메시지</p></div>
      <div class="ui-modal-actions">
        <button id="ui-modal-cancel" class="ui-modal-btn ui-modal-btn-secondary">취소</button>
        <button id="ui-modal-confirm" class="ui-modal-btn ui-modal-btn-primary">확인</button>
      </div>
      <button class="ui-modal-close" aria-label="닫기">✕</button>
    </div>
  `;
    document.body.appendChild(backdrop);

    const styleId = 'ui-modal-styles';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
      .ui-modal-backdrop { position: fixed; inset: 0; display:flex; align-items:center; justify-content:center; background: rgba(0,0,0,0.6); z-index:9999; }
      .ui-modal { width:420px; max-width:calc(100% - 40px); background: linear-gradient(180deg, rgba(255,255,255,0.02), rgba(0,0,0,0.6)); border-radius:12px; padding:18px; box-shadow:0 12px 36px rgba(0,0,0,0.6); border: 2px solid rgba(255,255,255,0.08); color: #fff; position:relative; }
      .ui-modal-header h3 { margin:0; font-size:18px; font-weight:700; color:#fff; }
      .ui-modal-body { margin-top:12px; margin-bottom:16px; color: #bfbfbf; font-size:14px; }
      .ui-modal-actions { display:flex; gap:10px; justify-content:flex-end; }
      .ui-modal-btn { padding:8px 14px; border-radius:10px; font-weight:700; cursor:pointer; border:2px solid transparent; background:transparent; color:#fff; }
      .ui-modal-btn-secondary { background: rgba(255,255,255,0.02); color:#bfbfbf; border-color: rgba(255,255,255,0.03); }
      .ui-modal-btn-primary { background: #f5c542; color:#000; border-color: rgba(245,197,66,0.98); box-shadow:0 6px 18px rgba(245,197,66,0.08); }
      .ui-modal-close { position:absolute; top:10px; right:10px; background:transparent; border:none; color:#bfbfbf; font-size:16px; cursor:pointer; padding:6px; border-radius:6px; }
    `;
        document.head.appendChild(style);
    }

    const modal = backdrop.querySelector('.ui-modal');
    const titleEl = backdrop.querySelector('#ui-modal-title');
    const msgEl = backdrop.querySelector('.ui-modal-message');
    const btnConfirm = backdrop.querySelector('#ui-modal-confirm');
    const btnCancel = backdrop.querySelector('#ui-modal-cancel');
    const btnClose = backdrop.querySelector('.ui-modal-close');

    let resolveConfirm = null;

    function openModal({ title = '알림', message = '', showCancel = true }) {
        titleEl && (titleEl.textContent = title);
        msgEl && (msgEl.textContent = message);
        btnCancel.style.display = showCancel ? 'inline-flex' : 'none';
        backdrop.style.display = 'flex';
        backdrop.setAttribute('aria-hidden', 'false');

        const focusTarget = showCancel ? btnCancel : btnConfirm;
        setTimeout(() => focusTarget && focusTarget.focus(), 50);

        function onKey(e) {
            if (e.key === 'Escape') closeModal(false);
            if (e.key === 'Tab') {
                const focusables = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
                if (!focusables || focusables.length === 0) return;
                const first = focusables[0];
                const last = focusables[focusables.length - 1];
                if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
                else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
            }
        }
        document.addEventListener('keydown', onKey);
        backdrop._onKey = onKey;
    }

    function closeModal(result) {
        backdrop.style.display = 'none';
        backdrop.setAttribute('aria-hidden', 'true');
        if (backdrop._onKey) { document.removeEventListener('keydown', backdrop._onKey); backdrop._onKey = null; }
        if (typeof resolveConfirm === 'function') { resolveConfirm(Boolean(result)); resolveConfirm = null; }
    }

    btnConfirm.addEventListener('click', () => closeModal(true));
    btnCancel.addEventListener('click', () => closeModal(false));
    btnClose.addEventListener('click', () => closeModal(false));
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModal(false); });

    window.showAlert = function (message, title = '알림') {
        return new Promise((resolve) => {
            resolveConfirm = function () { resolve(); };
            openModal({ title, message, showCancel: false });
        });
    };

    window.showConfirm = function (message, title = '확인') {
        return new Promise((resolve) => {
            resolveConfirm = function (result) { resolve(Boolean(result)); };
            openModal({ title, message, showCancel: true });
        });
    };
})();

/* 재생바 관련 유틸 */
function normalizeSrc(src) {
    if (!src) return '';
    try { return String(src).split('#')[0]; } catch (e) { return String(src); }
}

function findIndexBySrc(src) {
    const n = normalizeSrc(src);
    if (!n) return -1;
    for (let i = 0; i < appPlaylist.length; i++) {
        if (!appPlaylist[i]) continue;
        const p = normalizeSrc(appPlaylist[i].previewUrl || '');
        if (p && p === n) return i;
    }
    return -1;
}

/* Skip control helpers */
function updateSkipButtonsState() {
    const has = Array.isArray(appPlaylist) && appPlaylist.length > 0;
    if (skipPrevBtn) skipPrevBtn.disabled = !has;
    if (skipNextBtn) skipNextBtn.disabled = !has;
}

/* 다음곡 재생 (재생목록 기준, 순환) */
function playNext() {
    if (!Array.isArray(appPlaylist) || appPlaylist.length === 0) return;
    const len = appPlaylist.length;
    if (typeof currentIndex === 'undefined' || currentIndex == null || currentIndex < 0) {
        currentIndex = 0;
    } else {
        currentIndex = (currentIndex + 1) % len;
    }
    const next = appPlaylist[currentIndex];
    if (!next) return;
    if (next.previewUrl) {
        playPreview(next.previewUrl, next.title, next.artist, next.artwork || '');
        savePlaybackState(currentIndex, 0);
    } else {
        updateNowPlaying(next.title, next.artist || '아티스트');
    }
}

/* 이전곡 재생 (재생목록 기준, 순환) */
function playPrev() {
    if (!Array.isArray(appPlaylist) || appPlaylist.length === 0) return;
    const len = appPlaylist.length;
    if (typeof currentIndex === 'undefined' || currentIndex == null || currentIndex < 0) {
        currentIndex = 0;
    } else {
        currentIndex = (currentIndex - 1 + len) % len;
    }
    const prev = appPlaylist[currentIndex];
    if (!prev) return;
    if (prev.previewUrl) {
        playPreview(prev.previewUrl, prev.title, prev.artist, prev.artwork || '');
        savePlaybackState(currentIndex, 0);
    } else {
        updateNowPlaying(prev.title, prev.artist || '아티스트');
    }
}

/* updateProgressFill: progress-fill + progress-thumb 동기화 */
function updateProgressFill() {
    if (!audioPlayer) audioPlayer = document.getElementById('audio-player');
    const playerBar = document.querySelector('.player-bar');
    const prog = document.querySelector('.player-bar .progress-bar') || document.querySelector('.progress-bar');
    if (!prog || !audioPlayer) return;

    const fill = prog.querySelector('.progress-fill');
    const thumb = prog.querySelector('.progress-thumb');
    const curEl = playerBar ? playerBar.querySelector('.player-time-current') : null;
    const totalEl = playerBar ? playerBar.querySelector('.player-time-total') : null;
    const dur = isFinite(audioPlayer.duration) ? audioPlayer.duration : 0;
    const cur = audioPlayer.currentTime || 0;
    const pct = dur > 0 ? Math.min(100, (cur / dur) * 100) : 0;

    if (fill) fill.style.width = pct + '%';

    // thumb 생성 보장
    if (!thumb) {
        const t = document.createElement('div');
        t.className = 'progress-thumb';
        t.setAttribute('tabindex', '0');
        prog.appendChild(t);
    }

    const thumbNow = prog.querySelector('.progress-thumb');
    if (thumbNow) {
        const rect = prog.getBoundingClientRect();
        const left = rect.width * (pct / 100);
        thumbNow.style.left = `${left}px`;
    }

    if (curEl) curEl.textContent = formatTime(cur);
    if (totalEl) totalEl.textContent = (isFinite(dur) && dur > 0) ? formatTime(dur) : '-:-';
}

/* togglePlayPause (기존 로직 유지) */
function togglePlayPause() {
    if (!audioPlayer) audioPlayer = document.getElementById('audio-player');
    if (!audioPlayer || !audioPlayer.src) return;
    const btn = document.querySelector('.play-btn-large');
    if (audioPlayer.paused) {
        audioPlayer.play().then(() => { if (btn) btn.textContent = '⏸'; }).catch(e => { console.warn('재생 실패', e); if (btn) btn.textContent = '▶'; });
    } else {
        audioPlayer.pause();
        if (btn) btn.textContent = '▶';
    }
}

/* playPreview (기존 로직 유지) */
function playPreview(previewUrl, title = '', artist = '', artwork = '') {
    if (!audioPlayer) audioPlayer = document.getElementById('audio-player');
    if (!audioPlayer) return;
    if (!previewUrl) { updateNowPlaying(title, artist); return; }

    const normalizedPreview = normalizeSrc(previewUrl);
    const normalizedNow = normalizeSrc(audioPlayer.src || '');
    if (normalizedNow === normalizedPreview) { togglePlayPause(); return; }

    const idx = findIndexBySrc(previewUrl);
    currentIndex = idx >= 0 ? idx : -1;

    try { audioPlayer.pause(); } catch (e) { }
    audioPlayer.removeAttribute('src');
    audioPlayer.src = previewUrl;
    audioPlayer.crossOrigin = 'anonymous';
    try { audioPlayer.load(); } catch (e) { }

    updateNowPlaying(title, artist);
    if (artwork) setAlbumArtImage(artwork);

    const playerBar = document.querySelector('.player-bar');
    if (playerBar) {
        const progressFill = playerBar.querySelector('.progress-fill');
        if (progressFill) progressFill.style.width = '0%';
        const curEl = playerBar.querySelector('.player-time-current');
        const totalEl = playerBar.querySelector('.player-time-total');
        if (curEl) curEl.textContent = '0:00';
        if (totalEl) totalEl.textContent = '-:-';
    }

    const onLoadedMeta = function () {
        const duration = audioPlayer.duration || 0;
        const playerBarNow = document.querySelector('.player-bar');
        if (playerBarNow) {
            const totalEl = playerBarNow.querySelector('.player-time-total');
            const curEl = playerBarNow.querySelector('.player-time-current');
            if (totalEl) totalEl.textContent = duration ? formatTime(duration) : '-:-';
            if (curEl) curEl.textContent = formatTime(audioPlayer.currentTime || 0);
            const progressFillNow = playerBarNow.querySelector('.progress-fill');
            if (progressFillNow) progressFillNow.style.width = '0%';
        }
        try { audioPlayer.currentTime = 0; } catch (e) { }
        audioPlayer.play().catch(e => console.warn('재생 실패', e));
        const playBtnLarge = document.querySelector('.play-btn-large');
        if (playBtnLarge) playBtnLarge.textContent = '⏸';
        // ensure thumb updated
        setTimeout(updateProgressFill, 50);
    };

    audioPlayer.addEventListener('loadedmetadata', onLoadedMeta, { once: true });
    if (audioPlayer.readyState >= 1 && audioPlayer.duration && !isNaN(audioPlayer.duration)) {
        setTimeout(() => { try { onLoadedMeta(); } catch (e) { } }, 0);
    }
}

/* bindAudioEvents: 안정적 바인딩 (중복 등록 방지) */
function bindAudioEvents() {
    if (!audioPlayer) audioPlayer = document.getElementById('audio-player');
    if (!audioPlayer || audioPlayer._eventsBound) return;
    audioPlayer._eventsBound = true;

    audioPlayer.addEventListener('timeupdate', () => {
        updateProgressFill();
        try {
            let idxToSave = typeof currentIndex !== 'undefined' ? currentIndex : -1;
            if (idxToSave == null || idxToSave < 0) idxToSave = findIndexBySrc(audioPlayer.src);
            if (idxToSave >= 0) savePlaybackState(idxToSave, audioPlayer.currentTime || 0);
        } catch (e) { }
    });

    audioPlayer.addEventListener('loadedmetadata', () => {
        const playerBar = document.querySelector('.player-bar');
        if (playerBar) {
            const totalEl = playerBar.querySelector('.player-time-total');
            if (totalEl) totalEl.textContent = formatTime(audioPlayer.duration || 0);
        }
    });

    audioPlayer.addEventListener('ended', () => {
        const btn = document.querySelector('.play-btn-large');
        if (btn) btn.textContent = '▶';
        try {
            let idx = typeof currentIndex !== 'undefined' ? currentIndex : -1;
            if (idx == null || idx < 0) idx = findIndexBySrc(audioPlayer.src);
            if (Array.isArray(appPlaylist) && idx >= 0) {
                if (idx < appPlaylist.length - 1) {
                    currentIndex = idx + 1;
                    const next = appPlaylist[currentIndex];
                    if (next && next.previewUrl) {
                        playPreview(next.previewUrl, next.title, next.artist, next.artwork || '');
                        savePlaybackState(currentIndex, 0);
                    }
                } else currentIndex = -1;
            }
        } catch (e) { }
    });

    audioPlayer.addEventListener('error', (e) => {
        console.warn('오디오 오류', e);
        if (typeof showAlert === 'function') showAlert('오디오 재생 중 오류가 발생했습니다.');
    });

    const prog = document.querySelector('.player-bar .progress-bar') || document.getElementById('progress-bar');
    if (prog) {
        // ensure progress-fill exists
        if (!prog.querySelector('.progress-fill')) {
            const pf = document.createElement('div');
            pf.className = 'progress-fill';
            prog.appendChild(pf);
        }
        // ensure thumb exists
        if (!prog.querySelector('.progress-thumb')) {
            const t = document.createElement('div');
            t.className = 'progress-thumb';
            t.setAttribute('tabindex', '0');
            prog.appendChild(t);
        }

        // click / touch to seek
        const seekHandler = (ev) => {
            if (!audioPlayer || !audioPlayer.duration) return;
            const rect = prog.getBoundingClientRect();
            const clientX = (ev.touches && ev.touches[0]) ? ev.touches[0].clientX : ev.clientX;
            const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
            audioPlayer.currentTime = pct * audioPlayer.duration;
            updateProgressFill();
        };
        prog.addEventListener('click', seekHandler);
        prog.addEventListener('touchstart', seekHandler, { passive: true });

        // drag support for thumb (mouse + touch)
        const thumb = prog.querySelector('.progress-thumb');
        let dragging = false;

        function onPointerMove(e) {
            if (!dragging || !audioPlayer || !audioPlayer.duration) return;
            const rect = prog.getBoundingClientRect();
            const clientX = (e.touches && e.touches[0]) ? e.touches[0].clientX : e.clientX;
            const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
            audioPlayer.currentTime = pct * audioPlayer.duration;
            updateProgressFill();
        }

        function onPointerUp() {
            if (!dragging) return;
            dragging = false;
            document.removeEventListener('mousemove', onPointerMove);
            document.removeEventListener('mouseup', onPointerUp);
            document.removeEventListener('touchmove', onPointerMove);
            document.removeEventListener('touchend', onPointerUp);
        }

        thumb.addEventListener('mousedown', (e) => {
            e.preventDefault();
            dragging = true;
            document.addEventListener('mousemove', onPointerMove);
            document.addEventListener('mouseup', onPointerUp);
        });

        thumb.addEventListener('touchstart', (e) => {
            e.preventDefault();
            dragging = true;
            document.addEventListener('touchmove', onPointerMove, { passive: false });
            document.addEventListener('touchend', onPointerUp);
        });

        // keyboard accessibility for thumb (left/right arrows)
        thumb.addEventListener('keydown', (e) => {
            if (!audioPlayer || !audioPlayer.duration) return;
            const step = Math.max(1, Math.floor(audioPlayer.duration / 20)); // 5% step approx
            if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
                audioPlayer.currentTime = Math.min(audioPlayer.duration, audioPlayer.currentTime + step);
                updateProgressFill();
                e.preventDefault();
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
                audioPlayer.currentTime = Math.max(0, audioPlayer.currentTime - step);
                updateProgressFill();
                e.preventDefault();
            } else if (e.key === 'Home') {
                audioPlayer.currentTime = 0;
                updateProgressFill();
                e.preventDefault();
            } else if (e.key === 'End') {
                audioPlayer.currentTime = audioPlayer.duration || 0;
                updateProgressFill();
                e.preventDefault();
            }
        });
    }
}

/* 플레이리스트 렌더 (td.time은 item.time으로만 설정) */
function renderAppPlaylist() {
    const tbody = document.getElementById('playlist-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    appPlaylist.forEach((item, idx) => {
        const tr = document.createElement('tr');
        tr.className = 'playlist-row';

        const idxTd = document.createElement('td');
        idxTd.style.width = '48px';
        idxTd.textContent = String(idx + 1);

        const titleTd = document.createElement('td');
        titleTd.style.maxWidth = '320px';
        titleTd.style.whiteSpace = 'nowrap';
        titleTd.style.overflow = 'hidden';
        titleTd.style.textOverflow = 'ellipsis';
        titleTd.innerHTML = escapeHtml(item.title);

        const artistTd = document.createElement('td');
        artistTd.style.maxWidth = '180px';
        artistTd.style.whiteSpace = 'nowrap';
        artistTd.style.overflow = 'hidden';
        artistTd.style.textOverflow = 'ellipsis';
        artistTd.innerHTML = escapeHtml(item.artist || '-');

        const albumTd = document.createElement('td');
        albumTd.style.maxWidth = '220px';
        albumTd.style.whiteSpace = 'nowrap';
        albumTd.style.overflow = 'hidden';
        albumTd.style.textOverflow = 'ellipsis';
        albumTd.innerHTML = escapeHtml(item.album || '-');

        const timeTd = document.createElement('td');
        timeTd.className = 'time';
        timeTd.textContent = escapeHtml(item.time || '-');

        const actionsTd = document.createElement('td');
        actionsTd.style.width = '140px';
        actionsTd.style.textAlign = 'right';
        actionsTd.style.whiteSpace = 'nowrap';

        const playBtn = document.createElement('button');
        playBtn.className = 'playlist-row-play';
        playBtn.setAttribute('data-index', String(idx));
        playBtn.setAttribute('aria-label', `재생 ${item.title || ''}`);
        playBtn.type = 'button';
        playBtn.innerHTML = `<span class="btn-icon">▶</span><span class="btn-label">재생</span>`;

        const delBtn = document.createElement('button');
        delBtn.className = 'playlist-row-delete';
        delBtn.setAttribute('data-index', String(idx));
        delBtn.setAttribute('aria-label', `삭제 ${item.title || ''}`);
        delBtn.type = 'button';
        delBtn.textContent = '삭제';

        actionsTd.appendChild(playBtn);
        const spacer = document.createElement('span');
        spacer.style.display = 'inline-block';
        spacer.style.width = '8px';
        actionsTd.appendChild(spacer);
        actionsTd.appendChild(delBtn);

        tr.addEventListener('click', (e) => {
            if (e.target && (e.target.closest('.playlist-row-play') || e.target.closest('.playlist-row-delete'))) return;
            updateNowPlaying(item.title, item.artist || '아티스트');
            if (item.artwork) setAlbumArtImage(item.artwork);
        });

        playBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            const i = Number(ev.currentTarget.getAttribute('data-index'));
            const it = appPlaylist[i];
            if (!it) return;
            currentIndex = i;
            if (it.previewUrl) {
                playPreview(it.previewUrl, it.title, it.artist, it.artwork || '');
                setTimeout(() => {
                    try { if (audioPlayer && audioPlayer.src && audioPlayer.paused) audioPlayer.play().catch(() => { }); } catch (e) { }
                }, 300);
                savePlaybackState(i, 0);
            } else {
                updateNowPlaying(it.title, it.artist || '아티스트');
                const playBtnLarge = document.querySelector('.play-btn-large');
                if (playBtnLarge) playBtnLarge.textContent = '⏸';
            }
            updateSkipButtonsState();
        });

        delBtn.addEventListener('click', async (ev) => {
            ev.stopPropagation();
            const i = Number(ev.currentTarget.getAttribute('data-index'));
            if (i < 0 || i >= appPlaylist.length) return;
            const itemToRemove = appPlaylist[i];
            const ok = await showConfirm(`"${itemToRemove.title}"을(를) 재생목록에서 삭제하시겠습니까?`, '항목 삭제');
            if (ok) {
                appPlaylist.splice(i, 1);
                if (typeof currentIndex !== 'undefined' && currentIndex > i) currentIndex--;
                if (typeof currentIndex !== 'undefined' && currentIndex === i) {
                    if (audioPlayer) {
                        audioPlayer.pause();
                        audioPlayer.removeAttribute('src');
                        const playBtnLarge = document.querySelector('.play-btn-large');
                        if (playBtnLarge) playBtnLarge.textContent = '▶';
                        const playerBar = document.querySelector('.player-bar');
                        if (playerBar) {
                            const curEl = playerBar.querySelector('.player-time-current');
                            const totalEl = playerBar.querySelector('.player-time-total');
                            const progressFill = playerBar.querySelector('.progress-fill');
                            if (curEl) curEl.textContent = '0:00';
                            if (totalEl) totalEl.textContent = '-:-';
                            if (progressFill) progressFill.style.width = '0%';
                        }
                    }
                    currentIndex = -1;
                }
                renderAppPlaylist();
                savePlaylistToStorage();
                updateSkipButtonsState();
            }
        });

        tr.appendChild(idxTd);
        tr.appendChild(titleTd);
        tr.appendChild(artistTd);
        tr.appendChild(albumTd);
        tr.appendChild(timeTd);
        tr.appendChild(actionsTd);

        tbody.appendChild(tr);
    });

    // 재생목록 렌더 후 skip 버튼 상태 갱신
    updateSkipButtonsState();
}

/* 검색 결과 렌더러 (검색/추천 카드 공통) */
function displaySearchResultsSafe(results) {
    if (results && results.length > 0) hideTopRecommendations();
    else showTopRecommendations();
    if (!searchResults) searchResults = document.getElementById('search-results');
    if (!searchResults) return;
    searchResults.innerHTML = '';
    if (!results || results.length === 0) {
        const p = el('p', {}); p.style.color = '#a0a0a0'; p.style.gridColumn = '1/-1'; p.style.textAlign = 'center'; p.style.padding = '40px';
        p.textContent = '검색 결과가 없습니다.';
        searchResults.appendChild(p);
        return;
    }

    results.forEach(result => {
        const artworkUrl = (result.artworkUrl100 || result.artworkUrl60 || '').replace('100x100', '300x300');
        const card = el('div', { className: 'search-result-card' });
        const imgWrap = el('div', { className: 'search-result-image' });
        if (artworkUrl) {
            const img = el('img', { src: artworkUrl, alt: result.trackName ? `${result.trackName} 앨범 아트` : '앨범 아트' });
            img.loading = 'lazy';
            imgWrap.appendChild(img);
        }

        const info = el('div', { className: 'search-result-info' });
        const h3 = el('h3', { text: result.trackName || '제목 없음', title: result.trackName || '' });
        const p = el('p', { text: result.artistName || '아티스트 없음', title: result.artistName || '' });

        const controls = el('div', { className: 'search-result-controls' });

        const previewBtn = el('button', { type: 'button', className: 'search-result-preview', 'aria-label': result.previewUrl ? `미리듣기 ${result.trackName}` : '미리듣기 불가' });
        previewBtn.innerHTML = '<span class="preview-icon">▶</span>';
        if (!result.previewUrl) {
            previewBtn.disabled = true;
            previewBtn.classList.add('disabled');
        } else {
            previewBtn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                playPreview(result.previewUrl, result.trackName || '', result.artistName || '', artworkUrl);
            });
        }

        const addBtn = el('button', { type: 'button', className: 'search-result-add', 'aria-label': '재생목록에 추가' });
        const exists = appPlaylist.some(it => {
            if (it.previewUrl && result.previewUrl) return normalizeSrc(it.previewUrl) === normalizeSrc(result.previewUrl);
            return (it.title && result.trackName && it.title === result.trackName && it.artist && result.artistName && it.artist === result.artistName);
        });

        if (exists) {
            addBtn.textContent = '추가됨';
            addBtn.disabled = true;
            addBtn.classList.add('added');
            addBtn.setAttribute('aria-disabled', 'true');
        } else {
            addBtn.textContent = '재생목록추가';
            addBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const already = appPlaylist.some(it => it.previewUrl && result.previewUrl && normalizeSrc(it.previewUrl) === normalizeSrc(result.previewUrl));
                if (already) {
                    addBtn.textContent = '추가됨';
                    addBtn.disabled = true;
                    addBtn.classList.add('added');
                    return;
                }
                const newItem = {
                    title: result.trackName || '제목 없음',
                    artist: result.artistName || '아티스트 없음',
                    album: result.collectionName || '',
                    time: result.trackTimeMillis ? formatTime(Math.floor(result.trackTimeMillis / 1000)) : '',
                    previewUrl: result.previewUrl || '',
                    artwork: artworkUrl || ''
                };
                appPlaylist.push(newItem);
                renderAppPlaylist();
                savePlaylistToStorage();
                addBtn.textContent = '추가됨';
                addBtn.disabled = true;
                addBtn.classList.add('added');
                updateSkipButtonsState();
            }, { once: false });
        }

        controls.appendChild(previewBtn);
        controls.appendChild(addBtn);

        info.appendChild(h3);
        info.appendChild(p);
        info.appendChild(controls);

        card.appendChild(imgWrap);
        card.appendChild(info);
        searchResults.appendChild(card);
    });
}

/* 검색 (iTunes API 사용) */
async function searchMusic(query) {
    if (!query || !query.trim()) {
        displaySearchResultsSafe([]);
        return;
    }
    const q = encodeURIComponent(query.trim());
    const url = `https://itunes.apple.com/search?term=${q}&media=music&limit=24&country=KR`;
    try {
        const res = await fetch(url);
        const data = await res.json();
        const results = (data.results || []).map(r => ({
            trackName: r.trackName,
            artistName: r.artistName,
            collectionName: r.collectionName,
            trackTimeMillis: r.trackTimeMillis,
            previewUrl: r.previewUrl,
            artworkUrl100: r.artworkUrl100
        }));
        displaySearchResultsSafe(results);
    } catch (e) {
        console.warn('검색 실패', e);
        displaySearchResultsSafe([]);
    }
}

async function searchMusicForPage(query, container) {
    if (!container) return;
    if (!query || !query.trim()) {
        renderSearchResultsToContainer([], container);
        return;
    }
    const q = encodeURIComponent(query.trim());
    const url = `https://itunes.apple.com/search?term=${q}&media=music&limit=24&country=KR`;
    try {
        const res = await fetch(url);
        const data = await res.json();
        const results = (data.results || []).map(r => ({
            trackName: r.trackName,
            artistName: r.artistName,
            collectionName: r.collectionName,
            trackTimeMillis: r.trackTimeMillis,
            previewUrl: r.previewUrl,
            artworkUrl100: r.artworkUrl100
        }));
        renderSearchResultsToContainer(results, container);
    } catch (e) {
        console.warn('페이지 검색 실패', e);
        renderSearchResultsToContainer([], container);
    }
}

function renderSearchResultsToContainer(results, container) {
    // 페이지 검색 결과 렌더 시 추천 숨김/표시 처리
    if (results && results.length > 0) hideTopRecommendations();
    else showTopRecommendations();
    if (!container) return;
    container.innerHTML = '';
    if (!results || results.length === 0) {
        const p = el('p', {}); p.style.color = '#a0a0a0'; p.style.gridColumn = '1/-1'; p.style.textAlign = 'center'; p.style.padding = '40px';
        container.appendChild(p);
        return;
    }

    results.forEach(result => {
        const artwork = (result.artworkUrl100 || result.artworkUrl60 || '').replace('100x100', '300x300');
        const card = el('div', { className: 'search-result-card', role: 'article' });
        const imgWrap = el('div', { className: 'search-result-image' });
        if (artwork) { const img = el('img', { src: artwork, alt: result.trackName ? `${result.trackName} 앨범 아트` : '앨범 아트' }); img.loading = 'lazy'; imgWrap.appendChild(img); }
        const info = el('div', { className: 'search-result-info' });
        const h3 = el('h3', { text: result.trackName || '제목 없음', title: result.trackName || '' });
        const p = el('p', { text: result.artistName || '아티스트 없음', title: result.artistName || '' });

        const controls = el('div', { className: 'search-result-controls' });

        const previewBtn = el('button', { type: 'button', className: 'search-result-preview', 'aria-label': result.previewUrl ? `미리듣기 ${result.trackName}` : '미리듣기 불가' });
        previewBtn.innerHTML = '<span class="preview-icon">▶</span>';
        if (!result.previewUrl) previewBtn.disabled = true;
        else previewBtn.addEventListener('click', (ev) => { ev.stopPropagation(); playPreview(result.previewUrl, result.trackName || '', result.artistName || '', artwork); });

        const addBtn = el('button', { type: 'button', className: 'search-result-add', 'aria-label': '재생목록에 추가' });
        const exists = appPlaylist.some(it => {
            if (it.previewUrl && result.previewUrl) return normalizeSrc(it.previewUrl) === normalizeSrc(result.previewUrl);
            return (it.title && result.trackName && it.title === result.trackName && it.artist && result.artistName && it.artist === result.artistName);
        });

        if (exists) {
            addBtn.textContent = '추가됨';
            addBtn.disabled = true;
            addBtn.classList.add('added');
            addBtn.setAttribute('aria-disabled', 'true');
        } else {
            addBtn.textContent = '재생목록추가';
            addBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const already = appPlaylist.some(it => it.previewUrl && result.previewUrl && normalizeSrc(it.previewUrl) === normalizeSrc(result.previewUrl));
                if (already) {
                    addBtn.textContent = '추가됨';
                    addBtn.disabled = true;
                    addBtn.classList.add('added');
                    return;
                }
                const newItem = {
                    title: result.trackName || '제목 없음',
                    artist: result.artistName || '아티스트 없음',
                    album: result.collectionName || '',
                    time: result.trackTimeMillis ? formatTime(Math.floor(result.trackTimeMillis / 1000)) : '',
                    previewUrl: result.previewUrl || '',
                    artwork: artwork || ''
                };
                appPlaylist.push(newItem);
                renderAppPlaylist();
                savePlaylistToStorage();
                addBtn.textContent = '추가됨';
                addBtn.disabled = true;
                addBtn.classList.add('added');
                updateSkipButtonsState();
            }, { once: false });
        }

        controls.appendChild(previewBtn);
        controls.appendChild(addBtn);

        info.appendChild(h3);
        info.appendChild(p);
        info.appendChild(controls);

        card.appendChild(imgWrap);
        card.appendChild(info);
        container.appendChild(card);
    });
}

/* 플레이어 UI 업데이트 */
function updateNowPlaying(title, artist) {
    const songDetails = document.querySelector('.song-details');
    if (!songDetails) return;
    let h4 = songDetails.querySelector('h4');
    let p = songDetails.querySelector('p');
    if (!h4) { h4 = document.createElement('h4'); songDetails.prepend(h4); }
    if (!p) { p = document.createElement('p'); songDetails.appendChild(p); }
    h4.textContent = title || '제목 없음';
    p.textContent = artist || '아티스트';
}

/* Top10 추천 (iTunes 검색 기반) */
async function searchMusicRaw(query, limit = 24) {
    if (!query || !query.trim()) return [];
    const q = encodeURIComponent(query.trim());
    const url = `https://itunes.apple.com/search?term=${q}&media=music&limit=${limit}&country=KR`;
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('search failed: ' + res.status);
        const data = await res.json();
        return (data.results || []).map(r => ({
            trackName: r.trackName,
            artistName: r.artistName,
            collectionName: r.collectionName,
            trackTimeMillis: r.trackTimeMillis,
            previewUrl: r.previewUrl,
            artworkUrl100: r.artworkUrl100
        }));
    } catch (e) {
        console.warn('searchMusicRaw failed', e);
        return [];
    }
}

function renderTop10Recommendations(items, container) {
    container = container || document.getElementById('top100-recommendations');
    if (!container) return;
    container.innerHTML = '<div class="top100-title">이달의 추천 Top 100</div>';
    const grid = document.createElement('div');
    grid.className = 'top100-grid';

    if (!items || items.length === 0) {
        const p = document.createElement('div');
        p.style.color = 'var(--muted)';
        p.style.padding = '18px';
        p.textContent = '추천을 불러올 수 없습니다.';
        grid.appendChild(p);
        container.appendChild(grid);
        return;
    }

    items.forEach(result => {
        const artwork = (result.artworkUrl100 || '').replace('100x100', '300x300');
        const card = el('div', { className: 'search-result-card' });
        const imgWrap = el('div', { className: 'search-result-image' });
        if (artwork) {
            const img = el('img', { src: artwork, alt: result.trackName ? `${result.trackName} 앨범 아트` : '앨범 아트' });
            img.loading = 'lazy';
            imgWrap.appendChild(img);
        }
        const info = el('div', { className: 'search-result-info' });
        const h3 = el('h3', { text: result.trackName || '제목 없음', title: result.trackName || '' });
        const p = el('p', { text: result.artistName || '아티스트 없음', title: result.artistName || '' });

        const controls = el('div', { className: 'search-result-controls' });

        const previewBtn = el('button', { type: 'button', className: 'search-result-preview', 'aria-label': result.previewUrl ? `미리듣기 ${result.trackName}` : '미리듣기 불가' });
        previewBtn.innerHTML = '<span class="preview-icon">▶</span>';
        if (!result.previewUrl) previewBtn.disabled = true;
        else previewBtn.addEventListener('click', (ev) => { ev.stopPropagation(); playPreview(result.previewUrl, result.trackName || '', result.artistName || '', artwork); });

        const addBtn = el('button', { type: 'button', className: 'search-result-add', 'aria-label': '재생목록에 추가' });
        addBtn.textContent = '재생목록추가';
        addBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const newItem = {
                title: result.trackName || '제목 없음',
                artist: result.artistName || '아티스트 없음',
                album: result.collectionName || '',
                time: result.trackTimeMillis ? formatTime(Math.floor(result.trackTimeMillis / 1000)) : '',
                previewUrl: result.previewUrl || '',
                artwork: artwork || ''
            };
            appPlaylist.push(newItem);
            renderAppPlaylist();
            savePlaylistToStorage();
            addBtn.textContent = '추가됨';
            addBtn.disabled = true;
            addBtn.classList.add('added');
            updateSkipButtonsState();
        });

        controls.appendChild(previewBtn);
        controls.appendChild(addBtn);

        info.appendChild(h3);
        info.appendChild(p);
        info.appendChild(controls);

        card.appendChild(imgWrap);
        card.appendChild(info);
        grid.appendChild(card);
    });

    container.appendChild(grid);
}

async function initTop10Recommendations(query = 'top songs') {
    const container = document.getElementById('top100-recommendations');
    if (!container) return;
    const results = await searchMusicRaw(query, 100);
    renderTop10Recommendations(results.slice(0, 100), container);
}

/* 페이지 전환 유틸 */
function switchPage(pageId) {
    document.querySelectorAll('.page').forEach(p => {
        if (p.id === pageId) { p.classList.add('active'); p.setAttribute('aria-hidden', 'false'); }
        else { p.classList.remove('active'); p.setAttribute('aria-hidden', 'true'); }
    });
}

/* 이벤트 리스너 초기화 */
function initializeEventListeners({ pageSearchInput, pageSearchBtn, pageSearchResults } = {}) {
    // 플레이리스트 상단 재생/셔플 바인딩 복원
    (function bindPlaylistTopControls() {
        const playAllBtn = document.getElementById('playlist-play-all');
        const shuffleBtn = document.getElementById('playlist-shuffle');

        // 기존 핸들러 제거(중복 등록 방지)
        if (playAllBtn) playAllBtn.replaceWith(playAllBtn.cloneNode(true));
        if (shuffleBtn) shuffleBtn.replaceWith(shuffleBtn.cloneNode(true));

        const playAllBtn2 = document.getElementById('playlist-play-all');
        const shuffleBtn2 = document.getElementById('playlist-shuffle');

        if (playAllBtn2) {
            playAllBtn2.addEventListener('click', () => {
                if (!appPlaylist || appPlaylist.length === 0) {
                    showAlert('재생할 곡이 없습니다. 먼저 재생목록에 곡을 추가하세요.', '재생 오류');
                    return;
                }
                currentIndex = 0;
                const first = appPlaylist[0];
                if (first && first.previewUrl) {
                    playPreview(first.previewUrl, first.title, first.artist, first.artwork || '');
                    savePlaybackState(0, 0);
                } else {
                    updateNowPlaying(first.title, first.artist || '아티스트');
                    const playBtnLarge = document.querySelector('.play-btn-large');
                    if (playBtnLarge) playBtnLarge.textContent = '⏸';
                }
                updateSkipButtonsState();
            });
        }

        if (shuffleBtn2) {
            shuffleBtn2.addEventListener('click', () => {
                if (!appPlaylist || appPlaylist.length === 0) {
                    showAlert('셔플할 곡이 없습니다. 먼저 재생목록에 곡을 추가하세요.', '셔플 오류');
                    return;
                }
                // Fisher–Yates shuffle
                for (let i = appPlaylist.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [appPlaylist[i], appPlaylist[j]] = [appPlaylist[j], appPlaylist[i]];
                }
                renderAppPlaylist();
                savePlaylistToStorage();

                // 섞은 목록의 첫 곡 자동 재생
                currentIndex = 0;
                const first = appPlaylist[0];
                if (first && first.previewUrl) {
                    playPreview(first.previewUrl, first.title, first.artist, first.artwork || '');
                    savePlaybackState(0, 0);
                } else if (first) {
                    updateNowPlaying(first.title, first.artist || '아티스트');
                    const playBtnLarge = document.querySelector('.play-btn-large');
                    if (playBtnLarge) playBtnLarge.textContent = '⏸';
                }
                updateSkipButtonsState();
            });
        }
    })();


    // 사이드바 링크 -> 페이지 전환 + active 토글
    document.querySelectorAll('.sidebar-link').forEach(link => {
        link.addEventListener('click', function (e) {
            e.preventDefault();
            document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
            this.classList.add('active');
            const targetPage = this.getAttribute('data-page');
            if (targetPage) switchPage(targetPage);
        });
    });

    // 메인 재생 버튼
    if (playBtnLarge) {
        playBtnLarge.setAttribute('aria-label', '메인 재생 버튼');
        playBtnLarge.addEventListener('click', async () => {
            if (!audioPlayer || !audioPlayer.src) { await showAlert('먼저 곡을 선택하세요.', '재생 오류'); return; }
            const icon = playBtnLarge.textContent.trim();
            if (icon === '▶') { audioPlayer.play().catch(err => console.warn('재생 실패:', err)); playBtnLarge.textContent = '⏸'; }
            else { audioPlayer.pause(); playBtnLarge.textContent = '▶'; }
        });
    }

    // 프로그레스 seek
    const prog = document.querySelector('.player-bar .progress-bar') || document.querySelector('.progress-bar');
    if (prog) {
        const seek = clientX => {
            if (!audioPlayer || !audioPlayer.duration) return;
            const rect = prog.getBoundingClientRect();
            const percent = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
            audioPlayer.currentTime = percent * audioPlayer.duration;
        };
        prog.addEventListener('click', e => seek(e.clientX));
        prog.addEventListener('touchstart', e => { if (e.touches[0]) seek(e.touches[0].clientX); });
    }

    // 페이지 검색 이벤트 바인딩 (추천 숨김/표시 로직 포함)
    if (pageSearchBtn && pageSearchInput) {
        pageSearchBtn.addEventListener('click', () => {
            const q = (pageSearchInput.value || '').trim();
            if (!q) {
                // 빈 쿼리면 추천 보이기, 검색 결과 초기화
                showTopRecommendations();
                renderSearchResultsToContainer([], pageSearchResults);
                switchPage('page-search');
                return;
            }
            // 검색 시작: 추천 숨기기
            hideTopRecommendations();
            searchMusicForPage(q, pageSearchResults);
            switchPage('page-search');
        });

        pageSearchInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const q = (pageSearchInput.value || '').trim();
                if (!q) {
                    showTopRecommendations();
                    renderSearchResultsToContainer([], pageSearchResults);
                    switchPage('page-search');
                    return;
                }
                hideTopRecommendations();
                searchMusicForPage(q, pageSearchResults);
                switchPage('page-search');
            } else {
                // 입력 중: 사용자가 지워서 빈 상태가 되면 추천 보이기 (디바운스 없이 간단 처리)
                setTimeout(() => {
                    const q = (pageSearchInput.value || '').trim();
                    if (!q) {
                        showTopRecommendations();
                    }
                }, 0);
            }
        });
    }


    // 모달/검색 네비게이션
    if (searchNavLink) searchNavLink.addEventListener('click', e => { e.preventDefault(); switchPage('page-search'); });
}

/* DOMContentLoaded 초기화 (한 곳에서 처리) */
document.addEventListener('DOMContentLoaded', () => {
    // 요소 선택
    audioPlayer = document.getElementById('audio-player');
    searchModal = document.getElementById('search-modal');
    searchNavLink = document.getElementById('search-nav-link');
    searchInput = document.getElementById('search-input');
    searchBtn = document.getElementById('search-btn');
    searchResults = document.getElementById('search-results');
    playBtnLarge = document.querySelector('.play-btn-large');
    progressBar = document.querySelector('.player-bar .progress-bar') || document.querySelector('.progress-bar');
    volumeSlider = document.querySelector('.volume-slider');

    const pageSearchInput = document.getElementById('page-search-input');
    const pageSearchBtn = document.getElementById('page-search-btn');
    const pageSearchResults = document.getElementById('page-search-results');

    // 플레이어 초기화
    (function initPlayerState() {
        const playerBar = document.querySelector('.player-bar');
        if (playerBar) {
            const progressFill = playerBar.querySelector('.progress-fill');
            if (progressFill) progressFill.style.width = '0%';
            const curEl = playerBar.querySelector('.player-time-current');
            const totalEl = playerBar.querySelector('.player-time-total');
            if (curEl) curEl.textContent = '0:00';
            if (totalEl) totalEl.textContent = '-:-';
        }
        const albumArt = document.querySelector('.album-art');
        if (albumArt) {
            const bg = window.getComputedStyle(albumArt).backgroundImage;
            if (!bg || bg === 'none') albumArt.style.background = 'linear-gradient(135deg,#3b5bdb 0%,#4a69bd 100%)';
        }
        const songDetails = document.querySelector('.song-details');
        if (songDetails) {
            let h4 = songDetails.querySelector('h4');
            let p = songDetails.querySelector('p');
            if (!h4) { h4 = document.createElement('h4'); h4.textContent = '곡 제목'; songDetails.prepend(h4); }
            if (!p) { p = document.createElement('p'); p.textContent = '아티스트'; songDetails.appendChild(p); }
            songDetails.style.display = 'flex';
            songDetails.style.flexDirection = 'column';
            songDetails.style.justifyContent = 'center';
        }
    })();

    // 볼륨 슬라이더
    (function setupVolumeSlider() {
        volumeSlider = volumeSlider || document.querySelector('.volume-slider');
        audioPlayer = audioPlayer || document.getElementById('audio-player');
        if (!volumeSlider) return;
        volumeSlider.value = volumeSlider.value || 20;
        volumeSlider.classList.add('dynamic');
        volumeSlider.style.setProperty('--vol-percent', volumeSlider.value + '%');
        // also set root var so CSS gradient uses it
        document.documentElement.style.setProperty('--vol-percent', volumeSlider.value + '%');
        if (audioPlayer) audioPlayer.volume = Number(volumeSlider.value) / 100;
        const volHandler = function () {
            const val = Math.min(Math.max(Number(this.value) || 0, 0), 100);
            const pct = val + '%';
            this.style.setProperty('--vol-percent', pct);
            document.documentElement.style.setProperty('--vol-percent', pct);
            if (audioPlayer) audioPlayer.volume = val / 100;
        };
        volumeSlider.addEventListener('input', volHandler);
        volumeSlider.addEventListener('change', volHandler);
        // initial trigger
        volumeSlider.dispatchEvent(new Event('input'));
    })();

    // 동적으로 이전/다음 버튼 생성 및 배치
    (function createSkipButtons() {
        const playerContent = document.querySelector('.player-content');
        if (!playerContent) return;

        // 이전 버튼
        skipPrevBtn = document.createElement('button');
        skipPrevBtn.className = 'control-btn skip-btn skip-prev';
        skipPrevBtn.type = 'button';
        skipPrevBtn.setAttribute('aria-label', '이전 곡');
        skipPrevBtn.textContent = '⏮';
        skipPrevBtn.style.fontSize = '18px';
        skipPrevBtn.style.width = '40px';
        skipPrevBtn.style.height = '40px';
        skipPrevBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            playPrev();
        });

        // 다음 버튼
        skipNextBtn = document.createElement('button');
        skipNextBtn.className = 'control-btn skip-btn skip-next';
        skipNextBtn.type = 'button';
        skipNextBtn.setAttribute('aria-label', '다음 곡');
        skipNextBtn.textContent = '⏭';
        skipNextBtn.style.fontSize = '18px';
        skipNextBtn.style.width = '40px';
        skipNextBtn.style.height = '40px';
        skipNextBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            playNext();
        });

        // 배치: playerContent 내에서 playBtnLarge 옆에 넣기(있으면)
        const ref = playerContent.querySelector('.play-btn-large');
        if (ref && ref.parentNode) {
            // insert prev before playBtnLarge, next after playBtnLarge
            ref.parentNode.insertBefore(skipPrevBtn, ref);
            ref.parentNode.insertBefore(skipNextBtn, ref.nextSibling);
        } else {
            // fallback: append to playerContent
            playerContent.appendChild(skipPrevBtn);
            playerContent.appendChild(skipNextBtn);
        }

        // 초기 상태 반영
        updateSkipButtonsState();
    })();

    // 이벤트 리스너 등록
    initializeEventListeners({ pageSearchInput, pageSearchBtn, pageSearchResults });

    // 플레이리스트 복원 및 렌더
    if (!loadPlaylistFromStorage()) appPlaylist.length = 0;
    renderAppPlaylist();

    // 재생 상태 복원
    const savedState = loadPlaybackState();
    if (savedState && savedState.index != null && appPlaylist[savedState.index]) {
        updateNowPlaying(appPlaylist[savedState.index].title, appPlaylist[savedState.index].artist);
        if (audioPlayer && appPlaylist[savedState.index].previewUrl) {
            audioPlayer.src = appPlaylist[savedState.index].previewUrl;
            try { audioPlayer.currentTime = savedState.time || 0; } catch (e) { }
            currentIndex = savedState.index;
        }
    }

    // 바인딩
    bindAudioEvents();

    // Top10 추천 초기화 (iTunes 기반)
    if (!document.getElementById('top100-recommendations')) {
        const searchInputEl = document.getElementById('page-search-input') || document.getElementById('search-input');
        if (searchInputEl && searchInputEl.parentNode) {
            const wrap = document.createElement('div');
            wrap.id = 'top100-recommendations';
            wrap.className = 'top100-wrap';
            searchInputEl.parentNode.insertBefore(wrap, searchInputEl.nextSibling);
        }
    }
    try { initTop10Recommendations('top songs'); } catch (e) { console.warn('initTop10Recommendations failed', e); }

    // ensure skip buttons reflect current playlist
    updateSkipButtonsState();
});

/* 분리된 무작위 재생 로직: 오늘의 추천곡 / 신곡 추천 (script.js 맨 아래에 추가) */
(function () {
    const AUDIO = document.getElementById("audio-player");
    if (!AUDIO) return;

    const TODAY_CANDIDATES = [
        "From the start",
        "LAmour Les",
        "Close to you Sole",
        "우리가 헤어져야 했던 이유",
        "Our Beloved Summer",
        "Big bird",
        "10cm 노을",
        "On your side 시온",
        "Fall In Love Alone"
    ];

    const NEW_RELEASE_CANDIDATES = [
        "엔믹스",
        "하츠투하츠",
        "르세라핌",
        "키키",
        "아일릿",
        "최예나",
        "이즈나",
        "리센느",
        "베이비 몬스터"
    ];

    const ITUNES_API = "https://itunes.apple.com/search";

    function findCardByTitles(titles) {
        const headers = document.querySelectorAll(".section-header h2, .home-dual-section .section-header h2, .section h2");
        for (const h of headers) {
            const txt = h.textContent && h.textContent.trim();
            if (!txt) continue;
            for (const t of titles) {
                if (txt === t) {
                    const section = h.closest(".home-dual-section, .section, .home-dual");
                    if (section) {
                        const card = section.querySelector(".playlist-card, .song-card");
                        if (card) return card;
                    }
                }
            }
        }
        return null;
    }

    const todayCard = findCardByTitles(["오늘의 추천 곡", "오늘의 추천곡"]);
    const newReleaseCard = findCardByTitles(["새로운 음악", "신곡", "새로운 곡"]);

    function updatePlayerUI(title, artist, artUrl) {
        const nowTitle = document.querySelector(".player-bar .song-title") || document.querySelector(".song-title");
        const nowArtist = document.querySelector(".player-bar .song-artist") || document.querySelector(".song-artist");
        const albumArtEl = document.querySelector(".player-bar .album-art") || document.querySelector(".album-art");

        if (nowTitle) nowTitle.textContent = title || "";
        if (nowArtist) nowArtist.textContent = artist || "";

        if (albumArtEl) {
            if (artUrl) {
                albumArtEl.innerHTML = "";
                const img = document.createElement("img");
                img.src = artUrl;
                img.alt = `${title} cover`;
                img.style.width = "100%";
                img.style.height = "100%";
                img.style.objectFit = "cover";
                albumArtEl.appendChild(img);
            }
        }
    }

    async function searchItunes(query) {
        const url = `${ITUNES_API}?term=${encodeURIComponent(query)}&entity=song&limit=10&country=KR`;
        try {
            const res = await fetch(url, { method: "GET", headers: { "Accept": "application/json" } });
            if (!res.ok) throw new Error("iTunes API error: " + res.status);
            const json = await res.json();
            return json.results || [];
        } catch (err) {
            console.error("iTunes search failed:", err);
            return [];
        }
    }

    function pickBestTrack(results, query) {
        const q = (query || "").toLowerCase();
        let exact = results.find(r => (r.trackName || "").toLowerCase().includes(q));
        if (exact) return exact;
        return results[0] || null;
    }

    async function playTrackFromItunes(track) {
        if (!track || !track.previewUrl) {
            console.warn("재생 가능한 previewUrl이 없습니다.");
            return;
        }

        try {
            const globalPlayers = [
                window.player,
                window.appPlayer,
                window.audioPlayer,
                window.musicPlayer
            ];
            for (const gp of globalPlayers) {
                if (!gp) continue;
                if (typeof gp.load === "function") {
                    gp.load({ src: track.previewUrl, title: track.trackName, artist: track.artistName, artwork: track.artworkUrl100 || track.artworkUrl60 });
                    if (typeof gp.play === "function") gp.play().catch(() => { });
                    return;
                }
                if (typeof gp.playTrack === "function") {
                    gp.playTrack(track.previewUrl, { title: track.trackName, artist: track.artistName, artwork: track.artworkUrl100 || track.artworkUrl60 });
                    return;
                }
                if (typeof gp.setTrack === "function") {
                    gp.setTrack({ src: track.previewUrl, title: track.trackName, artist: track.artistName, artwork: track.artworkUrl100 || track.artworkUrl60 });
                    if (typeof gp.play === "function") gp.play().catch(() => { });
                    return;
                }
            }
        } catch (e) {
            console.warn("global player 호출 시 예외:", e);
        }

        try {
            if (typeof window.playTrack === "function") {
                window.playTrack(track.previewUrl, { title: track.trackName, artist: track.artistName, artwork: track.artworkUrl100 || track.artworkUrl60 });
                return;
            }
            if (typeof window.setTrack === "function") {
                window.setTrack(track.previewUrl, track.trackName, track.artistName, track.artworkUrl100 || track.artworkUrl60);
                if (typeof window.play === "function") window.play();
                return;
            }
        } catch (e) {
            console.warn("global function 호출 시 예외:", e);
        }

        try {
            const playerBar = document.querySelector(".player-bar");
            if (playerBar) {
                if (playerBar.hasAttribute("data-track-src")) {
                    playerBar.setAttribute("data-track-src", track.previewUrl);
                    const playBtn = playerBar.querySelector(".play-btn-large, .play-btn");
                    if (playBtn) { playBtn.click(); updatePlayerUI(track.trackName, track.artistName, track.artworkUrl100 || track.artworkUrl60); return; }
                }
                const loadLink = playerBar.querySelector(".load-track, .set-track");
                if (loadLink) {
                    loadLink.setAttribute("data-src", track.previewUrl);
                    loadLink.dispatchEvent(new CustomEvent("track:change", { detail: { src: track.previewUrl, title: track.trackName, artist: track.artistName, artwork: track.artworkUrl100 || track.artworkUrl60 } }));
                    const playBtn = playerBar.querySelector(".play-btn-large, .play-btn");
                    if (playBtn) { playBtn.click(); updatePlayerUI(track.trackName, track.artistName, track.artworkUrl100 || track.artworkUrl60); return; }
                }
            }
        } catch (e) {
            console.warn("player-bar 조작 시 예외:", e);
        }

        try {
            const audioEl = document.getElementById("audio-player");
            if (!audioEl) {
                console.warn("audio-player 요소를 찾을 수 없습니다. 재생 불가.");
                return;
            }
            if (audioEl.getAttribute("src") !== track.previewUrl) {
                audioEl.setAttribute("src", track.previewUrl);
            }
            updatePlayerUI(track.trackName, track.artistName, track.artworkUrl100 || track.artworkUrl60);
            const p = audioEl.play();
            if (p !== undefined) await p;
        } catch (err) {
            console.warn("오디오 직접 재생 실패:", err);
            const bigPlay = document.querySelector(".player-bar .play-btn-large");
            if (bigPlay) bigPlay.focus();
        }
    }

    function createClickHandler(card, candidates) {
        return async function onCardClick(e) {
            e && e.preventDefault && e.preventDefault();
            e && e.stopPropagation && e.stopPropagation();

            if (!Array.isArray(candidates) || candidates.length === 0) {
                console.warn("재생 후보 목록이 비어 있습니다.");
                return;
            }

            const idx = Math.floor(Math.random() * candidates.length);
            const chosenQuery = candidates[idx];

            card && card.classList && card.classList.add("loading");

            const results = await searchItunes(chosenQuery);

            card && card.classList && card.classList.remove("loading");

            if (!results || results.length === 0) {
                console.warn("iTunes에서 결과를 찾지 못했습니다:", chosenQuery);
                return;
            }

            const chosen = pickBestTrack(results, chosenQuery);
            if (!chosen) {
                console.warn("적합한 트랙을 선택하지 못했습니다.");
                return;
            }

            await playTrackFromItunes(chosen);
        };
    }

    if (todayCard) {
        const handlerToday = createClickHandler(todayCard, TODAY_CANDIDATES);
        todayCard.addEventListener("click", handlerToday);
        const innerBtn = todayCard.querySelector(".play-btn, .play-icon, button");
        if (innerBtn) {
            innerBtn.addEventListener("click", function (ev) {
                ev.stopPropagation();
                ev.preventDefault && ev.preventDefault();
                handlerToday(ev);
            });
        }
    }

    if (newReleaseCard) {
        const handlerNew = createClickHandler(newReleaseCard, NEW_RELEASE_CANDIDATES);
        newReleaseCard.addEventListener("click", handlerNew);
        const innerBtnNew = newReleaseCard.querySelector(".play-btn, .play-icon, button");
        if (innerBtnNew) {
            innerBtnNew.addEventListener("click", function (ev) {
                ev.stopPropagation();
                ev.preventDefault && ev.preventDefault();
                handlerNew(ev);
            });
        }
    }

    try {
        const oldAudio = document.getElementById("audio-player");
        if (oldAudio) {
            const newAudio = oldAudio.cloneNode(true);
            newAudio.id = oldAudio.id;
            oldAudio.parentNode.replaceChild(newAudio, oldAudio);
            newAudio.addEventListener("ended", function () {
                newAudio.pause();
                const bigPlay = document.querySelector(".player-bar .play-btn-large");
                if (bigPlay) bigPlay.classList.remove("is-playing");
                const currentEl = document.querySelector(".player-time-current");
                if (currentEl) currentEl.textContent = "0:00";
            });
        }
    } catch (e) {
        console.warn("audio ended 리스너 재설정 중 예외:", e);
    }

})();

document.addEventListener("DOMContentLoaded", () => {
    const hamburgerBtn = document.querySelector(".hamburger-btn");
    const sidebar = document.querySelector(".sidebar");
    if (hamburgerBtn && sidebar) {
        hamburgerBtn.addEventListener("click", () => {
            sidebar.classList.toggle("open");
        });
        // 메뉴 클릭 시 자동 닫힘
        sidebar.querySelectorAll(".sidebar-link").forEach(link => {
            link.addEventListener("click", () => {
                sidebar.classList.remove("open");
            });
        });
    }
});
