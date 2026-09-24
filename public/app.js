const app = document.getElementById("app");
const state = {
  user: null,
  needsSetup: false,
  route: location.hash.slice(1) || "well",
  conversations: [],
  conversationId: null,
  messages: [],
  memories: [],
  projects: [],
  approvals: [],
  audit: [],
  mirror: [],
  health: null,
  root: null,
  vault: null,
};

window.addEventListener("hashchange", () => {
  state.route = location.hash.slice(1) || "well";
  loadRoute();
});

async function api(path, opts = {}) {
  const res = await fetch(path, {
    credentials: "same-origin",
    headers: { "content-type": "application/json", ...(opts.headers || {}) },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

function navItem(id, label) {
  return `<a href="#${id}" class="${state.route === id ? "active" : ""}">${label}</a>`;
}

function shell(content) {
  return `<div class="shell"><nav class="side" id="side"><div class="brand"><div class="mark">Mimir</div><div class="muted">One intelligence</div></div>
  ${navItem("well", "The Well")}${navItem("chat", "Council")}${navItem("memory", "Memory")}${navItem("domain", "The Domain")}${navItem("approvals", "Approvals")}${navItem("audit", "Audit")}${navItem("vault", "The Vault")}${navItem("forge", "The Forge")}${navItem("mirror", "The Mirror")}${navItem("root", "The Root")}${navItem("health", "Health")}
  <div style="margin-top:24px"><button class="btn small" id="logout">Leave</button></div></nav>
  <main><div class="topbar"><button class="btn small mobile-toggle" id="menu">Menu</button><div class="badge">${state.user?.display_name || "Founder"}</div></div>${content}</main></div>`;
}

function render() {
  if (!state.user) { app.innerHTML = gate(); bindGate(); return; }
  const views = { well: viewWell, chat: viewChat, memory: viewMemory, domain: viewDomain, approvals: viewApprovals, audit: viewAudit, vault: viewVault, forge: viewForge, mirror: viewMirror, root: viewRoot, health: viewHealth };
  app.innerHTML = shell((views[state.route] || viewWell)());
  document.getElementById("logout")?.addEventListener("click", async () => { await api("/api/logout", { method: "POST", body: {} }); state.user = null; render(); });
  document.getElementById("menu")?.addEventListener("click", () => document.getElementById("side").classList.toggle("open"));
  bindView();
}

function gate() {
  const title = state.needsSetup ? "Founder setup" : "Enter the Well";
  return `<div class="gate"><form class="card" id="gate-form"><div class="mark">Mimir</div><h1>${title}</h1><p class="muted">Private system. One Founder. The Oath holds.</p>
  ${state.needsSetup ? `<label>Display name</label><input name="displayName" value="Founder" />` : ""}
  <label>Username</label><input name="username" required autocomplete="username" />
  <label>Password</label><input name="password" type="password" required minlength="${state.needsSetup ? 10 : 1}" />
  <div class="error" id="gate-error"></div>
  <div style="margin-top:18px"><button class="btn solid" type="submit">${state.needsSetup ? "Take Root" : "Enter"}</button></div></form></div>`;
}

function bindGate() {
  document.getElementById("gate-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target).entries());
    try {
      if (state.needsSetup) await api("/api/setup", { method: "POST", body });
      else await api("/api/login", { method: "POST", body });
      await boot();
    } catch (err) { document.getElementById("gate-error").textContent = err.message; }
  });
}

function viewWell() {
  return `<h1>The Well</h1><p class="muted">Central intelligence. Route, remember, command.</p><div class="grid two">
  <div class="tile"><h3>Council</h3><p class="muted">Speak with Mimir.</p><a class="btn small" href="#chat">Open</a></div>
  <div class="tile"><h3>Domain</h3><p class="muted">Truth, protection, oaths.</p><a class="btn small" href="#domain">Open</a></div>
  <div class="tile"><h3>Vault</h3><p class="muted">Wealth frame. No transfers.</p><a class="btn small" href="#vault">Open</a></div>
  <div class="tile"><h3>Forge</h3><p class="muted">Projects and making.</p><a class="btn small" href="#forge">Open</a></div></div>`;
}

function viewChat() {
  const msgs = state.messages.map((m) => `<div class="bubble ${m.role}">${escapeHtml(m.content)}</div>`).join("");
  const convos = state.conversations.map((c) => `<button class="btn small ${c.id === state.conversationId ? "solid" : ""}" data-cid="${c.id}">${escapeHtml(c.title)}</button>`).join("");
  return `<div class="topbar"><h1>Council</h1><button class="btn small" id="new-convo">New</button></div>
  <div class="row" style="margin-bottom:10px">${convos || `<span class="muted">No prior councils</span>`}</div>
  <div class="chat"><div class="msgs">${msgs}</div>
  <form class="composer" id="chat-form"><textarea name="content" placeholder="Speak to Mimir" required></textarea>
  <button class="btn" type="button" id="mic">Mic</button><button class="btn" type="button" id="speak">Speak</button>
  <button class="btn solid" type="submit">Send</button></form></div>`;
}

function viewMemory() {
  const items = state.memories.map((m) => `<div class="item"><strong>${escapeHtml(m.title)}</strong> <span class="muted">${escapeHtml(m.category)}</span><p>${escapeHtml(m.content)}</p><button class="btn small danger" data-del="${m.id}">Forget</button></div>`).join("");
  return `<h1>Memory</h1><form class="tile" id="mem-form"><label>Category</label><select name="category"><option>preferences</option><option>relationships</option><option>projects</option><option>businesses</option><option>goals</option><option>skills</option><option>routines</option><option>decisions</option><option>connected systems</option></select>
  <label>Title</label><input name="title" required /><label>Content</label><textarea name="content" required></textarea><label>Why store this</label><input name="reason" />
  <div style="margin-top:10px"><button class="btn solid">Keep</button></div></form><div class="list" style="margin-top:16px">${items || `<p class="muted">No memories yet.</p>`}</div>`;
}

function viewDomain() {
  return `<h1>The Domain</h1><p class="muted">Fenrir and Týr — truth, justice, protection, oaths, wrath.</p>
  <div class="grid two"><div class="tile"><h3>Authorization</h3><p>L0 autonomous · L1 pre-authorized · L2 review · L3 re-auth · L4 Founder only</p></div>
  <div class="tile"><h3>The Oath</h3><p>Authentication, audit, secrets, Founder sovereignty, and rollback cannot be silently weakened.</p></div></div>
  <p style="margin-top:16px"><a class="btn" href="#approvals">Review queue</a> <a class="btn" href="#audit">Audit</a></p>`;
}

function viewApprovals() {
  const items = state.approvals.map((a) => `<div class="item"><strong>${escapeHtml(a.action)}</strong> · ${a.level} · ${a.status}<p class="muted">${escapeHtml(a.reason || "")}</p>${a.status === "pending" ? `<button class="btn small" data-ap="${a.id}">Approve</button> <button class="btn small danger" data-dn="${a.id}">Deny</button>` : ""}</div>`).join("");
  return `<h1>Approvals</h1><form class="tile" id="ap-form"><label>Action</label><input name="action" required /><label>Reason</label><input name="reason" /><label>Level</label><select name="level"><option>L2</option><option>L3</option><option>L4</option></select><div style="margin-top:10px"><button class="btn solid">Queue</button></div></form><div class="list" style="margin-top:16px">${items || `<p class="muted">Queue empty.</p>`}</div>`;
}

function viewAudit() {
  const items = state.audit.map((a) => `<div class="item"><strong>${escapeHtml(a.action)}</strong> · ${a.domain} · ${a.level}<div class="muted">${a.created_at} · ${a.result}</div></div>`).join("");
  return `<h1>Audit</h1><div class="list">${items || `<p class="muted">No records.</p>`}</div>`;
}

function viewVault() {
  const v = state.vault;
  return `<h1>The Vault</h1><p class="muted">Gullveig — wealth, prosperity, transformation. Mimir cannot move money.</p><div class="tile"><p>${escapeHtml(v?.note || "")}</p></div><div class="list" style="margin-top:12px">${(v?.placeholders || []).map((p) => `<div class="item">${escapeHtml(p.name)} — ${escapeHtml(p.status)}</div>`).join("")}</div>`;
}

function viewForge() {
  const items = state.projects.map((p) => `<div class="item"><strong>${escapeHtml(p.name)}</strong> · ${p.status}<p>${escapeHtml(p.description || "")}</p><form data-proj="${p.id}" class="proj-edit"><textarea name="notes">${escapeHtml(p.notes || "")}</textarea><select name="status"><option ${p.status === "active" ? "selected" : ""}>active</option><option ${p.status === "archived" ? "selected" : ""}>archived</option></select><button class="btn small">Save</button></form></div>`).join("");
  return `<h1>The Forge</h1><p class="muted">Cernunnos — creation, sovereignty, growth.</p><form class="tile" id="proj-form"><label>Name</label><input name="name" required /><label>Description</label><textarea name="description"></textarea><div style="margin-top:10px"><button class="btn solid">Create project</button></div></form><div class="list" style="margin-top:16px">${items || `<p class="muted">No projects.</p>`}</div>`;
}

function viewMirror() {
  const items = state.mirror.map((p) => `<div class="item"><strong>${escapeHtml(p.title)}</strong> · ${p.status} · ${p.risk}<p>${escapeHtml(p.description)}</p><div class="row"><button class="btn small" data-ms="${p.id}" data-st="development">Development</button><button class="btn small" data-ms="${p.id}" data-st="sandbox">Sandbox</button><button class="btn small" data-ms="${p.id}" data-st="testing">Testing</button><button class="btn small danger" data-ms="${p.id}" data-st="rejected">Reject</button></div></div>`).join("");
  return `<h1>The Mirror</h1><p class="muted">No silent production deploys in MVP 1.</p><form class="tile" id="mir-form"><label>Title</label><input name="title" required /><label>Description</label><textarea name="description" required></textarea><label>Risk</label><select name="risk"><option>low</option><option>medium</option><option>high</option></select><div style="margin-top:10px"><button class="btn solid">Propose</button></div></form><div class="list" style="margin-top:16px">${items || `<p class="muted">No proposals.</p>`}</div>`;
}

function viewRoot() {
  const s = state.root?.settings || {};
  const flags = (state.root?.flags || []).map((f) => `<label><input type="checkbox" data-flag="${f.key}" ${f.enabled ? "checked" : ""} ${f.key === "financial_transfers" ? "disabled" : ""}/> ${f.key} — ${escapeHtml(f.note || "")}</label>`).join("");
  return `<h1>The Root</h1><p class="muted">Founder console. Secrets are never shown here.</p>
  <form class="tile" id="root-form"><label>System prompt</label><textarea name="system_prompt">${escapeHtml(s.system_prompt || "")}</textarea>
  <label>AI provider</label><select name="ai_provider">${["none","openai","grok","anthropic","gemini","openrouter","local"].map((p) => `<option ${s.ai_provider === p ? "selected" : ""}>${p}</option>`).join("")}</select>
  <label>Model name</label><input name="ai_model" value="${escapeHtml(s.ai_model || "")}" />
  <label>Evolution level</label><select name="evolution_level">${["E0","E1","E2","E3","E4"].map((e) => `<option ${s.evolution_level === e ? "selected" : ""}>${e}</option>`).join("")}</select>
  <div style="margin-top:10px"><button class="btn solid">Save configuration</button></div></form>
  <div class="tile" style="margin-top:12px"><h3>Flags</h3>${flags}</div>
  <div class="tile" style="margin-top:12px"><h3>The Oath</h3><ul>${(state.root?.oath || []).map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul></div>
  <div class="tile" style="margin-top:12px"><h3>AI status</h3><pre class="muted">${escapeHtml(JSON.stringify(state.root?.ai || {}, null, 2))}</pre></div>`;
}

function viewHealth() {
  return `<h1>System health</h1><pre class="tile">${escapeHtml(JSON.stringify(state.health, null, 2))}</pre><p class="muted">iOS PWAs cannot keep a 24/7 background microphone. Voice works while this screen is open.</p>`;
}

function bindView() {
  if (state.route === "chat") bindChat();
  if (state.route === "memory") bindMemory();
  if (state.route === "approvals") bindApprovals();
  if (state.route === "forge") bindForge();
  if (state.route === "mirror") bindMirror();
  if (state.route === "root") bindRoot();
}

function bindChat() {
  document.getElementById("new-convo")?.addEventListener("click", async () => {
    const c = await api("/api/conversations", { method: "POST", body: { title: "New council", domain: "well" } });
    state.conversationId = c.id; state.messages = []; await loadRoute();
  });
  document.querySelectorAll("[data-cid]").forEach((b) => b.addEventListener("click", async () => {
    state.conversationId = b.dataset.cid;
    state.messages = await api(`/api/conversations/${state.conversationId}/messages`);
    render();
  }));
  document.getElementById("chat-form")?.addEventListener("submit", sendChat);
  document.getElementById("mic")?.addEventListener("click", listen);
  document.getElementById("speak")?.addEventListener("click", speakLast);
}

async function sendChat(e) {
  e.preventDefault();
  const content = new FormData(e.target).get("content");
  const data = await api("/api/chat", { method: "POST", body: { conversationId: state.conversationId, content, domain: "well" } });
  state.conversationId = data.conversationId;
  state.messages = await api(`/api/conversations/${state.conversationId}/messages`);
  render();
}

function listen() {
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Rec) return alert("Speech recognition is not available in this browser.");
  const r = new Rec(); r.lang = "en-US";
  r.onresult = (ev) => { const box = document.querySelector("#chat-form textarea"); if (box) box.value = ev.results[0][0].transcript; };
  r.start();
}

function speakLast() {
  const last = [...state.messages].reverse().find((m) => m.role === "assistant");
  if (!last || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(last.content));
}

function bindMemory() {
  document.getElementById("mem-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    await api("/api/memories", { method: "POST", body: Object.fromEntries(new FormData(e.target)) });
    await loadRoute();
  });
  document.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => {
    await api(`/api/memories/${b.dataset.del}`, { method: "DELETE" });
    await loadRoute();
  }));
}

