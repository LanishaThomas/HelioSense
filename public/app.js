/* ═══════════════════════════════════════════════════════════════════
   HelioSense — app.js
   Shared JavaScript: intro, navigation, API, geolocation, page logic
   ═══════════════════════════════════════════════════════════════════ */

// ─── Helpers ───────────────────────────────────────────────────────
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

// ─── Toast Notifications ───────────────────────────────────────────
function showToast(msg, type = '', duration = 3000) {
  const t = $('#toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'toast show ' + type;
  clearTimeout(t._timeout);
  t._timeout = setTimeout(() => t.classList.remove('show'), duration);
}

// ─── API Helpers ───────────────────────────────────────────────────
async function fetchUV(lat, lng) {
  try {
    const res = await fetch(`/api/uv?lat=${lat}&lng=${lng}`);
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      console.error('UV API Error:', res.status, errData);
      throw new Error(errData.error || 'UV fetch failed');
    }
    const data = await res.json();
    console.log('UV Data received:', data);
    return data;
  } catch (err) {
    console.error('fetchUV error:', err);
    throw err;
  }
}

async function fetchForecast(lat, lng) {
  try {
    const res = await fetch(`/api/forecast?lat=${lat}&lng=${lng}`);
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      console.error('Forecast API Error:', res.status, errData);
      throw new Error(errData.error || 'Forecast fetch failed');
    }
    const data = await res.json();
    console.log('Forecast Data received:', data);
    return data;
  } catch (err) {
    console.error('fetchForecast error:', err);
    throw err;
  }
}

async function geocodeCity(city) {
  const res = await fetch(`/api/geocode?city=${encodeURIComponent(city)}`);
  if (!res.ok) throw new Error('Geocode failed');
  return res.json();
}

async function reverseGeocode(lat, lng) {
  const res = await fetch(`/api/reverse-geocode?lat=${lat}&lng=${lng}`);
  if (!res.ok) throw new Error('Reverse geocode failed');
  return res.json();
}

async function fetchTimezone(lat, lng) {
  const res = await fetch(`/api/timezone?lat=${lat}&lng=${lng}`);
  if (!res.ok) throw new Error('Timezone fetch failed');
  return res.json();
}

// ─── Geolocation ───────────────────────────────────────────────────
function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Geolocation not supported'));
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      err => reject(err),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

// ─── Location Time Helper ──────────────────────────────────────────
function getApproxTimezoneLabelFromLng(lng) {
  const offsetHours = Math.round(Number(lng || 0) / 15);
  const sign = offsetHours >= 0 ? '+' : '';
  return `UTC${sign}${offsetHours}`;
}

function formatLocationTime(timezone, lngFallback, utcOffsetSeconds) {
  const now = new Date();
  if (timezone) {
    try {
      return new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: timezone
      }).format(now);
    } catch (e) { /* fallback below */ }
  }

  if (Number.isFinite(Number(utcOffsetSeconds)) && Number(utcOffsetSeconds) !== 0) {
    const utcMs = now.getTime() + (now.getTimezoneOffset() * 60000);
    return new Date(utcMs + Number(utcOffsetSeconds) * 1000)
      .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }

  // Last-resort fallback for old saved locations that do not have timezone yet.
  const utcMs = now.getTime() + (now.getTimezoneOffset() * 60000);
  const offsetHours = Math.round(Number(lngFallback || 0) / 15);
  return new Date(utcMs + offsetHours * 3600000)
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function formatLocationTimeWithDualZones(timezone, lngFallback, utcOffsetSeconds) {
  const now = new Date();
  let localTime = '';
  
  if (timezone) {
    try {
      localTime = new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: timezone
      }).format(now);
    } catch (e) {
      if (Number.isFinite(Number(utcOffsetSeconds)) && Number(utcOffsetSeconds) !== 0) {
        const utcMs = now.getTime() + (now.getTimezoneOffset() * 60000);
        localTime = new Date(utcMs + Number(utcOffsetSeconds) * 1000)
          .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
      }
    }
  } else if (Number.isFinite(Number(utcOffsetSeconds)) && Number(utcOffsetSeconds) !== 0) {
    const utcMs = now.getTime() + (now.getTimezoneOffset() * 60000);
    localTime = new Date(utcMs + Number(utcOffsetSeconds) * 1000)
      .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  } else {
    const utcMs = now.getTime() + (now.getTimezoneOffset() * 60000);
    const offsetHours = Math.round(Number(lngFallback || 0) / 15);
    localTime = new Date(utcMs + offsetHours * 3600000)
      .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }
  
  // Format IST (UTC+5:30)
  const istTime = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata'
  }).format(now);
  
  const tzLabel = getTimezoneLabel(timezone, lngFallback);
  
  return {
    local: localTime,
    ist: istTime,
    tzLabel: tzLabel
  };
}

function getTimezoneLabel(timezone, lngFallback) {
  if (timezone) return timezone;
  return getApproxTimezoneLabelFromLng(lngFallback);
}

// ─── UV Data Interpretation ────────────────────────────────────────
function getUVCategory(uv) {
  if (uv < 3) return { label: 'Low', cls: 'uv-low', color: '#4caf50' };
  if (uv < 6) return { label: 'Moderate', cls: 'uv-moderate', color: '#f9a825' };
  if (uv < 8) return { label: 'High', cls: 'uv-high', color: '#ff9800' };
  if (uv < 11) return { label: 'Very High', cls: 'uv-very-high', color: '#f44336' };
  return { label: 'Extreme', cls: 'uv-extreme', color: '#9c27b0' };
}

function getSunscreenAdvice(uv) {
  if (uv < 3) return { needed: 'Optional', spf: 'SPF 15', reapply: 'Not required', detail: 'Low risk — sunscreen optional for most skin types.' };
  if (uv < 6) return { needed: 'Yes', spf: 'SPF 30', reapply: 'Every 2 hours', detail: 'Moderate risk — apply sunscreen before going out.' };
  if (uv < 8) return { needed: 'Essential', spf: 'SPF 30–50', reapply: 'Every 90 min', detail: 'High risk — cover up and use broad-spectrum sunscreen.' };
  if (uv < 11) return { needed: 'Critical', spf: 'SPF 50+', reapply: 'Every 60 min', detail: 'Very high risk — minimize sun exposure, seek shade.' };
  return { needed: 'Maximum', spf: 'SPF 50+', reapply: 'Every 45 min', detail: 'Extreme danger — avoid outdoors, full protection required.' };
}

function getSafeExposure(uv, skinType = 3) {
  // Minutes of safe exposure based on skin type & UV
  const baseMED = [10, 15, 20, 30, 45, 60]; // MED in minutes at UV 1 by Fitzpatrick type
  const med = (baseMED[(skinType || 3) - 1] || 20);
  const minutes = Math.round(med / (uv || 1) * 2.5);
  return Math.min(minutes, 240);
}

function getHydrationAdvice(uv) {
  if (uv < 3) return { advice: 'Normal hydration', detail: 'Drink water as usual.' };
  if (uv < 6) return { advice: '8+ glasses/day', detail: 'Increase water intake during outdoor activities.' };
  if (uv < 8) return { advice: '10+ glasses/day', detail: 'Drink water every 20 minutes outdoors.' };
  return { advice: '12+ glasses/day', detail: 'Stay hydrated! Drink water every 15 minutes outdoors.' };
}

function getVitaminDWindow(uv) {
  if (uv < 3) return { window: '20–30 min', detail: 'Get sun before 10 AM or after 3 PM for vitamin D.' };
  if (uv < 6) return { window: '10–15 min', detail: 'Brief midday exposure is sufficient.' };
  return { window: '5–10 min', detail: 'Very brief exposure is enough for vitamin D synthesis.' };
}

// ─── Intro Animation ──────────────────────────────────────────────
function initIntro() {
  const introOverlay = $('#introOverlay');
  const enterBtn = $('#introEnterBtn');

  if (introOverlay) {
    if (!sessionStorage.getItem('hs_intro_played')) {
      // Play intro and wait for button click
      setTimeout(() => introOverlay.classList.add('intro-active'), 100);
      enterBtn?.addEventListener('click', () => {
        introOverlay.classList.add('fade-out');
        sessionStorage.setItem('hs_intro_played', 'true');
        setTimeout(() => introOverlay.remove(), 600);
      });
    } else {
      introOverlay.remove(); // Skip if already played
    }
  }
}

// ─── Navigation ────────────────────────────────────────────────────
function initNav() {
  const hamburger = $('#navHamburger');
  const links = $('#navLinks');
  if (hamburger && links) {
    hamburger.addEventListener('click', () => links.classList.toggle('open'));
    // Close on outside click
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.navbar')) links.classList.remove('open');
    });
  }

  // Smooth page transitions for nav links
  $$('a.nav-link, .nav-links a, .footer-links a').forEach(link => {
    link.addEventListener('click', (e) => {
      const href = link.getAttribute('href');
      if (href && href.startsWith('/') && !href.startsWith('//')) {
        e.preventDefault();
        const transition = $('#pageTransition');
        if (transition) {
          transition.classList.add('active');
          setTimeout(() => { window.location.href = href; }, 300);
        } else {
          window.location.href = href;
        }
      }
    });
  });
}

// ─── Scroll Reveal ─────────────────────────────────────────────────
function initScrollReveal() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
        observer.unobserve(e.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  $$('.reveal').forEach(el => observer.observe(el));
}

