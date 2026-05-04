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
    if (b.dataset.tab === 'status') loadProfile();
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
      const id = btn.dataset.id;
      const act = btn.dataset.act;
      try {
        await api(`/api/driver/rides/${id}/${act}`, { method: 'POST' });
        if (act === 'accept') {
          // Auto-progress: start → finish on confirm so we can demo the trigger.
          if (confirm('Ride accepted. Mark as IN_PROGRESS now?')) {
            await api(`/api/driver/rides/${id}/start`, { method: 'POST' });
          }
          if (confirm('Mark as COMPLETED + collect payment now?')) {
            await api(`/api/driver/rides/${id}/finish`, { method: 'POST' });
          }
        }
        loadIncoming();
      } catch (err) {
        alert(err.message);
      }
    });
  });
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
