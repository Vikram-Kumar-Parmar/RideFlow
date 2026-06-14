import { api, requireRole, logout, fmtMoney, fmtDate, escape } from '/js/api.js';

const me = requireRole('DRIVER');
document.getElementById('who').textContent = `${me.full_name} (Driver)`;
document.getElementById('logoutBtn').addEventListener('click', logout);

const tabs = document.querySelectorAll('.tabs button');
tabs.forEach((b) => {
  b.addEventListener('click', () => {
    tabs.forEach((x) => x.classList.toggle('active', x === b));
    document.querySelectorAll('main > section').forEach((s) => {
      s.classList.toggle('hide', s.id !== `tab-${b.dataset.tab}`);
    });
    if (b.dataset.tab === 'incoming') loadIncoming();
    if (b.dataset.tab === 'earnings') loadEarnings();
    if (b.dataset.tab === 'history') loadHistory();
    if (b.dataset.tab === 'status') { loadProfile(); refreshActiveTrip(); }
    if (b.dataset.tab === 'ratings') loadRiderRateOptions();
  });
});

async function loadProfile() {
  const me2 = await api('/api/driver/me');
  if (!me2) return;
  setStatus(me2.avail_status);
  document.getElementById('profile').innerHTML = `
    <div class="kpi"><div class="label">Avg rating</div><div class="value">${Number(me2.avg_rating).toFixed(2)}</div></div>
    <div class="kpi"><div class="label">Total trips</div><div class="value">${me2.total_trips}</div></div>
    <div class="kpi"><div class="label">Wallet</div><div class="value">${fmtMoney(me2.wallet_balance)}</div></div>
    <div class="kpi"><div class="label">Verification</div><div class="value">${escape(me2.verif_status)}</div></div>
  `;
}

function setStatus(s) {
  const el = document.getElementById('curStatus');
  el.textContent = s;
  el.className = 'pill ' + (s === 'ONLINE' ? 'ok' : (s === 'ON_TRIP' ? 'warn' : 'bad'));
}

document.querySelectorAll('button[data-status]').forEach((b) => {
  b.addEventListener('click', async () => {
    const msg = document.getElementById('statusMsg');
    msg.innerHTML = '';
    try {
      const r = await api('/api/driver/availability', {
        method: 'PUT',
        body: JSON.stringify({ avail_status: b.dataset.status }),
      });
      setStatus(r.avail_status);
      msg.innerHTML = `<div class="status-msg ok">Status updated.</div>`;
    } catch (err) {
      msg.innerHTML = `<div class="status-msg err">${err.message}</div>`;
    }
  });
});

async function loadIncoming() {
  const rows = await api('/api/driver/incoming');
  const html = rows.length === 0
    ? `<p style="color:var(--muted)">No incoming requests right now (you must be ONLINE).</p>`
    : `<table><thead><tr>
        <th>#</th><th>When</th><th>Rider</th><th>Pickup</th><th>Drop-off</th>
        <th>Distance</th><th>Fare</th><th>Action</th>
      </tr></thead><tbody>${rows.map((r) => `
        <tr>
          <td>${r.ride_id}</td>
          <td>${fmtDate(r.requested_at)}</td>
          <td>${escape(r.rider_name)}<br/><small>${escape(r.rider_phone)}</small></td>
          <td>${escape(r.pickup_address)}</td>
          <td>${escape(r.dropoff_address)}</td>
          <td>${Number(r.distance_km).toFixed(1)} km · ${r.duration_min} min</td>
          <td>${fmtMoney(r.fare)}</td>
          <td>
            <button class="btn ok"     data-act="accept" data-id="${r.ride_id}">Accept</button>
            <button class="btn danger" data-act="reject" data-id="${r.ride_id}">Reject</button>
          </td>
        </tr>`).join('')}</tbody></table>`;
  document.getElementById('incomingTable').innerHTML = html;

  document.querySelectorAll('[data-act]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id  = btn.dataset.id;
      const act = btn.dataset.act;
      btn.disabled = true;
      try {
        await api(`/api/driver/rides/${id}/${act}`, { method: 'POST' });
        if (act === 'accept') {
          // Show the Active Trip card immediately on the Status tab
          // so the driver can progress the ride step-by-step.
          loadIncoming();            // remove from incoming list
          await refreshActiveTrip(); // show the active trip card
          // Switch to Status tab so driver sees the card.
          document.querySelector('.tabs button[data-tab="status"]')?.click();
        } else {
          loadIncoming();
        }
      } catch (err) {
        alert(err.message);
        btn.disabled = false;
      }
    });
  });
}

