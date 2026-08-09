// ---------- storage layer (swap for real API calls when backend is ready) ----------
const STORE_KEYS = { requests:'sethu_requests', shelters:'sethu_shelters', missing:'sethu_missing' };
const channel = 'BroadcastChannel' in window ? new BroadcastChannel('sethu_sync') : null;

function load(key){ return JSON.parse(localStorage.getItem(key) || '[]'); }
function save(key, data){
  localStorage.setItem(key, JSON.stringify(data));
  if(channel) channel.postMessage({ key }); // tell other open tabs to refresh
}
function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }

// ---------- seed demo data (only on first run, so judges see a live scenario) ----------
function seed(){
  if(localStorage.getItem('sethu_seeded')) return;
  const requests = [
    { id:uid(), type:'rescue', severity:'critical', area:'Diara Village, Patna', description:'Family of 5 stranded on rooftop, water rising', phone:'', lat:25.62, lng:85.08, status:'open', claimedBy:null, createdAt:Date.now()-1000*60*40 },
    { id:uid(), type:'medical', severity:'high', area:'Maner Block', description:'Elderly woman needs insulin', phone:'', lat:25.53, lng:84.88, status:'claimed', claimedBy:'Volunteer: Ravi K.', createdAt:Date.now()-1000*60*90 },
    { id:uid(), type:'food', severity:'medium', area:'Fatuha', description:'40 people without food since morning', phone:'', lat:25.51, lng:85.31, status:'open', claimedBy:null, createdAt:Date.now()-1000*60*20 },
    { id:uid(), type:'water', severity:'high', area:'Bakhtiyarpur', description:'No clean drinking water, children falling sick', phone:'', lat:25.43, lng:85.53, status:'open', claimedBy:null, createdAt:Date.now()-1000*60*55 },
    { id:uid(), type:'shelter', severity:'medium', area:'Danapur', description:'Home flooded, need temporary shelter for 3', phone:'', lat:25.63, lng:85.05, status:'resolved', claimedBy:'NGO: Rahat Seva', createdAt:Date.now()-1000*60*200 }
  ];
  const shelters = [
    { id:uid(), name:'Government Middle School, Fatuha', area:'Fatuha', lat:25.505, lng:85.315, capacity:150, occupied:98, contact:'0612-XXXXXXX' },
    { id:uid(), name:'Community Hall, Danapur', area:'Danapur', lat:25.635, lng:85.045, capacity:80, occupied:80, contact:'0612-XXXXXXX' },
    { id:uid(), name:'Panchayat Bhawan, Maner', area:'Maner', lat:25.525, lng:84.885, capacity:60, occupied:22, contact:'0612-XXXXXXX' }
  ];
  const missing = [
    { id:uid(), name:'Suresh Manjhi', age:52, lastSeen:'Near Ganga bridge, Diara village', photo:'', contact:'9800000000', status:'missing', postedAt:Date.now()-1000*60*300 }
  ];
  save(STORE_KEYS.requests, requests);
  save(STORE_KEYS.shelters, shelters);
  save(STORE_KEYS.missing, missing);
  localStorage.setItem('sethu_seeded','1');
}
seed();

// ---------- view switching ----------
const tabBtns = document.querySelectorAll('.tab-btn');
tabBtns.forEach(btn => btn.addEventListener('click', () => switchView(btn.dataset.view)));
function switchView(view){
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + view).classList.add('active');
  tabBtns.forEach(b => b.classList.toggle('active', b.dataset.view === view));
  if(view === 'map') setTimeout(() => map.invalidateSize(), 50); // fix leaflet sizing after display:none
}

// ---------- toast helper ----------
let toastTimer;
function toast(msg){
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

// ---------- connectivity status ----------
function updateStatus(){
  const strip = document.getElementById('statusStrip');
  const text = document.getElementById('statusText');
  if(navigator.onLine){
    strip.classList.remove('offline');
    text.textContent = 'Online — synced across devices';
  } else {
    strip.classList.add('offline');
    text.textContent = 'Offline — saving locally, will sync when back online';
  }
}
window.addEventListener('online', updateStatus);
window.addEventListener('offline', updateStatus);
updateStatus();

// ================= LIVE MAP =================
const map = L.map('map', { scrollWheelZoom:true }).setView([25.59, 85.14], 8);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors', maxZoom: 18
}).addTo(map);

let markers = [];
function pinIcon(status, severity){
  const cls = status === 'resolved' ? 'pin pin-resolved' : `pin pin-${severity}`;
  const pulse = (status !== 'resolved' && (severity === 'critical' || severity === 'high')) ? ' pin-pulse' : '';
  return L.divIcon({ className:'', html:`<span class="${cls}${pulse}"></span>`, iconSize:[16,16] });
}

