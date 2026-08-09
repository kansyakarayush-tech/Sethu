/* Sethu - Disaster Response Coordination Platform */

const STORAGE_KEY = "sethu_state_v2";

const defaultState = {
  requests: [
    {
      id: "REQ-1042",
      type: "Rescue",
      severity: "critical",
      title: "Family stranded on rooftop",
      description: "6 people need boat rescue. Water level rising rapidly.",
      location: "Mithapur, Bihar",
      lat: 25.462,
      lng: 85.704,
      status: "open",
      createdAt: Date.now() - 1000 * 60 * 12,
      claimedBy: null
    },
    {
      id: "REQ-1041",
      type: "Medical",
      severity: "high",
      title: "Urgent medicine required",
      description: "Insulin and basic medicines required for elderly residents.",
      location: "Patna Rural",
      lat: 25.594,
      lng: 85.137,
      status: "claimed",
      createdAt: Date.now() - 1000 * 60 * 32,
      claimedBy: "Volunteer Team A"
    },
    {
      id: "REQ-1040",
      type: "Food",
      severity: "medium",
      title: "Food packets required",
      description: "Around 35 people need food and drinking water.",
      location: "Hajipur",
      lat: 25.686,
      lng: 85.214,
      status: "open",
      createdAt: Date.now() - 1000 * 60 * 52,
      claimedBy: null
    }
  ],

  shelters: [
    {
      id: 1,
      name: "Mithapur Community Shelter",
      address: "Mithapur, Bihar",
      lat: 25.462,
      lng: 85.704,
      capacity: 50,
      occupied: 40,
      contact: "Emergency Desk",
      status: "open"
    },
    {
      id: 2,
      name: "Patna Relief Centre",
      address: "Patna, Bihar",
      lat: 25.594,
      lng: 85.137,
      capacity: 100,
      occupied: 62,
      contact: "Relief Control Room",
      status: "open"
    },
    {
      id: 3,
      name: "Hajipur School Shelter",
      address: "Hajipur, Bihar",
      lat: 25.686,
      lng: 85.214,
      capacity: 75,
      occupied: 74,
      contact: "Shelter Coordinator",
      status: "limited"
    }
  ],

  missingPersons: [
    {
      id: "MP-201",
      name: "Rahul Kumar",
      age: 17,
      gender: "Male",
      location: "Mithapur",
      description: "Last seen near the main bridge.",
      image: "",
      status: "missing",
      createdAt: Date.now() - 1000 * 60 * 60 * 3
    },
    {
      id: "MP-202",
      name: "Sunita Devi",
      age: 42,
      gender: "Female",
      location: "Hajipur",
      description: "Wearing a blue saree. Last seen near relief camp.",
      image: "",
      status: "missing",
      createdAt: Date.now() - 1000 * 60 * 60 * 5
    }
  ],

  sosAlerts: [],
  role: "affected"
};

let state = loadState();
let map;
let markersLayer;
let userMarker = null;
let selectedRequestId = null;

document.addEventListener("DOMContentLoaded", () => {
  initializeApp();
});

function initializeApp() {
  setupNavigation();
  setupRoleSwitcher();
  setupForms();
  setupFilters();
  setupModals();
  setupSOS();
  setupLocationButtons();
  setupMobileMenu();

  initializeMap();
  renderEverything();

  window.addEventListener("online", updateConnectionStatus);
  window.addEventListener("offline", updateConnectionStatus);

  updateConnectionStatus();
}

/* ---------------- STATE ---------------- */

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);

    if (!saved) {
      return structuredClone(defaultState);
    }

    const parsed = JSON.parse(saved);

    return {
      ...structuredClone(defaultState),
      ...parsed
    };
  } catch (error) {
    console.error("State loading failed:", error);
    return structuredClone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

  if ("BroadcastChannel" in window) {
    try {
      const channel = new BroadcastChannel("sethu_sync");
      channel.postMessage(state);
      channel.close();
    } catch (error) {
      console.warn("Broadcast sync unavailable.");
    }
  }
}

/* ---------------- NAVIGATION ---------------- */