// ─── Autocomplete Helper ──────────────────────────────────────────
function setupAutocomplete(inputId, listId, onSelect) {
  const input = $(`#${inputId}`);
  const list = $(`#${listId}`);
  if (!input || !list) return;

  let debounce;
  input.addEventListener('input', () => {
    clearTimeout(debounce);
    const q = input.value.trim();
    if (q.length < 2) { list.classList.add('hidden'); return; }
    debounce = setTimeout(async () => {
      try {
        const results = await geocodeCity(q);
        list.innerHTML = '';
        if (results.length === 0) {
          list.classList.add('hidden');
          return;
        }
        results.forEach(r => {
          const div = document.createElement('div');
          div.className = 'ac-item';
          div.textContent = r.name;
          div.addEventListener('click', () => {
            input.value = r.name.split(',')[0];
            list.classList.add('hidden');
            onSelect(r);
          });
          list.appendChild(div);
        });
        list.classList.remove('hidden');
      } catch(e) { list.classList.add('hidden'); }
    }, 350);
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest(`#${inputId}`) && !e.target.closest(`#${listId}`)) {
      list.classList.add('hidden');
    }
  });
}

// ═══════════════════════════════════════════════════════════════════
// PAGE-SPECIFIC LOGIC
// ═══════════════════════════════════════════════════════════════════

const PAGE = document.body.getAttribute('data-page');

// ─── DASHBOARD ─────────────────────────────────────────────────────
function initDashboard() {
  const DEFAULT_CITY = { name: 'Mumbai, India', lat: 19.0760, lng: 72.8777 };
  let currentCoords = null;
  let dashboardClockInterval = null;
  const mapSection = $('#mapSection');

  function stopDashboardClock() {
    if (dashboardClockInterval) {
      clearInterval(dashboardClockInterval);
      dashboardClockInterval = null;
    }
  }

  function startDashboardClock(lng, timezone) {
    stopDashboardClock();
    const updateTime = () => {
      const timeStr = formatLocationTime(timezone, lng, 0);
      const tzLabel = getTimezoneLabel(timezone, lng);
      const uvTimeEl = $('#uvTime');
      if (uvTimeEl) uvTimeEl.textContent = `${timeStr} (${tzLabel})`;
    };
    updateTime();
    dashboardClockInterval = setInterval(updateTime, 30000);
  }

  function ensureDashboardMap(lat, lng) {
    if (!mapSection) return;
    mapSection.classList.remove('hidden');
    const mapEl = document.getElementById('map');
    if (!mapEl || typeof L === 'undefined') return;

    if (!window._dashMap) {
      window._dashMap = L.map('map').setView([lat, lng], 12);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19
      }).addTo(window._dashMap);

      window._dashMarker = L.marker([lat, lng], {
        icon: L.divIcon({
          className: 'custom-marker',
          html: '<div class="marker-pin">📍</div>',
          iconSize: [40, 40],
          iconAnchor: [20, 40]
        }),
        draggable: false
      }).addTo(window._dashMap);

      window._dashMap.on('click', (e) => {
        const { lat: newLat, lng: newLng } = e.latlng;
        showToast('Loading UV data for selected location…');
        loadUVData(newLat, newLng);
      });
    } else {
      window._dashMap.setView([lat, lng], 12);
      if (window._dashMarker) {
        window._dashMarker.setLatLng([lat, lng]);
      }
    }

    setTimeout(() => window._dashMap.invalidateSize(), 100);
  }
  let _dashRefreshInterval = null;

  // Start auto-refresh for dashboard every 60 seconds
  function startDashboardRefresh() {
    stopDashboardRefresh();
    if (!currentCoords) return;
    _dashRefreshInterval = setInterval(() => {
      if (currentCoords) {
        loadUVData(currentCoords.lat, currentCoords.lng, true); // silent=true for background refresh
      }
    }, 60000); // every 60 seconds
  }

  function stopDashboardRefresh() {
    if (_dashRefreshInterval) { clearInterval(_dashRefreshInterval); _dashRefreshInterval = null; }
  }

  async function loadUVData(lat, lng, silent = false) {
    const loading = $('#dashLoading');
    const content = $('#uvContent');
    const infoGrid = $('#infoGrid');

    ensureDashboardMap(lat, lng);

    if (!silent) {
      loading && loading.classList.remove('hidden');
      content && content.classList.add('hidden');
      infoGrid && infoGrid.classList.add('hidden');
    }

    try {
      // Reverse geocode for display name
      const geo = await reverseGeocode(lat, lng);
      const locationName = geo.city ? `${geo.city}, ${geo.state || geo.country}` : geo.name.split(',').slice(0, 2).join(',');

      // Fetch UV data
      const data = await fetchUV(lat, lng);
      const uv = data.result?.uv ?? 0;
      const cat = getUVCategory(uv);
      const advice = getSunscreenAdvice(uv);
      const exposure = getSafeExposure(uv);
      const hydration = getHydrationAdvice(uv);
      const vitD = getVitaminDWindow(uv);

      // Store for share page
      localStorage.setItem('hs_last_uv', JSON.stringify({
        uv, location: locationName, lat, lng,
        date: new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
        category: cat.label, advice, exposure, hydration: hydration.advice
      }));

      // Update UI
      $('#locationName').textContent = `📍 ${locationName}`;
      $('#uvValue').textContent = uv.toFixed(1);
      const circle = $('#uvCircle');
      circle.className = `uv-circle ${cat.cls}`;
      const badge = $('#riskBadge');
      badge.textContent = cat.label;
      badge.style.background = cat.color;
      badge.style.color = uv >= 3 && uv < 6 ? '#333' : '#fff';

      $('#sunscreenNeeded').textContent = advice.needed;
      $('#sunscreenDetail').textContent = advice.detail;
      $('#spfLevel').textContent = advice.spf;
      $('#spfDetail').textContent = `Apply 15 min before sun exposure`;
      $('#safeExposure').textContent = `${exposure} min`;
      $('#exposureDetail').textContent = `Without sunscreen, fair skin`;
      $('#reapplyInterval').textContent = advice.reapply;
      $('#reapplyDetail').textContent = `More often if swimming or sweating`;
      $('#hydrationAdvice').textContent = hydration.advice;
      $('#hydrationDetail').textContent = hydration.detail;
      $('#vitaminDWindow').textContent = vitD.window;
      $('#vitaminDDetail').textContent = vitD.detail;

      loading && loading.classList.add('hidden');
      content && content.classList.remove('hidden');
      infoGrid && infoGrid.classList.remove('hidden');
      mapSection && mapSection.classList.remove('hidden');

      // Show location's real local time from timezone when available.
      startDashboardClock(lng, geo.timezone || null);

      currentCoords = { lat, lng };

      // Initialize/update Leaflet map with smooth animations
      if (typeof L !== 'undefined') {
        const mapEl = document.getElementById('map');
        if (mapEl) {
          if (window._dashMap) {
            // Smooth pan to new location
            window._dashMap.flyTo([lat, lng], 13, {
              duration: 1.5,
              easeLinearity: 0.25
            });

            // Smooth marker movement
            if (window._dashMarker) {
              window._dashMarker.setLatLng([lat, lng]);
              // Bounce animation
              setTimeout(() => {
                const icon = window._dashMarker.getElement();
                if (icon) {
                  icon.style.animation = 'bounceMarker 0.6s ease-out';
                  setTimeout(() => icon.style.animation = '', 600);
                }
              }, 1500);
            } else {
              window._dashMarker = L.marker([lat, lng], {
                icon: L.divIcon({
                  className: 'custom-marker',
                  html: '<div class="marker-pin">📍</div>',
                  iconSize: [40, 40],
                  iconAnchor: [20, 40]
                })
              }).addTo(window._dashMap);
            }
          }

          // Update popup
          window._dashMarker.bindPopup(
            `<div style="text-align:center;padding:4px;">
              <strong style="font-size:14px;">${locationName}</strong><br>
              <span style="color:${cat.color};font-weight:800;font-size:20px;">${uv.toFixed(1)}</span>
              <span style="font-size:12px;color:#666;"> ${cat.label}</span><br>
              <span style="font-size:12px;">${advice.spf}</span>
            </div>`
          ).openPopup();

          // Add UV circle overlay
          if (window._uvOverlay) window._dashMap.removeLayer(window._uvOverlay);
          window._uvOverlay = L.circle([lat, lng], {
            radius: 3000,
            color: cat.color,
            fillColor: cat.color,
            fillOpacity: 0.15,
            weight: 2,
            opacity: 0.6
          }).addTo(window._dashMap);

          // Ensure map renders correctly in side-by-side layout
          setTimeout(() => window._dashMap.invalidateSize(), 100);
          setTimeout(() => window._dashMap.invalidateSize(), 500);
          setTimeout(() => window._dashMap.invalidateSize(), 1200);
        }
      }
    } catch (err) {
      if (!silent) {
        loading && loading.classList.add('hidden');
        content && content.classList.remove('hidden');
        mapSection && mapSection.classList.remove('hidden');
        $('#locationName').textContent = '⚠️ Error loading UV data';
      }
      showToast(err.message || 'Failed to load UV data', 'error');

      // Always initialize an interactive map so the user can click to retry somewhere else
      if (!silent) ensureDashboardMap(lat, lng);
    }

    // Start auto-refresh after first successful load
    if (!silent) {
      startDashboardRefresh();
    }
  }

  // Use My Location button
  $('#useMyLocationBtn')?.addEventListener('click', async () => {
    try {
      showToast('Detecting location…');
      const pos = await getCurrentPosition();
      loadUVData(pos.lat, pos.lng);
    } catch (e) {
      showToast('Location access denied. Please search manually.', 'error');
      $('#dashLoading')?.classList.add('hidden');
      $('#uvContent')?.classList.remove('hidden');
      $('#locationName').textContent = '⚠️ Location access denied';
    }
  });

  // Search button
  $('#searchLocationBtn')?.addEventListener('click', async () => {
    const q = $('#locationInput')?.value.trim();
    if (!q) return showToast('Please enter a city name', 'error');
    try {
      const results = await geocodeCity(q);
      if (results.length === 0) return showToast('City not found', 'error');
      loadUVData(results[0].lat, results[0].lng);
    } catch (e) {
      showToast('Search failed', 'error');
    }
  });

  // Autocomplete
  setupAutocomplete('locationInput', 'autocompleteList', (r) => {
    loadUVData(r.lat, r.lng);
  });

  // Auto-detect on page load
  (async () => {
    try {
      ensureDashboardMap(DEFAULT_CITY.lat, DEFAULT_CITY.lng);
      const params = new URLSearchParams(window.location.search);
      const qLat = parseFloat(params.get('lat') || '');
      const qLng = parseFloat(params.get('lng') || '');
      if (!isNaN(qLat) && !isNaN(qLng)) {
        loadUVData(qLat, qLng);
        return;
      }

      const pos = await getCurrentPosition();
      loadUVData(pos.lat, pos.lng);
    } catch (e) {
      showToast('Using default location: Mumbai', 'success');
      loadUVData(DEFAULT_CITY.lat, DEFAULT_CITY.lng);
    }
  })();
}

