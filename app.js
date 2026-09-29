/**
 * Busan Convenience Store Map Application
 * Core Business Logic & Interactive Map Engine
 */

(function () {
  'use strict';

  // --- Constants & Config ---
  const BUSAN_CENTER = [35.1796, 129.0756];
  const DEFAULT_ZOOM = 12;

  // District Coordinates for Zooming
  const DISTRICT_COORDS = {
    "ALL": { center: BUSAN_CENTER, zoom: 12 },
    "중구": { center: [35.1062, 129.0326], zoom: 14 },
    "서구": { center: [35.0979, 129.0243], zoom: 14 },
    "동구": { center: [35.1293, 129.0454], zoom: 14 },
    "영도구": { center: [35.0912, 129.0678], zoom: 13 },
    "부산진구": { center: [35.1631, 129.0532], zoom: 14 },
    "동래구": { center: [35.2048, 129.0836], zoom: 14 },
    "남구": { center: [35.1365, 129.0843], zoom: 14 },
    "북구": { center: [35.1970, 128.9904], zoom: 13 },
    "해운대구": { center: [35.1631, 129.1636], zoom: 13 },
    "사하구": { center: [35.1044, 128.9750], zoom: 13 },
    "금정구": { center: [35.2430, 129.0921], zoom: 13 },
    "강서구": { center: [35.2122, 128.9806], zoom: 12 },
    "연제구": { center: [35.1764, 129.0797], zoom: 14 },
    "수영구": { center: [35.1456, 129.1131], zoom: 14 },
    "사상구": { center: [35.1526, 128.9913], zoom: 13 },
    "기장군": { center: [35.2447, 129.2223], zoom: 12 }
  };

  const BRAND_LABELS = {
    "CU": "CU",
    "GS25": "GS25",
    "SEVEN11": "세븐일레븐",
    "EMART24": "이마트24",
    "OTHER": "기타"
  };

  const BRAND_PIN_TEXT = {
    "CU": "CU",
    "GS25": "GS",
    "SEVEN11": "7",
    "EMART24": "E24",
    "OTHER": "편"
  };

  // --- State ---
  let map;
  let markerCluster;
  let allStores = [];
  let filteredStores = [];
  let markerMap = new Map(); // id -> L.marker
  let userLocationMarker = null;

  let currentBrand = "ALL";
  let currentDistrict = "ALL";
  let searchKeyword = "";

  let listRenderLimit = 40;
  const RENDER_BATCH_SIZE = 30;

  // Bottom sheet state for mobile: 'collapsed' | 'half' | 'full'
  let sheetState = 'collapsed';

  // --- DOM Elements ---
  const el = {
    keywordInput: document.getElementById('keyword-input'),
    searchClearBtn: document.getElementById('search-clear-btn'),
    myLocationBtn: document.getElementById('my-location-btn'),
    statsModalBtn: document.getElementById('stats-modal-btn'),
    districtSelect: document.getElementById('district-select'),
    brandChips: document.getElementById('brand-chips'),
    filterResetBtn: document.getElementById('filter-reset-btn'),
    sidebar: document.getElementById('sidebar'),
    sidebarToggleBtn: document.getElementById('sidebar-toggle-btn'),
    resultCount: document.getElementById('result-count'),
    storeList: document.getElementById('store-list'),
    busanOverviewBtn: document.getElementById('busan-overview-btn'),
    bottomSheet: document.getElementById('bottom-sheet'),
    sheetHeader: document.getElementById('sheet-header'),
    sheetHandle: document.getElementById('sheet-handle'),
    sheetResultCount: document.getElementById('sheet-result-count'),
    sheetContent: document.getElementById('sheet-content'),
    mobileStoreList: document.getElementById('mobile-store-list'),
    statsModal: document.getElementById('stats-modal'),
    statsCloseBtn: document.getElementById('stats-close-btn'),
    statsTotalCount: document.getElementById('stats-total-count'),
    statsBrandList: document.getElementById('stats-brand-list'),
    statsDistrictList: document.getElementById('stats-district-list')
  };

  // --- Initialize Map ---
  function initMap() {
    map = L.map('map', {
      center: BUSAN_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: false
    });

    // Add Zoom Control to Bottom Right
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // 1. 대한민국 국토교통부 VWorld 공식 일반지도 (100% 무료, 차단 없음, 선명한 한글 도로명)
    const vworldBaseLayer = L.tileLayer('https://xdworld.vworld.kr/2d/Base/service/{z}/{x}/{y}.png', {
      attribution: '&copy; 공간정보오픈플랫폼(VWorld) 국토교통부',
      minZoom: 6,
      maxZoom: 19
    }).addTo(map);

    // 2. Esri World Street Map (글로벌 고화질 도로망)
    const esriStreetLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles &copy; Esri',
      maxZoom: 19
    });

    // 3. VWorld 항공/위성 지도
    const vworldSatLayer = L.tileLayer('https://xdworld.vworld.kr/2d/Satellite/service/{z}/{x}/{y}.jpeg', {
      attribution: '&copy; 국토교통부 VWorld 위성',
      maxZoom: 19
    });

    // Layer Control (기본값: VWorld 일반지도)
    L.control.layers({
      "대한민국 일반지도 (VWorld)": vworldBaseLayer,
      "상세 도로지도 (Esri)": esriStreetLayer,
      "위성 항공사진 (VWorld)": vworldSatLayer
    }, null, { position: 'topright' }).addTo(map);

    // Marker Cluster Group
    markerCluster = L.markerClusterGroup({
      chunkedLoading: true,
      maxClusterRadius: 45,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true
    });
    map.addLayer(markerCluster);
  }

  // --- Load Data ---
  async function loadData() {
    try {
      // 1. Check window.STORE_DATA first (direct load for file:// compatibility)
      if (window.STORE_DATA && Array.isArray(window.STORE_DATA)) {
        allStores = window.STORE_DATA;
      } else {
        const resp = await fetch('stores.json');
        if (!resp.ok) throw new Error('Network response not ok');
        allStores = await resp.json();
      }
      onDataLoaded();
    } catch (err) {
      console.warn('Falling back or data load failed:', err);
      if (window.STORE_DATA) {
        allStores = window.STORE_DATA;
        onDataLoaded();
      } else {
        alert('편의점 데이터를 불러오는 중 오류가 발생했습니다. 로컬 서버 환경 또는 stores-data.js 파일 유무를 확인해주세요.');
      }
    }
  }

  function onDataLoaded() {
    updateBrandCounts(allStores);
    applyFilters();
    populateStatsModal();
  }

  // --- Custom Marker Pin Generator ---
  function createCustomIcon(brand) {
    const pinClass = `pin-${brand.toLowerCase()}`;
    const initial = BRAND_PIN_TEXT[brand] || '편';

    return L.divIcon({
      className: 'custom-pin-wrapper',
      html: `<div class="custom-pin ${pinClass}"><span>${initial}</span></div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 32],
      popupAnchor: [0, -30]
    });
  }

  // --- Create Marker Popup ---
  function createPopupContent(store) {
    const fullTitle = store.branch ? `${store.name} ${store.branch}` : store.name;
    const kakaoMapUrl = `https://map.kakao.com/link/to/${encodeURIComponent(fullTitle)},${store.lat},${store.lng}`;
    const naverMapUrl = `https://map.naver.com/v5/search/${encodeURIComponent(fullTitle)}`;

    return `
      <div class="popup-container">
        <div class="popup-header">
          <span class="brand-badge ${store.brand}">${store.brandLabel}</span>
          <span class="gu-dong-badge">${store.gu} ${store.dong || ''}</span>
        </div>
        <div class="popup-title">${fullTitle}</div>
        <div class="popup-addr">📍 ${store.roadAddr || store.jibunAddr || '주소 정보 없음'}</div>
        <div class="popup-links">
          <a href="${kakaoMapUrl}" target="_blank" rel="noopener noreferrer" class="popup-btn kakao">카카오 길찾기</a>
          <a href="${naverMapUrl}" target="_blank" rel="noopener noreferrer" class="popup-btn naver">네이버 길찾기</a>
        </div>
      </div>
    `;
  }

  // --- Update Brand Counts on Filter Chips ---
  function updateBrandCounts(storeList) {
    const counts = { ALL: storeList.length, CU: 0, GS25: 0, SEVEN11: 0, EMART24: 0, OTHER: 0 };
    storeList.forEach(s => {
      if (counts[s.brand] !== undefined) counts[s.brand]++;
      else counts.OTHER++;
    });

    document.getElementById('count-all').textContent = counts.ALL.toLocaleString();
    document.getElementById('count-cu').textContent = counts.CU.toLocaleString();
    document.getElementById('count-gs25').textContent = counts.GS25.toLocaleString();
    document.getElementById('count-seven11').textContent = counts.SEVEN11.toLocaleString();
    document.getElementById('count-emart24').textContent = counts.EMART24.toLocaleString();
    document.getElementById('count-other').textContent = counts.OTHER.toLocaleString();
  }

  // --- Filter Logic ---
  function applyFilters(resetZoom = false) {
    const kw = searchKeyword.trim().toLowerCase();

    filteredStores = allStores.filter(store => {
      // 1. Brand match
      if (currentBrand !== "ALL" && store.brand !== currentBrand) return false;

      // 2. District match
      if (currentDistrict !== "ALL" && store.gu !== currentDistrict) return false;

      // 3. Keyword match (Name, Branch, Road/Jibun Address, Dong)
      if (kw) {
        const fullSearchTarget = `${store.name} ${store.branch || ''} ${store.roadAddr} ${store.jibunAddr} ${store.dong}`.toLowerCase();
        if (!fullSearchTarget.includes(kw)) return false;
      }

      return true;
    });

    // Update Counts UI
    const countText = filteredStores.length.toLocaleString();
    el.resultCount.textContent = countText;
    el.sheetResultCount.textContent = countText;

    // Update Map Markers
    renderMarkers();

    // Reset list pagination limit and render store list
    listRenderLimit = 40;
    renderStoreList();

    if (resetZoom && DISTRICT_COORDS[currentDistrict]) {
      const target = DISTRICT_COORDS[currentDistrict];
      map.flyTo(target.center, target.zoom, { duration: 0.8 });
    }
  }

  // --- Render Map Markers ---
  function renderMarkers() {
    markerCluster.clearLayers();
    markerMap.clear();

    const markersToAdd = [];

    filteredStores.forEach(store => {
      const icon = createCustomIcon(store.brand);
      const marker = L.marker([store.lat, store.lng], { icon: icon });
      marker.bindPopup(createPopupContent(store));

      marker.on('click', () => {
        highlightCard(store.id);
      });

      markerMap.set(store.id, marker);
      markersToAdd.push(marker);
    });

    markerCluster.addLayers(markersToAdd);
  }

  // --- Render Store List Cards (Desktop & Mobile) ---
  function renderStoreList() {
    const listToDisplay = filteredStores.slice(0, listRenderLimit);

    if (filteredStores.length === 0) {
      const emptyHtml = `
        <div style="padding: 40px 20px; text-align: center; color: var(--text-muted);">
          <div style="font-size: 2rem; margin-bottom: 8px;">🔍</div>
          <p style="font-weight: 600;">검색 결과가 없습니다.</p>
          <p style="font-size: 0.82rem; margin-top: 4px;">다른 브랜드나 지역을 선택해 보세요.</p>
        </div>
      `;
      el.storeList.innerHTML = emptyHtml;
      el.mobileStoreList.innerHTML = emptyHtml;
      return;
    }

    const cardsHtml = listToDisplay.map(store => createStoreCardHtml(store)).join('');

    // Append 'Load More' if needed
    const loadMoreHtml = (filteredStores.length > listRenderLimit) ? `
      <div style="text-align: center; padding: 12px;">
        <button type="button" class="load-more-btn" style="
          padding: 8px 16px; border: 1px solid var(--border); border-radius: var(--radius-md);
          background: #ffffff; color: var(--accent); font-weight: 600; font-size: 0.84rem; cursor: pointer;
        ">
          더보기 (${listRenderLimit}/${filteredStores.length})
        </button>
      </div>
    ` : '';

    el.storeList.innerHTML = cardsHtml + loadMoreHtml;
    el.mobileStoreList.innerHTML = cardsHtml + loadMoreHtml;

    // Attach click listeners to cards and load more button
    attachCardListeners(el.storeList);
    attachCardListeners(el.mobileStoreList);
  }

  function createStoreCardHtml(store) {
    const fullTitle = store.name;
    const branchText = store.branch ? `<span class="branch-name">${store.branch}</span>` : '';
    const kakaoMapUrl = `https://map.kakao.com/link/to/${encodeURIComponent(fullTitle)},${store.lat},${store.lng}`;

    return `
      <div class="store-card" data-id="${store.id}" data-lat="${store.lat}" data-lng="${store.lng}">
        <div class="card-top">
          <span class="brand-badge ${store.brand}">${store.brandLabel}</span>
          <span class="gu-dong-badge">${store.gu} ${store.dong || ''}</span>
        </div>
        <div class="store-title">${fullTitle} ${branchText}</div>
        <div class="store-addr">📍 ${store.roadAddr || store.jibunAddr || ''}</div>
        <div class="card-actions">
          <a href="${kakaoMapUrl}" target="_blank" rel="noopener noreferrer" class="nav-link-btn" onclick="event.stopPropagation()">길찾기</a>
        </div>
      </div>
    `;
  }

  function attachCardListeners(container) {
    const cards = container.querySelectorAll('.store-card');
    cards.forEach(card => {
      card.addEventListener('click', () => {
        const id = card.dataset.id;
        const lat = parseFloat(card.dataset.lat);
        const lng = parseFloat(card.dataset.lng);
        focusStore(id, lat, lng);
      });
    });

    const loadBtn = container.querySelector('.load-more-btn');
    if (loadBtn) {
      loadBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        listRenderLimit += RENDER_BATCH_SIZE;
        renderStoreList();
      });
    }
  }

  // --- Focus Store on Map & Open Popup ---
  function focusStore(id, lat, lng) {
    highlightCard(id);

    // If mobile, collapse bottom sheet to half so map is visible
    if (window.innerWidth <= 768) {
      setBottomSheetState('half');
    }

    map.flyTo([lat, lng], 17, { duration: 0.6 });

    setTimeout(() => {
      const marker = markerMap.get(id);
      if (marker) {
        markerCluster.zoomToShowLayer(marker, () => {
          marker.openPopup();
        });
      }
    }, 400);
  }

  function highlightCard(id) {
    document.querySelectorAll('.store-card').forEach(c => {
      if (c.dataset.id === id) {
        c.classList.add('active');
        c.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else {
        c.classList.remove('active');
      }
    });
  }

  // --- Mobile Bottom Sheet Interactions ---
  function setBottomSheetState(state) {
    sheetState = state;
    el.bottomSheet.classList.remove('state-collapsed', 'state-half', 'state-full');
    el.bottomSheet.classList.add(`state-${state}`);
  }

  function toggleBottomSheet() {
    if (sheetState === 'collapsed') {
      setBottomSheetState('half');
    } else if (sheetState === 'half') {
      setBottomSheetState('full');
    } else {
      setBottomSheetState('collapsed');
    }
  }

  // --- Event Listeners Setup ---
  function setupEventListeners() {
    // 1. Search Input (Debounced)
    let debounceTimer;
    el.keywordInput.addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      const val = e.target.value;
      if (val.length > 0) {
        el.searchClearBtn.classList.add('active');
      } else {
        el.searchClearBtn.classList.remove('active');
      }

      debounceTimer = setTimeout(() => {
        searchKeyword = val;
        applyFilters();
      }, 200);
    });

    // Clear Search Button
    el.searchClearBtn.addEventListener('click', () => {
      el.keywordInput.value = '';
      el.searchClearBtn.classList.remove('active');
      searchKeyword = '';
      applyFilters();
      el.keywordInput.focus();
    });

    // 2. District Dropdown
    el.districtSelect.addEventListener('change', (e) => {
      currentDistrict = e.target.value;
      applyFilters(true);
    });

    // 3. Brand Filter Chips
    el.brandChips.addEventListener('click', (e) => {
      const btn = e.target.closest('.chip');
      if (!btn) return;

      el.brandChips.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');

      currentBrand = btn.dataset.brand;
      applyFilters();
    });

    // 4. Reset Filters Button
    el.filterResetBtn.addEventListener('click', () => {
      currentBrand = 'ALL';
      currentDistrict = 'ALL';
      searchKeyword = '';
      el.keywordInput.value = '';
      el.searchClearBtn.classList.remove('active');
      el.districtSelect.value = 'ALL';

      el.brandChips.querySelectorAll('.chip').forEach(c => {
        c.classList.toggle('active', c.dataset.brand === 'ALL');
      });

      applyFilters(true);
    });

    // 5. Desktop Sidebar Toggle
    el.sidebarToggleBtn.addEventListener('click', () => {
      el.sidebar.classList.toggle('collapsed');
      setTimeout(() => map.invalidateSize(), 300);
    });

    // 6. Busan Overview Floating Button
    el.busanOverviewBtn.addEventListener('click', () => {
      map.flyTo(BUSAN_CENTER, DEFAULT_ZOOM, { duration: 0.8 });
    });

    // 7. My Location Button (HTML5 Geolocation)
    el.myLocationBtn.addEventListener('click', () => {
      if (!navigator.geolocation) {
        alert('이 브라우저에서는 위치 서비스를 지원하지 않습니다.');
        return;
      }

      el.myLocationBtn.disabled = true;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          el.myLocationBtn.disabled = false;
          const userLat = pos.coords.latitude;
          const userLng = pos.coords.longitude;

          if (userLocationMarker) {
            map.removeLayer(userLocationMarker);
          }

          // User Location Pulse Marker
          const userIcon = L.divIcon({
            className: 'user-loc-pin',
            html: `
              <div style="
                width: 18px; height: 18px; background: #2563eb; border: 3px solid #ffffff;
                border-radius: 50%; box-shadow: 0 0 10px rgba(37,99,235,0.7);
              "></div>
            `,
            iconSize: [20, 20],
            iconAnchor: [10, 10]
          });

          userLocationMarker = L.marker([userLat, userLng], { icon: userIcon }).addTo(map);
          userLocationMarker.bindPopup('<strong>📍 현재 나의 위치</strong>').openPopup();

          map.flyTo([userLat, userLng], 15, { duration: 1 });
        },
        (err) => {
          el.myLocationBtn.disabled = false;
          console.warn('Geolocation error:', err);
          alert('위치 정보를 가져올 수 없습니다. 브라우저의 위치 권한 설정을 확인해주세요.');
        },
        { timeout: 10000, enableHighAccuracy: true }
      );
    });

    // 8. Mobile Bottom Sheet Interactions
    el.sheetHandle.addEventListener('click', toggleBottomSheet);
    el.sheetHeader.addEventListener('click', toggleBottomSheet);

    // 9. Statistics Modal
    el.statsModalBtn.addEventListener('click', () => {
      el.statsModal.classList.add('active');
    });

    el.statsCloseBtn.addEventListener('click', () => {
      el.statsModal.classList.remove('active');
    });

    el.statsModal.addEventListener('click', (e) => {
      if (e.target === el.statsModal) {
        el.statsModal.classList.remove('active');
      }
    });

    // Window Resize Handler for Leaflet
    window.addEventListener('resize', () => {
      if (map) map.invalidateSize();
    });
  }

  // --- Populate Statistics Modal Content ---
  function populateStatsModal() {
    el.statsTotalCount.textContent = `${allStores.length.toLocaleString()}개`;

    // Brand counts
    const brandCounts = {};
    const districtCounts = {};

    allStores.forEach(s => {
      brandCounts[s.brandLabel] = (brandCounts[s.brandLabel] || 0) + 1;
      districtCounts[s.gu] = (districtCounts[s.gu] || 0) + 1;
    });

    // Render Brand Stats
    const sortedBrands = Object.entries(brandCounts).sort((a, b) => b[1] - a[1]);
    const maxBrand = sortedBrands[0][1];

    const brandColors = {
      "CU": "var(--brand-cu)",
      "GS25": "var(--brand-gs25)",
      "세븐일레븐": "var(--brand-seven11)",
      "이마트24": "var(--brand-emart24)",
      "기타": "var(--brand-other)"
    };

    el.statsBrandList.innerHTML = sortedBrands.map(([name, count]) => {
      const pct = Math.round((count / allStores.length) * 100);
      const widthPct = Math.round((count / maxBrand) * 100);
      const color = brandColors[name] || "var(--accent)";

      return `
        <div class="stats-brand-row">
          <span style="font-weight: 600; width: 80px;">${name}</span>
          <div class="stats-bar-wrapper">
            <div class="stats-bar-fill" style="width: ${widthPct}%; background-color: ${color};"></div>
          </div>
          <span style="width: 75px; text-align: right; color: var(--text-muted); font-size: 0.8rem;">
            <strong>${count.toLocaleString()}</strong>개 (${pct}%)
          </span>
        </div>
      `;
    }).join('');

    // Render District Top 5
    const sortedDistricts = Object.entries(districtCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const maxDistrict = sortedDistricts[0][1];

    el.statsDistrictList.innerHTML = sortedDistricts.map(([gu, count], idx) => {
      const widthPct = Math.round((count / maxDistrict) * 100);

      return `
        <div class="stats-district-row">
          <span style="font-weight: 600; width: 80px;">${idx + 1}. ${gu}</span>
          <div class="stats-bar-wrapper">
            <div class="stats-bar-fill" style="width: ${widthPct}%; background-color: var(--accent);"></div>
          </div>
          <span style="width: 60px; text-align: right; color: var(--text-muted); font-size: 0.8rem;">
            <strong>${count}</strong>개
          </span>
        </div>
      `;
    }).join('');
  }

  // --- Bootstrap ---
  window.addEventListener('DOMContentLoaded', () => {
    initMap();
    setupEventListeners();
    loadData();
  });

})();