function bindApprovals() {
  document.getElementById("ap-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target)); body.domain = "domain";
    await api("/api/approvals", { method: "POST", body });
    await loadRoute();
  });
  document.querySelectorAll("[data-ap]").forEach((b) => b.addEventListener("click", async () => { await api(`/api/approvals/${b.dataset.ap}/approve`, { method: "POST", body: {} }); await loadRoute(); }));
  document.querySelectorAll("[data-dn]").forEach((b) => b.addEventListener("click", async () => { await api(`/api/approvals/${b.dataset.dn}/deny`, { method: "POST", body: {} }); await loadRoute(); }));
}

function bindForge() {
  document.getElementById("proj-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    await api("/api/projects", { method: "POST", body: Object.fromEntries(new FormData(e.target)) });
    await loadRoute();
  });
  document.querySelectorAll(".proj-edit").forEach((f) => f.addEventListener("submit", async (e) => {
    e.preventDefault();
    await api(`/api/projects/${f.dataset.proj}`, { method: "PUT", body: Object.fromEntries(new FormData(f)) });
    await loadRoute();
  }));
}

function bindMirror() {
  document.getElementById("mir-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    await api("/api/mirror", { method: "POST", body: Object.fromEntries(new FormData(e.target)) });
    await loadRoute();
  });
  document.querySelectorAll("[data-ms]").forEach((b) => b.addEventListener("click", async () => {
    try { await api(`/api/mirror/${b.dataset.ms}/status`, { method: "POST", body: { status: b.dataset.st } }); await loadRoute(); }
    catch (err) { alert(err.message); }
  }));
}

