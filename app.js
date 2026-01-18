/**
 * Include:
 * - Autosave su localStorage
 * - Import/Export .txt (JSON)
 * - Binding di tutti i campi con data-key (eccetto legami: dinamici)
 * - Attributi BASE/CORRENTE (d20 d12 d10 d8 d6) con debuff cumulativi:
 *      DEX: LENTO + FURENTE
 *      INT: CONFUSO + FURENTE
 *      VIG: DEBOLE + AVVELENATO
 *      VOL: SCOSSO + AVVELENATO
 * - HUD HP/MP: slider per VALORI CORRENTI + click sul testo per edit "cur/max"
 * - IP (MAX/CORRENTE): input normali con render dedicato (renderIPFields)
 * - Pozioni:
 *      Rosso: +50 HP, -3 IP (scende da CORRENTE, cumulativo)
 *      Blu:   +50 MP, -3 IP (scende da CORRENTE, cumulativo)
 *      Giallo:-2 IP (nessun status automatico)
 * - Legami:
 *    - 4 di default
 *    - aggiunta con bottone
 *    - collassabili
 *    - rimozione con pressione su cestino per 3 secondi
 *
 * Requisiti HTML (id / data-key):
 * - #btnExport, #btnNew, #fileImport
 * - Portrait: #portraitImg + input data-key="portraitUrl"
 * - Legami: #bondsList, #bondsBody, #btnToggleBonds, #btnAddBond
 * - HUD HP: #hpBar #hpFill #hpText #hpHit #hpSlider
 * - HUD MP: #mpBar #mpFill #mpText #mpHit #mpSlider
 * - IP inputs: data-key="points.ip.max" e data-key="points.ip.current"
 * - Pozioni: #btnPotionHP, #btnPotionMP, #btnPotionCure
 * - ATTRIBUTI CORRENTI: input readonly con data-attr-current="dex|ins|mig|wlp"
 * - BASE attributes: select con data-key="attributes.dex.base" ecc.
 * - Status: checkbox con data-key="status.slow" ecc.
 */

"use strict";

/* ============================================================
   0) COSTANTI & UTILITIES
   ============================================================ */

const STORAGE_KEY = "fabula_ultima_character_v1";
const DICE = ["d20", "d12", "d10", "d8", "d6"];

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function intOrNull(x) {
  const n = Number.parseInt(String(x).trim(), 10);
  return Number.isFinite(n) ? n : null;
}

function getByPath(obj, path) {
  const parts = path.split(".");
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

function setByPath(obj, path, value) {
  const parts = path.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (!(p in cur)) cur[p] = {};
    cur = cur[p];
  }
  cur[parts[parts.length - 1]] = value;
}

/**
 * deepMerge:
 * - Unisce incoming dentro base
 * - Arrays: preserva anche gli elementi extra (bonds aggiunti)
 */
function deepMerge(base, incoming) {
  if (typeof base !== "object" || base === null) return incoming;

  if (Array.isArray(base)) {
    const arrIn = Array.isArray(incoming) ? incoming : [];
    const maxLen = Math.max(base.length, arrIn.length);
    const out = [];
    for (let i = 0; i < maxLen; i++) {
      if (i < base.length && i < arrIn.length) out[i] = deepMerge(base[i], arrIn[i]);
      else if (i < arrIn.length) out[i] = arrIn[i];
      else out[i] = base[i];
    }
    return out;
  }

  const out = { ...base };
  if (typeof incoming !== "object" || incoming === null) return out;

  for (const k of Object.keys(incoming)) {
    if (k in out) out[k] = deepMerge(out[k], incoming[k]);
    else out[k] = incoming[k];
  }
  return out;
}

/* ============================================================
   1) DEFAULT STATE
   ============================================================ */

function defaultBond() {
  return {
    name: "",
    admiration: false,
    loyalty: false,
    affection: false,
    inferiority: false,
    mistrust: false,
    hatred: false,
  };
}

