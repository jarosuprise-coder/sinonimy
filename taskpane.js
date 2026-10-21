/* Панель «Синонимы» для Word: следит за выделением, показывает синонимы из нескольких словарей,
   заменяет слово. Вкладки: «Все» (без повторов) и по одному словарю. */
(function () {
  "use strict";

  var VERSION = "1.1";
  var DICT_VER = "2";   // меняется, когда обновляются файлы dict/*.json

  // Порядок вкладок. short — пометка источника на вкладке «Все».
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

  var dicts = {};          // id → словарь | "loading" | "error"
  var wikiCache = {};      // ключ запроса → {title, groups} | null
  var state = { word: null, target: null, prefer: null, cur: null, lemmas: [], results: {}, wiki: "idle", reqId: 0 };
  var tab = readTab();
  var ignoreSelUntil = 0;
  var inWord = false;

  var $ = function (id) { return document.getElementById(id); };
  var L = "A-Za-zА-Яа-яЁё";

  /* ---------- Мелочи ---------- */

  function setStatus(html) { $("status").innerHTML = html; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function readTab() { try { return localStorage.getItem("sin-tab") || "all"; } catch (e) { return "all"; } }
  function saveTab(t) { try { localStorage.setItem("sin-tab", t); } catch (e) { /* не страшно */ } }
  function anyLoaded() { return SOURCES.some(function (s) { return dicts[s.id] && typeof dicts[s.id] === "object"; }); }
  function hasLocal(w) {
    return SOURCES.some(function (s) { var d = dicts[s.id]; return d && typeof d === "object" && d.has(w); });
  }

  /* ---------- Кэш словарей (IndexedDB) ---------- */

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

  /* ---------- Викисловарь ---------- */

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

  /* ---------- Поиск синонимов ---------- */

  function show(word, target, prefer, keepWiki) {
    var sameWord = state.word === word && state.prefer === prefer;
    state.word = word;
    state.target = target;
    state.prefer = prefer || null;

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
      render();                       // ответ Викисловаря ещё в пути — дождёмся его
    } else if ((keepWiki || sameWord) && oldWiki && state.wiki !== "error") {
      state.results.wiki = oldWiki;
      render();
    } else {
      state.reqId++;
      state.results.wiki = null;
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

  /* ---------- Отрисовка ---------- */

  function render() {
    var word = state.word;
    var all = Syn.merge(ordered());
    renderTabs(all.length);

    var lemma = state.cur ? state.cur.lemma : (state.results.wiki && state.results.wiki.lemma) || null;
    if (!all.length) {
      var waiting = state.wiki === "loading" || SOURCES.some(function (s) { return dicts[s.id] === "loading"; });
      setStatus(waiting ? "Ищу синонимы к «<b>" + esc(word) + "</b>»…"
                        : "Нет синонимов для «<b>" + esc(word) + "</b>»");
    } else {
      var head = "«<b>" + esc(word) + "</b>»";
      if (lemma && Syn.key(lemma) !== Syn.key(word)) head += " → " + esc(lemma);
      setStatus(head);
    }

    renderLemmas();

    var list = $("list");
    list.innerHTML = "";
    if (tab === "all") {
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
    nav.innerHTML = "";
    nav.hidden = false;
    var defs = [{ id: "all", name: "Все", count: allCount }].concat(SOURCES.map(function (s) {
      var res = state.results[s.id], c = countOf(res);
      var busy = s.live ? state.wiki === "loading" : dicts[s.id] === "loading";
      var err = s.live ? state.wiki === "error" : dicts[s.id] === "error";
      return { id: s.id, name: s.name, count: busy ? "…" : err ? "!" : c, title: s.about };
    }));
    defs.forEach(function (d) {
      var b = document.createElement("button");
      b.type = "button";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", d.id === tab ? "true" : "false");
      b.className = "tab" + (d.id === tab ? " active" : "") + (d.count === 0 ? " empty" : "");
      if (d.title) b.title = d.title;
      b.innerHTML = esc(d.name) + ' <span class="cnt">' + esc(d.count) + "</span>";
      b.onclick = function () { tab = d.id; saveTab(tab); render(); };
      nav.appendChild(b);
    });
  }

  function renderLemmas() {
    var box = $("lemmas");
    box.innerHTML = "";
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

  /* ---------- Работа с текстом ---------- */

  // Разделяет выделение на знаки по краям и само слово: «слово, » → ["", "слово", ", "]
  function splitEdges(text) {
    var m = String(text).match(new RegExp("^([^" + L + "]*)([\\s\\S]*?)([^" + L + "]*)$"));
    return { pre: m[1], core: m[2], post: m[3] };
  }

  // Слово вокруг позиции курсора в тексте абзаца
  function wordAt(text, offset) {
    var re = new RegExp("[" + L + "\\-]");
    var s = offset, e = offset;
    while (s > 0 && re.test(text[s - 1])) s--;
    while (e < text.length && re.test(text[e])) e++;
    while (s < e && text[s] === "-") s++;
    while (e > s && text[e - 1] === "-") e--;
    return { word: text.slice(s, e), start: s };
  }

  // Сколько раз это слово целиком встречается в абзаце до позиции start
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

  /* ---------- Реакция на выделение ---------- */

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
          if (/\s/.test(p.core)) {
            state.word = null;
            $("list").innerHTML = ""; $("lemmas").hidden = true; $("tabs").hidden = true;
            setStatus("Выделите одно слово");
            return;
          }
          if (p.core !== state.word) show(p.core, "selection");
          else state.target = "selection";
          return;
        }
        var info = await cursorWord(ctx, sel);
        if (info.word && info.word !== state.word) show(info.word, "cursor");
        else if (info.word) state.target = "cursor";
      });
    } catch (e) { console.error(e); }
  }

  /* ---------- Замена ---------- */

  async function replaceWith(text, btn) {
    if (!inWord) {
      try { navigator.clipboard.writeText(text); setStatus("Скопировано: «<b>" + esc(text) + "</b>»"); } catch (e) { /* нет буфера */ }
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
        range.select();   // новое слово остаётся выделенным — можно сразу попробовать другой вариант
        await ctx.sync();
      });
      var used = document.querySelector(".chips button.used");
      if (used) used.classList.remove("used");
      btn.classList.add("used");
    } catch (e) {
      console.error(e);
      setStatus("Не получилось заменить: выделите слово ещё раз");
    }
  }

  /* ---------- Поиск вручную ---------- */

  function setupSearch() {
    var timer = null;
    function run() {
      var v = $("search").value.trim();
      if (!v) return;
      show(v.split(/\s+/)[0], "insert");
    }
    $("search").addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(run, 350); });
    $("searchForm").addEventListener("submit", function (e) { e.preventDefault(); run(); });
  }

  /* ---------- Старт ---------- */

  function debounce(fn, ms) {
    var t = null;
    return function () { clearTimeout(t); t = setTimeout(fn, ms); };
  }

  function start() {
    $("version").textContent = "v" + VERSION;
    $("sources").innerHTML = SOURCES.map(function (s) {
      return '<span title="' + esc(s.about) + '"><b>' + esc(s.short) + "</b> " + esc(s.name) + "</span>";
    }).join(" · ");
    setupSearch();
    cacheDel("abramov-index-v1");   // кэш версии 1.0 больше не нужен
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