function setupNavigation() {
  document.querySelectorAll("[data-section]").forEach(button => {
    button.addEventListener("click", () => {
      const sectionId = button.dataset.section;

      showSection(sectionId);

      document.querySelectorAll("[data-section]").forEach(item => {
        item.classList.remove("active");
      });

      button.classList.add("active");
    });
  });
}

function showSection(sectionId) {
  document.querySelectorAll("main section, .page-section").forEach(section => {
    section.classList.remove("active");
  });

  const target = document.getElementById(sectionId);

  if (target) {
    target.classList.add("active");
    target.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  closeMobileMenu();
}

/* ---------------- ROLE ---------------- */

function setupRoleSwitcher() {
  document.querySelectorAll("[data-role]").forEach(button => {
    button.addEventListener("click", () => {
      state.role = button.dataset.role;

      document.querySelectorAll("[data-role]").forEach(item => {
        item.classList.toggle(
          "active",
          item.dataset.role === state.role
        );
      });

      saveState();
      updateRoleUI();

      showToast(
        `${capitalize(state.role)} mode activated`,
        "success"
      );
    });
  });

  updateRoleUI();
}

function updateRoleUI() {
  document.body.dataset.role = state.role;

  const roleLabels = document.querySelectorAll("[data-current-role]");

  roleLabels.forEach(label => {
    label.textContent = capitalize(state.role);
  });
}

/* ---------------- MAP ---------------- */

function initializeMap() {
  const mapElement = document.getElementById("map");

  if (!mapElement || typeof L === "undefined") {
    return;
  }

  map = L.map(mapElement).setView([25.594, 85.137], 8);

  L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors"
    }
  ).addTo(map);

  markersLayer = L.layerGroup().addTo(map);

  renderMapMarkers();
}

function renderMapMarkers() {
  if (!map || !markersLayer) return;

  markersLayer.clearLayers();

  state.requests.forEach(request => {
    if (!request.lat || !request.lng) return;

    const marker = L.marker([
      request.lat,
      request.lng
    ]).addTo(markersLayer);

    marker.bindPopup(`
      <div class="map-popup">
        <strong>${escapeHTML(request.title)}</strong>
        <p>${escapeHTML(request.location)}</p>
        <span class="status-badge ${request.severity}">
          ${capitalize(request.severity)}
        </span>
        <p>${escapeHTML(request.type)} request</p>
        <button
          class="popup-action"
          onclick="openRequest('${request.id}')"
        >
          View Request
        </button>
      </div>
    `);
  });

  state.shelters.forEach(shelter => {
    const marker = L.marker(
      [shelter.lat, shelter.lng],
      {
        icon: createShelterIcon()
      }
    ).addTo(markersLayer);

    marker.bindPopup(`
      <div class="map-popup">
        <strong>${escapeHTML(shelter.name)}</strong>
        <p>${escapeHTML(shelter.address)}</p>
        <p>
          ${shelter.occupied}/${shelter.capacity} occupied
        </p>
        <button
          class="popup-action"
          onclick="focusShelter(${shelter.id})"
        >
          View Shelter
        </button>
      </div>
    `);
  });
}

function createShelterIcon() {
  if (typeof L === "undefined") return undefined;

  return L.divIcon({
    className: "shelter-map-icon",
    html: "🏠",
    iconSize: [30, 30],
    iconAnchor: [15, 15]
  });
}

function focusMap(lat, lng, zoom = 14) {
  if (!map) return;

  map.setView([lat, lng], zoom);
}

function focusShelter(id) {
  const shelter = state.shelters.find(item => item.id === id);

  if (!shelter) return;

  showSection("shelters");
  focusMap(shelter.lat, shelter.lng);
}

/* ---------------- LOCATION ---------------- */

function setupLocationButtons() {
  document.querySelectorAll("[data-location]").forEach(button => {
    button.addEventListener("click", getUserLocation);
  });
}

