let ALL = [];
let filter = "all";
let notesLeadId = null;

const $ = (q) => document.querySelector(q);

function fmtDate(iso){
  try{
    const d = new Date(iso);
    return d.toLocaleString();
  }catch{
    return iso || "";
  }
}

function badge(status){
  const s = status || "new";
  const text = s === "replied" ? "Respondido ✅" : (s === "closed" ? "Cerrado ⛔" : "Nuevo 🆕");
  return `<span class="badge ${s}">${text}</span>`;
}

function setChips(){
  document.querySelectorAll(".chip").forEach(c=>{
    c.classList.toggle("is-on", c.dataset.filter === filter);
  });
}

function openModal(id){
  const m = document.getElementById(id);
  m.classList.add("is-open");
  m.setAttribute("aria-hidden","false");
}

function closeModal(id){
  const m = document.getElementById(id);
  m.classList.remove("is-open");
  m.setAttribute("aria-hidden","true");
}

document.addEventListener("click", (e)=>{
  const close = e.target.getAttribute?.("data-close");
  if (close) closeModal(close);

  const chip = e.target.closest?.(".chip");
  if(chip){
    filter = chip.dataset.filter;
    setChips();
    render();
  }
});

async function api(url, opts){
  const res = await fetch(url, opts);
  if(!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

async function load(){
  const [sum, leads] = await Promise.all([
    api("./api/summary"),
    api("./api/leads")
  ]);

  $("#kpiNew").textContent = sum.summary.new;
  $("#kpiReplied").textContent = sum.summary.replied;
  $("#kpiClosed").textContent = sum.summary.closed;

  ALL = leads.leads || [];
  render();
}

function render(){
  const tbody = $("#leadsTbody");
  const rows = ALL.filter(l=>{
    if(filter === "all") return true;
    return (l.status || "new") === filter;
  });

  tbody.innerHTML = rows.map(l=>{
    const isOn = Number(l.is_important) === 1;
    return `
      <tr>
        <td class="col-star">
          <button class="star-btn ${isOn ? "on":""}" title="Importante" data-act="star" data-id="${l.id}">
            ${isOn ? "★" : "☆"}
          </button>
        </td>
        <td>${escapeHtml(l.name || "")}</td>
        <td>${escapeHtml(l.email || "")}</td>
        <td>${escapeHtml(l.phone || "")}</td>
        <td>${badge(l.status)}</td>
        <td class="col-date">${fmtDate(l.created_at)}</td>
        <td class="col-actions">
          <div class="row-actions">
            <button class="small-btn" data-act="view" data-id="${l.id}">Ver 👁️</button>
            <button class="small-btn" data-act="notes" data-id="${l.id}">Notas 📋</button>
            <button class="small-btn" data-act="status" data-to="replied" data-id="${l.id}">Respondido ✅</button>
            <button class="small-btn" data-act="status" data-to="closed" data-id="${l.id}">Cerrar ❌</button>
            <button class="small-btn danger" data-act="delete" data-id="${l.id}">Eliminar ⛔</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  // bind actions
  tbody.querySelectorAll("[data-act]").forEach(btn=>{
    btn.addEventListener("click", onAction);
  });
}

function escapeHtml(str){
  return String(str)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function getLead(id){
  return ALL.find(x=> String(x.id) === String(id));
}

async function onAction(e){
  const btn = e.currentTarget;
  const id = btn.dataset.id;
  const act = btn.dataset.act;

  if(act === "view"){
    const lead = getLead(id);
    const html = `
      <div style="display:grid;gap:10px">
        <div><b>Nombre:</b> ${escapeHtml(lead?.name || "")}</div>
        <div><b>Email:</b> ${escapeHtml(lead?.email || "")}</div>
        <div><b>Teléfono:</b> ${escapeHtml(lead?.phone || "")}</div>
        <div><b>Tipo:</b> ${escapeHtml(lead?.project_type || "")}</div>
        <div><b>Estado:</b> ${escapeHtml(lead?.status || "new")}</div>
        <div><b>Fecha:</b> ${escapeHtml(fmtDate(lead?.created_at))}</div>
        <div><b>Mensaje:</b><br>${escapeHtml(lead?.message || "").replaceAll("\n","<br>")}</div>
      </div>
    `;
    $("#viewBody").innerHTML = html;
    openModal("modalView");
    return;
  }

  if(act === "notes"){
    const lead = getLead(id);
    notesLeadId = id;
    $("#notesText").value = lead?.internal_notes || "";
    openModal("modalNotes");
    return;
  }

  if(act === "status"){
    const to = btn.dataset.to;
    await api(`./api/leads/${id}/status`, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ status: to })
    });
    await refresh();
    return;
  }

  if(act === "delete"){
    if(!confirm("¿Eliminar definitivamente este lead?")) return;
    await api(`./api/leads/${id}/delete`, { method:"POST" });
    await refresh();
    return;
  }

  if(act === "star"){
    await api(`./api/leads/${id}/important`, { method:"POST" });
    await refresh();
    return;
  }
}

$("#notesSaveBtn")?.addEventListener("click", async ()=>{
  if(!notesLeadId) return;
  const notes = $("#notesText").value || "";
  await api(`./api/leads/${notesLeadId}/notes`, {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ notes })
  });
  closeModal("modalNotes");
  await refresh();
});

async function refresh(){
  const leads = await api("./api/leads");
  ALL = leads.leads || [];
  const sum = await api("./api/summary");
  $("#kpiNew").textContent = sum.summary.new;
  $("#kpiReplied").textContent = sum.summary.replied;
  $("#kpiClosed").textContent = sum.summary.closed;
  render();
}

load().catch(err=>{
  console.error(err);
  alert("Error cargando el panel. Revisa consola del servidor.");
});