function defaultData() {
  return {
    // Identità
    name: "",
    pronouns: "",
    identity: "",
    theme: "",
    origin: "",
    portraitUrl: "",

    // Legami
    bonds: Array.from({ length: 4 }, () => defaultBond()),
    bondsUI: { collapsed: false },

    // Attributi
    attributes: {
      dex: { base: "d8", current: "d8" },
      ins: { base: "d8", current: "d8" },
      mig: { base: "d8", current: "d8" },
      wlp: { base: "d8", current: "d8" },
    },

    // Stati
    status: {
      slow: false,
      dazed: false,
      weak: false,
      shaken: false,
      enraged: false,
      poisoned: false,
    },

    // Punti
    points: {
      hp: { max: 0, current: 0 },
      mp: { max: 0, current: 0 },
      ip: { max: 0, current: 0 },
    },

    // Difese e iniziativa
    initiative: 0,
    defense: 0,
    magicDefense: 0,

    // Equip table
    equipment: {
      mainHand: { item: "", desc: "" },
      offHand: { item: "", desc: "" },
      armor: { item: "", desc: "" },
      accessory: { item: "", desc: "" },
      extra: { item: "", desc: "" },
    },

    // Note e zenit
    backpackNotes: "",
    zenit: 0,

    // Classes
    classes: Array.from({ length: 3 }, () => ({
      classLevel: "",
      freeBenefits: "",
      skills: "",
    })),
  };
}

/* ============================================================
   2) PERSONAGGIO E STATI
   ============================================================ */

let state = defaultData();
let saveTimer = null;

// Indicator
const indicator = document.getElementById("saveIndicator");

// Portrait
const portraitImg = document.getElementById("portraitImg");

// Bonds
const bondsListEl = document.getElementById("bondsList");
const bondsBodyEl = document.getElementById("bondsBody");
const btnToggleBonds = document.getElementById("btnToggleBonds");

// HUD HP
const hpBar = document.getElementById("hpBar");
const hpFill = document.getElementById("hpFill");
const hpText = document.getElementById("hpText");
const hpSlider = document.getElementById("hpSlider");
const hpHit = document.getElementById("hpHit");

// HUD MP
const mpBar = document.getElementById("mpBar");
const mpFill = document.getElementById("mpFill");
const mpText = document.getElementById("mpText");
const mpSlider = document.getElementById("mpSlider");
const mpHit = document.getElementById("mpHit");

/* ============================================================
   3) UI HELPERS
   ============================================================ */

function setIndicator(text) {
  if (indicator) indicator.textContent = text;
}

function readInputValue(el) {
  if (el.type === "checkbox") return el.checked;
  if (el.type === "number") return el.value === "" ? 0 : Number(el.value);
  return el.value ?? "";
}

function writeInputValue(el, value) {
  if (el.type === "checkbox") el.checked = !!value;
  else el.value = value ?? "";
}

/* ============================================================
   4) BONDS (DYNAMIC) — RENDER + BIND
   ============================================================ */

function trashSvg() {
  return `
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 3h6m-8 4h10m-9 0 1 14h6l1-14"
            stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M10 11v7M14 11v7"
            stroke="currentColor" stroke-width="2"
            stroke-linecap="round"/>
    </svg>
  `;
}

/** Render dei bonds dentro #bondsList */
function renderBonds() {
  if (!bondsListEl) return;

  bondsListEl.innerHTML = "";

  state.bonds.forEach((_, i) => {
    const row = document.createElement("div");
    row.className = "bondRow";
    row.innerHTML = `
      <div class="bondTop">
        <input class="bondName"
               data-key="bonds.${i}.name"
               type="text"
               placeholder="Nome / descrizione" />

        <button class="bondDelete"
                type="button"
                data-del-bond="${i}"
                title="Rimuovi questo Bond"
                aria-label="Rimuovi bond">
          ${trashSvg()}
        </button>
      </div>

      <div class="bondChecks">
        <label><input data-key="bonds.${i}.admiration" type="checkbox">Admiration</label>
        <label><input data-key="bonds.${i}.loyalty" type="checkbox">Loyalty</label>
        <label><input data-key="bonds.${i}.affection" type="checkbox">Affection</label>
        <label><input data-key="bonds.${i}.inferiority" type="checkbox">Inferiority</label>
        <label><input data-key="bonds.${i}.mistrust" type="checkbox">Mistrust</label>
        <label><input data-key="bonds.${i}.hatred" type="checkbox">Hatred</label>
      </div>
    `;
    bondsListEl.appendChild(row);
  });

  hydrateAndBindDynamicBonds();
}