function getUserLocation() {
  if (!navigator.geolocation) {
    showToast(
      "Geolocation is not supported by this browser.",
      "error"
    );
    return;
  }

  showToast("Getting your location...", "info");

  navigator.geolocation.getCurrentPosition(
    position => {
      const { latitude, longitude } = position.coords;

      if (map) {
        map.setView(
          [latitude, longitude],
          14
        );

        if (userMarker) {
          userMarker.remove();
        }

        userMarker = L.marker([
          latitude,
          longitude
        ])
          .addTo(map)
          .bindPopup("You are here")
          .openPopup();
      }

      const latInput = document.querySelector("#latitude");
      const lngInput = document.querySelector("#longitude");

      if (latInput) latInput.value = latitude;
      if (lngInput) lngInput.value = longitude;

      showToast(
        "Location detected successfully.",
        "success"
      );
    },
    error => {
      console.error(error);

      showToast(
        "Unable to get your location. Please enter it manually.",
        "error"
      );
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 30000
    }
  );
}

/* ---------------- REQUESTS ---------------- */

function setupForms() {
  const requestForm = document.getElementById("requestForm");

  if (requestForm) {
    requestForm.addEventListener("submit", handleRequestSubmit);
  }

  const missingForm = document.getElementById("missingPersonForm");

  if (missingForm) {
    missingForm.addEventListener(
      "submit",
      handleMissingPersonSubmit
    );
  }
}

function handleRequestSubmit(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const data = new FormData(form);

  const request = {
    id: generateId("REQ"),
    type: data.get("type") || "Other",
    severity: data.get("severity") || "medium",
    title: data.get("title") || "Emergency request",
    description: data.get("description") || "",
    location: data.get("location") || "Unknown location",
    lat: Number(data.get("latitude")) || 25.594,
    lng: Number(data.get("longitude")) || 85.137,
    status: "open",
    createdAt: Date.now(),
    claimedBy: null
  };

  state.requests.unshift(request);

  saveState();
  renderEverything();

  form.reset();

  closeModal("requestModal");

  showToast(
    "Emergency request submitted successfully.",
    "success"
  );

  showSection("requests");
}

function claimRequest(id) {
  const request = state.requests.find(
    item => item.id === id
  );

  if (!request) return;

  if (request.status !== "open") {
    showToast(
      "This request is no longer available.",
      "error"
    );
    return;
  }

  request.status = "claimed";
  request.claimedBy = "Current Volunteer";

  saveState();
  renderEverything();

  showToast(
    "Request claimed successfully.",
    "success"
  );
}

function resolveRequest(id) {
  const request = state.requests.find(
    item => item.id === id
  );

  if (!request) return;

  request.status = "resolved";
  request.resolvedAt = Date.now();

  saveState();
  renderEverything();

  showToast(
    "Request marked as resolved.",
    "success"
  );
}

function openRequest(id) {
  const request = state.requests.find(
    item => item.id === id
  );

  if (!request) return;

  selectedRequestId = id;

  const modal = document.getElementById("requestDetailsModal");

  if (!modal) {
    focusMap(request.lat, request.lng);
    return;
  }

  const content = modal.querySelector(
    "[data-request-details]"
  );

  if (content) {
    content.innerHTML = `
      <div class="request-detail">
        <span class="status-badge ${request.severity}">
          ${capitalize(request.severity)}
        </span>

        <h2>${escapeHTML(request.title)}</h2>

        <p>${escapeHTML(request.description)}</p>

        <div class="detail-row">
          <strong>Type</strong>
          <span>${escapeHTML(request.type)}</span>
        </div>

        <div class="detail-row">
          <strong>Location</strong>
          <span>${escapeHTML(request.location)}</span>
        </div>

        <div class="detail-row">
          <strong>Status</strong>
          <span>${capitalize(request.status)}</span>
        </div>

        ${
          request.claimedBy
            ? `
              <div class="detail-row">
                <strong>Handled by</strong>
                <span>${escapeHTML(request.claimedBy)}</span>
              </div>
            `
            : ""
        }

        <div class="modal-actions">
          ${
            request.status === "open"
              ? `
                <button
                  class="btn btn-primary"
                  onclick="claimRequest('${request.id}')"
                >
                  Claim Request
                </button>
              `
              : ""
          }

          ${
            request.status === "claimed"
              ? `
                <button
                  class="btn btn-success"
                  onclick="resolveRequest('${request.id}')"
                >
                  Mark Resolved
                </button>
              `
              : ""
          }

          <button
            class="btn btn-secondary"
            onclick="focusMap(${request.lat}, ${request.lng}); closeModal('requestDetailsModal')"
          >
            View on Map
          </button>
        </div>
      </div>
    `;
  }

  openModal("requestDetailsModal");
}

