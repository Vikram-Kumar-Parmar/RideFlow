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
  dash: loadDash, users: loadUsers, drivers: loadDrivers, vehicles: loadVehicles,
  fares: loadFares, reports: loadReports, alerts: loadAlerts,
  promos: loadPromos, complaints: loadComplaints, payouts: loadPayouts,
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

// ---- DRIVERS -----------------------------------------------------
async function loadDrivers() {
  const rows = await api('/api/admin/drivers');
  document.getElementById('driversTable').innerHTML = table(rows, [
    { h: '#', k: 'driver_id' }, { h: 'Name', k: 'full_name' },
    { h: 'Email', k: 'email' }, { h: 'Phone', k: 'phone' },
    { h: 'License', k: 'license_num' }, { h: 'CNIC', k: 'cnic' },
    { h: 'Avail', f: (r) => `<span class="pill ${r.avail_status === 'ONLINE' ? 'ok' : (r.avail_status === 'ON_TRIP' ? 'warn' : 'bad')}">${escape(r.avail_status)}</span>` },
    { h: 'Avg', f: (r) => Number(r.avg_rating).toFixed(2) },
    { h: 'Trips', k: 'total_trips' },
    { h: 'Flagged', f: (r) => r.is_flagged ? `<span class="pill bad">FLAGGED</span>` : '—' },
    {
      h: 'Verification',
      f: (r) => `
        <select data-did="${r.driver_id}" class="drv-verif">
          ${['PENDING','VERIFIED','REJECTED'].map((s) =>
            `<option ${r.verif_status===s?'selected':''}>${s}</option>`).join('')}
        </select>`,
    },
    {
      h: 'Action',
      f: (r) => r.is_flagged
        ? `<button class="btn secondary drv-unflag" data-did="${r.driver_id}">Unflag</button>`
        : '',
    },
  ], 'No drivers yet — register one from the Sign-up page.');
  document.querySelectorAll('.drv-verif').forEach((el) => {
    el.addEventListener('change', async () => {
      try {
        await api(`/api/admin/drivers/${el.dataset.did}/verify`, {
          method: 'PUT', body: JSON.stringify({ verif_status: el.value }),
        });
      } catch (e) { alert(e.message); }
    });
  });
  document.querySelectorAll('.drv-unflag').forEach((el) => {
    el.addEventListener('click', async () => {
      try {
        await api(`/api/admin/drivers/${el.dataset.did}/unflag`, { method: 'PUT' });
        loadDrivers();
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

  // Revenue by payment method
  const revenueByMethod = await api('/api/admin/reports/revenue-by-method');
  document.getElementById('revenueMethodTable').innerHTML = table(revenueByMethod, [
    { h: 'Payment Method', k: 'payment_method' },
    { h: 'Transactions', k: 'total_transactions' },
    { h: 'Total Revenue', f: (r) => fmtMoney(r.total_revenue) },
  ], 'No paid transactions yet.');

  // Refunds & failed payments
  const refData = await api('/api/admin/reports/refunds');
  document.getElementById('refundsTable').innerHTML = `
    <table><thead><tr><th>Metric</th><th>Count</th><th>Total Amount</th></tr></thead><tbody>
      <tr><td>Refunds</td><td>${refData.refunds.refund_count}</td><td>${fmtMoney(refData.refunds.total_refunded)}</td></tr>
      <tr><td>Failed Payments</td><td>${refData.failed_payments.failed_count}</td><td>${fmtMoney(refData.failed_payments.total_failed)}</td></tr>
    </tbody></table>
    ${refData.complaints_by_status.length ? `
      <h4 style="margin-top:16px; font-size:13px; color:var(--muted); text-transform:uppercase; letter-spacing:.5px;">Complaints by Status</h4>
      <table><thead><tr><th>Status</th><th>Count</th></tr></thead><tbody>
        ${refData.complaints_by_status.map((c) => `<tr><td>${escape(c.comp_status)}</td><td>${c.count}</td></tr>`).join('')}
      </tbody></table>` : ''}`;
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

// ---- PROMO CODES -------------------------------------------------
async function loadPromos() {
  const rows = await api('/api/admin/promo-codes');
  document.getElementById('promoListTable').innerHTML = table(rows, [
    { h: '#', k: 'promo_id' }, { h: 'Code', k: 'code' },
    { h: 'Discount %', k: 'discount_pct' },
    { h: 'Valid Until', k: 'valid_until' },
    { h: 'Max Uses', k: 'max_uses' }, { h: 'Used', k: 'usage_count' },
    { h: 'Active', f: (r) => r.is_active
      ? `<span class="pill ok">YES</span>`
      : `<span class="pill bad">NO</span>` },
    { h: 'Action', f: (r) => r.is_active
      ? `<button class="btn danger" style="font-size:12px; padding:4px 10px;" data-promo-deact="${r.promo_id}">Deactivate</button>`
      : '' },
  ], 'No promo codes yet.');

  document.querySelectorAll('[data-promo-deact]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await api(`/api/admin/promo-codes/${btn.dataset.promoDeact}`, {
          method: 'PUT', body: JSON.stringify({ is_active: false }),
        });
        loadPromos();
      } catch (e) { alert(e.message); }
    });
  });
}

