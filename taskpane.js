/* Панель «Синонимы» для Word: следит за выделением, показывает синонимы, заменяет слово. */
(function () {
  "use strict";

  // Сначала ищем словарь рядом с надстройкой (если вы положите dictionary.json в репозиторий),
  // иначе берём его с jsDelivr прямо из репозитория словаря.
  var DICT_URLS = [
    "dictionary.json",
    "https://cdn.jsdelivr.net/gh/egorkaru/synonym_dictionary@master/dictionary.json"
  ];
  var CACHE_KEY = "abramov-index-v1";

  var idx = null;
  var state = { word: null, target: null };   // target: "selection" | "cursor" | "insert"
  var ignoreSelUntil = 0;                      // не реагировать на смену выделения после своей замены
  var inWord = false;

  var $ = function (id) { return document.getElementById(id); };
  var L = "A-Za-zА-Яа-яЁё";

  /* ---------- Интерфейс ---------- */

  function setStatus(html) { $("status").innerHTML = html; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  function clearList() { $("list").innerHTML = ""; $("lemmas").hidden = true; $("lemmas").innerHTML = ""; }

  function show(word, target, preferLemma) {
    state.word = word;
    state.target = target;
    var r = Syn.lookup(idx, word, preferLemma);
    clearList();

    if (!r.current || !r.items.length) {
      setStatus("Нет синонимов для «<b>" + esc(word) + "</b>»");
      return;
    }
    var head = "«<b>" + esc(word) + "</b>»";
    if (r.current !== Syn.norm(word)) head += " → " + esc(r.current);
    setStatus(head + " · " + r.items.length);

    if (r.lemmas.length > 1) {
      var box = $("lemmas");
      box.appendChild(document.createTextNode("Другие значения: "));
      r.lemmas.forEach(function (lem) {
        var b = document.createElement("button");
        b.type = "button";
        b.textContent = lem;
        if (lem === r.current) b.className = "active";
        b.onclick = function () { show(word, target, lem); };
        box.appendChild(b);
      });
      box.hidden = false;
    }

    var list = $("list");
    r.items.forEach(function (it) {
      var li = document.createElement("li");
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = it.text;
      if (it.text.toLowerCase() !== it.base) b.title = "Словарная форма: " + it.base;
      b.onclick = function () { replaceWith(it.text, b); };
      li.appendChild(b);
      list.appendChild(li);
    });
  }

  /* ---------- Кэш индекса (IndexedDB) ---------- */

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
    return openDb().then(function (db) {
      db.transaction("kv", "readwrite").objectStore("kv").put(v, k);
    }).catch(function () {});
  }

  async function loadIndex() {
    var cached = await cacheGet(CACHE_KEY);
    if (cached) return cached;
    for (var i = 0; i < DICT_URLS.length; i++) {
      try {
        setStatus("Загружаю словарь (около 6 МБ, только в первый раз)…");
        var r = await fetch(DICT_URLS[i]);
        if (!r.ok) continue;
        var data = await r.json();
        setStatus("Готовлю словарь…");
        var built = Syn.buildIndex(data.wordlist || data);
        cacheSet(CACHE_KEY, built);
        return built;
      } catch (e) { /* пробуем следующий адрес */ }
    }
    throw new Error("Словарь не загрузился");
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
    if (!idx || Date.now() < ignoreSelUntil) return;
    try {
      await Word.run(async function (ctx) {
        var sel = ctx.document.getSelection();
        sel.load("text,isEmpty");
        await ctx.sync();
        if (!sel.isEmpty) {
          var p = splitEdges(sel.text);
          if (!p.core) return;
          if (/\s/.test(p.core)) { clearList(); setStatus("Выделите одно слово"); return; }
          show(p.core, "selection");
          return;
        }
        var info = await cursorWord(ctx, sel);
        if (info.word) show(info.word, "cursor");
      });
    } catch (e) { console.error(e); }
  }

  /* ---------- Замена ---------- */

  async function replaceWith(text, btn) {
    if (!inWord) { navigator.clipboard && navigator.clipboard.writeText(text); return; }
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
      var used = document.querySelector(".list button.used");
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
      if (!v || !idx) return;
      show(v.split(/\s+/)[0], "insert");
    }
    $("search").addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(run, 300); });
    $("searchForm").addEventListener("submit", function (e) { e.preventDefault(); run(); });
  }

  /* ---------- Старт ---------- */

  function debounce(fn, ms) {
    var t = null;
    return function () { clearTimeout(t); t = setTimeout(fn, ms); };
  }

  async function start() {
    setupSearch();
    try {
      idx = await loadIndex();
    } catch (e) {
      setStatus("Словарь не загрузился. Проверьте интернет и откройте панель заново.");
      return;
    }
    setStatus(inWord ? "Выделите слово в документе" : "Введите слово в поиске");
    if (inWord) onSelectionChanged();
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