/* ---------------- FILTERS ---------------- */

function setupFilters() {
  document.addEventListener("input", event => {
    if (
      event.target.matches(
        "[data-filter-search], #requestSearch, #shelterSearch, #missingSearch"
      )
    ) {
      renderEverything();
    }
  });

  document.addEventListener("change", event => {
    if (
      event.target.matches(
        "[data-filter], #requestStatusFilter, #severityFilter, #shelterFilter, #missingStatusFilter"
      )
    ) {
      renderEverything();
    }
  });
}

function getFilteredRequests() {
  const search =
    getValue([
      "#requestSearch",
      "[data-filter-search]"
    ]).toLowerCase();

  const severity =
    getValue([
      "#severityFilter"
    ]).toLowerCase();

  const status =
    getValue([
      "#requestStatusFilter"
    ]).toLowerCase();

  return state.requests.filter(request => {
    const matchesSearch =
      !search ||
      request.title.toLowerCase().includes(search) ||
      request.location.toLowerCase().includes(search) ||
      request.type.toLowerCase().includes(search);

    const matchesSeverity =
      !severity ||
      severity === "all" ||
      request.severity === severity;

    const matchesStatus =
      !status ||
      status === "all" ||
      request.status === status;

    return (
      matchesSearch &&
      matchesSeverity &&
      matchesStatus
    );
  });
}

/* ---------------- RENDER ---------------- */

function renderEverything() {
  renderRequests();
  renderShelters();
  renderMissingPersons();
  renderDashboard();
  renderStats();
  renderMapMarkers();
}

function renderRequests() {
  const containers = document.querySelectorAll(
    "[data-requests-list], #requestsList, #requestList"
  );

  if (!containers.length) return;

  const requests = getFilteredRequests();

  containers.forEach(container => {
    if (!requests.length) {
      container.innerHTML = emptyState(
        "No requests found",
        "Try changing your filters or create a new emergency request."
      );
      return;
    }

    container.innerHTML = requests
      .map(requestCard)
      .join("");
  });
}

function requestCard(request) {
  const elapsed = formatTimeAgo(request.createdAt);

  return `
    <article class="request-card ${request.severity}">
      <div class="request-card-top">
        <span class="status-badge ${request.severity}">
          ${capitalize(request.severity)}
        </span>

        <span class="request-time">
          ${elapsed}
        </span>
      </div>

      <div class="request-icon">
        ${getRequestIcon(request.type)}
      </div>

      <h3>${escapeHTML(request.title)}</h3>

      <p>
        ${escapeHTML(request.description)}
      </p>

      <div class="request-meta">
        <span>📍 ${escapeHTML(request.location)}</span>
        <span>🆘 ${escapeHTML(request.type)}</span>
      </div>

      <div class="request-status">
        <span class="status-dot ${request.status}"></span>
        ${capitalize(request.status)}
        ${
          request.claimedBy
            ? ` · ${escapeHTML(request.claimedBy)}`
            : ""
        }
      </div>

      <div class="request-actions">
        <button
          class="btn btn-secondary"
          onclick="openRequest('${request.id}')"
        >
          View
        </button>

        ${
          request.status === "open"
            ? `
              <button
                class="btn btn-primary"
                onclick="claimRequest('${request.id}')"
              >
                Claim
              </button>
            `
            : ""
        }

        ${
          request.status === "claimed"
            ? `
              <button
                class="btn btn-success"
                onclick="resolveRequest('${request.id}')"
              >
                Resolve
              </button>
            `
            : ""
        }

        <button
          class="btn btn-ghost"
          onclick="focusMap(${request.lat}, ${request.lng})"
        >
          Map
        </button>
      </div>
    </article>
  `;
}