// ---- Active Trip Tracker (Driver side) ------------------------------

let tripPollTimer = null;

function startTripPolling() {
  stopTripPolling();
  tripPollTimer = setInterval(refreshActiveTrip, 6000);
}

function stopTripPolling() {
  if (tripPollTimer) { clearInterval(tripPollTimer); tripPollTimer = null; }
}

async function refreshActiveTrip() {
  try {
    const ride = await api('/api/driver/rides/active');
    if (!ride) {
      stopTripPolling();
      document.getElementById('activeTripCard').classList.add('hide');
      return;
    }
    renderActiveTrip(ride);
    // Keep polling while there's an active ride.
    if (!tripPollTimer) startTripPolling();
  } catch (_) { /* network blip */ }
}

function renderActiveTrip(ride) {
  const card   = document.getElementById('activeTripCard');
  const status = ride.ride_status;
  card.classList.remove('hide');

  // Status badge
  const statusEl = document.getElementById('activeTripStatus');
  statusEl.textContent = status.replace(/_/g, ' ');
  statusEl.className  = 'pill warn';

  // Details grid
  document.getElementById('activeTripDetails').innerHTML = `
    <div class="kpi"><div class="label">Ride #</div><div class="value">${ride.ride_id}</div></div>
    <div class="kpi"><div class="label">Rider</div><div class="value">${escape(ride.rider_name)}<br><small style="font-size:13px;font-weight:400;">${escape(ride.rider_phone)}</small></div></div>
    <div class="kpi"><div class="label">Pickup</div><div class="value" style="font-size:15px;">${escape(ride.pickup_address)}</div></div>
    <div class="kpi"><div class="label">Drop-off</div><div class="value" style="font-size:15px;">${escape(ride.dropoff_address)}</div></div>
    <div class="kpi"><div class="label">Distance</div><div class="value">${Number(ride.distance_km).toFixed(1)} km</div></div>
    <div class="kpi"><div class="label">Fare</div><div class="value">${fmtMoney(ride.fare)}</div></div>
  `;

  // Action buttons — step-by-step based on current status
  const actEl = document.getElementById('activeTripActions');
  const msgEl = document.getElementById('activeTripMsg');
  actEl.innerHTML = '';

  const makeBtn = (label, cls, endpoint, confirmMsg) => {
    const b = document.createElement('button');
    b.className = `btn ${cls}`;
    b.textContent = label;
    b.onclick = async () => {
      if (confirmMsg && !confirm(confirmMsg)) return;
      b.disabled = true;
      b.textContent = 'Please wait…';
      try {
        await api(`/api/driver/rides/${ride.ride_id}/${endpoint}`, { method: 'POST' });
        msgEl.innerHTML = `<div class="status-msg ok">${label} — status updated.</div>`;
        await refreshActiveTrip();
      } catch (err) {
        msgEl.innerHTML = `<div class="status-msg err">${err.message}</div>`;
        b.disabled = false;
        b.textContent = label;
      }
    };
    return b;
  };

  if (status === 'ACCEPTED') {
    actEl.appendChild(makeBtn('🗠 Mark En Route', 'btn', 'enroute', null));
    const note = document.createElement('p');
    note.style.cssText = 'color:var(--muted);font-size:13px;margin:0;align-self:center;';
    note.textContent = 'Head to the rider’s pickup location, then mark En Route.';
    actEl.appendChild(note);

  } else if (status === 'DRIVER_EN_ROUTE') {
    actEl.appendChild(makeBtn('▶️ Start Trip', 'btn', 'start', null));
    const note = document.createElement('p');
    note.style.cssText = 'color:var(--muted);font-size:13px;margin:0;align-self:center;';
    note.textContent = 'Rider is in the vehicle — start the trip when ready.';
    actEl.appendChild(note);

  } else if (status === 'IN_PROGRESS') {
    actEl.appendChild(makeBtn('✅ Complete Ride', 'ok', 'finish', 'Mark this ride as completed and collect payment?'));
    const note = document.createElement('p');
    note.style.cssText = 'color:var(--muted);font-size:13px;margin:0;align-self:center;';
    note.textContent = 'Tap Complete when you’ve reached the drop-off location.';
    actEl.appendChild(note);
  }
}

