let ALL = [];
let filter = "all";

const $ = (q) => document.querySelector(q);

function fmtDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString("es-MX", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit"
    });
  } catch {
    return iso || "";
  }
}

function badge(status) {
  const s = status || "new";
  const text = s === "replied" ? "Respondido" : (s === "closed" ? "Cerrado" : "Nuevo");
  return `<span class="badge ${s}">${text}</span>`;
}

function setChips() {
  document.querySelectorAll(".chip").forEach(c => {
    c.classList.toggle("is-on", c.dataset.filter === filter);
  });
}

document.addEventListener("click", (e) => {
  const chip = e.target.closest?.(".chip");
  if (chip && chip.dataset.filter) {
    filter = chip.dataset.filter;
    setChips();
    render();
  }
});

async function api(url, opts) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

async function load() {
  const [sum, leads] = await Promise.all([
    api("./api/summary"),
    api("./api/leads")
  ]);

  $("#kpiNew").textContent = sum.summary.new;
  $("#kpiReplied").textContent = sum.summary.replied;
  $("#kpiClosed").textContent = sum.summary.closed;

  ALL = leads.leads || [];
  render();

  // Load notifications & comments count
  loadNotifications();
}

function render() {
  const tbody = $("#leadsTbody");
  const rows = ALL.filter(l => {
    if (filter === "all") return true;
    return (l.status || "new") === filter;
  });

  tbody.innerHTML = rows.map(l => {
    const isOn = Number(l.is_important) === 1;
    return `
      <tr class="${isOn ? "is-starred" : ""}">
        <td class="col-star">
          <button class="star-btn ${isOn ? "on" : ""}" title="Importante" data-act="star" data-id="${l.id}">
            ${isOn ? "\u2605" : "\u2606"}
          </button>
        </td>
        <td>${escapeHtml(l.name || "")}</td>
        <td>${escapeHtml(l.email || "")}</td>
        <td>${escapeHtml(l.phone || "")}</td>
        <td>${badge(l.status)}</td>
        <td class="col-date">${fmtDate(l.created_at)}</td>
        <td class="col-actions">
          <div class="row-actions">
            <a class="small-btn" href="./lead?id=${l.id}">Detalle</a>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  tbody.querySelectorAll("[data-act]").forEach(btn => {
    btn.addEventListener("click", onAction);
  });
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function onAction(e) {
  const btn = e.currentTarget;
  const id = btn.dataset.id;
  const act = btn.dataset.act;

  if (act === "star") {
    await api(`./api/leads/${id}/important`, { method: "POST" });
    await refresh();
  }
}

async function refresh() {
  const [leads, sum] = await Promise.all([
    api("./api/leads"),
    api("./api/summary")
  ]);
  ALL = leads.leads || [];
  $("#kpiNew").textContent = sum.summary.new;
  $("#kpiReplied").textContent = sum.summary.replied;
  $("#kpiClosed").textContent = sum.summary.closed;
  render();
}

// ── Notifications (Facebook-style dropdown) ──
async function loadNotifications() {
  try {
    const res = await api("./api/notifications");
    const notifs = res.notifications || [];
    const unread = notifs.filter(n => !Number(n.is_read));

    // Comments KPI
    const kpiComments = $("#kpiComments");
    if (kpiComments) {
      const commentNotifs = unread.filter(n => n.type === "comment");
      kpiComments.textContent = commentNotifs.length;
    }

    // Badge
    const bdg = $("#notifBadge");
    if (bdg) {
      if (unread.length > 0) {
        bdg.style.display = "";
        bdg.textContent = unread.length > 99 ? "99+" : String(unread.length);
      } else {
        bdg.style.display = "none";
      }
    }

    // Render list in dropdown
    const list = $("#notifList");
    if (list) {
      if (notifs.length === 0) {
        list.innerHTML = '<div class="notif-empty">Sin notificaciones</div>';
      } else {
        const notifIcons = { lead: '&#x1F4E9;', comment: '&#x1F4AC;', ticket: '&#x1F3AB;', ticket_reply: '&#x1F4AC;', ticket_internal: '&#x1F4E8;' };
        list.innerHTML = notifs.slice(0, 20).map(n => `
          <div class="notif-item ${Number(n.is_read) ? '' : 'is-unread'}" data-notif-id="${n.id}" data-type="${n.type}" data-ref="${n.ref_id || ''}" style="cursor:pointer;">
            <div class="notif-item-icon">${notifIcons[n.type] || '&#x1F514;'}</div>
            <div class="notif-item-body">
              <div class="notif-item-title">${escapeHtml(n.title)}</div>
              <div class="notif-item-text">${escapeHtml(n.body || "")}</div>
              <div class="notif-item-time">${fmtDate(n.created_at)}</div>
            </div>
            <button class="notif-item-delete" data-delete="${n.id}" title="Eliminar">&#x2715;</button>
          </div>
        `).join("");

        // Attach click handlers for navigation
        list.querySelectorAll(".notif-item").forEach(item => {
          item.addEventListener("click", (e) => {
            if (e.target.closest('[data-delete]')) return;
            const type = item.dataset.type;
            const refId = item.dataset.ref;
            if (type === 'lead' || type === 'comment') {
              window.location.href = './leads';
            } else if (type === 'ticket' || type === 'ticket_reply' || type === 'ticket_internal') {
              window.location.href = './support';
            }
          });
        });

        // Attach delete handlers
        list.querySelectorAll("[data-delete]").forEach(btn => {
          btn.addEventListener("click", async (e) => {
            e.stopPropagation();
            const id = btn.dataset.delete;
            try {
              await api(`./api/notifications/${id}/delete`, { method: "POST" });
              loadNotifications();
            } catch (err) {
              console.warn("[Notifications] Delete error:", err);
            }
          });
        });
      }
    }
  } catch (err) {
    console.warn("[Notifications]", err);
  }
}

// Toggle notifications dropdown
const notifBtn = $("#notifBtn");
const notifDropdown = $("#notifDropdown");
if (notifBtn && notifDropdown) {
  notifBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    notifDropdown.classList.toggle("is-open");
  });

  // Close dropdown when clicking outside
  document.addEventListener("click", (e) => {
    if (!notifDropdown.contains(e.target) && !notifBtn.contains(e.target)) {
      notifDropdown.classList.remove("is-open");
    }
  });
}

// Mark all read
const markAllBtn = $("#markAllRead");
if (markAllBtn) {
  markAllBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    try {
      await api("./api/notifications/read-all", { method: "POST" });
      loadNotifications();
    } catch (err) {
      console.warn("[Notifications]", err);
    }
  });
}

load().catch(err => {
  console.error(err);
});