function renderShelters() {
  const containers = document.querySelectorAll(
    "[data-shelters-list], #sheltersList, #shelterList"
  );

  if (!containers.length) return;

  const search = getValue([
    "#shelterSearch"
  ]).toLowerCase();

  const filter = getValue([
    "#shelterFilter"
  ]).toLowerCase();

  let shelters = state.shelters.filter(shelter => {
    const available =
      shelter.capacity - shelter.occupied;

    const matchesSearch =
      !search ||
      shelter.name.toLowerCase().includes(search) ||
      shelter.address.toLowerCase().includes(search);

    const matchesFilter =
      !filter ||
      filter === "all" ||
      (filter === "available" && available > 0) ||
      (filter === "full" && available <= 0) ||
      shelter.status === filter;

    return matchesSearch && matchesFilter;
  });

  containers.forEach(container => {
    container.innerHTML = shelters.length
      ? shelters.map(shelterCard).join("")
      : emptyState(
          "No shelters found",
          "Try another search or availability filter."
        );
  });
}

function shelterCard(shelter) {
  const available =
    Math.max(
      shelter.capacity - shelter.occupied,
      0
    );

  const percentage =
    Math.min(
      Math.round(
        (shelter.occupied / shelter.capacity) * 100
      ),
      100
    );

  const availabilityClass =
    percentage >= 90
      ? "danger"
      : percentage >= 70
      ? "warning"
      : "good";

  return `
    <article class="shelter-card">
      <div class="shelter-card-header">
        <div>
          <span class="shelter-label">SHELTER</span>
          <h3>${escapeHTML(shelter.name)}</h3>
        </div>

        <span class="status-badge ${availabilityClass}">
          ${
            available > 0
              ? `${available} spaces`
              : "Full"
          }
        </span>
      </div>

      <p class="shelter-address">
        📍 ${escapeHTML(shelter.address)}
      </p>

      <div class="capacity-info">
        <div>
          <span>Capacity</span>
          <strong>
            ${shelter.occupied}/${shelter.capacity}
          </strong>
        </div>

        <span>${percentage}%</span>
      </div>

      <div class="capacity-bar">
        <span
          style="width:${percentage}%"
        ></span>
      </div>

      <div class="shelter-actions">
        <button
          class="btn btn-primary"
          onclick="focusShelter(${shelter.id})"
        >
          View Map
        </button>

        <button
          class="btn btn-secondary"
          onclick="showShelterDetails(${shelter.id})"
        >
          Details
        </button>
      </div>
    </article>
  `;
}

function showShelterDetails(id) {
  const shelter = state.shelters.find(
    item => item.id === id
  );

  if (!shelter) return;

  showToast(
    `${shelter.name}: ${shelter.capacity - shelter.occupied} spaces available`,
    "info"
  );
}

/* ---------------- MISSING PERSONS ---------------- */

function handleMissingPersonSubmit(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const data = new FormData(form);

  const imageInput = form.querySelector(
    'input[type="file"]'
  );

  const file = imageInput?.files?.[0];

  if (file && file.size > 2 * 1024 * 1024) {
    showToast(
      "Image must be smaller than 2 MB.",
      "error"
    );
    return;
  }

  const createPerson = image => {
    const person = {
      id: generateId("MP"),
      name: data.get("name") || "Unknown",
      age: Number(data.get("age")) || null,
      gender: data.get("gender") || "",
      location: data.get("location") || "",
      description: data.get("description") || "",
      image: image || "",
      status: "missing",
      createdAt: Date.now()
    };

    state.missingPersons.unshift(person);

    saveState();
    renderMissingPersons();

    form.reset();

    closeModal("missingPersonModal");

    showToast(
      "Missing-person report published.",
      "success"
    );
  };

  if (file) {
    const reader = new FileReader();

    reader.onload = () => {
      createPerson(reader.result);
    };

    reader.readAsDataURL(file);
  } else {
    createPerson("");
  }
}

function renderMissingPersons() {
  const containers = document.querySelectorAll(
    "[data-missing-list], #missingList, #missingPersonsList"
  );

  if (!containers.length) return;

  const search = getValue([
    "#missingSearch"
  ]).toLowerCase();

  const status = getValue([
    "#missingStatusFilter"
  ]).toLowerCase();

  const people = state.missingPersons.filter(person => {
    const matchesSearch =
      !search ||
      person.name.toLowerCase().includes(search) ||
      person.location.toLowerCase().includes(search);

    const matchesStatus =
      !status ||
      status === "all" ||
      person.status === status;

    return matchesSearch && matchesStatus;
  });

  containers.forEach(container => {
    container.innerHTML = people.length
      ? people.map(missingPersonCard).join("")
      : emptyState(
          "No matching reports",
          "Try another search."
        );
  });
}