// ─── FORECAST ──────────────────────────────────────────────────────
function initForecast() {
  let chartInstance = null;

  async function loadForecast(lat, lng) {
    const loading = $('#forecastLoading');
    const canvas = $('#uvChart');
    const peakInfo = $('#peakInfo');
    const mapSection = $('#forecastMapSection');

    loading && loading.classList.remove('hidden');
    canvas && canvas.classList.add('hidden');
    peakInfo && peakInfo.classList.add('hidden');

    try {
      const geo = await reverseGeocode(lat, lng);
      const locName = geo.city ? `${geo.city}, ${geo.state || geo.country}` : geo.name.split(',').slice(0, 2).join(',');
      $('#forecastLocation').textContent = `📍 ${locName}`;

      const data = await fetchForecast(lat, lng);
      const forecast = data.result || [];

      if (forecast.length === 0) {
        loading && loading.classList.add('hidden');
        showToast('No forecast data available', 'error');
        return;
      }

      const labels = forecast.map(f => {
        const d = new Date(f.uv_time);
        return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      });
      const uvValues = forecast.map(f => f.uv);

      // Find peak
      let peakIdx = 0;
      uvValues.forEach((v, i) => { if (v > uvValues[peakIdx]) peakIdx = i; });

      const bgColors = uvValues.map(v => {
        const cat = getUVCategory(v);
        return cat.color + '33';
      });
      const borderColors = uvValues.map(v => getUVCategory(v).color);

      // Highlight peak
      const pointBg = uvValues.map((v, i) =>
        i === peakIdx ? '#FF6B35' : getUVCategory(v).color
      );
      const pointRadius = uvValues.map((v, i) => i === peakIdx ? 8 : 3);

      if (chartInstance) chartInstance.destroy();

      loading && loading.classList.add('hidden');
      canvas && canvas.classList.remove('hidden');

      chartInstance = new Chart(canvas, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'UV Index',
            data: uvValues,
            fill: true,
            backgroundColor: (ctx) => {
              const gradient = ctx.chart.ctx.createLinearGradient(0, 0, 0, 400);
              gradient.addColorStop(0, 'rgba(255,159,67,0.3)');
              gradient.addColorStop(1, 'rgba(255,159,67,0.02)');
              return gradient;
            },
            borderColor: '#FF9F43',
            borderWidth: 3,
            pointBackgroundColor: pointBg,
            pointBorderColor: '#fff',
            pointBorderWidth: 2,
            pointRadius: pointRadius,
            tension: 0.4,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: '#1a1d2e',
              titleFont: { family: 'Inter', size: 13 },
              bodyFont: { family: 'Inter', size: 12 },
              padding: 12,
              cornerRadius: 10,
              callbacks: {
                label: (ctx) => {
                  const cat = getUVCategory(ctx.parsed.y);
                  return `UV ${ctx.parsed.y.toFixed(1)} — ${cat.label}`;
                }
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              max: Math.max(14, Math.ceil(Math.max(...uvValues)) + 2),
              grid: { color: 'rgba(0,0,0,0.04)' },
              ticks: { font: { family: 'Inter', size: 11 }, color: '#8b95a5' }
            },
            x: {
              grid: { display: false },
              ticks: { font: { family: 'Inter', size: 11 }, color: '#8b95a5', maxRotation: 45 }
            }
          }
        }
      });

      // Peak info
      peakInfo && peakInfo.classList.remove('hidden');
      $('#peakTime').textContent = labels[peakIdx];
      $('#peakUV').textContent = uvValues[peakIdx].toFixed(1);
    } catch (err) {
      loading && loading.classList.add('hidden');
      showToast(err.message || 'Failed to load forecast', 'error');
    }
  }

  setupAutocomplete('forecastLocationInput', 'forecastAutocomplete', (r) => loadForecast(r.lat, r.lng));

  $('#forecastSearchBtn')?.addEventListener('click', async () => {
    const q = $('#forecastLocationInput')?.value.trim();
    if (!q) return;
    try {
      const results = await geocodeCity(q);
      if (results.length) loadForecast(results[0].lat, results[0].lng);
      else showToast('City not found', 'error');
    } catch (e) { showToast('Search failed', 'error'); }
  });

  $('#forecastMyLocBtn')?.addEventListener('click', async () => {
    try {
      const pos = await getCurrentPosition();
      loadForecast(pos.lat, pos.lng);
    } catch (e) { showToast('Location denied', 'error'); }
  });

  (async () => {
    try {
      const pos = await getCurrentPosition();
      loadForecast(pos.lat, pos.lng);
    } catch (e) {
      $('#forecastLoading')?.classList.add('hidden');
      $('#forecastLocation').textContent = '📍 Search for a city to see the UV forecast';
    }
  })();
}

// ─── CALCULATOR ────────────────────────────────────────────────────
function initCalculator() {
  const form = $('#calcForm');
  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const skinType = parseInt($('#skinType').value) || 3;
    const ageGroup = $('#ageGroup').value;
    const durationHrs = parseFloat($('#duration').value) || 1;
    const duration = Math.round(durationHrs * 60);
    const activity = $('#activity').value;
    const clothing = $('#clothing').value;

    // Risk calculation algorithm
    let riskScore = 0;

    // Skin type (1 = highest risk, 6 = lowest)
    const skinRisk = [50, 40, 30, 20, 12, 5];
    riskScore += skinRisk[skinType - 1] || 30;

    // Age factor
    const ageFactor = { child: 15, teen: 8, adult: 5, senior: 12 };
    riskScore += ageFactor[ageGroup] || 5;

    // Duration factor
    riskScore += Math.min(duration / 10, 20);

    // Activity factor
    const activityFactor = { swimming: 15, hiking: 12, sports: 10, gardening: 8, walking: 5, sitting: 3 };
    riskScore += activityFactor[activity] || 5;

    // Clothing factor (less coverage = higher risk)
    const clothingFactor = { minimal: 20, light: 12, moderate: 5, full: 2 };
    riskScore += clothingFactor[clothing] || 10;

    // Clamp to 0–100
    riskScore = Math.min(Math.round(riskScore), 100);

    // Determine risk level
    let riskLevel, riskColor;
    if (riskScore < 25) { riskLevel = '🟢 Low'; riskColor = '#4caf50'; }
    else if (riskScore < 50) { riskLevel = '🟡 Moderate'; riskColor = '#f9a825'; }
    else if (riskScore < 75) { riskLevel = '🟠 High'; riskColor = '#ff9800'; }
    else { riskLevel = '🔴 Very High'; riskColor = '#f44336'; }

    // Max safe exposure
    const baseExposure = getSafeExposure(6, skinType); // Assume UV 6 as baseline
    const clothingMultiplier = { minimal: 0.5, light: 0.8, moderate: 1.3, full: 2 };
    const maxExp = Math.round(baseExposure * (clothingMultiplier[clothing] || 1));

    // SPF recommendation
    let recSPF;
    if (riskScore < 25) recSPF = 'SPF 15';
    else if (riskScore < 50) recSPF = 'SPF 30';
    else if (riskScore < 75) recSPF = 'SPF 50';
    else recSPF = 'SPF 50+';

    // Reapply
    let recReapply;
    if (activity === 'swimming' || activity === 'sports') recReapply = 'Every 40 min';
    else if (riskScore >= 50) recReapply = 'Every 60 min';
    else recReapply = 'Every 2 hours';

    // Gear
    let recGear;
    if (riskScore >= 75) recGear = 'Hat + sunglasses + UPF clothing';
    else if (riskScore >= 50) recGear = 'Hat + sunglasses';
    else recGear = 'Sunglasses recommended';

    // Tips
    let tips = [];
    if (skinType <= 2) tips.push('Your skin type burns very easily — always use high SPF sunscreen.');
    if (ageGroup === 'child') tips.push('Children\'s skin is more sensitive — use child-safe SPF 50+ sunscreen.');
    if (ageGroup === 'senior') tips.push('Older skin is more vulnerable — stay hydrated and seek shade often.');
    if (activity === 'swimming') tips.push('Water reflects UV rays — reapply water-resistant sunscreen frequently.');
    if (activity === 'hiking') tips.push('Higher altitude means stronger UV — carry extra sunscreen.');
    if (clothing === 'minimal') tips.push('Consider covering more skin with UPF-rated clothing for better protection.');
    if (duration > 120) tips.push('Extended outdoor time detected — take shade breaks every 30 minutes.');

    // Update UI
    $('#riskLevel').textContent = riskLevel;
    $('#riskLevel').style.color = riskColor;
    $('#riskScore').textContent = `${riskScore}/100`;
    $('#maxExposure').textContent = `${maxExp} min`;
    $('#recSPF').textContent = recSPF;
    $('#recReapply').textContent = recReapply;
    $('#recGear').textContent = recGear;
    $('#recTips').innerHTML = tips.length
      ? '<strong>💡 Tips:</strong><ul style="margin-top:8px;padding-left:20px;">' + tips.map(t => `<li>${t}</li>`).join('') + '</ul>'
      : '';

    $('#resultPanel')?.classList.remove('hidden');
    $('#resultPlaceholder')?.classList.add('hidden');
  });
}