function bindRoot() {
  document.getElementById("root-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    await api("/api/root/settings", { method: "POST", body: Object.fromEntries(new FormData(e.target)) });
    await loadRoute();
  });
  document.querySelectorAll("[data-flag]").forEach((box) => box.addEventListener("change", async () => {
    try { await api("/api/root/flags", { method: "POST", body: { key: box.dataset.flag, enabled: box.checked } }); }
    catch (err) { alert(err.message); box.checked = false; }
  }));
}

function escapeHtml(s) {
  return String(s || "").replaceAll("&", "&").replaceAll("<", "<").replaceAll(">", ">");
}

async function loadRoute() {
  try {
    if (state.route === "chat") {
      state.conversations = await api("/api/conversations");
      if (state.conversationId) state.messages = await api(`/api/conversations/${state.conversationId}/messages`);
    }
    if (state.route === "memory") state.memories = await api("/api/memories");
    if (state.route === "approvals") state.approvals = await api("/api/approvals");
    if (state.route === "audit") state.audit = await api("/api/audit");
    if (state.route === "vault") state.vault = await api("/api/vault");
    if (state.route === "forge") state.projects = await api("/api/projects");
    if (state.route === "mirror") state.mirror = await api("/api/mirror");
    if (state.route === "root") state.root = await api("/api/root/settings");
    if (state.route === "health") state.health = await api("/api/health");
  } catch (err) {
    if (String(err.message).includes("Authentication")) state.user = null;
  }
  render();
}

async function boot() {
  const bootData = await api("/api/bootstrap");
  state.needsSetup = bootData.needsSetup;
  state.user = bootData.user;
  await loadRoute();
}

boot().catch((err) => {
  app.innerHTML = `<div class="gate"><div class="card"><h1>Mimir</h1><p>${escapeHtml(err.message)}</p></div></div>`;
});