function missingPersonCard(person) {
  const initials = getInitials(person.name);

  return `
    <article class="missing-card">
      <div class="missing-photo">
        ${
          person.image
            ? `<img src="${person.image}" alt="${escapeHTML(person.name)}">`
            : `<span>${initials}</span>`
        }
      </div>

      <div class="missing-info">
        <div class="missing-card-top">
          <span class="status-badge ${person.status}">
            ${capitalize(person.status)}
          </span>

          <span>
            ${formatTimeAgo(person.createdAt)}
          </span>
        </div>

        <h3>${escapeHTML(person.name)}</h3>

        <p>
          ${person.age ? `${person.age} years` : ""}
          ${person.gender ? ` · ${escapeHTML(person.gender)}` : ""}
        </p>

        <p>
          📍 ${escapeHTML(person.location)}
        </p>

        <p>
          ${escapeHTML(person.description)}
        </p>

        ${
          person.status === "missing"
            ? `
              <button
                class="btn btn-success"
                onclick="markPersonFound('${person.id}')"
              >
                Mark Found
              </button>
            `
            : ""
        }
      </div>
    </article>
  `;
}

function markPersonFound(id) {
  const person = state.missingPersons.find(
    item => item.id === id
  );

  if (!person) return;

  person.status = "found";

  saveState();
  renderMissingPersons();

  showToast(
    `${person.name} marked as found.`,
    "success"
  );
}

/* ---------------- SOS ---------------- */

function setupSOS() {
  document.querySelectorAll("[data-sos]").forEach(button => {
    button.addEventListener("click", triggerSOS);
  });
}

function triggerSOS() {
  const confirmed = window.confirm(
    "Send an emergency SOS with your current location?"
  );

  if (!confirmed) return;

  const createAlert = (
    latitude = null,
    longitude = null
  ) => {
    const alert = {
      id: generateId("SOS"),
      lat: latitude,
      lng: longitude,
      createdAt: Date.now(),
      status: "active"
    };

    state.sosAlerts.unshift(alert);

    saveState();

    if (
      latitude &&
      longitude &&
      map
    ) {
      focusMap(
        latitude,
        longitude,
        16
      );

      if (userMarker) {
        userMarker.remove();
      }

      userMarker = L.marker([
        latitude,
        longitude
      ])
        .addTo(map)
        .bindPopup(
          "🚨 SOS location"
        )
        .openPopup();
    }

    showToast(
      "SOS sent. Help has been alerted.",
      "success"
    );
  };

  if (!navigator.geolocation) {
    createAlert();
    return;
  }

  navigator.geolocation.getCurrentPosition(
    position => {
      createAlert(
        position.coords.latitude,
        position.coords.longitude
      );
    },
    () => {
      createAlert();
    },
    {
      enableHighAccuracy: true,
      timeout: 8000
    }
  );
}

/* ---------------- DASHBOARD ---------------- */

function renderDashboard() {
  const total =
    state.requests.length;

  const unresolved =
    state.requests.filter(
      request =>
        request.status !== "resolved"
    ).length;

  const critical =
    state.requests.filter(
      request =>
        request.severity === "critical" &&
        request.status !== "resolved"
    ).length;

  const resolved =
    state.requests.filter(
      request =>
        request.status === "resolved"
    ).length;

  setText(
    "[data-total-requests]",
    total
  );

  setText(
    "[data-unresolved]",
    unresolved
  );

  setText(
    "[data-critical]",
    critical
  );

  setText(
    "[data-resolved]",
    resolved
  );

  renderAreaBreakdown();
}