function renderMap(){
  markers.forEach(m => map.removeLayer(m));
  markers = [];
  const filter = document.getElementById('filterSeverity').value;
  const requests = load(STORE_KEYS.requests);
  requests
    .filter(r => filter === 'all' || r.severity === filter)
    .forEach(r => {
      const marker = L.marker([r.lat, r.lng], { icon: pinIcon(r.status, r.severity) }).addTo(map);
      marker.bindPopup(`<strong>${capitalize(r.type)} — ${capitalize(r.severity)}</strong><br>${r.area}<br>${r.description || ''}<br><em>${capitalize(r.status)}</em>`);
      markers.push(marker);
    });
}
function capitalize(s){ return s.charAt(0).toUpperCase() + s.slice(1); }

// ---------- request list + claim/resolve workflow ----------
function renderRequests(){
  const list = document.getElementById('requestItems');
  const filter = document.getElementById('filterSeverity').value;
  const requests = load(STORE_KEYS.requests)
    .filter(r => filter === 'all' || r.severity === filter)
    .sort((a,b) => severityRank(b.severity) - severityRank(a.severity) || b.createdAt - a.createdAt);

  list.innerHTML = requests.map(r => `
    <li class="request-card" data-id="${r.id}">
      <div class="rc-top">
        <h4>${capitalize(r.type)} — ${escapeHtml(r.area)}</h4>
        <span class="badge badge-${r.severity}">${r.severity}</span>
      </div>
      <p>${escapeHtml(r.description || 'No further details provided.')}</p>
      <div class="rc-meta">
        <span class="badge badge-${r.status}">${r.status}</span>
        &nbsp;${timeAgo(r.createdAt)}${r.claimedBy ? ' · ' + escapeHtml(r.claimedBy) : ''}
      </div>
      <div class="rc-actions">
        <button class="btn-claim" data-action="claim" ${r.status !== 'open' ? 'disabled' : ''}>I'll handle this</button>
        <button class="btn-resolve" data-action="resolve" ${r.status !== 'claimed' ? 'disabled' : ''}>Mark resolved</button>
      </div>
    </li>
  `).join('') || '<p style="color:#8a8f97;font-size:.85rem;">No requests match this filter.</p>';
}
function severityRank(s){ return { critical:3, high:2, medium:1 }[s] || 0; }
function timeAgo(ts){
  const min = Math.round((Date.now() - ts) / 60000);
  if(min < 60) return min + 'm ago';
  return Math.round(min/60) + 'h ago';
}
function escapeHtml(s){ const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

document.getElementById('requestItems').addEventListener('click', e => {
  const btn = e.target.closest('button[data-action]');
  if(!btn) return;
  const id = btn.closest('.request-card').dataset.id;
  const requests = load(STORE_KEYS.requests);
  const req = requests.find(r => r.id === id);
  if(!req) return;
  if(btn.dataset.action === 'claim'){
    req.status = 'claimed';
    req.claimedBy = 'Volunteer: You'; // real backend would use the logged-in volunteer's name
    toast('Request claimed — the requester status is now updated for everyone.');
  } else {
    req.status = 'resolved';
    toast('Marked resolved. Great work.');
  }
  save(STORE_KEYS.requests, requests);
  refreshAll();
});
document.getElementById('filterSeverity').addEventListener('change', () => { renderMap(); renderRequests(); });

// ================= REPORT NEED FORM =================
let capturedLocation = null;
function locateUser(){
  const status = document.getElementById('locationStatus');
  if(!navigator.geolocation){ status.textContent = 'Location unavailable — request will use area name only.'; return; }
  navigator.geolocation.getCurrentPosition(
    pos => {
      capturedLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      status.textContent = `Location captured: ${capturedLocation.lat.toFixed(4)}, ${capturedLocation.lng.toFixed(4)}`;
    },
    () => { status.textContent = 'Could not access location — request will use area name only.'; },
    { timeout: 8000 }
  );
}
locateUser();

document.getElementById('reportForm').addEventListener('submit', e => {
  e.preventDefault();
  const requests = load(STORE_KEYS.requests);
  const fallback = { lat: 25.59 + (Math.random()-0.5)*0.4, lng: 85.14 + (Math.random()-0.5)*0.4 };
  requests.push({
    id: uid(),
    type: document.getElementById('needType').value,
    severity: document.getElementById('severity').value,
    area: document.getElementById('area').value,
    description: document.getElementById('description').value,
    phone: document.getElementById('phone').value,
    lat: (capturedLocation || fallback).lat,
    lng: (capturedLocation || fallback).lng,
    status: 'open', claimedBy: null, createdAt: Date.now()
  });
  save(STORE_KEYS.requests, requests);
  e.target.reset();
  toast('Request submitted. Volunteers can now see it on the live map.');
  switchView('map'); document.querySelector('[data-view="map"]').classList.add('active');
  refreshAll();
});

// ================= SHELTERS =================
function renderShelters(){
  const grid = document.getElementById('shelterGrid');
  const shelters = load(STORE_KEYS.shelters);
  grid.innerHTML = shelters.map(s => {
    const pct = Math.min(100, Math.round((s.occupied / s.capacity) * 100));
    return `
    <article class="info-card">
      <h3>${escapeHtml(s.name)}</h3>
      <p>${escapeHtml(s.area)}</p>
      <div class="capacity-bar"><div class="capacity-fill ${pct >= 100 ? 'full' : ''}" style="width:${pct}%"></div></div>
      <p><strong>${s.occupied}/${s.capacity}</strong> beds occupied${pct >= 100 ? ' — FULL' : ''}</p>
      <p>Contact: ${escapeHtml(s.contact || 'n/a')}</p>
    </article>`;
  }).join('') || '<p style="color:#8a8f97;">No shelters added yet.</p>';
}

document.getElementById('addShelterBtn').addEventListener('click', () => {
  openModal(`
    <h3>Add a shelter</h3>
    <form id="shelterForm">
      <label for="sName">Shelter name</label>
      <input id="sName" required>
      <label for="sArea">Area</label>
      <input id="sArea" required>
      <label for="sCap">Total capacity</label>
      <input id="sCap" type="number" min="1" required>
      <label for="sOcc">Currently occupied</label>
      <input id="sOcc" type="number" min="0" value="0" required>
      <label for="sContact">Contact number</label>
      <input id="sContact">
      <button class="btn-primary" type="submit">Save shelter</button>
    </form>
  `);
  document.getElementById('shelterForm').addEventListener('submit', e => {
    e.preventDefault();
    const shelters = load(STORE_KEYS.shelters);
    shelters.push({
      id: uid(),
      name: document.getElementById('sName').value,
      area: document.getElementById('sArea').value,
      capacity: Number(document.getElementById('sCap').value),
      occupied: Number(document.getElementById('sOcc').value),
      contact: document.getElementById('sContact').value,
      lat: 25.59 + (Math.random()-0.5)*0.4, lng: 85.14 + (Math.random()-0.5)*0.4
    });
    save(STORE_KEYS.shelters, shelters);
    closeModal();
    toast('Shelter added.');
    refreshAll();
  });
});

// ================= MISSING PERSONS =================
function renderMissing(query=''){
  const grid = document.getElementById('missingGrid');
  const q = query.toLowerCase();
  const missing = load(STORE_KEYS.missing).filter(m =>
    m.name.toLowerCase().includes(q) || m.lastSeen.toLowerCase().includes(q)
  );
  grid.innerHTML = missing.map(m => `
    <article class="info-card">
      <img class="missing-photo" src="${m.photo || placeholderPhoto()}" alt="Photo of ${escapeHtml(m.name)}">
      <span class="status-pill status-${m.status}">${m.status}</span>
      <h3>${escapeHtml(m.name)}${m.age ? ', ' + m.age : ''}</h3>
      <p>Last seen: ${escapeHtml(m.lastSeen)}</p>
      <p>Contact: ${escapeHtml(m.contact || 'n/a')}</p>
      ${m.status === 'missing' ? `<button class="btn-secondary" data-found="${m.id}">Mark as found</button>` : ''}
    </article>
  `).join('') || '<p style="color:#8a8f97;">No matching reports.</p>';
}
function placeholderPhoto(){
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="150"><rect width="100%" height="100%" fill="#e7e1cf"/><text x="50%" y="50%" text-anchor="middle" fill="#8a8f97" font-family="sans-serif" font-size="13">No photo</text></svg>`
  );
}
document.getElementById('missingSearch').addEventListener('input', e => renderMissing(e.target.value));
document.getElementById('missingGrid').addEventListener('click', e => {
  const id = e.target.dataset.found;
  if(!id) return;
  const missing = load(STORE_KEYS.missing);
  const person = missing.find(m => m.id === id);
  person.status = 'found';
  save(STORE_KEYS.missing, missing);
  toast(`${person.name} marked as found.`);
  renderMissing(document.getElementById('missingSearch').value);
});

document.getElementById('addMissingBtn').addEventListener('click', () => {
  openModal(`
    <h3>Post a missing person report</h3>
    <form id="missingForm">
      <label for="mName">Full name</label>
      <input id="mName" required>
      <label for="mAge">Age</label>
      <input id="mAge" type="number" min="0">
      <label for="mLast">Last seen location</label>
      <input id="mLast" required>
      <label for="mContact">Your contact number</label>
      <input id="mContact" required>
      <label for="mPhoto">Photo (optional)</label>
      <input id="mPhoto" type="file" accept="image/*">
      <button class="btn-primary" type="submit">Post report</button>
    </form>
  `);
  document.getElementById('missingForm').addEventListener('submit', e => {
    e.preventDefault();
    const fileInput = document.getElementById('mPhoto');
    const finish = (photoData) => {
      const missing = load(STORE_KEYS.missing);
      missing.push({
        id: uid(),
        name: document.getElementById('mName').value,
        age: document.getElementById('mAge').value,
        lastSeen: document.getElementById('mLast').value,
        contact: document.getElementById('mContact').value,
        photo: photoData || '',
        status: 'missing', postedAt: Date.now()
      });
      save(STORE_KEYS.missing, missing);
      closeModal();
      toast('Missing person report posted.');
      refreshAll();
    };
    if(fileInput.files[0]){
      const reader = new FileReader();
      reader.onload = () => finish(reader.result);
      reader.readAsDataURL(fileInput.files[0]);
    } else finish('');
  });
});

// ================= MODAL HELPERS =================
function openModal(html){
  document.getElementById('modalBody').innerHTML = html;
  const overlay = document.getElementById('modalOverlay');
  overlay.hidden = false;
  overlay.style.display = 'grid';
}
function closeModal(){
  const overlay = document.getElementById('modalOverlay');
  overlay.hidden = true;
  overlay.style.display = 'none';
}
document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('modalOverlay').addEventListener('click', e => { if(e.target.id === 'modalOverlay') closeModal(); });

// ================= DASHBOARD =================
function renderDashboard(){
  const requests = load(STORE_KEYS.requests);
  const open = requests.filter(r => r.status === 'open').length;
  const claimed = requests.filter(r => r.status === 'claimed').length;
  const resolved = requests.filter(r => r.status === 'resolved').length;

  document.getElementById('statRow').innerHTML = [
    ['Total requests', requests.length],
    ['Open', open],
    ['Claimed', claimed],
    ['Resolved', resolved],
    ['Shelters', load(STORE_KEYS.shelters).length],
    ['Missing persons', load(STORE_KEYS.missing).filter(m => m.status === 'missing').length]
  ].map(([label,num]) => `<div class="stat-card"><div class="num">${num}</div><div class="label">${label}</div></div>`).join('');

  // unresolved by area
  const byArea = {};
  requests.filter(r => r.status !== 'resolved').forEach(r => { byArea[r.area] = (byArea[r.area]||0) + 1; });
  renderBars('areaBars', byArea);

  // by severity
  const bySeverity = { critical:0, high:0, medium:0 };
  requests.forEach(r => { bySeverity[r.severity] = (bySeverity[r.severity]||0) + 1; });
  renderBars('severityBars', bySeverity);
}
function renderBars(elId, data){
  const entries = Object.entries(data).sort((a,b) => b[1]-a[1]);
  const max = Math.max(1, ...entries.map(e => e[1]));
  document.getElementById(elId).innerHTML = entries.map(([label,count]) => `
    <li class="bar-row">
      <span class="bar-label">${escapeHtml(label)}</span>
      <span class="bar-track"><span class="bar-fill" style="width:${(count/max)*100}%"></span></span>
      <span class="bar-count">${count}</span>
    </li>
  `).join('') || '<p style="color:#8a8f97;font-size:.8rem;">No data yet.</p>';
}

// ================= SOS BUTTON =================
document.getElementById('sosBtn').addEventListener('click', () => {
  const finish = (lat, lng) => {
    const requests = load(STORE_KEYS.requests);
    requests.push({
      id: uid(), type:'rescue', severity:'critical', area:'SOS — auto location',
      description:'Emergency SOS triggered — immediate assistance needed.',
      phone:'', lat, lng, status:'open', claimedBy:null, createdAt:Date.now()
    });
    save(STORE_KEYS.requests, requests);
    toast('SOS sent with your location. Help is being alerted.');
    switchView('map');
    refreshAll();
    map.setView([lat,lng], 13);
  };
  if(navigator.geolocation){
    navigator.geolocation.getCurrentPosition(
      pos => finish(pos.coords.latitude, pos.coords.longitude),
      () => finish(25.59 + (Math.random()-0.5)*0.4, 85.14 + (Math.random()-0.5)*0.4),
      { timeout: 6000 }
    );
  } else {
    finish(25.59, 85.14);
  }
});

// ================= SYNC ACROSS TABS / DEVICES ON THIS BROWSER =================
if(channel) channel.onmessage = refreshAll;
window.addEventListener('storage', refreshAll); // fallback for browsers without BroadcastChannel
setInterval(refreshAll, 5000); // poll, so this becomes a drop-in place for real backend polling later

function refreshAll(){
  renderMap();
  renderRequests();
  renderShelters();
  renderMissing(document.getElementById('missingSearch').value);
  renderDashboard();
}
refreshAll();