/** Popola valori e collega listener su input/checkbox dei bonds */
function hydrateAndBindDynamicBonds() {
  if (!bondsListEl) return;

  // Set values
  bondsListEl.querySelectorAll("[data-key]").forEach((el) => {
    const key = el.getAttribute("data-key");
    writeInputValue(el, getByPath(state, key));
  });

  // Bind
  bondsListEl.querySelectorAll("[data-key]").forEach((el) => {
    const handler = () => {
      const key = el.getAttribute("data-key");
      const val = readInputValue(el);
      setByPath(state, key, val);
      queueSave();
    };
    el.addEventListener("input", handler);
    el.addEventListener("change", handler);
  });
}

function addBond() {
  state.bonds.push(defaultBond());
  renderBonds();
  queueSave();
}

function deleteBondAt(index) {
  if (!Number.isFinite(index)) return;
  if (state.bonds.length <= 1) return;

  state.bonds.splice(index, 1);
  renderBonds();
  queueSave();
}

/* Collapse/Expand bonds */
function applyBondsCollapsedUI() {
  const collapsed = !!state.bondsUI?.collapsed;
  if (bondsBodyEl) bondsBodyEl.classList.toggle("is-collapsed", collapsed);
  if (btnToggleBonds) btnToggleBonds.setAttribute("aria-expanded", collapsed ? "false" : "true");
}

function toggleBonds() {
  state.bondsUI = state.bondsUI || { collapsed: false };
  state.bondsUI.collapsed = !state.bondsUI.collapsed;
  applyBondsCollapsedUI();
  queueSave();
}

/* ============================================================
   5) ATTRIBUTES + STATUS
   ============================================================ */

function normalizeDie(v) {
  if (typeof v === "string" && DICE.includes(v)) return v;
  return "d8";
}

/** Scala di N step: d20->d12->d10->d8->d6 (min d6) */
function downgradeDieSteps(die, steps) {
  die = normalizeDie(die);
  let idx = DICE.indexOf(die);
  if (idx < 0) idx = DICE.indexOf("d8");
  for (let s = 0; s < steps; s++) idx = Math.min(idx + 1, DICE.length - 1);
  return DICE[idx];
}

/** Aggiorna i campi CURRENT e highlight se diverso dal base */
function syncCurrentAttributeFields() {
  const map = {
    dex: { base: state.attributes.dex.base, current: state.attributes.dex.current },
    ins: { base: state.attributes.ins.base, current: state.attributes.ins.current },
    mig: { base: state.attributes.mig.base, current: state.attributes.mig.current },
    wlp: { base: state.attributes.wlp.base, current: state.attributes.wlp.current },
  };

  document.querySelectorAll("[data-attr-current]").forEach((el) => {
    const k = el.getAttribute("data-attr-current");
    const base = map[k]?.base ?? "";
    const cur = map[k]?.current ?? "";
    el.value = cur;
    el.classList.toggle("modified", base !== cur);
  });
}

/**
 * Debuff cumulativi:
 * DEX: slow + enraged
 * INS: dazed + enraged
 * MIG: weak + poisoned
 * WLP: shaken + poisoned
 */
function recomputeAttributeCurrents() {
  state.attributes.dex.base = normalizeDie(state.attributes.dex.base);
  state.attributes.ins.base = normalizeDie(state.attributes.ins.base);
  state.attributes.mig.base = normalizeDie(state.attributes.mig.base);
  state.attributes.wlp.base = normalizeDie(state.attributes.wlp.base);

  const enraged = !!state.status.enraged;
  const poisoned = !!state.status.poisoned;

  const slow = !!state.status.slow;
  const dazed = !!state.status.dazed;
  const weak = !!state.status.weak;
  const shaken = !!state.status.shaken;

  const dexSteps = (slow ? 1 : 0) + (enraged ? 1 : 0);
  const insSteps = (dazed ? 1 : 0) + (enraged ? 1 : 0);
  const migSteps = (weak ? 1 : 0) + (poisoned ? 1 : 0);
  const wlpSteps = (shaken ? 1 : 0) + (poisoned ? 1 : 0);

  state.attributes.dex.current = downgradeDieSteps(state.attributes.dex.base, dexSteps);
  state.attributes.ins.current = downgradeDieSteps(state.attributes.ins.base, insSteps);
  state.attributes.mig.current = downgradeDieSteps(state.attributes.mig.base, migSteps);
  state.attributes.wlp.current = downgradeDieSteps(state.attributes.wlp.base, wlpSteps);

  syncCurrentAttributeFields();
}