function renderAreaBreakdown() {
  const containers = document.querySelectorAll(
    "[data-area-breakdown], #areaBreakdown"
  );

  if (!containers.length) return;

  const areas = {};

  state.requests.forEach(request => {
    const area = request.location || "Unknown";

    if (!areas[area]) {
      areas[area] = {
        total: 0,
        unresolved: 0,
        critical: 0
      };
    }

    areas[area].total++;

    if (request.status !== "resolved") {
      areas[area].unresolved++;
    }

    if (
      request.severity === "critical" &&
      request.status !== "resolved"
    ) {
      areas[area].critical++;
    }
  });

  const sorted = Object.entries(areas)
    .sort(
      (a, b) =>
        b[1].unresolved -
        a[1].unresolved
    );

  containers.forEach(container => {
    container.innerHTML = sorted.length
      ? sorted
          .map(
            ([area, data]) => `
              <div class="area-row">
                <div>
                  <strong>
                    ${escapeHTML(area)}
                  </strong>
                  <small>
                    ${data.unresolved} unresolved
                  </small>
                </div>

                <span class="severity-count">
                  ${data.critical} critical
                </span>
              </div>
            `
          )
          .join("")
      : emptyState(
          "No data yet",
          "Requests will appear here automatically."
        );
  });
}

function renderStats() {
  const activeRequests =
    state.requests.filter(
      request =>
        request.status !== "resolved"
    );

  const criticalRequests =
    activeRequests.filter(
      request =>
        request.severity === "critical"
    );

  const availableBeds =
    state.shelters.reduce(
      (total, shelter) =>
        total +
        Math.max(
          shelter.capacity -
            shelter.occupied,
          0
        ),
      0
    );

  setText(
    "[data-active-count]",
    activeRequests.length
  );

  setText(
    "[data-critical-count]",
    criticalRequests.length
  );

  setText(
    "[data-bed-count]",
    availableBeds
  );

  setText(
    "[data-missing-count]",
    state.missingPersons.filter(
      person =>
        person.status === "missing"
    ).length
  );
}

/* ---------------- MODALS ---------------- */

function setupModals() {
  document.addEventListener("click", event => {
    const openTarget =
      event.target.closest(
        "[data-modal-open]"
      );

    const closeTarget =
      event.target.closest(
        "[data-modal-close]"
      );

    if (openTarget) {
      openModal(
        openTarget.dataset.modalOpen
      );
    }

    if (closeTarget) {
      closeModal(
        closeTarget.dataset.modalClose
      );
    }

    if (
      event.target.classList.contains(
        "modal"
      )
    ) {
      event.target.classList.remove(
        "open"
      );
    }
  });

  document.addEventListener(
    "keydown",
    event => {
      if (event.key === "Escape") {
        document
          .querySelectorAll(".modal.open")
          .forEach(modal => {
            modal.classList.remove(
              "open"
            );
          });
      }
    }
  );
}

function openModal(id) {
  const modal =
    document.getElementById(id);

  if (!modal) return;

  modal.classList.add("open");
  document.body.classList.add(
    "modal-open"
  );

  const firstInput =
    modal.querySelector(
      "input, textarea, select, button"
    );

  if (firstInput) {
    setTimeout(
      () => firstInput.focus(),
      100
    );
  }
}

function closeModal(id) {
  const modal =
    document.getElementById(id);

  if (!modal) return;

  modal.classList.remove(
    "open"
  );

  if (
    !document.querySelector(
      ".modal.open"
    )
  ) {
    document.body.classList.remove(
      "modal-open"
    );
  }
}

/* ---------------- MOBILE MENU ---------------- */

function setupMobileMenu() {
  const toggle =
    document.querySelector(
      "[data-menu-toggle]"
    );

  const menu =
    document.querySelector(
      "[data-mobile-menu]"
    );

  if (!toggle || !menu) return;

  toggle.addEventListener(
    "click",
    () => {
      menu.classList.toggle(
        "open"
      );

      toggle.setAttribute(
        "aria-expanded",
        menu.classList.contains(
          "open"
        )
      );
    }
  );
}

function closeMobileMenu() {
  const menu =
    document.querySelector(
      "[data-mobile-menu]"
    );

  if (menu) {
    menu.classList.remove(
      "open"
    );
  }
}

/* ---------------- CONNECTION ---------------- */

function updateConnectionStatus() {
  const online =
    navigator.onLine;

  document
    .querySelectorAll(
      "[data-connection-status]"
    )
    .forEach(element => {
      element.textContent = online
        ? "Online"
        : "Offline";

      element.classList.toggle(
        "offline",
        !online
      );
    });

  if (!online) {
    showToast(
      "You are offline. New data will remain on this device until connection returns.",
      "warning"
    );
  }
}