document.getElementById('promoForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('promoMsg');
  const fd = new FormData(e.target);
  const body = Object.fromEntries(fd);
  body.discount_pct = Number(body.discount_pct);
  body.max_uses = Number(body.max_uses);
  try {
    await api('/api/admin/promo-codes', { method: 'POST', body: JSON.stringify(body) });
    msg.innerHTML = `<div class="status-msg ok">Promo code created.</div>`;
    e.target.reset();
    loadPromos();
  } catch (err) {
    msg.innerHTML = `<div class="status-msg err">${err.message}</div>`;
  }
});

// ---- COMPLAINTS --------------------------------------------------
async function loadComplaints() {
  const rows = await api('/api/admin/complaints');
  document.getElementById('complaintsTable').innerHTML = table(rows, [
    { h: '#', k: 'complaint_id' }, { h: 'Ride', k: 'ride_id' },
    { h: 'Filed By', k: 'filed_by_name' }, { h: 'Against', k: 'against_user_name' },
    { h: 'Description', f: (r) => `<span title="${escape(r.description)}">${escape(r.description.substring(0,60))}${r.description.length>60?'…':''}</span>` },
    { h: 'Filed At', f: (r) => fmtDate(r.filed_at) },
    {
      h: 'Status',
      f: (r) => `
        <select data-comp="${r.complaint_id}" class="comp-status">
          ${['OPEN','IN_PROGRESS','RESOLVED','REJECTED'].map((s) =>
            `<option ${r.comp_status===s?'selected':''}>${s}</option>`).join('')}
        </select>`,
    },
  ], 'No complaints filed yet.');

  document.querySelectorAll('.comp-status').forEach((el) => {
    el.addEventListener('change', async () => {
      try {
        await api(`/api/admin/complaints/${el.dataset.comp}/resolve`, {
          method: 'PUT', body: JSON.stringify({ comp_status: el.value }),
        });
      } catch (e) { alert(e.message); }
    });
  });
}

// ---- PAYOUTS -----------------------------------------------------
async function loadPayouts() {
  const rows = await api('/api/admin/payouts');
  document.getElementById('payoutsTable').innerHTML = table(rows, [
    { h: 'Earning #', k: 'earning_id' }, { h: 'Ride', k: 'ride_id' },
    { h: 'Driver', k: 'driver_name' },
    { h: 'Gross Fare', f: (r) => fmtMoney(r.gross_fare) },
    { h: 'Comm %', k: 'commission_pct' },
    { h: 'Net Earning', f: (r) => fmtMoney(r.net_earning) },
    { h: 'Earned At', f: (r) => fmtDate(r.earned_at) },
    {
      h: 'Action',
      f: (r) => `<button class="btn ok" style="font-size:12px; padding:4px 10px;" data-payout-driver="${r.driver_id}">Process All</button>`,
    },
  ], 'No pending payouts.');

  // Group by driver — clicking Process processes ALL pending for that driver.
  const processed = new Set();
  document.querySelectorAll('[data-payout-driver]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const driverId = btn.dataset.payoutDriver;
      if (processed.has(driverId)) return;
      processed.add(driverId);
      try {
        const res = await api('/api/admin/payouts/process', {
          method: 'POST', body: JSON.stringify({ driver_id: Number(driverId) }),
        });
        alert(`Processed ${res.earning_count} earning(s) totalling Rs ${res.total_paid_out.toFixed(2)} for driver #${driverId}.`);
        loadPayouts();
      } catch (e) {
        processed.delete(driverId);
        alert(e.message);
      }
    });
  });
}

loadDash();