/* ============================================================
   6) PORTRAIT
   ============================================================ */

function updatePortrait() {
  if (!portraitImg) return;

  const url = (state.portraitUrl || "").trim();
  if (!url) {
    portraitImg.style.display = "none";
    portraitImg.removeAttribute("src");
    return;
  }

  portraitImg.src = url;
  portraitImg.style.display = "block";
}

/* ============================================================
   7) HUD HP/MP + IP inputs
   ============================================================ */

function clampPoints() {
  // HP
  state.points.hp.max = Math.max(0, Math.round(Number(state.points.hp.max ?? 0)));
  state.points.hp.current = clamp(
    Math.round(Number(state.points.hp.current ?? 0)),
    0,
    state.points.hp.max
  );

  // MP
  state.points.mp.max = Math.max(0, Math.round(Number(state.points.mp.max ?? 0)));
  state.points.mp.current = clamp(
    Math.round(Number(state.points.mp.current ?? 0)),
    0,
    state.points.mp.max
  );

  // IP (consumabile su current)
  state.points.ip.max = Math.max(0, Math.round(Number(state.points.ip.max ?? 0)));
  state.points.ip.current = clamp(
    Math.round(Number(state.points.ip.current ?? 0)),
    0,
    state.points.ip.max
  );
}

/** Aggiorna la barra HP/MP */
function renderBar(which) {
  const obj = state.points[which];
  const fill = which === "hp" ? hpFill : mpFill;
  const text = which === "hp" ? hpText : mpText;
  const slider = which === "hp" ? hpSlider : mpSlider;

  const max = obj.max;
  const cur = obj.current;

  const pct = max > 0 ? (cur / max) * 100 : 0;

  if (fill) fill.style.width = `${pct}%`;
  if (text) text.textContent = `${cur}/${max}`;
  if (slider) {
    slider.max = String(max);
    slider.value = String(cur);
  }
}

/** IP è un input normale: serve render dedicato */
function renderIPFields() {
  const maxEl = document.querySelector('[data-key="points.ip.max"]');
  const curEl = document.querySelector('[data-key="points.ip.current"]');

  if (maxEl) maxEl.value = state.points.ip.max ?? 0;
  if (curEl) curEl.value = state.points.ip.current ?? 0;
}

/** Editor inline sul testo "cur/max" per HP/MP */
function attachInlineEditor(which, textEl, barEl, hitEl) {
  const obj = state.points[which];

  const startEdit = () => {
    if (!textEl || !barEl || !hitEl) return;
    if (textEl.querySelector("input")) return;

    barEl.classList.add("is-editing");

    const oldCur = obj.current;
    const oldMax = obj.max;

    const input = document.createElement("input");
    input.value = `${obj.current}/${obj.max}`;
    input.setAttribute("aria-label", `Inserisci ${which.toUpperCase()} come cur/max (es. 80/120)`);

    textEl.textContent = "";
    textEl.appendChild(input);
    input.focus();
    input.select();

    const cancel = () => {
      obj.current = oldCur;
      obj.max = oldMax;
      barEl.classList.remove("is-editing");
      clampPoints();
      renderBar(which);
      queueSave();
    };

    const commit = () => {
      const raw = input.value.trim();

      if (raw.includes("/")) {
        const [left, right] = raw.split("/");
        const maybeCur = left.trim() === "" ? null : intOrNull(left);
        const maybeMax = right.trim() === "" ? null : intOrNull(right);

        if (maybeMax !== null) obj.max = Math.max(0, maybeMax);
        if (maybeCur !== null) obj.current = maybeCur;
      } else {
        const maybeMax = intOrNull(raw);
        if (maybeMax !== null) obj.max = Math.max(0, maybeMax);
      }

      clampPoints();
      barEl.classList.remove("is-editing");
      renderBar(which);
      queueSave();
    };

    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") commit();
      if (ev.key === "Escape") cancel();
    });
    input.addEventListener("blur", commit);
  };

  hitEl?.addEventListener("click", (e) => {
    e.stopPropagation();
    startEdit();
  });
}

