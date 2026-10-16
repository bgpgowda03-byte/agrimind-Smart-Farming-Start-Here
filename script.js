const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const NOT_FOUND = "This information is not in the knowledge base.";
const STOP = new Set("the and for are was were with from that this what how does can should would will you your not any have has had when where which there their about into then than its our who why".split(" "));
const GENERIC = new Set(["soil","land","plot","survivor","system","field","farm","ground"]);

/* label, short rail name, what the step is for (UI wording only, no soil facts) */
const STAGES = [
  { rail: "Describe",  title: "Describe your plot" },
  { rail: "Input echo", title: "What you shared", why: "Your description, photo and checks, exactly as you entered them." },
  { rail: "Missing analysis", title: "What the signs point to", why: "What the signs suggest, and which checks are still missing." },
  { rail: "Fix protocol", title: "Fix protocol", why: "What to do, in everyday amounts, and why." },
  { rail: "Next action", title: "Readiness gate", why: "How you can tell the soil is ready." },
  { rail: "Crop suggestions", title: "Crop suggestions", why: "Crops suited to these conditions. Tap the ones you want to keep." },
  { rail: "Timeframe", title: "Timeframe", why: "How long it takes, including a buffer for slow repair." },
  { rail: "Planting method", title: "Planting method", why: "Bed, sowing and watering method." },
  { rail: "Ongoing care", title: "Ongoing care", why: "Care by growth stage." },
  { rail: "Harvest", title: "Harvest and regeneration", why: "Ripeness signs, harvest method and rebuilding the soil." },
  { rail: "Summary", title: "Your plan summary", why: "Everything in one place." }
];
const STEPQ = {
  2: "missing check crumb salt crust water quality test squeeze plate",
  3: "fix amendment gypsum compost furrow mulch drainage",
  4: "ready readiness drain crust improve gate",
  5: "crop tolerant suggestion choose",
  6: "time season maturity buffer weeks",
  7: "planting bed furrow sow watering method",
  8: "care stage fertilizer disease pest bio-pesticide wilting",
  9: "harvest ripe ripeness regeneration residue"
};
const SCI = /\b(ph|ec|dsm|ppm|sar|esp|cec)\b|ds\/m|\d+(\.\d+)?\s*(ph|ds\/m|ppm|mm|cm|kg|%)/i;

let kbList = [], stage = 0, reached = 0, imgData = null;
const chosen = new Set();

/* ================= KB loading ================= */
const stem = w => w.replace(/(ing|es|s)$/, "");
const toks = s => (String(s).toLowerCase().match(/[a-z]+/g) || []).filter(w => w.length > 2 && !STOP.has(w)).map(stem);

function normalize(raw, i) {
  const g = (...k) => { for (const x of k) if (raw[x] !== undefined && raw[x] !== null && raw[x] !== "") return raw[x]; return ""; };
  const arr = v => Array.isArray(v) ? v.map(String) : String(v || "").split(/[,;]/).map(s => s.trim()).filter(Boolean);
  const m = String(g("step", "stage", "step_no")).match(/\d+/);
  const e = {
    id: g("id") || i + 1,
    topic: String(g("topic", "title", "name") || "Entry " + (i + 1)),
    text: String(g("answer", "text", "content", "info", "fact")),
    kw: arr(g("keywords", "tags")),
    qs: arr(g("questions")),
    step: m ? +m[0] : 0,
    arch: String(g("archetype", "type", "applies_to", "soil_type")).toLowerCase()
  };
  e.kwT = new Set(toks(e.kw.join(" ")));
  e.topT = new Set(toks(e.topic));
  e.qT = new Set(toks(e.qs.join(" ")));
  e.txtT = new Set(toks(e.text));
  return e;
}

function setKB(data) {
  if (!Array.isArray(data)) data = Object.values(data).find(Array.isArray) || [];
  kbList = data.map(normalize);
  const s = $("kbstat");
  if (kbList.length) { s.textContent = "Knowledge base: " + kbList.length + " entries"; s.className = "pill ok"; }
  else { s.textContent = "Knowledge base is empty"; s.className = "pill bad"; }
  if (started()) render();
}

