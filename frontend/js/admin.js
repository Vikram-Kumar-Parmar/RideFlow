import { api, requireRole, logout, fmtMoney, fmtDate, escape } from '/js/api.js';

const me = requireRole('ADMIN') || requireRole('SUPER_ADMIN');
document.getElementById('who').textContent = `${me.full_name} (${me.role})`;
document.getElementById('logoutBtn').addEventListener('click', logout);

const tabs = document.querySelectorAll('.tabs button');
tabs.forEach((b) => {
  b.addEventListener('click', () => {
    tabs.forEach((x) => x.classList.toggle('active', x === b));
    document.querySelectorAll('main > section').forEach((s) => {
      s.classList.toggle('hide', s.id !== `tab-${b.dataset.tab}`);
    });
    LOADERS[b.dataset.tab]?.();
  });
});

const LOADERS = {
  dash: loadDash, users: loadUsers, vehicles: loadVehicles,
  fares: loadFares, reports: loadReports, alerts: loadAlerts,
};

function table(rows, cols, empty) {
  if (!rows.length) return `<p style="color:var(--muted)">${empty || 'No data.'}</p>`;
  return `<table><thead><tr>${cols.map((c) => `<th>${c.h}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${cols.map((c) => `<td>${c.f ? c.f(r) : escape(r[c.k])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

// ---- DASH --------------------------------------------------------
async function loadDash() {
  const s = await api('/api/admin/reports/summary');
  document.getElementById('kpis').innerHTML = `
    <div class="kpi"><div class="label">Users</div><div class="value">${s.users}</div></div>
    <div class="kpi"><div class="label">Drivers</div><div class="value">${s.drivers}</div></div>
    <div class="kpi"><div class="label">Total rides</div><div class="value">${s.rides}</div></div>
    <div class="kpi"><div class="label">Completed</div><div class="value">${s.completed_rides}</div></div>
    <div class="kpi"><div class="label">Revenue (paid)</div><div class="value">${fmtMoney(s.total_revenue)}</div></div>
    <div class="kpi"><div class="label">Flagged drivers</div><div class="value">${s.flagged_drivers}</div></div>
  `;
  const active = await api('/api/admin/reports/active-rides');
  document.getElementById('activeTable').innerHTML = table(active, [
    { h: '#', k: 'ride_id' }, { h: 'Status', k: 'ride_status' },
    { h: 'Rider', k: 'rider_name' }, { h: 'Driver', k: 'driver_name' },
    { h: 'Vehicle', f: (r) => `${escape(r.vehicle_make)} ${escape(r.vehicle_model)} (${escape(r.license_plate)})` },
    { h: 'Pickup→Drop', f: (r) => `${escape(r.pickup_city)} → ${escape(r.dropoff_city)}` },
    { h: 'Fare', f: (r) => fmtMoney(r.fare) },
  ], 'No active rides.');

  const top = await api('/api/admin/reports/top-drivers');
  document.getElementById('topDriversTable').innerHTML = table(top, [
    { h: 'Driver', k: 'driver_name' }, { h: 'Email', k: 'email' },
    { h: 'Avg rating', f: (r) => Number(r.avg_rating).toFixed(2) },
    { h: 'Trips', k: 'total_trips' },
    { h: 'Status', k: 'avail_status' },
  ], 'No drivers above 4.5 yet.');
}

// ---- USERS -------------------------------------------------------
async function loadUsers() {
  const rows = await api('/api/admin/users');
  document.getElementById('usersTable').innerHTML = table(rows, [
    { h: '#', k: 'user_id' }, { h: 'Name', k: 'full_name' },
    { h: 'Email', k: 'email' }, { h: 'Phone', k: 'phone' },
    { h: 'Role', k: 'role' },
    { h: 'Status', f: (r) => `<span class="pill ${r.acc_status === 'ACTIVE' ? 'ok' : 'bad'}">${escape(r.acc_status)}</span>` },
    { h: 'Wallet', f: (r) => fmtMoney(r.wallet_balance) },
    { h: 'Joined', f: (r) => fmtDate(r.reg_date) },
    {
      h: 'Action',
      f: (r) => `
        <select data-uid="${r.user_id}" class="user-status">
          ${['ACTIVE','SUSPENDED','BANNED'].map((s) =>
            `<option ${r.acc_status===s?'selected':''}>${s}</option>`).join('')}
        </select>`,
    },
  ]);
  document.querySelectorAll('.user-status').forEach((el) => {
    el.addEventListener('change', async () => {
      try {
        await api(`/api/admin/users/${el.dataset.uid}/status`, {
          method: 'PUT', body: JSON.stringify({ acc_status: el.value }),
        });
      } catch (e) { alert(e.message); }
    });
  });
}

// ---- VEHICLES ----------------------------------------------------
async function loadVehicles() {
  const rows = await api('/api/admin/vehicles');
  document.getElementById('vehiclesTable').innerHTML = table(rows, [
    { h: '#', k: 'vehicle_id' }, { h: 'Driver', k: 'driver_name' },
    { h: 'Make', k: 'make' }, { h: 'Model', k: 'model' },
    { h: 'Year', k: 'vehicle_year' }, { h: 'Plate', k: 'license_plate' },
    { h: 'Type', k: 'vehicle_type' },
    {
      h: 'Verification',
      f: (r) => `
        <select data-vid="${r.vehicle_id}" class="veh-verif">
          ${['PENDING','VERIFIED','REJECTED'].map((s) =>
            `<option ${r.verif_status===s?'selected':''}>${s}</option>`).join('')}
        </select>`,
    },
  ]);
  document.querySelectorAll('.veh-verif').forEach((el) => {
    el.addEventListener('change', async () => {
      try {
        await api(`/api/admin/vehicles/${el.dataset.vid}/verify`, {
          method: 'PUT', body: JSON.stringify({ verif_status: el.value }),
        });
      } catch (e) { alert(e.message); }
    });
  });
}

// ---- FARES -------------------------------------------------------
async function loadFares() {
  const rows = await api('/api/admin/fare-rules');
  document.getElementById('faresTable').innerHTML = `
    ${rows.map((r) => `
      <form class="row" data-rid="${r.rule_id}">
        <div style="width:120px"><label>Type</label><input value="${r.vehicle_type}" disabled /></div>
        <div style="width:120px"><label>Base</label><input name="base_rate" value="${r.base_rate}" /></div>
        <div style="width:120px"><label>Per km</label><input name="per_km_rate" value="${r.per_km_rate}" /></div>
        <div style="width:120px"><label>Per min</label><input name="per_min_rate" value="${r.per_min_rate}" /></div>
        <div style="width:120px"><label>Surge ×</label><input name="surge_multiplier" value="${r.surge_multiplier}" /></div>
        <div style="width:120px"><label>Surge active?</label>
          <select name="is_surge_active">
            <option value="0" ${!r.is_surge_active?'selected':''}>No</option>
            <option value="1" ${r.is_surge_active?'selected':''}>Yes</option>
          </select>
        </div>
        <div><button class="btn">Save</button></div>
      </form>`).join('')}`;
  document.querySelectorAll('#faresTable form').forEach((f) => {
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(f);
      try {
        await api(`/api/admin/fare-rules/${f.dataset.rid}`, {
          method: 'PUT', body: JSON.stringify({
            base_rate: Number(fd.get('base_rate')),
            per_km_rate: Number(fd.get('per_km_rate')),
            per_min_rate: Number(fd.get('per_min_rate')),
            surge_multiplier: Number(fd.get('surge_multiplier')),
            is_surge_active: fd.get('is_surge_active') === '1',
          }),
        });
        alert('Saved.');
      } catch (e) { alert(e.message); }
    });
  });
}

// ---- REPORTS -----------------------------------------------------
async function loadReports() {
  const [revenue, trips, lowRated, fullTrips, allRiders, promo] = await Promise.all([
    api('/api/admin/reports/revenue-per-city'),
    api('/api/admin/reports/trips-per-driver'),
    api('/api/admin/reports/low-rated-drivers'),
    api('/api/admin/reports/full-trip-report'),
    api('/api/admin/reports/all-riders-with-rides'),
    api('/api/admin/reports/promo-discount-usage'),
  ]);
  document.getElementById('revenueTable').innerHTML = table(revenue, [
    { h: 'City', k: 'city' }, { h: 'Paid rides', k: 'paid_rides' },
    { h: 'Total revenue', f: (r) => fmtMoney(r.total_revenue) },
  ]);
  document.getElementById('tripsTable').innerHTML = table(trips, [
    { h: 'Driver', k: 'driver_name' }, { h: 'Completed trips', k: 'completed_trips' },
    { h: 'Total fare', f: (r) => fmtMoney(r.total_fare_value) },
  ]);
  document.getElementById('lowRatedTable').innerHTML = table(lowRated, [
    { h: 'Driver', k: 'full_name' },
    { h: 'Avg score', f: (r) => Number(r.avg_score).toFixed(2) },
    { h: 'Ratings', k: 'rating_count' },
  ], 'No drivers below 3.5 yet.');
  document.getElementById('fullTripTable').innerHTML = table(fullTrips, [
    { h: '#', k: 'ride_id' }, { h: 'When', f: (r) => fmtDate(r.requested_at) },
    { h: 'Rider', k: 'rider_name' }, { h: 'Driver', k: 'driver_name' },
    { h: 'Vehicle', f: (r) => `${escape(r.make)} ${escape(r.model)}` },
    { h: 'Plate', k: 'license_plate' }, { h: 'Type', k: 'vehicle_type' },
    { h: 'Pickup→Drop', f: (r) => `${escape(r.pickup_city)} → ${escape(r.dropoff_city)}` },
    { h: 'Status', k: 'ride_status' }, { h: 'Fare', f: (r) => fmtMoney(r.fare) },
  ]);
  document.getElementById('allRidersTable').innerHTML = table(allRiders, [
    { h: '#', k: 'user_id' }, { h: 'Name', k: 'full_name' }, { h: 'Email', k: 'email' },
    { h: 'Completed rides', k: 'completed_rides' },
  ]);
  document.getElementById('promoTable').innerHTML = table(promo, [
    { h: 'Payment #', k: 'payment_id' }, { h: 'Ride', k: 'ride_id' },
    { h: 'Promo', k: 'code' }, { h: 'Discount %', k: 'discount_pct' },
    { h: 'Discount Rs', f: (r) => fmtMoney(r.promo_discount) },
    { h: 'Net charged', f: (r) => fmtMoney(r.amount) },
    { h: 'When', f: (r) => fmtDate(r.txn_date) },
  ], 'No promo-coded payments yet.');

  // Rider picker
  const riders = allRiders.map((r) => `<option value="${r.user_id}">${escape(r.full_name)} (#${r.user_id})</option>`).join('');
  document.getElementById('riderPicker').innerHTML = riders || `<option value="">No riders</option>`;
  document.getElementById('loadRiderRides').onclick = async () => {
    const id = document.getElementById('riderPicker').value;
    if (!id) return;
    const rows = await api(`/api/admin/reports/completed-rides?rider_id=${id}`);
    document.getElementById('riderRidesTable').innerHTML = table(rows, [
      { h: '#', k: 'ride_id' }, { h: 'When', f: (r) => fmtDate(r.requested_at) },
      { h: 'Driver', k: 'driver_name' },
      { h: 'Distance', f: (r) => `${Number(r.distance_km).toFixed(1)} km` },
      { h: 'Fare', f: (r) => fmtMoney(r.fare) },
    ]);
  };
  document.getElementById('loadDriversCity').onclick = async () => {
    const c = document.getElementById('cityInput').value.trim();
    if (!c) return;
    const rows = await api(`/api/admin/reports/drivers-by-city?city=${encodeURIComponent(c)}`);
    document.getElementById('driversCityTable').innerHTML = table(rows, [
      { h: 'Driver', k: 'full_name' },
      { h: 'Avg rating', f: (r) => Number(r.avg_rating).toFixed(2) },
      { h: 'Trips', k: 'total_trips' },
      { h: 'Status', k: 'avail_status' },
    ], 'No drivers found in that city.');
  };
}

// ---- ALERTS ------------------------------------------------------
async function loadAlerts() {
  const rows = await api('/api/admin/notifications');
  document.getElementById('alertsTable').innerHTML = table(rows, [
    { h: '#', k: 'notification_id' },
    { h: 'When', f: (r) => fmtDate(r.created_at) },
    { h: 'Message', k: 'message' },
    { h: 'Related user', k: 'related_user_name' },
  ], 'No notifications yet — flag a driver to test.');
}

loadDash();