/* ============================================================
   8) POZIONI (sotto IP) — consumo cumulativo su IP
   ============================================================ */

function spendIP(cost) {
  state.points.ip.current = Math.max(0, Number(state.points.ip.current ?? 0) - cost);
}

function useRemedyHP() {
  if (state.points.ip.current < 3) return; // non abbastanza IP

  state.points.hp.current = Number(state.points.hp.current ?? 0) + 50;
  spendIP(3);

  clampPoints();
  renderBar("hp");
  renderIPFields();
  queueSave();
}

function useElixirMP() {
  if (state.points.ip.current < 3) return; // non abbastanza IP

  state.points.mp.current = Number(state.points.mp.current ?? 0) + 50;
  spendIP(3);

  clampPoints();
  renderBar("mp");
  renderIPFields();
  queueSave();
}


function useAntidote() {
  if (state.points.ip.current < 2) return; // non abbastanza IP

  spendIP(2);

  clampPoints();
  renderIPFields();
  queueSave();
}


/* ============================================================
   9) BINDING GENERALE data-key (esclude bonds)
   ============================================================ */

function bindInputs() {
  const fields = document.querySelectorAll("[data-key]");

  fields.forEach((el) => {
    const key = el.getAttribute("data-key");
    if (!key) return;

    // Bonds gestiti dinamicamente
    if (key.startsWith("bonds.")) return;

    const handler = () => {
      const k = el.getAttribute("data-key");
      const val = readInputValue(el);

      // current attributes non editabili
      if (k.startsWith("attributes.") && k.endsWith(".current")) {
        syncCurrentAttributeFields();
        return;
      }

      setByPath(state, k, val);

      // Side effects
      if (k === "portraitUrl") updatePortrait();

      const isAttrBase = k.startsWith("attributes.") && k.endsWith(".base");
      const isStatus = k.startsWith("status.");
      if (isAttrBase || isStatus) recomputeAttributeCurrents();

      // Se l'utente modifica IP max/current a mano -> clampa e rendi
      if (k === "points.ip.max" || k === "points.ip.current") {
        clampPoints();
        renderIPFields();
      }

      // Se l'utente modifica HP/MP max/current a mano (via input o altro)
      if (k === "points.hp.max" || k === "points.hp.current") {
        clampPoints();
        renderBar("hp");
      }
      if (k === "points.mp.max" || k === "points.mp.current") {
        clampPoints();
        renderBar("mp");
      }

      queueSave();
    };

    el.addEventListener("input", handler);
    el.addEventListener("change", handler);
  });
}

/* ============================================================
   10) RENDER COMPLETO
   ============================================================ */

function renderAll() {
  const fields = document.querySelectorAll("[data-key]");

  fields.forEach((el) => {
    const key = el.getAttribute("data-key");
    if (!key) return;
    if (key.startsWith("bonds.")) return;
    writeInputValue(el, getByPath(state, key));
  });

  renderBonds();
  applyBondsCollapsedUI();

  updatePortrait();
  recomputeAttributeCurrents();

  clampPoints();
  renderBar("hp");
  renderBar("mp");
  renderIPFields();
}

/* ============================================================
   11) SAVE / LOAD
   ============================================================ */

function queueSave() {
  setIndicator("Salvataggio…");
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveLocal, 250);
}

function saveLocal() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  setIndicator("Salvato");
}

function loadLocal() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return false;

  try {
    const parsed = JSON.parse(raw);
    state = deepMerge(defaultData(), parsed);

    // normalize dice
    state.attributes.dex.base = normalizeDie(state.attributes.dex.base);
    state.attributes.ins.base = normalizeDie(state.attributes.ins.base);
    state.attributes.mig.base = normalizeDie(state.attributes.mig.base);
    state.attributes.wlp.base = normalizeDie(state.attributes.wlp.base);

    if (!Array.isArray(state.bonds)) state.bonds = Array.from({ length: 4 }, () => defaultBond());
    if (!state.bondsUI) state.bondsUI = { collapsed: false };

    return true;
  } catch {
    return false;
  }
}