async function loadEarnings() {
  const r = await api('/api/driver/earnings');
  document.getElementById('earningsKpi').innerHTML = `
    <div class="kpi"><div class="label">Wallet balance</div><div class="value">${fmtMoney(r.wallet_balance)}</div></div>
    <div class="kpi"><div class="label">Trips paid</div><div class="value">${r.summary.trips_paid}</div></div>
    <div class="kpi"><div class="label">Total net</div><div class="value">${fmtMoney(r.summary.total_net)}</div></div>
    <div class="kpi"><div class="label">Total gross</div><div class="value">${fmtMoney(r.summary.total_gross)}</div></div>
  `;
  const html = r.recent.length === 0
    ? `<p style="color:var(--muted)">No payouts yet.</p>`
    : `<table><thead><tr>
        <th>Earning #</th><th>Ride</th><th>Gross</th><th>Comm %</th>
        <th>Net</th><th>Status</th><th>When</th>
      </tr></thead><tbody>${r.recent.map((e) => `
        <tr><td>${e.earning_id}</td><td>${e.ride_id}</td>
        <td>${fmtMoney(e.gross_fare)}</td><td>${e.commission_pct}</td>
        <td>${fmtMoney(e.net_earning)}</td>
        <td><span class="pill ${e.payout_status === 'PAID' ? 'ok' : 'warn'}">${escape(e.payout_status)}</span></td>
        <td>${fmtDate(e.earned_at)}</td></tr>`).join('')}</tbody></table>`;
  document.getElementById('earningsTable').innerHTML = html;
}

async function loadHistory() {
  const rows = await api('/api/driver/history');
  const html = rows.length === 0
    ? `<p style="color:var(--muted)">No rides yet.</p>`
    : `<table><thead><tr>
        <th>#</th><th>When</th><th>Rider</th><th>Pickup → Drop</th>
        <th>Distance</th><th>Status</th><th>Fare</th>
      </tr></thead><tbody>${rows.map((r) => `
        <tr><td>${r.ride_id}</td><td>${fmtDate(r.requested_at)}</td>
        <td>${escape(r.rider_name)}</td>
        <td>${escape(r.pickup_city)} → ${escape(r.dropoff_city)}</td>
        <td>${Number(r.distance_km).toFixed(1)} km</td>
        <td>${escape(r.ride_status)}</td>
        <td>${fmtMoney(r.fare)}</td></tr>`).join('')}</tbody></table>`;
  document.getElementById('historyTable').innerHTML = html;
}

loadProfile();
refreshActiveTrip(); // Show active trip card immediately if driver has an ongoing ride.

// ---------- RATE RIDER (Driver → Rider) --------------------------------
async function loadRiderRateOptions() {
  const pending = await api('/api/driver/ratings/pending');
  const sel = document.getElementById('rateRiderRide');
  const btn = document.getElementById('rateRiderBtn');
  if (pending.length === 0) {
    sel.innerHTML = `<option value="">No rides to rate yet</option>`;
    sel.disabled = true;
    if (btn) btn.disabled = true;
  } else {
    sel.disabled = false;
    if (btn) btn.disabled = false;
    sel.innerHTML = pending.map(
      (r) => `<option value="${r.ride_id}">
        #${r.ride_id} — ${escape(r.rider_name)} (${escape(r.pickup_city)} → ${escape(r.dropoff_city)})
      </option>`
    ).join('');
  }
}

document.getElementById('rateRiderForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('rateRiderMsg');
  msg.innerHTML = '';
  const fd = new FormData(e.target);
  const body = Object.fromEntries(fd);
  if (!body.ride_id) {
    msg.innerHTML = `<div class="status-msg err">No ride selected.</div>`;
    return;
  }
  body.ride_id = Number(body.ride_id);
  body.score   = Number(body.score);
  if (!body.comment) delete body.comment;
  try {
    await api('/api/driver/ratings', { method: 'POST', body: JSON.stringify(body) });
    msg.innerHTML = `<div class="status-msg ok">Rating submitted.</div>`;
    loadRiderRateOptions();
  } catch (err) {
    msg.innerHTML = `<div class="status-msg err">${err.message}</div>`;
  }
});