// ─── LOCATIONS ─────────────────────────────────────────────────────
function initLocations() {
  let locations = JSON.parse(localStorage.getItem('hs_locations') || '[]');
  let currentMode = 'list';
  let _clockInterval = null;
  let _uvRefreshInterval = null;

  async function ensureLocationTimezone(loc) {
    if (loc.timezone) return;
    try {
      const tz = await fetchTimezone(loc.lat, loc.lng);
      if (tz?.timezone) {
        loc.timezone = tz.timezone;
        loc.utcOffsetSeconds = Number(tz.utcOffsetSeconds || 0);
      }
    } catch (e) {
      // keep existing fallback behavior
    }
  }

  async function hydrateSavedLocationTimezones() {
    let changed = false;
    for (const loc of locations) {
      const prev = loc.timezone;
      await ensureLocationTimezone(loc);
      if (!prev && loc.timezone) changed = true;
    }
    if (changed) saveLocations();
  }

  // Start live clock that updates time displays every 3-5 seconds for real-time feel
  function startLiveClock() {
    stopLiveClock();
    _clockInterval = setInterval(() => {
      // Update all time elements in the current view
      $$('[data-time-local]').forEach(el => {
        const timezone = el.dataset.locTimezone || null;
        const lng = parseFloat(el.dataset.locLng || '0');
        const utcOffsetSeconds = parseInt(el.dataset.locUtcOffset || '0', 10);
        el.textContent = formatLocationTime(timezone, lng, utcOffsetSeconds);
      });
      
      // Update all IST time displays
      $$('[data-time-ist]').forEach(el => {
        const now = new Date();
        const istTime = new Intl.DateTimeFormat('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
          timeZone: 'Asia/Kolkata'
        }).format(now);
        el.textContent = istTime;
      });
    }, 3000); // every 3 seconds for real-time feel
  }

  function stopLiveClock() {
    if (_clockInterval) { clearInterval(_clockInterval); _clockInterval = null; }
  }

  // Refresh UV data for all locations every 30-60 seconds (real-time updates)
  async function fetchAllLiveUV() {
    let updated = false;
    for (const loc of locations) {
      try {
        await ensureLocationTimezone(loc);
        const data = await fetchUV(loc.lat, loc.lng);
        const uv = data.result?.uv;
        if (uv !== undefined && uv !== loc.uv) {
          const cat = getUVCategory(uv);
          loc.uv = uv;
          loc.uvClass = cat.cls;
          loc.uvColor = cat.color;
          loc.uvLabel = cat.label;
          updated = true;
        }
      } catch (e) { 
        console.error('Failed to refresh UV for location:', loc.name, e);
      }
    }
    if (updated) {
      saveLocations();
      updateCurrentView();
    }
  }

  function startUVRefresh() {
    stopUVRefresh();
    fetchAllLiveUV(); // Trigger immediate fetch on load!
    _uvRefreshInterval = setInterval(fetchAllLiveUV, 45000); 
  }

  function stopUVRefresh() {
    if (_uvRefreshInterval) { clearInterval(_uvRefreshInterval); _uvRefreshInterval = null; }
  }

  // Update current view without full re-render (preserves state) where possible, or full render for simple list
  function updateCurrentView() {
    if (currentMode === 'compare') {
      updateComparisonView();
    } else if (currentMode === 'travel') {
      updateTravelView();
    } else {
      renderList();
    }
  }

  function updateComparisonView() {
    const container = $('#comparisonCards');
    if (!container) return;

    container.innerHTML = locations.map(loc => {
      const times = formatLocationTimeWithDualZones(loc.timezone, loc.lng, loc.utcOffsetSeconds || 0);
      return `
      <div class="card" style="text-align:center;padding:24px;">
        <div style="font-size:24px;margin-bottom:8px;">📍</div>
        <h4 style="font-weight:700;margin-bottom:4px;">${loc.name}</h4>
        <div style="margin:12px 0;font-size:var(--fs-xs);color:var(--gray-600);">
          <div style="display:flex;align-items:center;justify-content:center;gap:6px;margin:6px 0;">
            <span>🕐</span>
            <span style="font-weight:600;">${times.tzLabel}:</span>
            <span data-loc-timezone="${loc.timezone || ''}" data-loc-lng="${loc.lng}" data-loc-utc-offset="${loc.utcOffsetSeconds || 0}" data-time-local>${times.local}</span>
          </div>
          <div style="display:flex;align-items:center;justify-content:center;gap:6px;margin:6px 0;">
            <span>🕑</span>
            <span style="font-weight:600;">IST:</span>
            <span data-time-ist>${times.ist}</span>
          </div>
        </div>
        <div style="font-size:var(--fs-3xl);font-weight:900;color:${loc.uvColor || '#ccc'};margin:12px 0;">${loc.uv !== undefined ? loc.uv.toFixed(1) : '—'}</div>
        <div class="risk-badge" style="background:${loc.uvColor || '#ccc'};color:#fff;font-size:var(--fs-xs);">${loc.uvLabel || 'N/A'}</div>
      </div>
    `;
    }).join('');
  }

  function updateTravelView() {
    const travelList = $('#travelList');
    if (!travelList) return;

    // Update times and UV values without reloading everything
    locations.forEach((loc, i) => {
      const times = formatLocationTimeWithDualZones(loc.timezone, loc.lng, loc.utcOffsetSeconds || 0);
      const card = document.getElementById(`travelCard${i}`);
      if (card) {
        // Update local time display
        const localTimeEl = card.querySelector('[data-time-local]');
        if (localTimeEl) localTimeEl.textContent = times.local;
        
        // Update IST time display
        const istEl = card.querySelector('[data-time-ist]');
        if (istEl) istEl.textContent = times.ist;
        
        // Update UV value
        const uvSpan = card.querySelector('span[style*="font-size:var(--fs-xl)"]');
        if (uvSpan && loc.uv !== undefined) {
          uvSpan.textContent = loc.uv.toFixed(1);
          uvSpan.style.color = loc.uvColor || '#ccc';
        }
        
        // Update sunscreen advice
        const adviceDiv = card.querySelectorAll('div[style*="font-size:var(--fs-xs)"]')[2];
        if (adviceDiv && loc.uv !== undefined) {
          adviceDiv.textContent = getSunscreenAdvice(loc.uv).detail;
        }
      }
    });
  }

  function saveLocations() {
    localStorage.setItem('hs_locations', JSON.stringify(locations));
  }

  function renderList() {
    const container = $('#locationsList');
    const empty = $('#emptyLocations');
    const compView = $('#comparisonView');
    const travelView = $('#travelView');

    compView?.classList.add('hidden');
    travelView?.classList.add('hidden');
    container.style.display = 'block';

    if (locations.length === 0) {
      container.innerHTML = '';
      container.appendChild(empty);
      empty.classList.remove('hidden');
      return;
    }

    empty?.classList.add('hidden');
    container.innerHTML = locations.map((loc, i) => {
      const times = formatLocationTimeWithDualZones(loc.timezone, loc.lng, loc.utcOffsetSeconds || 0);
      return `
      <div class="card location-item" data-idx="${i}">
        <div class="loc-info">
          <div class="loc-icon">📍</div>
          <div>
            <div class="loc-name">${loc.name}</div>
            <div class="loc-coords">${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}</div>
            <div style="display:flex;flex-direction:column;gap:6px;margin-top:8px;font-size:var(--fs-xs);color:var(--gray-600);">
              <div style="display:flex;gap:6px;align-items:center;">
                <span>🕐</span>
                <span><strong>${times.tzLabel}:</strong></span>
                <span data-loc-timezone="${loc.timezone || ''}" data-loc-lng="${loc.lng}" data-loc-utc-offset="${loc.utcOffsetSeconds || 0}" data-time-local>${times.local}</span>
              </div>
              <div style="display:flex;gap:6px;align-items:center;">
                <span>🕑</span>
                <span><strong>IST:</strong></span>
                <span data-time-ist>${times.ist}</span>
              </div>
            </div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:12px;">
          <span class="loc-uv ${loc.uvClass || ''}" style="background:${loc.uvColor || '#ccc'}">${loc.uv !== undefined ? loc.uv.toFixed(1) : '—'}</span>
          <button class="remove-btn" data-idx="${i}" title="Remove">✕</button>
        </div>
      </div>
    `;
    }).join('');

    // Remove buttons
    $$('.remove-btn', container).forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        locations.splice(parseInt(btn.dataset.idx), 1);
        saveLocations();
        renderList();
      });
    });

    // Click to view on dashboard
    $$('.location-item', container).forEach(item => {
      item.addEventListener('click', () => {
        const idx = parseInt(item.dataset.idx);
        const loc = locations[idx];
        window.location.href = `/dashboard?lat=${loc.lat}&lng=${loc.lng}`;
      });
    });
    
    // Ensure intervals are running
    startLiveClock();
    startUVRefresh();
  }

  function renderComparison() {
    const container = $('#comparisonCards');
    const compView = $('#comparisonView');
    const listView = $('#locationsList');
    const travelView = $('#travelView');

    listView.style.display = 'none';
    travelView?.classList.add('hidden');
    compView?.classList.remove('hidden');

    if (locations.length === 0) {
      container.innerHTML = '<div class="card" style="text-align:center;padding:32px;grid-column:1/-1;"><p style="color:var(--gray-400);">Add locations to compare UV levels.</p></div>';
      return;
    }

    container.innerHTML = locations.map(loc => {
      const times = formatLocationTimeWithDualZones(loc.timezone, loc.lng, loc.utcOffsetSeconds || 0);
      return `
      <div class="card" style="text-align:center;padding:24px;">
        <div style="font-size:24px;margin-bottom:8px;">📍</div>
        <h4 style="font-weight:700;margin-bottom:4px;">${loc.name}</h4>
        <div style="margin:12px 0;font-size:var(--fs-xs);color:var(--gray-600);">
          <div style="display:flex;align-items:center;justify-content:center;gap:6px;margin:6px 0;">
            <span>🕐</span>
            <span style="font-weight:600;">${times.tzLabel}:</span>
            <span data-loc-timezone="${loc.timezone || ''}" data-loc-lng="${loc.lng}" data-loc-utc-offset="${loc.utcOffsetSeconds || 0}" data-time-local>${times.local}</span>
          </div>
          <div style="display:flex;align-items:center;justify-content:center;gap:6px;margin:6px 0;">
            <span>🕑</span>
            <span style="font-weight:600;">IST:</span>
            <span data-time-ist>${times.ist}</span>
          </div>
        </div>
        <div style="font-size:var(--fs-3xl);font-weight:900;color:${loc.uvColor || '#ccc'};margin:12px 0;">${loc.uv !== undefined ? loc.uv.toFixed(1) : '—'}</div>
        <div class="risk-badge" style="background:${loc.uvColor || '#ccc'};color:#fff;font-size:var(--fs-xs);">${loc.uvLabel || 'N/A'}</div>
      </div>
    `;
    }).join('');

    // Start live clock for compare view
    startLiveClock();
    startUVRefresh();
  }

  async function renderTravel() {
    const travelView = $('#travelView');
    const travelList = $('#travelList');
    const listView = $('#locationsList');
    const compView = $('#comparisonView');

    listView.style.display = 'none';
    compView?.classList.add('hidden');
    travelView?.classList.remove('hidden');

    if (locations.length === 0) {
      travelList.innerHTML = '<div class="card" style="text-align:center;padding:24px;grid-column:1/-1;"><p style="color:var(--gray-400);">Add destinations to plan travel.</p></div>';
      return;
    }

    // First render cards with loading state for forecast data
    travelList.innerHTML = locations.map((loc, i) => {
      const times = formatLocationTimeWithDualZones(loc.timezone, loc.lng, loc.utcOffsetSeconds || 0);
      return `
      <div class="card travel-card-enhanced" style="padding:20px; cursor:pointer;" id="travelCard${i}"
           onclick="window.location.href='/travel-detail?lat=${loc.lat}&lng=${loc.lng}&name=${encodeURIComponent(loc.name)}'">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
          <span style="font-size:24px;">✈️</span>
          <div>
            <strong>${loc.name}</strong>
            <div style="font-size:var(--fs-xs);color:var(--gray-400);">${loc.lat.toFixed(2)}°, ${loc.lng.toFixed(2)}°</div>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:10px;padding:8px 12px;background:rgba(255,255,255,0.6);border-radius:var(--radius-full);border:1px solid var(--glass-border);">
          <div style="display:flex;align-items:center;gap:6px;">
            <span>🕐</span>
            <span style="font-size:var(--fs-xs);color:var(--gray-700);font-weight:500;">${times.tzLabel}:</span>
            <span style="font-size:var(--fs-sm);font-weight:600;color:var(--gray-700);" data-loc-timezone="${loc.timezone || ''}" data-loc-lng="${loc.lng}" data-loc-utc-offset="${loc.utcOffsetSeconds || 0}" data-time-local>${times.local}</span>
          </div>
          <div style="display:flex;align-items:center;gap:6px;">
            <span>🕑</span>
            <span style="font-size:var(--fs-xs);color:var(--gray-700);font-weight:500;">IST:</span>
            <span style="font-size:var(--fs-sm);font-weight:600;color:var(--gray-700);" data-time-ist>${times.ist}</span>
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:var(--fs-sm);color:var(--gray-400);">UV Index</span>
          <span id="travelUv${i}" style="font-size:var(--fs-xl);font-weight:800;color:${loc.uvColor || '#ccc'}">${loc.uv !== undefined ? loc.uv.toFixed(1) : '—'}</span>
        </div>
        <div id="travelUvAdvice${i}" style="font-size:var(--fs-xs);color:var(--gray-400);margin-top:8px;">
          ${loc.uv !== undefined ? getSunscreenAdvice(loc.uv).detail : 'UV data not loaded'}
        </div>
        <div class="travel-uv-times" id="travelTimes${i}" style="margin-top:12px;padding-top:12px;border-top:1px solid var(--gray-100);font-size:var(--fs-xs);">
          <div style="color:var(--gray-400);"><span class="spinner" style="width:14px;height:14px;border-width:2px;margin:0 6px 0 0;display:inline-block;"></span>Loading UV forecast…</div>
        </div>
      </div>
    `;
    }).join('');

    // Fetch forecast & live UV for each location
    locations.forEach(async (loc, i) => {
      // 1. Fetch real-time UV to update the current card immediately
      try {
        const liveUVData = await fetchUV(loc.lat, loc.lng);
        const currentUv = liveUVData.result?.uv ?? loc.uv;
        if (currentUv !== undefined) {
          loc.uv = currentUv;
          const cat = getUVCategory(currentUv);
          loc.uvColor = cat.color;
          
          const uvEl = document.getElementById(`travelUv${i}`);
          if (uvEl) {
            uvEl.textContent = currentUv.toFixed(1);
            uvEl.style.color = cat.color;
          }
          const adviceEl = document.getElementById(`travelUvAdvice${i}`);
          if (adviceEl) {
            adviceEl.innerHTML = getSunscreenAdvice(currentUv).detail;
          }
          saveLocations(); // save updated live UV to storage
        }
      } catch (e) { /* ignore fetching live UV error */ }

      // 2. Fetch Forecast to get peak/lowest UV
      try {
        const data = await fetchForecast(loc.lat, loc.lng);
        const forecast = data.result || [];
        const timesEl = document.getElementById(`travelTimes${i}`);
        if (!timesEl || forecast.length === 0) {
          if (timesEl) timesEl.innerHTML = '<div style="color:var(--gray-400);">Forecast unavailable</div>';
          return;
        }

        const uvVals = forecast.map(f => f.uv);
        let peakIdx = 0, lowIdx = 0;
        uvVals.forEach((v, j) => {
          if (v > uvVals[peakIdx]) peakIdx = j;
          if (v < uvVals[lowIdx]) lowIdx = j;
        });

        const timeFormatOpts = { hour: 'numeric', minute: '2-digit' };
        if (loc.timezone) timeFormatOpts.timeZone = loc.timezone;
        const peakTime = new Date(forecast[peakIdx].uv_time).toLocaleTimeString('en-US', timeFormatOpts);
        const lowTime = new Date(forecast[lowIdx].uv_time).toLocaleTimeString('en-US', timeFormatOpts);
        const peakCat = getUVCategory(uvVals[peakIdx]);
        const lowCat = getUVCategory(uvVals[lowIdx]);

        timesEl.innerHTML = `
          <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
            <span style="color:var(--uv-very-high);font-weight:600;">☀️ Peak UV</span>
            <span><strong style="color:${peakCat.color};">${uvVals[peakIdx].toFixed(1)}</strong> at ${peakTime}</span>
          </div>
          <div style="display:flex;justify-content:space-between;">
            <span style="color:var(--uv-low);font-weight:600;">🌙 Lowest UV</span>
            <span><strong style="color:${lowCat.color};">${uvVals[lowIdx].toFixed(1)}</strong> at ${lowTime}</span>
          </div>
        `;
      } catch (e) {
        const timesEl = document.getElementById(`travelTimes${i}`);
        if (timesEl) timesEl.innerHTML = '<div style="color:var(--gray-400);">Forecast unavailable</div>';
      }
    });

    // Keep travel cards live-updated like compare mode.
    startLiveClock();
    startUVRefresh();
  }

  function render() {
    // Stop any running intervals before re-rendering
    stopLiveClock();
    stopUVRefresh();
    if (currentMode === 'list') renderList();
    else if (currentMode === 'compare') renderComparison();
    else renderTravel();
  }

  async function addLocation(name, lat, lng, timezone = null) {
    // Check for duplicate
    if (locations.some(l => Math.abs(l.lat - lat) < 0.01 && Math.abs(l.lng - lng) < 0.01)) {
      showToast('Location already saved', 'error');
      return;
    }

    const loc = { name, lat, lng, timezone, utcOffsetSeconds: 0 };

    await ensureLocationTimezone(loc);

    // Try to fetch UV
    try {
      const data = await fetchUV(lat, lng);
      const uv = data.result?.uv ?? 0;
      const cat = getUVCategory(uv);
      loc.uv = uv;
      loc.uvClass = cat.cls;
      loc.uvColor = cat.color;
      loc.uvLabel = cat.label;
    } catch (e) { /* UV fetch optional */ }

    locations.push(loc);
    saveLocations();
    render();
    showToast(`${name} added!`, 'success');
  }

  // Mode toggles
  $$('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentMode = btn.dataset.mode;
      render();
    });
  });

  // Add city
  setupAutocomplete('citySearchInput', 'cityAutocomplete', (r) => {
    const name = r.name.split(',')[0];
    addLocation(name, r.lat, r.lng, r.timezone || null);
  });

  $('#addCityBtn')?.addEventListener('click', async () => {
    const q = $('#citySearchInput')?.value.trim();
    if (!q) return showToast('Enter a city name', 'error');
    try {
      const results = await geocodeCity(q);
      if (results.length === 0) return showToast('City not found', 'error');
      const r = results[0];
      addLocation(r.name.split(',')[0], r.lat, r.lng, r.timezone || null);
      $('#citySearchInput').value = '';
    } catch (e) { showToast('Search failed', 'error'); }
  });

  // Use current location
  $('#addCurrentLocBtn')?.addEventListener('click', async () => {
    try {
      showToast('Detecting location…');
      const pos = await getCurrentPosition();
      const geo = await reverseGeocode(pos.lat, pos.lng);
      const name = geo.city || geo.name.split(',')[0];
      addLocation(name, pos.lat, pos.lng, geo.timezone || null);
    } catch (e) {
      showToast('Location access denied', 'error');
    }
  });

  render();
  hydrateSavedLocationTimezones();
}