/* ---------------- HELPERS ---------------- */

function generateId(prefix) {
  return `${prefix}-${Date.now()
    .toString(36)
    .toUpperCase()}-${Math.random()
    .toString(36)
    .slice(2, 7)
    .toUpperCase()}`;
}

function capitalize(value = "") {
  return value.charAt(0).toUpperCase() +
    value.slice(1);
}

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getInitials(name = "") {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map(word => word[0])
    .join("")
    .toUpperCase();
}

function getRequestIcon(type) {
  const icons = {
    Food: "🍱",
    Water: "💧",
    Medical: "🏥",
    Rescue: "🚨",
    Shelter: "🏠",
    Other: "⚠️"
  };

  return icons[type] || icons.Other;
}

function formatTimeAgo(timestamp) {
  const seconds =
    Math.floor(
      (Date.now() - timestamp) /
        1000
    );

  if (seconds < 60) {
    return "Just now";
  }

  const minutes =
    Math.floor(seconds / 60);

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours =
    Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days =
    Math.floor(hours / 24);

  return `${days}d ago`;
}

function getValue(selectors) {
  for (const selector of selectors) {
    const element =
      document.querySelector(selector);

    if (element) {
      return element.value || "";
    }
  }

  return "";
}

function setText(selector, value) {
  document
    .querySelectorAll(selector)
    .forEach(element => {
      element.textContent = value;
    });
}

function emptyState(title, description) {
  return `
    <div class="empty-state">
      <div class="empty-icon">📭</div>
      <h3>${escapeHTML(title)}</h3>
      <p>${escapeHTML(description)}</p>
    </div>
  `;
}

/* ---------------- TOAST ---------------- */

function showToast(
  message,
  type = "info"
) {
  let container =
    document.querySelector(
      "#toastContainer"
    );

  if (!container) {
    container =
      document.createElement("div");

    container.id =
      "toastContainer";

    container.className =
      "toast-container";

    document.body.appendChild(
      container
    );
  }

  const toast =
    document.createElement("div");

  toast.className =
    `toast toast-${type}`;

  toast.innerHTML = `
    <span class="toast-icon">
      ${getToastIcon(type)}
    </span>

    <span class="toast-message">
      ${escapeHTML(message)}
    </span>

    <button
      class="toast-close"
      aria-label="Close notification"
    >
      ×
    </button>
  `;

  container.appendChild(toast);

  const closeButton =
    toast.querySelector(
      ".toast-close"
    );

  closeButton.addEventListener(
    "click",
    () => toast.remove()
  );

  setTimeout(() => {
    toast.classList.add(
      "hide"
    );

    setTimeout(
      () => toast.remove(),
      300
    );
  }, 4500);
}

function getToastIcon(type) {
  const icons = {
    success: "✓",
    error: "!",
    warning: "⚠",
    info: "i"
  };

  return icons[type] || "i";
}

/* ---------------- CROSS TAB SYNC ---------------- */

if ("BroadcastChannel" in window) {
  try {
    const channel =
      new BroadcastChannel(
        "sethu_sync"
      );

    channel.addEventListener(
      "message",
      event => {
        if (!event.data) return;

        state = {
          ...state,
          ...event.data
        };

        renderEverything();
      }
    );
  } catch (error) {
    console.warn(
      "Cross-tab sync unavailable."
    );
  }
}

window.addEventListener(
  "storage",
  event => {
    if (
      event.key !== STORAGE_KEY ||
      !event.newValue
    ) {
      return;
    }

    try {
      state = JSON.parse(
        event.newValue
      );

      renderEverything();
    } catch (error) {
      console.warn(
        "Storage synchronization failed."
      );
    }
  }
);

/* ---------------- GLOBAL API ---------------- */

window.openRequest =
  openRequest;

window.claimRequest =
  claimRequest;

window.resolveRequest =
  resolveRequest;

window.focusMap =
  focusMap;

window.focusShelter =
  focusShelter;

window.showShelterDetails =
  showShelterDetails;

window.markPersonFound =
  markPersonFound;

window.openModal =
  openModal;

window.closeModal =
  closeModal;

window.getUserLocation =
  getUserLocation;

window.triggerSOS =
  triggerSOS;