async function loadKB() {
  try {
    const r = await fetch("kb.json?t=" + Date.now());
    if (!r.ok) throw new Error(r.status);
    setKB(await r.json());
  } catch (e) {
    if (typeof KB !== "undefined") setKB(KB);
    else { $("kbstat").textContent = "Not loaded. Click “Load kb.json”"; $("kbstat").className = "pill bad"; }
  }
}
$("reload").onclick = loadKB;
$("pick").onclick = () => $("file").click();
$("file").onchange = e => {
  const f = e.target.files[0]; if (!f) return;
  const rd = new FileReader();
  rd.onload = () => { try { setKB(JSON.parse(rd.result)); } catch (x) { alert("That file is not valid JSON."); } };
  rd.readAsText(f);
};

/* ================= Retrieval (no generation) ================= */
function scoreEntry(e, qt) {
  let score = 0, strong = 0;
  for (const t of new Set(qt)) {
    let s = 0, st = false;
    if (e.kwT.has(t)) { s += 3; st = true; }
    if (e.topT.has(t)) { s += 2; st = true; }
    if (e.qT.has(t)) { s += 2; st = true; }
    if (e.txtT.has(t)) s += 1;
    score += s;
    if (st && !GENERIC.has(t)) strong++;
  }
  return { score, strong };
}
function search(query, n = 3) {
  const qt = toks(query);
  return kbList.map(e => ({ e, ...scoreEntry(e, qt) }))
    .filter(r => r.strong >= 1 && r.score >= 3)
    .sort((a, b) => b.score - a.score).slice(0, n);
}
function entryHTML(e, pick) {
  const body = `<h3>${esc(e.topic)}${pick ? `<span class="badge">${chosen.has(String(e.id)) ? "Selected ✓" : "Tap to select"}</span>` : ""}</h3>
    <div class="t">${esc(e.text)}</div>
    <div class="src">Source: knowledge base entry #${esc(e.id)} · ${esc(e.topic)}</div>`;
  return pick
    ? `<button type="button" class="card pick ${chosen.has(String(e.id)) ? "sel" : ""}" data-id="${esc(e.id)}">${body}</button>`
    : `<div class="card">${body}</div>`;
}

/* ================= Form state ================= */
const sel = id => $(id).options[$(id).selectedIndex].text;
const signs = () => [...document.querySelectorAll(".sign:checked")].map(x => x.value);
const hasInput = () => $("desc").value.trim() || signs().length || imgData;
function started() { return reached >= 1; }

function archetypes() {
  const c = $("crumb").value, p = $("plate").value, w = $("white").checked, t = [];
  if (c === "fall") t.push("sodic");
  if (w || p === "film") t.push("saline");
  if (c === "whole" && !w && p !== "film") t.push("compacted");
  return t;
}
function archMatch(a, tags) {
  if (!tags.length || !a || /all|any|general|every/.test(a)) return true;
  return tags.some(t => (t === "sodic" && /sodi/.test(a)) || (t === "saline" && /sal/.test(a)) || (t === "compacted" && /compact|plain/.test(a)));
}
function entriesFor(s) {
  const tags = archetypes();
  const ctx = $("desc").value + " " + signs().join(" ") + " " + sel("crumb") + " " + sel("plate") + " " + sel("hole");
  const qt = toks(ctx);
  if (kbList.some(e => e.step)) {
    return kbList.filter(e => e.step === s && archMatch(e.arch, tags))
      .map(e => ({ e, sc: scoreEntry(e, qt).score })).sort((a, b) => b.sc - a.sc).slice(0, 6).map(x => x.e);
  }
  return search(STEPQ[s], 4).map(r => r.e).filter(e => archMatch(e.arch, tags));
}

