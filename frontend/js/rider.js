import { api, requireRole, getUser, logout, fmtMoney, fmtDate, escape } from '/js/api.js';

const me = requireRole('RIDER');
if (!me) { /* redirected */ }

document.getElementById('who').textContent = `${me.full_name} (Rider)`;
document.getElementById('logoutBtn').addEventListener('click', logout);

// Tabs
const tabs = document.querySelectorAll('.tabs button');
tabs.forEach((b) => {
  b.addEventListener('click', () => {
    tabs.forEach((x) => x.classList.toggle('active', x === b));
    document.querySelectorAll('main > section').forEach((s) => {
      s.classList.toggle('hide', s.id !== `tab-${b.dataset.tab}`);
    });
    if (b.dataset.tab === 'history') loadHistory();
    if (b.dataset.tab === 'wallet') loadWallet();
    if (b.dataset.tab === 'ratings') loadRideOptions();
  });
});

// ---------- BOOKING -----------------------------------------------------
async function loadLocations() {
  const locs = await api('/api/lookups/locations');
  const optHtml = locs.map(
    (l) => `<option value="${l.location_id}">${escape(l.address)} (${escape(l.city)})</option>`
  ).join('');
  document.querySelectorAll('select[name="pickup_loc_id"], select[name="dropoff_loc_id"]')
    .forEach((s) => { s.innerHTML = optHtml; });
}

document.getElementById('bookForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('bookMsg');
  msg.innerHTML = '';
  const fd = new FormData(e.target);
  const body = Object.fromEntries(fd);
  body.distance_km = Number(body.distance_km);
  body.duration_min = Number(body.duration_min);
  body.is_peak = body.is_peak === 'true';
  if (!body.promo_code) delete body.promo_code;
  try {
    const r = await api('/api/rider/rides', { method: 'POST', body: JSON.stringify(body) });
    msg.innerHTML = `<div class="status-msg ok">
      Ride booked! ID #${r.ride_id} · Fare ${fmtMoney(r.fare)} · You pay ${fmtMoney(r.amount)}
      ${r.promo_discount ? `(promo discount ${fmtMoney(r.promo_discount)})` : ''}
    </div>`;
  } catch (err) {
    msg.innerHTML = `<div class="status-msg err">${err.message}</div>`;
  }
});

// ---------- HISTORY -----------------------------------------------------
async function loadHistory() {
  const rows = await api('/api/rider/rides');
  const cancellable = ['REQUESTED', 'ACCEPTED', 'DRIVER_EN_ROUTE'];
  const html = rows.length === 0
    ? `<p style="color:var(--muted)">No rides yet — book one!</p>`
    : `<table><thead><tr>
        <th>#</th><th>When</th><th>Driver</th><th>Vehicle</th>
        <th>Pickup → Dropoff</th><th>Status</th><th>Fare</th><th>Payment</th><th>Action</th>
      </tr></thead><tbody>${rows.map((r) => `
        <tr>
          <td>${r.ride_id}</td>
          <td>${fmtDate(r.requested_at)}</td>
          <td>${escape(r.driver_name)}</td>
          <td>${escape(r.make)} ${escape(r.model)} <span class="pill">${escape(r.license_plate)}</span></td>
          <td>${escape(r.pickup_city)} → ${escape(r.dropoff_city)}</td>
          <td>${statusPill(r.ride_status)}</td>
          <td>${fmtMoney(r.fare)}</td>
          <td>${escape(r.payment_method || '-')} ${paymentPill(r.payment_status)}</td>
          <td>${cancellable.includes(r.ride_status)
            ? `<button class="btn danger" style="font-size:12px; padding: 4px 10px;" data-cancel="${r.ride_id}">Cancel</button>`
            : '—'}</td>
        </tr>`).join('')}</tbody></table>`;
  document.getElementById('historyTable').innerHTML = html;

  // Wire up cancel buttons.
  document.querySelectorAll('[data-cancel]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Are you sure you want to cancel this ride?')) return;
      try {
        await api(`/api/rider/rides/${btn.dataset.cancel}/cancel`, { method: 'POST' });
        loadHistory();
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

function statusPill(s) {
  const cls = s === 'COMPLETED' ? 'ok' : (s === 'CANCELLED' ? 'bad' : 'warn');
  return `<span class="pill ${cls}">${escape(s)}</span>`;
}
function paymentPill(s) {
  if (!s) return '';
  const cls = s === 'PAID' ? 'ok' : (s === 'FAILED' ? 'bad' : 'warn');
  return `<span class="pill ${cls}">${escape(s)}</span>`;
}

// ---------- WALLET ------------------------------------------------------
async function loadWallet() {
  const r = await api('/api/rider/wallet');
  document.getElementById('walletBal').textContent = fmtMoney(r.wallet_balance);
}
document.getElementById('topupForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('topupMsg');
  const fd = new FormData(e.target);
  try {
    const r = await api('/api/rider/wallet/topup', {
      method: 'POST', body: JSON.stringify({ amount: Number(fd.get('amount')) }),
    });
    document.getElementById('walletBal').textContent = fmtMoney(r.wallet_balance);
    msg.innerHTML = `<div class="status-msg ok">Top-up successful.</div>`;
  } catch (err) {
    msg.innerHTML = `<div class="status-msg err">${err.message}</div>`;
  }
});

// ---------- RATINGS -----------------------------------------------------
async function loadRideOptions() {
  // Only completed rides that the rider hasn't already rated.
  const pending = await api('/api/rider/ratings/pending');
  const sel = document.getElementById('rateRide');
  const submitBtn = document.querySelector('#rateForm button[type="submit"]');
  if (pending.length === 0) {
    sel.innerHTML = `<option value="">No rides to rate yet</option>`;
    sel.disabled = true;
    if (submitBtn) submitBtn.disabled = true;
  } else {
    sel.disabled = false;
    if (submitBtn) submitBtn.disabled = false;
    sel.innerHTML = pending.map(
      (r) => `<option value="${r.ride_id}">
        #${r.ride_id} — ${escape(r.driver_name)} (${escape(r.pickup_city)} → ${escape(r.dropoff_city)})
      </option>`
    ).join('');
  }
}
document.getElementById('rateForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('rateMsg');
  msg.innerHTML = '';
  const fd = new FormData(e.target);
  const body = Object.fromEntries(fd);
  if (!body.ride_id) {
    msg.innerHTML = `<div class="status-msg err">No ride selected.</div>`;
    return;
  }
  body.ride_id = Number(body.ride_id);
  body.score = Number(body.score);
  if (!body.comment) delete body.comment;
  try {
    await api('/api/rider/ratings', { method: 'POST', body: JSON.stringify(body) });
    msg.innerHTML = `<div class="status-msg ok">Rating submitted.</div>`;
    loadRideOptions(); // refresh list — the rated ride drops out
  } catch (err) {
    msg.innerHTML = `<div class="status-msg err">${err.message}</div>`;
  }
});

// init
loadLocations();