/* ============================================================
   12) IMPORT / EXPORT
   ============================================================ */

function exportTxt() {
  const payload = {
    app: "fabula-ultima-sheet",
    version: 1,
    exportedAt: new Date().toISOString(),
    character: state,
  };

  const text = JSON.stringify(payload, null, 2);
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });

  const a = document.createElement("a");
  const safeName = (state.name || "personaggio").trim().replace(/[^\w\-]+/g, "_");
  a.href = URL.createObjectURL(blob);
  a.download = `${safeName}.txt`;

  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(a.href);
}

function importTxtFile(file) {
  const reader = new FileReader();

  reader.onload = () => {
    try {
      const txt = String(reader.result || "");
      const parsed = JSON.parse(txt);
      const incoming = parsed?.character ?? parsed;

      state = deepMerge(defaultData(), incoming);

      state.attributes.dex.base = normalizeDie(state.attributes.dex.base);
      state.attributes.ins.base = normalizeDie(state.attributes.ins.base);
      state.attributes.mig.base = normalizeDie(state.attributes.mig.base);
      state.attributes.wlp.base = normalizeDie(state.attributes.wlp.base);

      if (!Array.isArray(state.bonds)) state.bonds = Array.from({ length: 4 }, () => defaultBond());
      if (!state.bondsUI) state.bondsUI = { collapsed: false };

      renderAll();
      saveLocal();
      setIndicator("Importato e salvato");
    } catch {
      alert("File non valido. Deve contenere JSON (anche se estensione .txt).");
    }
  };

  reader.readAsText(file);
}

function newSheet() {
  if (!confirm("Vuoi davvero creare una nuova scheda? Il salvataggio locale verrà sovrascritto.")) return;
  state = defaultData();
  renderAll();
  saveLocal();
  setIndicator("Nuova scheda");
}

/* ============================================================
   13) EVENTI (wireButtons)
   ============================================================ */

function wireButtons() {
  // Toolbar
  document.getElementById("btnExport")?.addEventListener("click", exportTxt);
  document.getElementById("btnNew")?.addEventListener("click", newSheet);

  document.getElementById("fileImport")?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) importTxtFile(file);
    e.target.value = "";
  });

  // legami
  document.getElementById("btnAddBond")?.addEventListener("click", addBond);
  btnToggleBonds?.addEventListener("click", toggleBonds);

  // Cestino legami
  bondsListEl?.addEventListener(
    "click",
    (e) => {
      let el = e.target;
      while (el && el !== bondsListEl) {
        if (el.dataset && el.dataset.delBond !== undefined) break;
        el = el.parentNode;
      }
      if (!el || el === bondsListEl) return;

      e.preventDefault();
      e.stopPropagation();

      const idx = Number(el.dataset.delBond);
      deleteBondAt(idx);
    },
    true
  );

  // Pozioni
  document.getElementById("btnPotionHP")?.addEventListener("click", useRemedyHP);
  document.getElementById("btnPotionMP")?.addEventListener("click", useElixirMP);
  document.getElementById("btnPotionCure")?.addEventListener("click", useAntidote);

  // HUD sliders
  hpSlider?.addEventListener("input", (e) => {
    const v = intOrNull(e.target.value);
    if (v !== null) state.points.hp.current = v;
    clampPoints();
    renderBar("hp");
    queueSave();
  });

  mpSlider?.addEventListener("input", (e) => {
    const v = intOrNull(e.target.value);
    if (v !== null) state.points.mp.current = v;
    clampPoints();
    renderBar("mp");
    queueSave();
  });

  // Inline editor su testo HP/MP
  attachInlineEditor("hp", hpText, hpBar, hpHit);
  attachInlineEditor("mp", mpText, mpBar, mpHit);
}

/* ============================================================
   14) INIT
   ============================================================ */

bindInputs();
wireButtons();

const loaded = loadLocal();
renderAll();
setIndicator(loaded ? "Caricato da salvataggio locale" : "Pronto");