// ─── SHARE ─────────────────────────────────────────────────────────
function initShare() {
  $('#generateReportBtn')?.addEventListener('click', async () => {
    try {
      showToast('Generating report…');
      let uvData = JSON.parse(localStorage.getItem('hs_last_uv') || 'null');

      if (!uvData) {
        // Try to get fresh data with current location
        const pos = await getCurrentPosition();
        const geo = await reverseGeocode(pos.lat, pos.lng);
        const data = await fetchUV(pos.lat, pos.lng);
        const uv = data.result?.uv ?? 0;
        const cat = getUVCategory(uv);
        const advice = getSunscreenAdvice(uv);
        uvData = {
          uv,
          location: geo.city ? `${geo.city}, ${geo.country}` : geo.name.split(',').slice(0, 2).join(','),
          date: new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
          category: cat.label,
          advice,
          exposure: getSafeExposure(uv),
          hydration: getHydrationAdvice(uv).advice
        };
        localStorage.setItem('hs_last_uv', JSON.stringify(uvData));
      }

      const cat = getUVCategory(uvData.uv);

      $('#shareLocation').textContent = `📍 ${uvData.location}`;
      $('#shareDate').textContent = uvData.date;
      $('#shareUV').textContent = uvData.uv.toFixed(1);
      $('#shareUV').style.color = cat.color;
      const badge = $('#shareRisk');
      badge.textContent = cat.label;
      badge.style.background = cat.color;
      badge.style.color = '#fff';
      $('#shareSPF').textContent = uvData.advice?.spf || '--';
      $('#shareExposure').textContent = `${uvData.exposure || '--'} min`;
      $('#shareSunscreen').textContent = uvData.advice?.needed || '--';
      $('#shareReapply').textContent = uvData.advice?.reapply || '--';

      $('#shareContent')?.classList.remove('hidden');
      showToast('Report generated!', 'success');
    } catch (e) {
      showToast('Failed to generate report. Allow location access or visit the Dashboard first.', 'error');
    }
  });

  // Share as image
  $('#nativeShareBtn')?.addEventListener('click', async () => {
    const uvData = JSON.parse(localStorage.getItem('hs_last_uv') || 'null');
    if (!uvData) return showToast('Generate a report first', 'error');

    const reportCard = document.getElementById('reportCard');
    if (!reportCard) return showToast('Report card not found', 'error');

    try {
      showToast('Generating image…');
      const html2canvas = window.html2canvas;
      if (!html2canvas) return showToast('Image library not loaded', 'error');

      const canvas = await html2canvas(reportCard, {
        backgroundColor: '#fff7e6',
        scale: 2,
        useCORS: true,
        logging: false
      });

      canvas.toBlob(async (blob) => {
        if (!blob) return showToast('Failed to create image', 'error');

        const file = new File([blob], 'heliosense-uv-report.png', { type: 'image/png' });

        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              title: 'HelioSense UV Report',
              text: `UV Index at ${uvData.location}: ${uvData.uv.toFixed(1)} (${uvData.category})`,
              files: [file]
            });
          } catch (e) { /* user cancelled */ }
        } else {
          // Fallback: download the image
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'heliosense-uv-report.png';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          showToast('Report image downloaded!', 'success');
        }
      }, 'image/png');
    } catch (e) {
      showToast('Failed to generate image', 'error');
    }
  });

  // Create shareable link with backend
  $('#createShareLinkBtn')?.addEventListener('click', async () => {
    const uvData = JSON.parse(localStorage.getItem('hs_last_uv') || 'null');
    if (!uvData) return showToast('Generate a report first', 'error');

    try {
      const res = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportData: uvData })
      });
      const data = await res.json();
      const shareUrl = `${window.location.origin}${data.url}`;

      // Generate QR code
      const qrContainer = $('#qrCode');
      if (qrContainer) {
        qrContainer.innerHTML = '';
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(shareUrl)}`;
        const img = document.createElement('img');
        img.src = qrUrl;
        img.alt = 'QR Code';
        img.style.cssText = 'width:200px;height:200px;border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,0.1);';
        qrContainer.appendChild(img);
      }

      $('#shareLinkUrl').textContent = shareUrl;
      $('#shareLinkSection')?.classList.remove('hidden');
      showToast('Share link created!', 'success');
    } catch (e) {
      showToast('Failed to create share link', 'error');
    }
  });

  // Copy share link
  $('#copyShareLinkBtn')?.addEventListener('click', () => {
    const url = $('#shareLinkUrl')?.textContent;
    if (!url) return;
    navigator.clipboard.writeText(url).then(() => showToast('Link copied!', 'success'));
  });
}

// ═══ Splash/Intro ═══
function initIntro() {
  const overlay = document.querySelector('.intro-overlay');
  const enterBtn = document.getElementById('introEnterBtn');
  if (!overlay) return;

  if (enterBtn) {
    enterBtn.addEventListener('click', () => {
      overlay.classList.add('hidden');
    });
  }
}

// ─── CHATBOT ───────────────────────────────────────────────────────
function initChatbot() {
  let chatHistory = JSON.parse(localStorage.getItem('hs_chat_history') || '[]');
  let recognition = null;
  let selectedLang = localStorage.getItem('hs_chat_lang') || 'en';
  let autoSpeak = false;

  // Language config
  const LANGUAGES = {
    en: { label: 'English', speechLang: 'en-US', flag: '🇺🇸' },
    hi: { label: 'हिन्दी', speechLang: 'hi-IN', flag: '🇮🇳' },
    es: { label: 'Español', speechLang: 'es-ES', flag: '🇪🇸' },
    fr: { label: 'Français', speechLang: 'fr-FR', flag: '🇫🇷' },
    de: { label: 'Deutsch', speechLang: 'de-DE', flag: '🇩🇪' },
    ja: { label: '日本語', speechLang: 'ja-JP', flag: '🇯🇵' },
    zh: { label: '中文', speechLang: 'zh-CN', flag: '🇨🇳' },
    ar: { label: 'العربية', speechLang: 'ar-SA', flag: '🇸🇦' },
    pt: { label: 'Português', speechLang: 'pt-BR', flag: '🇧🇷' },
    ko: { label: '한국어', speechLang: 'ko-KR', flag: '🇰🇷' }
  };

  // Init language selector
  const langSelect = $('#langSelect');
  if (langSelect) {
    langSelect.value = selectedLang;
    langSelect.addEventListener('change', (e) => {
      selectedLang = e.target.value;
      localStorage.setItem('hs_chat_lang', selectedLang);
      showToast(`Language: ${LANGUAGES[selectedLang]?.label || 'English'}`, 'success');
    });
  }

  // Auto-speak toggle
  const autoSpeakBtn = $('#autoSpeakBtn');
  if (autoSpeakBtn) {
    autoSpeakBtn.addEventListener('click', () => {
      autoSpeak = !autoSpeak;
      autoSpeakBtn.classList.toggle('active', autoSpeak);
      autoSpeakBtn.title = autoSpeak ? 'Auto-speak ON' : 'Auto-speak OFF';
      showToast(autoSpeak ? '🔊 Auto-speak enabled' : '🔇 Auto-speak disabled', 'success');
    });
  }

  // Voice output (text-to-speech)
  let currentSpeakingText = null;

  function speakText(text) {
    if (!('speechSynthesis' in window)) {
      showToast('Text-to-speech not supported', 'error');
      return;
    }
    
    // Toggle logic: If currently speaking, check if clicking the same text
    if (speechSynthesis.speaking) {
      speechSynthesis.cancel();
      if (currentSpeakingText === text) {
        currentSpeakingText = null;
        return; // Clicked the same speaker icon, so just stop it
      }
    }
    
    currentSpeakingText = text;

    // Strip markdown/HTML for cleaner speech
    const cleanText = text
      .replace(/```[\s\S]*?```/g, '')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/`(.+?)`/g, '$1')
      .replace(/#{1,4}\s*/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[-*]\s/g, '')
      .replace(/\|/g, ' ')
      .replace(/\n+/g, '. ')
      .trim();

    const utterance = new SpeechSynthesisUtterance(cleanText);
    const langCfg = LANGUAGES[selectedLang];
    utterance.lang = langCfg?.speechLang || 'en-US';
    utterance.rate = 0.95;
    utterance.pitch = 1;

    // Try to aggressively find a matching voice by lang code or full name string
    const voices = speechSynthesis.getVoices();
    const targetLang = selectedLang.toLowerCase();
    const targetLabel = langCfg?.label.toLowerCase() || '';
    
    // Priority 1: Exact lang substring match (e.g. 'hi' matches 'hi-IN')
    let matchVoice = voices.find(v => v.lang.toLowerCase().includes(targetLang));
    
    // Priority 2: Name substring match (e.g. 'Google हिन्दी')
    if (!matchVoice && targetLabel) {
       matchVoice = voices.find(v => v.name.toLowerCase().includes(targetLabel));
    }

    if (matchVoice) {
      utterance.voice = matchVoice;
    } else {
      console.warn(`No exact local TTS Voice found for ${targetLabel}. Relying purely on utterance.lang = ${utterance.lang}`);
    }

    // Clear tracking variable when finished
    utterance.onend = () => {
      if (currentSpeakingText === text) {
        currentSpeakingText = null;
      }
    };

    speechSynthesis.speak(utterance);
  }

  // Get UV context — ALWAYS fetch live data for real-time accuracy in Chatbot
  async function getUVContext() {
    // Fetch live UV data using current location
    try {
      const pos = await getCurrentPosition();
      const [data, geo] = await Promise.all([
        fetchUV(pos.lat, pos.lng),
        reverseGeocode(pos.lat, pos.lng)
      ]);
      const uv = data.result?.uv ?? 0;
      const cat = getUVCategory(uv);
      const advice = getSunscreenAdvice(uv);
      const exposure = getSafeExposure(uv);
      const locationName = geo.city ? `${geo.city}, ${geo.state || geo.country}` : `${pos.lat.toFixed(2)}, ${pos.lng.toFixed(2)}`;

      // Cache for future fallback use
      const freshContext = {
        location: locationName,
        uv: uv,
        category: cat.label,
        advice: advice,
        exposure: exposure,
        date: new Date().toISOString()
      };
      
      localStorage.setItem('hs_last_uv', JSON.stringify(freshContext));
      return freshContext;
    } catch (err) {
      console.warn('Failed live UV context, falling back to cache.', err);
      // Fallback
      const uvData = JSON.parse(localStorage.getItem('hs_last_uv') || 'null');
      if (uvData && uvData.uv !== undefined) {
        return {
          location: uvData.location,
          uv: uvData.uv,
          category: uvData.category,
          spf: uvData.advice?.spf,
          exposure: uvData.exposure
        };
      }
    }

  }

  // Render message with markdown → HTML
  function renderMarkdown(text) {
    let html = text;
    html = html.replace(/```([\s\S]*?)```/g, (m, code) => '<pre><code>' + code.trim().replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</code></pre>');
    html = html.replace(/(\|.+\|\n)(\|[-| :]+\|\n)((\|.+\|\n?)+)/g, (match) => {
      const rows = match.trim().split('\n').filter(r => r.trim());
      if (rows.length < 2) return match;
      const hdr = rows[0].split('|').filter(c => c.trim());
      const body = rows.slice(2);
      let t = '<table><thead><tr>' + hdr.map(c => '<th>' + c.trim() + '</th>').join('') + '</tr></thead><tbody>';
      body.forEach(r => {
        const cells = r.split('|').filter(c => c.trim());
        t += '<tr>' + cells.map(c => '<td>' + c.trim() + '</td>').join('') + '</tr>';
      });
      t += '</tbody></table>';
      return t;
    });
    html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    html = html.replace(/^---$/gm, '<hr>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/`(.+?)`/g, '<code>$1</code>');
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    html = html.replace(/^(\s*)[-*] (.+)$/gm, '$1<li>$2</li>');
    html = html.replace(/^(\s*)\d+\. (.+)$/gm, '$1<li>$2</li>');
    html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');
    html = html.replace(/\n/g, '<br>');
    html = html.replace(/(<\/h[1-4]>)<br>/g, '$1');
    html = html.replace(/(<\/table>)<br>/g, '$1');
    html = html.replace(/(<\/ul>)<br>/g, '$1');
    html = html.replace(/(<\/pre>)<br>/g, '$1');
    html = html.replace(/(<hr>)<br>/g, '$1');
    html = html.replace(/<br>(<h[1-4]>)/g, '$1');
    html = html.replace(/<br>(<ul>)/g, '$1');
    html = html.replace(/<br>(<pre>)/g, '$1');
    html = html.replace(/<br>(<table>)/g, '$1');
    html = html.replace(/<br>(<hr>)/g, '$1');
    return html;
  }

  // Add message to chat
  function addMessage(content, isBot = false) {
    const messagesDiv = $('#chatMessages');
    if (!messagesDiv) return;

    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-message ${isBot ? 'bot-message' : 'user-message'}`;

    const now = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

    const speakBtnHtml = isBot
      ? `<button class="speak-msg-btn" title="Listen to this message">🔊</button>`
      : '';

    msgDiv.innerHTML = `
      ${isBot ? '<div class="msg-avatar">🤖</div>' : ''}
      <div class="msg-bubble">
        <div class="msg-content">${isBot ? renderMarkdown(content) : content}</div>
        <div class="msg-footer">
          <span class="msg-time">${now}</span>
          ${speakBtnHtml}
        </div>
      </div>
      ${!isBot ? '<div class="msg-avatar">👤</div>' : ''}
    `;

    // Wire speak button
    if (isBot) {
      const speakBtn = msgDiv.querySelector('.speak-msg-btn');
      speakBtn?.addEventListener('click', () => speakText(content));
    }

    messagesDiv.appendChild(msgDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;

    // Auto-speak bot replies
    if (isBot && autoSpeak) {
      speakText(content);
    }

    // Save to history
    chatHistory.push({ content, isBot, time: now });
    localStorage.setItem('hs_chat_history', JSON.stringify(chatHistory.slice(-50)));
  }

  // Add typing indicator
  function showTyping() {
    const messagesDiv = $('#chatMessages');
    if (!messagesDiv) return;

    const typingDiv = document.createElement('div');
    typingDiv.id = 'typingIndicator';
    typingDiv.className = 'chat-message bot-message';
    typingDiv.innerHTML = `
      <div class="msg-avatar">🤖</div>
      <div class="msg-bubble">
        <div class="typing-dots">
          <span></span><span></span><span></span>
        </div>
      </div>
    `;
    messagesDiv.appendChild(typingDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }

  function hideTyping() {
    $('#typingIndicator')?.remove();
  }

  // Send message
  async function sendMessage(text) {
    if (!text.trim()) return;

    addMessage(text, false);
    showTyping();

    const context = await getUVContext();
    const langLabel = LANGUAGES[selectedLang]?.label || 'English';

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, context, language: langLabel })
      });

      const data = await res.json();
      hideTyping();
      addMessage(data.reply || 'Sorry, I could not generate a response.', true);
    } catch (err) {
      hideTyping();
      addMessage('⚠️ Connection error. Please try again.', true);
    }
  }

  // Send button
  $('#sendBtn')?.addEventListener('click', () => {
    const input = $('#chatInput');
    if (!input) return;
    sendMessage(input.value);
    input.value = '';
    input.style.height = 'auto';
  });

  // Enter to send
  $('#chatInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      $('#sendBtn')?.click();
    }
  });

  // Auto-resize textarea
  $('#chatInput')?.addEventListener('input', (e) => {
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
  });

  // Quick prompts
  $$('.qp-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const prompt = btn.dataset.prompt;
      if (prompt) {
        $('#chatInput').value = prompt;
        $('#sendBtn')?.click();
      }
    });
  });

  // Clear chat
  $('#clearChatBtn')?.addEventListener('click', () => {
    if (confirm('Clear all chat history?')) {
      chatHistory = [];
      localStorage.removeItem('hs_chat_history');
      const messagesDiv = $('#chatMessages');
      if (messagesDiv) {
        messagesDiv.innerHTML = `
          <div class="chat-message bot-message">
            <div class="msg-avatar">🤖</div>
            <div class="msg-bubble">
              <div class="msg-content">
                <p>Chat cleared! How can I help you today?</p>
              </div>
              <div class="msg-time">Just now</div>
            </div>
          </div>
        `;
      }
      showToast('Chat history cleared', 'success');
    }
  });

  // Voice input
  $('#voiceBtn')?.addEventListener('click', () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      return showToast('Voice input not supported in this browser', 'error');
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    // Use the selected language for voice input
    recognition.lang = LANGUAGES[selectedLang]?.speechLang || 'en-US';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
      $('#voiceIndicator')?.classList.remove('hidden');
      $('#voiceBtn')?.classList.add('listening');
      $('#chatStatus').innerHTML = `<span class="status-dot" style="background:#ff6b35;"></span> Listening (${LANGUAGES[selectedLang]?.label || 'English'})…`;
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      $('#chatInput').value = transcript;
      $('#sendBtn')?.click();
    };

    recognition.onerror = () => {
      showToast('Voice input failed', 'error');
    };

    recognition.onend = () => {
      $('#voiceIndicator')?.classList.add('hidden');
      $('#voiceBtn')?.classList.remove('listening');
      $('#chatStatus').innerHTML = '<span class="status-dot"></span> Online — Sun Safety Expert';
    };

    recognition.start();
  });

  $('#stopVoiceBtn')?.addEventListener('click', () => {
    if (recognition) recognition.stop();
  });

  // Load chat history
  chatHistory.forEach(msg => {
    const messagesDiv = $('#chatMessages');
    if (!messagesDiv) return;

    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-message ${msg.isBot ? 'bot-message' : 'user-message'}`;
    const speakBtnHtml = msg.isBot
      ? `<button class="speak-msg-btn" title="Listen to this message">🔊</button>`
      : '';
    msgDiv.innerHTML = `
      ${msg.isBot ? '<div class="msg-avatar">🤖</div>' : ''}
      <div class="msg-bubble">
        <div class="msg-content">${msg.isBot ? renderMarkdown(msg.content) : msg.content}</div>
        <div class="msg-footer">
          <span class="msg-time">${msg.time}</span>
          ${speakBtnHtml}
        </div>
      </div>
      ${!msg.isBot ? '<div class="msg-avatar">👤</div>' : ''}
    `;
    if (msg.isBot) {
      const speakBtn = msgDiv.querySelector('.speak-msg-btn');
      speakBtn?.addEventListener('click', () => speakText(msg.content));
    }
    messagesDiv.appendChild(msgDiv);
  });

  // Pre-load voices
  if ('speechSynthesis' in window) {
    speechSynthesis.getVoices();
    speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();
  }
}

// ─── SMART NOTIFICATIONS ───────────────────────────────────────────
function initSmartNotifications() {
  const prefs = JSON.parse(localStorage.getItem('hs_user_prefs') || '{}');
  if (!prefs.notifications) return;

  // Check UV data periodically
  setInterval(async () => {
    try {
      const uvData = JSON.parse(localStorage.getItem('hs_last_uv') || 'null');
      if (!uvData) return;

      const now = new Date();
      const hour = now.getHours();

      // UV peak approaching (10 AM - 2 PM)
      if (hour === 9 && uvData.uv >= 6) {
        showToast('⚠️ UV peak approaching! Apply sunscreen now.', 'warning', 5000);
      }

      // Safe window starting (after 4 PM)
      if (hour === 16 && uvData.uv < 6) {
        showToast('✅ Safe window starting — UV is dropping to safer levels.', 'success', 5000);
      }

      // Reapply reminder (every 2 hours during peak)
      if (hour >= 10 && hour <= 16 && hour % 2 === 0 && uvData.uv >= 6) {
        const lastReapply = localStorage.getItem('hs_last_reapply');
        if (!lastReapply || Date.now() - parseInt(lastReapply) > 7200000) {
          showToast('🧴 Time to reapply sunscreen! Don\'t forget your face and neck.', 'warning', 6000);
          localStorage.setItem('hs_last_reapply', Date.now().toString());
        }
      }
    } catch (e) { /* Silent fail */ }
  }, 60000); // Check every minute
}

// ─── USER PREFERENCES ──────────────────────────────────────────────
function initUserPreferences() {
  // Load preferences or set defaults
  let prefs = JSON.parse(localStorage.getItem('hs_user_prefs') || '{}');

  if (!prefs.skinType) {
    prefs = {
      skinType: 3,
      favoriteLocations: [],
      notifications: true,
      homeLocation: null
    };
    localStorage.setItem('hs_user_prefs', JSON.stringify(prefs));
  }
}

// ─── TRAVEL DETAIL ─────────────────────────────────────────────────
async function initTravelDetail() {
  const urlParams = new URLSearchParams(window.location.search);
  const lat = parseFloat(urlParams.get('lat'));
  const lng = parseFloat(urlParams.get('lng'));
  const name = urlParams.get('name') || 'Unknown Location';

  if (isNaN(lat) || isNaN(lng)) return;

  $('#tdLocationName').textContent = name;
  const content = $('#tdContent');
  const loader = $('#tdLoading');
  const aiLoader = $('#tdAiLoading');
  const aiTips = $('#tdAiTips');

  // Format time helper using location's timezone
  const formatTime = (isoString, timezone, lng, utcOffsetSeconds = 0) => {
    if (!isoString) return '--:--';
    const d = new Date(isoString);
    try {
      if (timezone) {
        return new Intl.DateTimeFormat('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
          timeZone: timezone
        }).format(d);
      }
    } catch (e) { /* fallback */ }
    
    // Fallback if timezone is invalid/missing: use UTC offset from timezone API
    if (Number.isFinite(Number(utcOffsetSeconds)) && Number(utcOffsetSeconds) !== 0) {
      const utcMs = d.getTime();
      return new Date(utcMs + Number(utcOffsetSeconds) * 1000)
        .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'UTC' });
    }

    // Last fallback if we have no timezone metadata
    const offsetHours = Math.round(Number(lng || 0) / 15);
    const utcMs = d.getTime();
    return new Date(utcMs + offsetHours * 3600000)
      .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'UTC' });
  };

  try {
    // 1. Fetch destination timezone (prefer dedicated endpoint)
    const [geo, tzInfo] = await Promise.all([
      reverseGeocode(lat, lng).catch(() => ({})),
      fetchTimezone(lat, lng).catch(() => null)
    ]);
    const timezone = tzInfo?.timezone || geo.timezone || null;
    const timezoneAbbr = tzInfo?.timezoneAbbr || '';
    const utcOffsetSeconds = Number(tzInfo?.utcOffsetSeconds || 0);

    // 2. Fetch Full UV Details
    const res = await fetch(`/api/uv-detail?lat=${lat}&lng=${lng}`);
    if (!res.ok) throw new Error('Failed to fetch details');
    const data = await res.json();
    const result = data.result;

    const uv = result.uv || 0;
    const cat = getUVCategory(uv);
    const badge = $('#tdUvBadge');
    badge.textContent = `Current UV: ${uv.toFixed(1)} (${cat.label})`;
    badge.style.backgroundColor = cat.color;

    const sf = result.sun_info?.sun_times || {};

    $('#tdSunrise').textContent = formatTime(sf.sunrise, timezone, lng, utcOffsetSeconds);
    $('#tdSolarNoon').textContent = formatTime(sf.solarNoon, timezone, lng, utcOffsetSeconds);
    $('#tdSunset').textContent = formatTime(sf.sunset, timezone, lng, utcOffsetSeconds);

    // Display the timezone being used
    const tzDisplay = timezone
      ? `${timezoneAbbr ? `${timezoneAbbr} · ` : ''}${timezone}`
      : `UTC${Math.round(lng / 15) >= 0 ? '+' : ''}${Math.round(lng / 15)}`;
    $('#tdTimezoneLabel').textContent = tzDisplay;
    
    // Golden Hour range
    const ghStart = formatTime(sf.goldenHour, timezone, lng, utcOffsetSeconds);
    const ghEnd = formatTime(sf.goldenHourEnd, timezone, lng, utcOffsetSeconds);
    $('#tdGoldenHour').textContent = (sf.goldenHour && sf.goldenHourEnd) ? `${ghStart} - ${ghEnd}` : '--:--';

    // Safe Exposure
    const exp = result.safe_exposure_time?.st3 || 0; // Type 3 skin
    $('#tdSafeExposure').textContent = exp > 0 ? `${exp} mins` : 'Unlimited';

    loader.classList.add('hidden');
    content.classList.remove('hidden');

    // 3. Fetch AI Travel Tips
    aiLoader.classList.remove('hidden');
    
    // Mock getUVContext for the chat API
    const contextStr = JSON.stringify({
      location: name,
      uv,
      category: cat.label,
      goldenHour: $('#tdGoldenHour').textContent,
      sunset: $('#tdSunset').textContent
    });

    const aiRes = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `I'm travelling to ${name}. The current UV index is ${uv.toFixed(1)} (${cat.label}). The golden hour is ${$('#tdGoldenHour').textContent}. Give me exactly 3 Markdown bullet points. Bullet 1: Exact safe times to go outdoors today. Bullet 2: Specific clothing and gear recommendations. Bullet 3: Sun safety advice tailored to this UV level. Keep it concise without introductory text.`,
        context: contextStr
      })
    });
    
    const aiData = await aiRes.json();
    aiLoader.classList.add('hidden');

    // Parse Markdown to HTML manually for the tips (since we don't have the full renderMarkdown here)
    let tipHtml = aiData.reply || 'Enjoy your trip safely!';
    tipHtml = tipHtml.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    tipHtml = tipHtml.replace(/^\* (.*$)/gim, '<li>$1</li>');
    if (tipHtml.includes('<li>')) tipHtml = `<ul>${tipHtml}</ul>`;
    
    aiTips.innerHTML = tipHtml;

  } catch (err) {
    loader.innerHTML = '<div style="color:var(--uv-very-high);">Failed to load location details. Please try again.</div>';
  }
}

// ═══════════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  initIntro();
  initNav();
  initScrollReveal();

  // Remove page transition overlay on load
  setTimeout(() => {
    const pt = $('#pageTransition');
    if (pt) pt.classList.remove('active');
  }, 50);

  // Dispatch page-specific init
  switch (PAGE) {
    case 'dashboard': initDashboard(); break;
    case 'forecast': initForecast(); break;
    case 'calculator': initCalculator(); break;
    case 'locations': initLocations(); break;
    case 'share': initShare(); break;
    case 'chatbot': initChatbot(); break;
    case 'travel-detail': initTravelDetail(); break;
  }

  // Initialize smart notifications
  initSmartNotifications();

  // Initialize user preferences
  initUserPreferences();
});
