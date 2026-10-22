// Панель «Синонимы» для Word.
(function () {
  "use strict";

  var VERSION = "1.2.4";
  var DICT_VER = "2";

  var SOURCES = [
    { id: "abramov", name: "Абрамов", short: "А", url: "dict/abramov.json",
      about: "Словарь русских синонимов Н. Абрамова (1911)" },
    { id: "wiki", name: "Викисловарь", short: "В", live: true,
      about: "Русский Викисловарь, ru.wiktionary.org (CC BY-SA)" },
    { id: "ruwordnet", name: "RuWordNet", short: "Р", url: "dict/ruwordnet.json",
      about: "Тезаурус RuWordNet 2021, ruwordnet.ru (CC BY-SA 4.0)" },
    { id: "libreoffice", name: "LibreOffice", short: "Л", url: "dict/libreoffice.json",
      about: "Тезаурус LibreOffice: АОТ и Абрамов в ред. М. Королёва (LGPL)" }
  ];
  var BY_ID = {};
  SOURCES.forEach(function (s) { BY_ID[s.id] = s; });

  var dicts = {};
  var wikiCache = {};
  var state = { word: null, target: null, prefer: null, cur: null, lemmas: [], results: {}, wiki: "idle", reqId: 0,
                phrase: false, context: "" };
  var ai = { settings: AI.loadSettings(), style: "same", status: "idle", variants: [], error: "", model: "",
             reqId: 0, cache: {}, open: false, models: null, forKey: "" };
  var tab = readTab();
  var ignoreSelUntil = 0;
  var inWord = false;

  var $ = function (id) { return document.getElementById(id); };
  var L = "A-Za-zА-Яа-яЁё";

  function setStatus(before, bold, after) {
    var box = $("status");
    box.textContent = before || "";
    if (bold != null) {
      var b = document.createElement("b");
      b.textContent = bold;
      box.appendChild(b);
      box.appendChild(document.createTextNode(after || ""));
    }
  }
  function readTab() { try { return localStorage.getItem("sin-tab") || "all"; } catch (e) { return "all"; } }
  function saveTab(t) { try { localStorage.setItem("sin-tab", t); } catch (e) {} }
  function anyLoaded() { return SOURCES.some(function (s) { return dicts[s.id] && typeof dicts[s.id] === "object"; }); }
  function hasLocal(w) {
    return SOURCES.some(function (s) { var d = dicts[s.id]; return d && typeof d === "object" && d.has(w); });
  }

  function openDb() {
    return new Promise(function (res, rej) {
      var r = indexedDB.open("sinonimy", 1);
      r.onupgradeneeded = function () { r.result.createObjectStore("kv"); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
  }
  function cacheGet(k) {
    return openDb().then(function (db) {
      return new Promise(function (res) {
        var q = db.transaction("kv").objectStore("kv").get(k);
        q.onsuccess = function () { res(q.result || null); };
        q.onerror = function () { res(null); };
      });
    }).catch(function () { return null; });
  }
  function cacheSet(k, v) {
    return openDb().then(function (db) { db.transaction("kv", "readwrite").objectStore("kv").put(v, k); }).catch(function () {});
  }
  function cacheDel(k) {
    return openDb().then(function (db) { db.transaction("kv", "readwrite").objectStore("kv").delete(k); }).catch(function () {});
  }

  async function loadDict(src) {
    dicts[src.id] = "loading";
    var k = "dict-" + src.id + "-v" + DICT_VER;
    try {
      var data = await cacheGet(k);
      if (!data) {
        var r = await fetch(src.url);
        if (!r.ok) throw new Error(r.status);
        data = await r.json();
        cacheSet(k, data);
      }
      dicts[src.id] = Syn.makeDict(data);
    } catch (e) {
      console.error(src.id, e);
      dicts[src.id] = "error";
    }
    if (state.word) show(state.word, state.target, state.prefer, true);
    else { idleStatus(); if (inWord) onSelectionChanged(); }
  }

  function idleStatus() {
    if (!anyLoaded()) {
      var failed = SOURCES.every(function (s) { return s.live || dicts[s.id] === "error"; });
      setStatus(failed ? "Словари не загрузились. Проверьте интернет и откройте панель заново."
                       : "Загружаю словари (только в первый раз, около 3 МБ)…");
    } else {
      setStatus(inWord ? "Выделите слово в документе" : "Введите слово в поиске");
    }
  }

  function yoVariants(w) {
    var out = [];
    for (var i = 0; i < w.length && out.length < 4; i++) {
      if (w[i] === "е") out.push(w.slice(0, i) + "ё" + w.slice(i + 1));
    }
    return out;
  }

  async function wikiLookup(titles) {
    var cacheKey = titles.join("|");
    if (Object.prototype.hasOwnProperty.call(wikiCache, cacheKey)) return wikiCache[cacheKey];
    var url = "https://ru.wiktionary.org/w/api.php?action=query&prop=revisions&rvprop=content&rvslots=main" +
              "&format=json&formatversion=2&redirects=1&origin=*&titles=" + encodeURIComponent(titles.join("|"));
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 10000) : null;
    var r = await fetch(url, ctrl ? { signal: ctrl.signal } : undefined);
    if (timer) clearTimeout(timer);
    if (!r.ok) throw new Error("wiki " + r.status);
    var j = await r.json();
    var q = j.query || {}, pages = {};
    (q.pages || []).forEach(function (p) {
      if (!p.missing && p.revisions) pages[p.title] = p.revisions[0].slots.main.content;
    });
    function resolve(t) {
      (q.normalized || []).forEach(function (n) { if (n.from === t) t = n.to; });
      (q.redirects || []).forEach(function (n) { if (n.from === t) t = n.to; });
      return t;
    }
    var result = null;
    for (var i = 0; i < titles.length && !result; i++) {
      var t = resolve(titles[i]);
      if (pages[t]) {
        var groups = Syn.parseWiki(pages[t]);
        if (groups.length) result = { title: t, groups: groups };
      }
    }
    wikiCache[cacheKey] = result;
    return result;
  }

  function wikiTitles(word, cur) {
    var raw = word.toLowerCase(), list = [];
    function add(t) { if (t && list.indexOf(t) === -1 && list.length < 40) list.push(t); }
    if (cur) { add(cur.lemma); yoVariants(cur.lemma).forEach(add); }
    add(raw);
    if (!cur) {
      Syn.findLemmas(null, word).slice(0, 10).forEach(function (l) { add(l.lemma); yoVariants(l.lemma).forEach(add); });
    }
    return list;
  }

  async function fetchWiki(word, cur, reqId) {
    state.wiki = "loading";
    try {
      var res = await wikiLookup(wikiTitles(word, cur));
      if (reqId !== state.reqId) return;
      if (res) {
        var info = cur && Syn.key(res.title) === Syn.key(cur.lemma) ? cur : Syn.ruleFor(word, res.title);
        state.results.wiki = { id: "wiki", lemma: res.title, groups: Syn.prepare(word, info, res.groups) };
      } else {
        state.results.wiki = { id: "wiki", groups: [] };
      }
      state.wiki = "done";
    } catch (e) {
      if (reqId !== state.reqId) return;
      console.error(e);
      state.wiki = "error";
      state.results.wiki = { id: "wiki", groups: [] };
    }
    render();
  }

  function show(word, target, prefer, keepWiki) {
    var sameWord = state.word === word && (state.prefer || null) === (prefer || null);
    state.word = word;
    state.target = target;
    state.prefer = prefer || null;
    state.phrase = /\s/.test(word.trim());
    if (!sameWord) aiReset();

    if (state.phrase) {
      state.reqId++;
      state.lemmas = []; state.cur = null; state.results = {}; state.wiki = "idle";
      render();
      return;
    }

    var lemmas = Syn.findLemmas(hasLocal, word);
    var cur = lemmas[0] || null;
    if (prefer) lemmas.forEach(function (l) { if (l.lemma === prefer) cur = l; });
    state.lemmas = lemmas;
    state.cur = cur;

    var oldWiki = state.results.wiki;
    state.results = {};
    SOURCES.forEach(function (s) {
      var d = dicts[s.id];
      if (s.live || !d || typeof d !== "object") return;
      state.results[s.id] = { id: s.id, groups: cur ? Syn.prepare(word, cur, d.groups(cur.lemma)) : [] };
    });

    if ((keepWiki || sameWord) && state.wiki === "loading") {
      render();
    } else if ((keepWiki || sameWord) && oldWiki && state.wiki !== "error") {
      state.results.wiki = oldWiki;
      render();
    } else {
      state.reqId++;
      state.results.wiki = null;
      state.wiki = "loading";
      render();
      fetchWiki(word, cur, state.reqId);
    }
  }

  function countOf(res) {
    if (!res) return 0;
    return res.groups.reduce(function (a, g) { return a + g.items.length; }, 0);
  }

  function ordered() {
    var list = [];
    SOURCES.forEach(function (s) { if (state.results[s.id]) list.push(state.results[s.id]); });
    return list;
  }

  function render() {
    var word = state.word;
    if (state.phrase) {
      renderTabs(0);
      $("lemmas").hidden = true;
      setStatus("Фраза: «", word.length > 80 ? word.slice(0, 80) + "…" : word, "»");
      renderAI();
      return;
    }
    var all = Syn.merge(ordered());
    renderTabs(all.length);

    var lemma = state.cur ? state.cur.lemma : (state.results.wiki && state.results.wiki.lemma) || null;
    if (!all.length) {
      var waiting = state.wiki === "loading" || SOURCES.some(function (s) { return dicts[s.id] === "loading"; });
      setStatus(waiting ? "Ищу синонимы к «" : "Нет синонимов для «", word, waiting ? "»…" : "»");
    } else {
      setStatus("«", word, "»" + (lemma && Syn.key(lemma) !== Syn.key(word) ? " → " + lemma : ""));
    }

    renderLemmas();

    var list = $("list");
    list.textContent = "";
    if (tab === "ai") {
      renderAI();
    } else if (tab === "all") {
      list.appendChild(chips(all, true));
    } else {
      var res = state.results[tab];
      if (!res) {
        list.appendChild(note(tab === "wiki" && state.wiki === "loading" ? "Загружаю статью из Викисловаря…"
                         : dicts[tab] === "error" ? "Этот словарь не загрузился. Проверьте интернет."
                         : dicts[tab] === "loading" ? "Словарь ещё загружается…" : ""));
      } else if (!res.groups.length) {
        list.appendChild(note(tab === "wiki" && state.wiki === "error" ? "Викисловарь сейчас недоступен."
                         : all.length ? "В этом словаре нет синонимов к этому слову. Посмотрите вкладку «Все»." : ""));
      } else {
        res.groups.forEach(function (g) {
          if (g.label || res.groups.length > 1) {
            var cap = document.createElement("div");
            cap.className = g.label ? "glabel" : "gsep";
            cap.textContent = g.label;
            list.appendChild(cap);
          }
          list.appendChild(chips(g.items, false));
        });
      }
    }
  }

  function note(text) {
    var p = document.createElement("p");
    p.className = "note";
    p.textContent = text;
    return p;
  }

  function chips(items, withSources) {
    var ul = document.createElement("ul");
    ul.className = "chips";
    items.forEach(function (it) {
      var li = document.createElement("li");
      var b = document.createElement("button");
      b.type = "button";
      b.appendChild(document.createTextNode(it.text));
      var tip = [];
      if (Syn.key(it.text) !== it.key) tip.push("Словарная форма: " + it.base);
      if (withSources && it.sources) {
        var sup = document.createElement("span");
        sup.className = "src";
        sup.textContent = it.sources.map(function (id) { return BY_ID[id].short; }).join("");
        b.appendChild(sup);
        tip.push("Есть в словарях: " + it.sources.map(function (id) { return BY_ID[id].name; }).join(", "));
      }
      if (tip.length) b.title = tip.join("\n");
      b.onclick = function () { replaceWith(it.text, b); };
      li.appendChild(b);
      ul.appendChild(li);
    });
    return ul;
  }

  function renderTabs(allCount) {
    var nav = $("tabs");
    nav.textContent = "";
    nav.hidden = false;
    var aiDef = { id: "ai", name: "✨ ИИ", title: "Перефразирование и синонимы по контексту через ИИ",
                  count: ai.status === "loading" || ai.status === "waiting" ? "…" : ai.status === "error" ? "!" : ai.variants.length || "" };
    var defs = state.phrase ? [aiDef] : [{ id: "all", name: "Все", count: allCount }].concat(SOURCES.map(function (s) {
      var res = state.results[s.id], c = countOf(res);
      var busy = s.live ? state.wiki === "loading" : dicts[s.id] === "loading";
      var err = s.live ? state.wiki === "error" : dicts[s.id] === "error";
      return { id: s.id, name: s.name, count: busy ? "…" : err ? "!" : c, title: s.about };
    })).concat([aiDef]);
    var active = state.phrase ? "ai" : tab;
    defs.forEach(function (d) {
      var b = document.createElement("button");
      b.type = "button";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", d.id === active ? "true" : "false");
      b.className = "tab" + (d.id === active ? " active" : "") + (d.count === 0 ? " empty" : "") + (d.id === "ai" ? " ai" : "");
      if (d.title) b.title = d.title;
      b.textContent = d.name + " ";
      var cnt = document.createElement("span");
      cnt.className = "cnt";
      cnt.textContent = String(d.count);
      b.appendChild(cnt);
      b.onclick = function () { if (state.phrase) return; tab = d.id; saveTab(tab); render(); };
      nav.appendChild(b);
    });
  }

  function renderLemmas() {
    var box = $("lemmas");
    box.textContent = "";
    if (state.lemmas.length < 2) { box.hidden = true; return; }
    box.appendChild(document.createTextNode("Другие значения: "));
    state.lemmas.forEach(function (l) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = l.lemma;
      if (state.cur && l.lemma === state.cur.lemma) b.className = "active";
      b.onclick = function () { show(state.word, state.target, l.lemma); };
      box.appendChild(b);
    });
    box.hidden = false;
  }

  function splitEdges(text) {
    var m = String(text).match(new RegExp("^([^" + L + "]*)([\\s\\S]*?)([^" + L + "]*)$"));
    return { pre: m[1], core: m[2], post: m[3] };
  }

  function wordAt(text, offset) {
    var re = new RegExp("[" + L + "\\-]");
    var s = offset, e = offset;
    while (s > 0 && re.test(text[s - 1])) s--;
    while (e < text.length && re.test(text[e])) e++;
    while (s < e && text[s] === "-") s++;
    while (e > s && text[e - 1] === "-") e--;
    return { word: text.slice(s, e), start: s };
  }

  function countBefore(text, word, start) {
    var safe = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    var re = new RegExp("(?<![" + L + "])" + safe + "(?![" + L + "])", "g");
    var n = 0, m;
    while ((m = re.exec(text)) && m.index < start) n++;
    return n;
  }

  async function cursorWord(ctx, sel) {
    var para = sel.paragraphs.getFirst();
    para.load("text");
    var before = para.getRange("Start").expandTo(sel.getRange("Start"));
    before.load("text");
    await ctx.sync();
    var info = wordAt(para.text, before.text.length);
    info.para = para;
    info.paraText = para.text;
    return info;
  }

  function sentenceAround(text, start, end) {
    var a = start, b = end;
    while (a > 0 && !/[.!?…]/.test(text[a - 1])) a--;
    while (b < text.length && !/[.!?…]/.test(text[b])) b++;
    if (b < text.length) b++;
    var s = text.slice(a, b).replace(/\s+/g, " ").trim();
    if (s.length > 600) s = text.slice(Math.max(0, start - 250), Math.min(text.length, end + 250)).replace(/\s+/g, " ").trim();
    return s;
  }

  async function selectionContext(ctx, sel, core, pre) {
    try {
      var para = sel.paragraphs.getFirst();
      para.load("text");
      var before = para.getRange("Start").expandTo(sel.getRange("Start"));
      before.load("text");
      await ctx.sync();
      var start = before.text.length + (pre || "").length;
      return sentenceAround(para.text, start, start + core.length);
    } catch (e) { return ""; }
  }

  async function onSelectionChanged() {
    if (!anyLoaded() || Date.now() < ignoreSelUntil) return;
    try {
      await Word.run(async function (ctx) {
        var sel = ctx.document.getSelection();
        sel.load("text,isEmpty");
        await ctx.sync();
        if (!sel.isEmpty) {
          var p = splitEdges(sel.text);
          if (!p.core) return;
          if (p.core.length > 1500) {
            state.word = null;
            $("list").textContent = ""; $("lemmas").hidden = true; $("tabs").hidden = true;
            setStatus("Выделен слишком длинный фрагмент. Выделите слово, фразу или предложение.");
            return;
          }
          if (p.core !== state.word) {
            state.context = await selectionContext(ctx, sel, p.core, p.pre);
            show(p.core, "selection");
          } else state.target = "selection";
          return;
        }
        var info = await cursorWord(ctx, sel);
        if (info.word && info.word !== state.word) {
          state.context = sentenceAround(info.paraText, info.start, info.start + info.word.length);
          show(info.word, "cursor");
        } else if (info.word) state.target = "cursor";
      });
    } catch (e) { console.error(e); }
  }

  function aiReset() {
    ai.reqId++;
    ai.status = "idle"; ai.variants = []; ai.error = ""; ai.model = "";
  }

  function aiCacheKey() {
    var st = ai.settings;
    return [st.provider, st.models[st.provider] || "", ai.style, st.count, state.word, state.context].join("\u0001");
  }

  async function aiRun(force, isRetry) {
    var word = state.word;
    if (!word) return;
    if (!isRetry) ai.retries = 0;
    var k = aiCacheKey();
    if (!force && ai.cache[k]) {
      ai.status = "done"; ai.variants = ai.cache[k].variants; ai.model = ai.cache[k].model; render(); return;
    }
    var id = isRetry ? ai.reqId : ++ai.reqId;
    ai.status = "loading"; ai.error = ""; ai.variants = [];
    render();
    try {
      var res = await AI.paraphrase(ai.settings, word, state.context, ai.style);
      if (id !== ai.reqId) return;
      ai.cache[aiCacheKey()] = res;
      ai.status = "done"; ai.variants = res.variants; ai.model = res.model;
    } catch (e) {
      if (id !== ai.reqId) return;
      if (e && e.retryAfter && (ai.retries || 0) < 2) {
        ai.retries = (ai.retries || 0) + 1;
        ai.status = "waiting"; ai.waitUntil = Date.now() + e.retryAfter * 1000;
        render();
        var tick = setInterval(function () {
          if (id !== ai.reqId || ai.status !== "waiting") { clearInterval(tick); return; }
          if (Date.now() >= ai.waitUntil) { clearInterval(tick); aiRun(true, true); return; }
          var w = document.querySelector(".ai-wait");
          if (w) w.textContent = waitText();
        }, 1000);
        return;
      }
      ai.status = "error"; ai.error = e && e.message || String(e);
    }
    ai.retries = 0;
    render();
  }

  function waitText() {
    var sec = Math.max(0, Math.ceil((ai.waitUntil - Date.now()) / 1000));
    return "Бесплатный лимит сервиса: повторю запрос автоматически через " + sec + " с…";
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function renderAI() {
    var list = $("list");
    list.textContent = "";
    var box = el("div", "ai-box");
    var st = ai.settings, prov = AI.PROVIDERS[st.provider];

    box.appendChild(el("div", "ai-what", state.phrase
      ? "Варианты замены для выделенной фразы с учётом предложения:"
      : "Синонимы к «" + state.word + "» по смыслу предложения и в той же форме:"));

    var styles = el("div", "ai-styles");
    AI.STYLES.forEach(function (sty) {
      var b = el("button", "ai-style" + (ai.style === sty.id && ai.status !== "idle" ? " active" : ""), sty.name);
      b.type = "button";
      b.title = "Предложить варианты: " + sty.hint;
      b.disabled = ai.status === "loading" || ai.status === "waiting";
      b.onclick = function () { ai.style = sty.id; aiRun(false); };
      styles.appendChild(b);
    });
    box.appendChild(styles);

    if (ai.status === "idle") {
      box.appendChild(el("p", "note", "Нажмите стиль, чтобы получить варианты. Каждое нажатие — один запрос к сервису."));
    } else if (ai.status === "loading") {
      box.appendChild(el("p", "note ai-wait", "Спрашиваю " + prov.name.replace(/ — .*/, "") + "…"));
    } else if (ai.status === "waiting") {
      box.appendChild(el("p", "note ai-wait", waitText()));
    } else if (ai.status === "error") {
      box.appendChild(el("p", "ai-error", ai.error));
    } else {
      var ul = el("ul", "variants");
      ai.variants.forEach(function (v) {
        var li = el("li");
        var b = el("button", "variant", v);
        b.type = "button";
        b.title = "Заменить выделенное этим вариантом";
        b.onclick = function () { replaceWith(v, b); };
        li.appendChild(b);
        ul.appendChild(li);
      });
      box.appendChild(ul);
      var more = el("button", "ai-more", "Ещё варианты");
      more.type = "button";
      more.onclick = function () { aiRun(true); };
      box.appendChild(more);
    }

    var foot = el("div", "ai-foot");
    foot.appendChild(document.createTextNode("Сервис: " + prov.name.replace(/ — .*/, "") +
      (ai.model || st.models[st.provider] ? " · " + (ai.model || st.models[st.provider]) : "") + " "));
    var gear = el("button", "ai-gear", ai.open ? "Скрыть настройки" : "⚙ Настройки");
    gear.type = "button";
    gear.onclick = function () { ai.open = !ai.open; render(); };
    foot.appendChild(gear);
    box.appendChild(foot);

    if (ai.open) box.appendChild(renderSettings());
    list.appendChild(box);
  }

  function renderSettings() {
    var st = ai.settings;
    var wrap = el("div", "ai-settings");

    var lab = el("label", null, "Сервис");
    var sel = el("select");
    Object.keys(AI.PROVIDERS).forEach(function (id) {
      var o = el("option", null, AI.PROVIDERS[id].name);
      o.value = id;
      if (id === st.provider) o.selected = true;
      sel.appendChild(o);
    });
    sel.onchange = function () { st.provider = sel.value; st.chosen = true; ai.models = null; AI.saveSettings(st); aiReset(); render(); };
    lab.appendChild(sel);
    wrap.appendChild(lab);

    var prov = AI.PROVIDERS[st.provider];
    var noteP = el("p", "note", prov.note || "");
    if (prov.signup) {
      noteP.appendChild(document.createTextNode(" "));
      var a = el("a", null, "Получить ключ");
      a.href = prov.signup; a.target = "_blank"; a.rel = "noopener";
      noteP.appendChild(a);
    }
    wrap.appendChild(noteP);

    if (prov.custom) {
      var lb = el("label", null, "Адрес (до /chat/completions)");
      var ib = el("input");
      ib.type = "url"; ib.placeholder = "http://localhost:11434/v1"; ib.value = st.customBase || "";
      ib.onchange = function () { st.customBase = ib.value.trim(); ai.models = null; AI.saveSettings(st); };
      lb.appendChild(ib);
      wrap.appendChild(lb);
    }

    if (prov.key) {
      var lk = el("label", null, prov.key === true ? "Ключ API" : "Ключ API (если нужен)");
      var ik = el("input");
      ik.type = "password"; ik.autocomplete = "off"; ik.spellcheck = false; ik.placeholder = "вставьте ключ";
      ik.value = st.keys[st.provider] || "";
      ik.oninput = function () {
        st.keys[st.provider] = AI.cleanKey(ik.value);
        AI.saveSettings(st);
      };
      ik.onchange = function () {
        ik.value = st.keys[st.provider] || "";
        ai.models = null; aiReset();
      };
      lk.appendChild(ik);
      wrap.appendChild(lk);

      var test = el("button", "ai-more", "Проверить ключ");
      test.type = "button";
      var testMsg = el("p", "note");
      test.onclick = async function () {
        st.keys[st.provider] = AI.cleanKey(ik.value);
        AI.saveSettings(st);
        test.disabled = true;
        testMsg.className = "note";
        testMsg.textContent = "Проверяю…";
        try {
          var m = await AI.testKey(st);
          testMsg.className = "note ai-ok";
          testMsg.textContent = "Ключ работает, модель: " + m;
          aiReset();
        } catch (e) {
          testMsg.className = "ai-error";
          testMsg.textContent = e.message;
        }
        test.disabled = false;
      };
      wrap.appendChild(test);
      wrap.appendChild(testMsg);
    }

    var lm = el("label", null, "Модель");
    var row = el("div", "ai-row");
    var ms = el("select");
    var current = st.models[st.provider] || "";
    var models = ai.models && ai.models.provider === st.provider ? ai.models.list : (current ? [current] : []);
    if (!models.length) { var o0 = el("option", null, "выберется автоматически"); o0.value = ""; ms.appendChild(o0); }
    models.forEach(function (m) {
      var o = el("option", null, m); o.value = m;
      if (m === current) o.selected = true;
      ms.appendChild(o);
    });
    ms.onchange = function () { st.models[st.provider] = ms.value; AI.saveSettings(st); aiReset(); render(); };
    var load = el("button", "ai-more", "Загрузить список");
    load.type = "button";
    var msg = el("p", "note");
    load.onclick = async function () {
      load.disabled = true; msg.textContent = "Загружаю список моделей…";
      try {
        var list = await AI.listModels(st);
        ai.models = { provider: st.provider, list: list };
        if (list.length && list.indexOf(st.models[st.provider]) === -1) { st.models[st.provider] = list[0]; AI.saveSettings(st); }
        render();
      } catch (e) { msg.textContent = e.message; load.disabled = false; }
    };
    row.appendChild(ms); row.appendChild(load);
    lm.appendChild(row);
    wrap.appendChild(lm);
    wrap.appendChild(msg);

    var lc = el("label", null, "Сколько вариантов");
    var cs = el("select");
    [3, 5, 7].forEach(function (n) {
      var o = el("option", null, String(n)); o.value = n;
      if (n === st.count) o.selected = true;
      cs.appendChild(o);
    });
    cs.onchange = function () { st.count = +cs.value; AI.saveSettings(st); };
    lc.appendChild(cs);
    wrap.appendChild(lc);

    wrap.appendChild(el("p", "note",
      "Выделенный фрагмент и предложение вокруг него отправляются выбранному сервису. " +
      "Ключи хранятся только на этом компьютере."));
    var wipe = el("button", "ai-more", "Удалить все сохранённые ключи");
    wipe.type = "button";
    wipe.onclick = function () {
      st.keys = {};
      AI.saveSettings(st);
      aiReset();
      render();
    };
    wrap.appendChild(wipe);
    return wrap;
  }

  async function replaceWith(text, btn) {
    if (!inWord) {
      try { navigator.clipboard.writeText(text); setStatus("Скопировано: «", text, "»"); } catch (e) {}
      return;
    }
    try {
      await Word.run(async function (ctx) {
        var sel = ctx.document.getSelection();
        sel.load("text,isEmpty");
        await ctx.sync();
        var range;
        if (!sel.isEmpty) {
          var p = splitEdges(sel.text);
          range = sel.insertText(p.pre + text + p.post, "Replace");
        } else if (state.target === "cursor") {
          var info = await cursorWord(ctx, sel);
          var target = null;
          if (info.word) {
            var n = countBefore(info.paraText, info.word, info.start);
            var found = info.para.search(info.word, { matchCase: true, matchWholeWord: true });
            found.load("items");
            await ctx.sync();
            target = found.items[n] || found.items[0] || null;
          }
          range = (target || sel).insertText(text, "Replace");
        } else {
          range = sel.insertText(text, "Replace");
        }
        ignoreSelUntil = Date.now() + 800;
        range.select();
        await ctx.sync();
      });
      var used = document.querySelector("#list button.used");
      if (used) used.classList.remove("used");
      btn.classList.add("used");
    } catch (e) {
      console.error(e);
      setStatus("Не получилось заменить: выделите слово ещё раз");
    }
  }

  function setupSearch() {
    var timer = null;
    function run() {
      var v = $("search").value.trim();
      if (!v) return;
      state.context = "";
      show(v.replace(/\s+/g, " "), "insert");
    }
    $("search").addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(run, 350); });
    $("searchForm").addEventListener("submit", function (e) { e.preventDefault(); run(); });
  }

  function debounce(fn, ms) {
    var t = null;
    return function () { clearTimeout(t); t = setTimeout(fn, ms); };
  }

  function start() {
    $("version").textContent = "v" + VERSION;
    SOURCES.forEach(function (s, i) {
      var sp = document.createElement("span");
      sp.title = s.about;
      var b = document.createElement("b");
      b.textContent = s.short;
      sp.appendChild(b);
      sp.appendChild(document.createTextNode(" " + s.name));
      if (i) $("sources").appendChild(document.createTextNode(" · "));
      $("sources").appendChild(sp);
    });
    setupSearch();
    cacheDel("abramov-index-v1");
    idleStatus();
    SOURCES.forEach(function (s) { if (!s.live) loadDict(s); });
    if (inWord) setTimeout(onSelectionChanged, 300);
  }

  if (typeof Office !== "undefined") {
    Office.onReady(function (info) {
      inWord = info.host === Office.HostType.Word;
      if (inWord) {
        Office.context.document.addHandlerAsync(
          Office.EventType.DocumentSelectionChanged,
          debounce(onSelectionChanged, 200)
        );
      }
      start();
    });
  } else {
    start();
  }
})();