/* ================= Image upload ================= */
function setImage(file) {
  if (!file || !file.type.startsWith("image/")) return;
  const rd = new FileReader();
  rd.onload = () => {
    imgData = rd.result;
    $("prev").src = imgData; $("dropIdle").hidden = true; $("dropPrev").hidden = false;
  };
  rd.readAsDataURL(file);
}
$("drop").onclick = e => { if (e.target.id !== "rmImg") $("imgfile").click(); };
$("drop").onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("imgfile").click(); } };
$("imgfile").onchange = e => setImage(e.target.files[0]);
$("rmImg").onclick = e => {
  e.stopPropagation(); imgData = null; $("imgfile").value = "";
  $("dropIdle").hidden = false; $("dropPrev").hidden = true;
};
["dragenter", "dragover"].forEach(ev => $("drop").addEventListener(ev, e => { e.preventDefault(); $("drop").classList.add("over"); }));
["dragleave", "drop"].forEach(ev => $("drop").addEventListener(ev, e => { e.preventDefault(); $("drop").classList.remove("over"); }));
$("drop").addEventListener("drop", e => setImage(e.dataTransfer.files[0]));

/* ================= Wizard ================= */
function go(i) {
  stage = i; reached = Math.max(reached, i); render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderRail() {
  $("rail").innerHTML = STAGES.map((s, i) => {
    const cls = i === stage ? "on" : (i < reached ? "done" : "");
    const n = i === 0 ? "•" : (i === 10 ? "★" : (i < reached && i !== stage ? "✓" : i));
    return `<li><button class="${cls}" data-i="${i}" ${i > reached ? "disabled" : ""}${i === stage ? ' aria-current="step"' : ""}><span class="n">${n}</span><span>${esc(s.rail)}</span></button></li>`;
  }).join("");
}

function stepHTML(s) {
  const m = STAGES[s];
  let h = `<span class="stepno">${s <= 9 ? "Step " + s + " of 9" : "Complete"}</span><h1>${esc(m.title)}</h1><p class="lead">${esc(m.why)}</p>`;
  if (!kbList.length && s >= 2) return h + `<div class="card none"><div class="t">The knowledge base is not loaded yet. Click “Load kb.json” at the top.</div></div>`;

  if (s === 1) {
    const d = $("desc").value.trim(), sg = signs();
    h += `<div class="${imgData ? "echo" : ""}"><div>`;
    if (!d && !sg.length) h += `<div class="card"><div class="t">No description or signs were entered.</div></div>`;
    if (d) h += `<div class="card"><h3>Your description</h3><div class="t">${esc(d)}</div></div>`;
    if (sg.length) h += `<div class="card"><h3>Signs you ticked</h3><ul>${sg.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>`;
    h += `<div class="card"><h3>Checks and water</h3><ul><li>Crumb check: ${esc(sel("crumb"))}</li><li>Plate check: ${esc(sel("plate"))}</li><li>Drainage hole: ${esc(sel("hole"))}</li><li>Water source: ${esc(sel("water"))}</li></ul></div></div>`;
    if (imgData) h += `<div><img src="${imgData}" alt="Your uploaded photo"></div>`;
    h += `</div>`;
    return h;
  }

  if (s === 10) {
    const crops = kbList.filter(e => chosen.has(String(e.id)));
    h += `<div class="card"><h3>Crops you selected</h3>${crops.length ? `<ul>${crops.map(c => `<li>${esc(c.topic)}</li>`).join("")}</ul>` : `<div class="t">None selected. Go back to Step 5 to choose.</div>`}</div>`;
    for (let k = 2; k <= 9; k++) {
      const list = entriesFor(k);
      h += `<div class="card ${list.length ? "" : "none"}"><h3>Step ${k} · ${esc(STAGES[k].rail)}</h3>${list.length ? `<ul>${list.map(e => `<li>${esc(e.topic)}</li>`).join("")}</ul>` : `<div class="t">${NOT_FOUND}</div>`}</div>`;
    }
    return h;
  }

  if (s === 2) {
    const tags = archetypes();
    const todo = [];
    if (!$("crumb").value) todo.push("crumb check");
    if (!$("plate").value) todo.push("plate check on the water");
    if (!$("hole").value) todo.push("drainage hole check");
    if (!$("water").value) todo.push("water source");
    if (tags.length) h += `<div class="note">Matching knowledge base entries for: <strong>${esc(tags.join(" + "))}</strong> (plus general entries).</div>`;
    if (todo.length) h += `<div class="note">Not done yet: ${esc(todo.join(", "))}. Use “Edit my inputs” to add them once you have tried.</div>`;
  }

  const list = entriesFor(s);
  h += list.length ? list.map(e => entryHTML(e, s === 5)).join("") : `<div class="card none"><div class="t">${NOT_FOUND}</div></div>`;
  return h;
}

const ACC = ["#8a5d44", "#8a5d44", "#c8891f", "#2b7a78", "#2f6fa3", "#4c8a3c", "#7a7a2f", "#3f7d5a", "#2f8f83", "#c8891f", "#2b7a78"];

function render() {
  document.body.style.setProperty("--accent", ACC[stage]);
  renderRail();
  $("bar").style.width = (stage / 10 * 100) + "%";
  const onForm = stage === 0;
  $("form").hidden = !onForm;
  $("step").hidden = onForm;
  $("nav").hidden = onForm;
  $("start").textContent = started() ? "Update and continue" : "Start analysis";
  if (onForm) return;
  const el = $("step");
  el.innerHTML = stepHTML(stage);
  el.classList.remove("fade"); void el.offsetWidth; el.classList.add("fade");
  $("next").hidden = stage === 10;
  $("next").textContent = stage === 9 ? "View summary" : "Next";
  $("print").hidden = $("restart").hidden = stage !== 10;
}

$("start").onclick = () => {
  if (!hasInput()) { $("formErr").hidden = false; return; }
  $("formErr").hidden = true;
  go(1);
};
$("next").onclick = () => go(Math.min(10, stage + 1));
$("back").onclick = () => go(Math.max(0, stage - 1));
$("edit").onclick = () => go(0);
$("print").onclick = () => window.print();
$("restart").onclick = () => {
  if (!confirm("Clear everything and start over?")) return;
  $("desc").value = ""; document.querySelectorAll(".sign").forEach(c => c.checked = false);
  ["crumb", "plate", "hole", "water"].forEach(id => $(id).selectedIndex = 0);
  imgData = null; $("rmImg").click(); chosen.clear(); stage = 0; reached = 0; render();
};
$("rail").onclick = e => { const b = e.target.closest("button"); if (b && !b.disabled) go(+b.dataset.i); };
$("step").onclick = e => {
  const p = e.target.closest(".pick"); if (!p) return;
  const id = p.dataset.id; chosen.has(id) ? chosen.delete(id) : chosen.add(id);
  const y = window.scrollY; render(); window.scrollTo(0, y);
};

/* ================= Ask ================= */
function ask() {
  const q = $("q").value.trim(); if (!q) return;
  let h = "";
  if (!kbList.length) { $("ans").innerHTML = `<div class="card none"><div class="t">The knowledge base is not loaded yet.</div></div>`; return; }
  if (SCI.test(q)) h += `<div class="note">This system does not use instrument readings or fixed numbers. Describe what you can see, feel, or test with household items.</div>`;
  const hits = search(q, 3);
  if (!hits.length) h += `<div class="card none"><div class="t">${NOT_FOUND}</div></div>`;
  else {
    h += hits.map(r => entryHTML(r.e)).join("");
    const cov = new Set(); hits.forEach(r => [r.e.kwT, r.e.topT, r.e.qT, r.e.txtT].forEach(s => s.forEach(t => cov.add(t))));
    const miss = [...new Set(toks(q))].filter(t => !cov.has(t) && !GENERIC.has(t));
    if (miss.length) h += `<div class="note">Not covered by the knowledge base: ${esc(miss.join(", "))}</div>`;
  }
  $("ans").innerHTML = h;
}
$("ask").onclick = ask;
$("q").addEventListener("keydown", e => { if (e.key === "Enter") ask(); });

/* ================= KB check (for the team) ================= */
function lint() {
  const L = $("lint");
  if (!kbList.length) { L.innerHTML = `<h1>KB check</h1><p class="lead">Load the knowledge base first.</p>`; return; }
  const counts = {}; kbList.forEach(e => counts[e.step] = (counts[e.step] || 0) + 1);
  let h = `<h1>KB check</h1><p class="lead">For the team building kb.json.</p><h2>Entries per step</h2><ul>`;
  for (let s = 2; s <= 9; s++) h += `<li>Step ${s} · ${esc(STAGES[s].rail)}: ${counts[s] || 0}${counts[s] ? "" : " (none yet)"}</li>`;
  h += `<li>No step set: ${counts[0] || 0}</li></ul>`;
  const bad = kbList.filter(e => /\d/.test(e.text) || /\b(ph|ec|ppm|sar|esp|dsm)\b|ds\/m/i.test(e.text));
  h += `<h2>Entries with numbers or readings</h2><p class="muted">The ground rule bans fixed numbers and readings.</p>`;
  h += bad.length ? bad.map(e => `<div class="card none"><h3>#${esc(e.id)} ${esc(e.topic)}</h3><div class="t">${esc(e.text)}</div></div>`).join("") : `<p class="muted">None found.</p>`;
  const nokw = kbList.filter(e => !e.kw.length);
  h += `<h2>Entries without keywords</h2>` + (nokw.length ? `<ul>${nokw.map(e => `<li>#${esc(e.id)} ${esc(e.topic)}</li>`).join("")}</ul>` : `<p class="muted">None.</p>`);
  L.innerHTML = h;
}

/* ================= View switching ================= */
function view(n) {
  ["plan", "ask", "lint"].forEach(v => { $("view-" + v).hidden = v !== n; $("v-" + v).classList.toggle("on", v === n); });
  if (n === "lint") lint();
}
$("v-plan").onclick = () => view("plan");
$("v-ask").onclick = () => view("ask");
$("v-lint").onclick = () => view("lint");

render();
loadKB();


/* ================= Scroll progress line ================= */
addEventListener("scroll", () => {
  const h = document.documentElement, m = h.scrollHeight - h.clientHeight;
  $("scrollbar").style.width = (m > 0 ? h.scrollTop / m * 100 : 0) + "%";
}, { passive: true });

/* ================= Button ripple ================= */
document.addEventListener("click", e => {
  const b = e.target.closest(".primary"); if (!b) return;
  const r = b.getBoundingClientRect(), d = Math.max(r.width, r.height), s = document.createElement("span");
  s.className = "ripple";
  s.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
  b.appendChild(s); setTimeout(() => s.remove(), 600);
});

/* ================= Intro: thunderstorm + neon circuit tree ================= */
(function intro() {
  const box = $("intro"); if (!box) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) { box.remove(); return; }

  const cv = $("storm"), ctx = cv.getContext("2d"), flash = $("flash");
  const logo = box.querySelector(".intrologo"), hud = box.querySelector(".hud");
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const ease = x => 1 - Math.pow(1 - x, 3);
  const DPR = Math.min(devicePixelRatio || 1, 2), MAXD = 8;
  let W, H, closed = false, raf, flashAmt = 0;
  let byDepth = [], tips = [], crown = { x: 0, y: 0 }, drops = [], bolts = [];

  /* ---- fractal tree ---- */
  function grow(x, y, a, l, d) {
    const x2 = x + Math.cos(a) * l, y2 = y + Math.sin(a) * l;
    byDepth[d].push({ x, y, x2, y2 });
    if (d >= MAXD) { tips.push({ x: x2, y: y2, r: Math.random() }); return; }
    const n = d < 2 ? 2 : (Math.random() < .72 ? 2 : 3);
    for (let i = 0; i < n; i++) {
      const spread = (i - (n - 1) / 2) * .58 + (Math.random() - .5) * .28;
      grow(x2, y2, a + spread, l * (.72 + Math.random() * .08), d + 1);
    }
  }
  function build() {
    byDepth = Array.from({ length: MAXD + 1 }, () => []); tips = [];
    grow(W / 2, H * .88, -Math.PI / 2, Math.min(H * .17, W * .2), 0);
    crown = tips.reduce((m, p) => p.y < m.y ? p : m, tips[0]);
  }
  function resize() {
    W = cv.clientWidth; H = cv.clientHeight;
    cv.width = W * DPR; cv.height = H * DPR; ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    build();
    drops = Array.from({ length: Math.round(W / 6) }, () => ({
      x: Math.random() * W, y: Math.random() * H, l: 10 + Math.random() * 18, v: 700 + Math.random() * 600
    }));
  }
  resize(); addEventListener("resize", resize);

  /* ---- lightning ---- */
  function jag(x1, y1, x2, y2, disp, out) {
    if (disp < 4) { out.push([x2, y2]); return; }
    const mx = (x1 + x2) / 2 + (Math.random() - .5) * disp, my = (y1 + y2) / 2 + (Math.random() - .5) * disp * .4;
    jag(x1, y1, mx, my, disp / 2, out); jag(mx, my, x2, y2, disp / 2, out);
  }
  function strike(main, tx, ty) {
    const sx = tx + (Math.random() - .5) * W * (main ? .1 : .5), pts = [[sx, 0]], forks = [];
    jag(sx, 0, tx, ty, main ? 130 : 90, pts);
    if (main) for (let i = 0; i < 3; i++) {
      const p = pts[Math.floor(pts.length * (.2 + Math.random() * .5))], f = [[p[0], p[1]]];
      jag(p[0], p[1], p[0] + (Math.random() - .5) * 320, p[1] + H * .28, 60, f); forks.push(f);
    }
    bolts.push({ pts, forks, life: 1, main });
    flashAmt = main ? .9 : .45;
    if (main) { box.classList.remove("shake"); void box.offsetWidth; box.classList.add("shake"); }
  }
  const events = [
    { t: 1.3, fn: () => strike(false, Math.random() * W * .3, H * .88) },
    { t: 2.0, fn: () => strike(false, W * .7 + Math.random() * W * .25, H * .88) },
    { t: 2.7, fn: () => strike(true, crown.x, crown.y) },
    { t: 3.9, fn: () => strike(true, crown.x, crown.y + 20) }
  ];

  /* ---- drawing ---- */
  function drawGround() {
    const hy = H * .88, g = ctx.createLinearGradient(0, hy, 0, H);
    g.addColorStop(0, "rgba(40,230,190,.2)"); g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g; ctx.fillRect(0, hy, W, H - hy);
    ctx.strokeStyle = "rgba(80,240,210,.28)"; ctx.lineWidth = 1; ctx.beginPath();
    ctx.moveTo(0, hy); ctx.lineTo(W, hy);
    for (let i = 1; i <= 6; i++) { const y = hy + (H - hy) * Math.pow(i / 6, 2); ctx.moveTo(0, y); ctx.lineTo(W, y); }
    for (let i = -10; i <= 10; i++) { ctx.moveTo(W / 2 + i * W * .02, hy); ctx.lineTo(W / 2 + i * W * .13, H); }
    ctx.stroke();
  }
  function drawRain(t, dt) {
    const k = 1 - clamp((t - 5) / 2.5) * .75;            // storm eases off
    ctx.strokeStyle = `rgba(150,210,255,${.4 * k})`; ctx.lineWidth = 1; ctx.beginPath();
    for (const d of drops) {
      d.y += d.v * dt; d.x -= d.v * dt * .18;
      if (d.y > H) { d.y = -20; d.x = Math.random() * W * 1.2; }
      ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + d.l * .18, d.y - d.l);
    }
    ctx.stroke();
  }
  function drawTree(t) {
    const e = ease(clamp((t - 2.7) / 3)), g = .28 + .72 * e, L = MAXD + 1;
    ctx.lineCap = "round"; ctx.shadowColor = "#36ffb0"; ctx.shadowBlur = e * 16;
    ctx.strokeStyle = `hsla(${195 - e * 55},100%,${34 + e * 28}%,${.45 + .55 * e})`;
    byDepth.forEach((list, d) => {
      const f = clamp(g * L - d); if (!f) return;
      ctx.lineWidth = Math.max(1, (MAXD - d) * 1.5); ctx.beginPath();
      for (const b of list) { ctx.moveTo(b.x, b.y); ctx.lineTo(b.x + (b.x2 - b.x) * f, b.y + (b.y2 - b.y) * f); }
      ctx.stroke();
    });
    const bl = ease(clamp((t - 4.3) / 1.6));             // leaves bloom
    if (bl > 0) [[.5, "110,255,150"], [0, "70,190,255"]].forEach(([th, col]) => {
      ctx.shadowColor = `rgb(${col})`; ctx.shadowBlur = 10;
      ctx.fillStyle = `rgba(${col},.9)`; ctx.strokeStyle = `rgba(${col},.7)`; ctx.beginPath();
      for (const p of tips) {
        if ((p.r > .5) !== (th > 0)) continue;
        const r = (2 + p.r * 3.2) * bl * (1 + .25 * Math.sin(t * 3 + p.r * 20));
        ctx.moveTo(p.x + r, p.y); ctx.arc(p.x, p.y, r, 0, 7);
        if (p.r > .8) { ctx.moveTo(p.x + r + 5, p.y); ctx.arc(p.x, p.y, r + 5, 0, 7); }  // circuit-node ring
      }
      ctx.fill(); ctx.stroke();
    });
    ctx.shadowBlur = 0;
  }
  function drawBolts() {
    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i]; b.life -= .045;
      if (b.life <= 0) { bolts.splice(i, 1); continue; }
      const line = (pts, w) => { ctx.beginPath(); pts.forEach((p, j) => j ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.lineWidth = w; ctx.stroke(); };
      ctx.lineJoin = "round"; ctx.globalAlpha = clamp(b.life * 1.4);
      ctx.shadowColor = "#7cc8ff"; ctx.shadowBlur = 24;
      ctx.strokeStyle = "#8fd0ff"; line(b.pts, b.main ? 6 : 4); b.forks.forEach(f => line(f, 2.5));
      ctx.shadowBlur = 0; ctx.strokeStyle = "#fff"; line(b.pts, b.main ? 2.2 : 1.4);
      ctx.globalAlpha = 1;
    }
  }

  let t0 = performance.now(), last = t0;
  function frame(now) {
    if (closed) return;
    const t = (now - t0) / 1000, dt = Math.min(.05, (now - last) / 1000); last = now;
    events.forEach(ev => { if (!ev.done && t >= ev.t) { ev.done = true; ev.fn(); } });
    ctx.clearRect(0, 0, W, H);
    drawGround(); drawRain(t, dt); drawTree(t); drawBolts();
    flashAmt *= .88; flash.style.opacity = flashAmt < .01 ? 0 : flashAmt;
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  /* ---- UI sequence ---- */
  const close = () => {
    if (closed) return; closed = true; cancelAnimationFrame(raf);
    removeEventListener("resize", resize);
    box.classList.add("out"); setTimeout(() => box.remove(), 800);
  };
  $("skip").onclick = close;
  box.addEventListener("click", close);
  addEventListener("keydown", e => { if (e.key === "Escape" || e.key === "Enter") close(); });

  const wait = ms => new Promise(r => setTimeout(r, ms));
  const type = (el, text, speed) => new Promise(res => {
    let i = 0; el.classList.add("caret");
    const id = setInterval(() => {
      if (closed) { clearInterval(id); return res(); }
      el.textContent = text.slice(0, ++i);
      if (i >= text.length) { clearInterval(id); el.classList.remove("caret"); res(); }
    }, speed);
  });
  (async () => {
    await wait(2900); logo.classList.add("show"); hud.classList.add("show");
    await wait(900);  await type($("introTitle"), "Sodic Clay Plateau", 65);
    await type($("introSub"), "Read the soil. Answer only from what is known.", 28);
    await wait(1300); close();
  })();
})();