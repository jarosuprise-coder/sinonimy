/*
 * Логика синонимов: построение индекса из словаря Абрамова,
 * поиск начальной формы слова и согласование окончаний прилагательных.
 * Не зависит от Word — работает и в браузере, и в Node (для тестов).
 */
(function (root) {
  "use strict";

  var norm = function (s) {
    return String(s).toLowerCase().replace(/ё/g, "е").trim();
  };

  /* ---------- 1. Индекс из словаря ---------- */

  // Чистим одну запись синонима: убираем пометы в скобках, мусор, длинные фразы.
  function cleanSyn(raw) {
    var out = [];
    String(raw).split(";").forEach(function (part) {
      part = part
        .replace(/\([^)]*\)/g, " ")
        .replace(/[()<>\[\]"«».:]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (!part || part.length < 2) return;
      if (/[a-z0-9]/i.test(part)) return;
      if (part.split(" ").length > 3) return;
      out.push(part.toLowerCase());
    });
    return out;
  }

  // list — массив wordlist из dictionary.json (egorkaru/synonym_dictionary).
  // Возвращает объект { "слово": ["синоним", ...] }.
  function buildIndex(list) {
    var direct = new Map(), refs = new Map(), rev = new Map();
    function add(m, k, v) {
      var a = m.get(k);
      if (!a) { a = []; m.set(k, a); }
      if (a.indexOf(v) === -1) a.push(v);
    }

    list.forEach(function (e) {
      var k = norm(e.name || "");
      if (!k) return;
      (e.synonyms || []).forEach(function (s) {
        cleanSyn(s).forEach(function (c) { if (norm(c) !== k) add(direct, k, c); });
      });
      // Ссылки вида «см. великий, высокий»
      var def = String(e.definition || "").split("||")[0];
      var re = /см\.\s*([^.;|]+)/gi, m;
      while ((m = re.exec(def))) {
        m[1].split(/,|\sи\s/).forEach(function (r) {
          cleanSyn(r).forEach(function (c) { if (norm(c) !== k) add(refs, k, c); });
        });
      }
    });

    // Обратные связи: если у «ад» есть синоним «пекло», то у «пекло» будет «ад».
    direct.forEach(function (arr, k) {
      arr.forEach(function (s) { if (s.indexOf(" ") === -1) add(rev, norm(s), k); });
    });

    var keys = new Set();
    [direct, refs, rev].forEach(function (m) { m.forEach(function (_, k) { keys.add(k); }); });

    var idx = {};
    keys.forEach(function (k) {
      var res = [];
      function push(v) { if (norm(v) !== k && res.indexOf(v) === -1) res.push(v); }
      (direct.get(k) || []).forEach(push);
      (refs.get(k) || []).forEach(function (r) {
        push(r);
        (direct.get(norm(r)) || []).forEach(push);
      });
      (rev.get(k) || []).forEach(push);
      if (res.length) idx[k] = res.slice(0, 60);
    });
    return idx;
  }

  /* ---------- 2. Поиск начальной формы ---------- */

  // [окончание формы, [возможные окончания начальной формы], тип]
  // тип "adj" — по этому правилу умеем согласовывать прилагательные.
  var RULES = [
    // прилагательные
    ["ыми", ["ый", "ой"], "adj"], ["ими", ["ой", "ий"], "adj"],
    ["ого", ["ый", "ой", "ий"], "adj"], ["его", ["ий"], "adj"],
    ["ому", ["ый", "ой", "ий"], "adj"], ["ему", ["ий"], "adj"],
    ["ая", ["ый", "ой", "ий"], "adj"], ["яя", ["ий"], "adj"],
    ["ое", ["ый", "ой", "ий"], "adj"], ["ее", ["ий"], "adj"],
    ["ые", ["ый", "ой"], "adj"], ["ие", ["ой", "ий"], "adj"],
    ["ую", ["ый", "ой", "ий"], "adj"], ["юю", ["ий"], "adj"],
    ["ым", ["ый", "ой"], "adj"], ["им", ["ой", "ий"], "adj"],
    ["ых", ["ый", "ой"], "adj"], ["их", ["ой", "ий"], "adj"],
    ["ой", ["ый", "ий"], "adj"], ["ей", ["ий"], "adj"],
    // глаголы
    ["ает", ["ать"]], ["ают", ["ать"]], ["аешь", ["ать"]], ["аем", ["ать"]], ["аете", ["ать"]], ["аю", ["ать"]],
    ["яет", ["ять"]], ["яют", ["ять"]], ["яешь", ["ять"]], ["яю", ["ять"]],
    ["ует", ["овать"]], ["уют", ["овать"]], ["уешь", ["овать"]],
    ["нула", ["нуть"]], ["нуло", ["нуть"]], ["нули", ["нуть"]], ["нул", ["нуть"]],
    ["ала", ["ать"]], ["ало", ["ать"]], ["али", ["ать"]], ["ал", ["ать"]],
    ["яла", ["ять"]], ["яло", ["ять"]], ["яли", ["ять"]], ["ял", ["ять"]],
    ["ила", ["ить"]], ["ило", ["ить"]], ["или", ["ить"]], ["ил", ["ить"]],
    ["ела", ["еть"]], ["ело", ["еть"]], ["ели", ["еть"]], ["ел", ["еть"]],
    ["ешь", ["ать", "еть", "ять", "ти"]], ["ишь", ["ить", "еть"]],
    ["ете", ["ать", "еть", "ти"]], ["ите", ["ить", "еть"]],
    ["ет", ["ать", "еть", "ять", "ить", "ти"]], ["ит", ["ить", "еть"]],
    ["ут", ["ать", "ти", "ыть"]], ["ют", ["ять", "ать", "ить", "еть"]],
    ["ат", ["ать", "ить"]], ["ят", ["ить", "ять", "еть"]],
    // существительные
    ["ами", ["а", "", "о"]], ["ями", ["я", "ь", "е"]],
    ["ах", ["а", "", "о"]], ["ях", ["я", "ь", "е"]],
    ["ам", ["а", "", "о"]], ["ям", ["я", "ь", "е"]],
    ["ов", ["", "о"]], ["ев", ["ь", "й", "е"]],
    ["ом", ["", "о"]], ["ем", ["ь", "е", "й"]],
    ["ою", ["а"]], ["ью", ["ь"]],
    ["ия", ["ие"]], ["ии", ["ия", "ие"]], ["ию", ["ия", "ие"]],
    ["у", ["", "а", "о"]], ["ю", ["ь", "я", "е", "й"]],
    ["а", ["", "о", "ь"]], ["я", ["ь", "е", "й"]],
    ["ы", ["", "а"]], ["и", ["ь", "я", "а", "й"]],
    ["е", ["а", "", "о", "я", "ь"]], ["ой", ["а"]], ["ей", ["я", "ь"]]
  ];

  // Слова, которые правилами не угадать
  var IRREG = {
    "люди": "человек", "людей": "человек", "людям": "человек", "людьми": "человек", "людях": "человек",
    "шел": "идти", "шла": "идти", "шло": "идти", "шли": "идти",
    "пошел": "пойти", "пошла": "пойти", "пошло": "пойти", "пошли": "пойти",
    "дети": "ребенок", "детей": "ребенок", "детям": "ребенок", "детьми": "ребенок", "детях": "ребенок",
    "лучше": "хороший", "лучший": "хороший", "хуже": "плохой", "худший": "плохой",
    "больше": "большой", "меньше": "маленький", "мог": "мочь", "могла": "мочь", "могли": "мочь",
    "может": "мочь", "могут": "мочь", "хочет": "хотеть", "хотят": "хотеть", "хочу": "хотеть"
  };

  // idx — объект-индекс или функция has(слово) → true/false
  function hasSyn(idx, w) {
    return typeof idx === "function" ? idx(w) : Object.prototype.hasOwnProperty.call(idx, w);
  }

  // Возвращает список найденных начальных форм: [{lemma, rule}], лучшие первыми.
  // Если idx не передан (null), возвращает все возможные начальные формы (для Викисловаря).
  function findLemmas(idx, word) {
    var w = norm(word);
    var found = [], seen = {};
    function take(lemma, rule) {
      if (!seen[lemma] && (idx === null || hasSyn(idx, lemma))) { seen[lemma] = 1; found.push({ lemma: lemma, rule: rule || null }); }
    }
    take(w, null);
    if (IRREG[w]) take(IRREG[w], null);

    function tryForms(base, reflexive) {
      RULES.forEach(function (r) {
        var end = r[0];
        if (base.length - end.length < 2 || base.slice(-end.length) !== end) return;
        var stem = base.slice(0, -end.length);
        r[1].forEach(function (le) {
          take(stem + le + (reflexive ? "ся" : ""), r);
          if (reflexive) take(stem + le, r);
        });
      });
    }

    if (/(ся|сь)$/.test(w) && w.length > 4) {
      var base = w.slice(0, -2);
      take(base + "ся", null);
      take(base, null);
      tryForms(base, true);
    }
    tryForms(w, false);
    return found;
  }

  /* ---------- 3. Согласование прилагательных ---------- */

  // Приводим окончание формы к «твёрдому» образцу.
  var CANON = { "яя": "ая", "ее": "ое", "ие": "ые", "его": "ого", "ему": "ому", "юю": "ую",
                "ей": "ой", "им": "ым", "их": "ых", "ими": "ыми" };

  function adjType(word) {
    var end = word.slice(-2), last = word.slice(-3, -2);
    if (end !== "ый" && end !== "ий" && end !== "ой") return null;
    if ("гкх".indexOf(last) !== -1) return "velar";
    if ("жшчщ".indexOf(last) !== -1) return end === "ой" ? "sibStressed" : "sib";
    if (end === "ий") return "soft";
    return "hard";
  }

  function inflectAdj(lemma, canon) {
    var t = adjType(lemma);
    if (!t) return null;
    var e = canon;
    if (t === "soft") e = e.replace("а", "я").replace("о", "е").replace("ы", "и").replace("у", "ю");
    else if (t === "velar" || t === "sibStressed") e = e.replace("ы", "и");
    else if (t === "sib") e = e.replace("ы", "и").replace("о", "е");
    return lemma.slice(0, -2) + e;
  }

  // Подстраиваем синоним под форму исходного слова (только прилагательные).
  function adapt(original, found, syn) {
    if (!found || !found.rule || found.rule[2] !== "adj") return syn;
    var formEnd = found.rule[0];
    if (!adjType(found.lemma)) return syn;
    var canon = CANON[formEnd] || formEnd;
    var parts = syn.split(" ");
    // Подстраиваем первое слово-прилагательное, остальное оставляем
    if (!adjType(parts[0])) return syn;
    var inf = inflectAdj(parts[0], canon);
    if (!inf) return syn;
    parts[0] = inf;
    return parts.join(" ");
  }

  /* ---------- 4. Регистр ---------- */

  function matchCase(original, repl) {
    var letters = original.replace(/[^A-Za-zА-Яа-яЁё]/g, "");
    if (letters.length > 1 && letters === letters.toUpperCase()) return repl.toUpperCase();
    if (/^[A-ZА-ЯЁ]/.test(original)) return repl.charAt(0).toUpperCase() + repl.slice(1);
    return repl;
  }

  /* ---------- 5. Несколько словарей ---------- */

  // Ключ для сравнения слов из разных словарей: регистр, ё/е, пробелы и дефисы не важны.
  function key(s) {
    return norm(s).replace(/[\s \-‐–—]+/g, " ").trim();
  }

  // Словарь из файла dict/*.json: {id, name, g:[[метка, слово...]], h?:{слово:[группы]}}
  function makeDict(data) {
    var g = data.g, index = data.h || null;
    if (!index) {
      index = {};
      g.forEach(function (grp, i) {
        for (var j = 1; j < grp.length; j++) {
          var k = norm(grp[j]);
          var a = index[k] || (index[k] = []);
          if (a[a.length - 1] !== i) a.push(i);
        }
      });
    }
    return {
      id: data.id,
      name: data.name,
      has: function (w) { return Object.prototype.hasOwnProperty.call(index, w); },
      groups: function (lemma) {
        return (index[lemma] || []).map(function (i) { return { label: g[i][0], words: g[i].slice(1) }; });
      }
    };
  }

  // По какому правилу из слова получилась начальная форма (для согласования окончаний)
  function ruleFor(word, lemma) {
    var all = findLemmas(null, word), l = key(lemma);
    for (var i = 0; i < all.length; i++) if (key(all[i].lemma) === l) return all[i];
    return { lemma: key(lemma), rule: null };
  }

  // Группы синонимов → готовые варианты для вставки (с окончанием и регистром исходного слова)
  function prepare(word, lemmaInfo, groups) {
    var w = key(word), lem = key(lemmaInfo.lemma), seen = {};
    var out = [];
    groups.forEach(function (grp) {
      var items = [];
      grp.words.forEach(function (s) {
        var k = key(s);
        if (!k || k === w || k === lem || seen[k]) return;
        // «красивый на вид», «внешне красивый» — это то же слово с уточнением, не синоним
        var toks = k.split(" ");
        if (toks.length > 1 && (toks.indexOf(lem) !== -1 || toks.indexOf(w) !== -1)) return;
        var t = adapt(word, lemmaInfo, s);
        var kt = key(t);
        if (kt === w || seen[kt]) return;
        seen[k] = seen[kt] = 1;
        items.push({ base: s, key: k, text: matchCase(word, t) });
      });
      if (items.length) out.push({ label: grp.label || "", items: items });
    });
    return out;
  }

  // Вкладка «Все словари»: каждое слово ровно один раз, с пометкой, в каких словарях оно есть.
  // Выше стоят слова, которые есть в нескольких словарях, затем — по месту в списке.
  function merge(results) {
    var map = {}, order = [];
    results.forEach(function (res) {
      var flat = [];
      res.groups.forEach(function (g) { flat = flat.concat(g.items); });
      flat.forEach(function (it, pos) {
        var e = map[it.key];
        var rank = flat.length > 1 ? pos / (flat.length - 1) : 0;
        if (!e) {
          e = map[it.key] = { base: it.base, key: it.key, text: it.text, sources: [], rank: 0 };
          order.push(e);
        }
        if (e.sources.indexOf(res.id) === -1) { e.sources.push(res.id); e.rank += rank; }
      });
    });
    // Разные словарные формы могли дать одинаковый текст после согласования — оставляем один
    var byText = {}, out = [];
    order.forEach(function (e) {
      var kt = key(e.text);
      var prev = byText[kt];
      if (prev) {
        e.sources.forEach(function (s) { if (prev.sources.indexOf(s) === -1) prev.sources.push(s); });
        return;
      }
      byText[kt] = e;
      out.push(e);
    });
    out.forEach(function (e, i) { e.first = i; e.avg = e.rank / e.sources.length; });
    out.sort(function (a, b) {
      return (b.sources.length - a.sources.length) || (a.avg - b.avg) || (a.first - b.first);
    });
    return out;
  }

  /* ---------- 6. Викисловарь ---------- */

  function stripTemplates(s) {
    var prev;
    do { prev = s; s = s.replace(/\{\{[^{}]*\}\}/g, ""); } while (s !== prev);
    return s;
  }
  function unlink(s) {
    return s.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1");
  }

  // Разбирает текст статьи Викисловаря: русская часть, значения и синонимы к каждому значению.
  function parseWiki(text) {
    var parts = String(text).split(/^=\s*\{\{-([a-z-]+)-\}\}\s*=\s*$/m);
    var ru = null;
    for (var i = 1; i < parts.length; i += 2) if (parts[i] === "ru") { ru = parts[i + 1]; break; }
    if (ru === null) return [];

    // Омонимы: блоки с заголовком второго уровня («== {{заголовок|(глагол)}} ==»)
    var blocks = ru.split(/^==(?!=)\s*(.*?)\s*==\s*$/m);
    var list = [{ title: "", body: blocks[0] }];
    for (var b = 1; b < blocks.length; b += 2) list.push({ title: blocks[b], body: blocks[b + 1] || "" });

    function section(body, name) {
      var re = new RegExp("^=+\\s*" + name + "\\s*=+\\s*$", "m");
      var m = re.exec(body);
      if (!m) return [];
      var rest = body.slice(m.index + m[0].length);
      var end = rest.search(/^=/m);
      if (end !== -1) rest = rest.slice(0, end);
      return rest.split("\n").filter(function (l) { return /^#(?![:*])/.test(l); })
                 .map(function (l) { return l.replace(/^#\s*/, ""); });
    }

    // Синонимы из шаблона {{семантика|синонимы=...}} внутри строки значения
    function semSyn(line) {
      var at = line.indexOf("{{семантика");
      if (at === -1) return [];
      var depth = 0, i = at, end = -1;
      for (; i < line.length - 1; i++) {
        if (line[i] === "{" && line[i + 1] === "{") { depth++; i++; }
        else if (line[i] === "}" && line[i + 1] === "}") { depth--; i++; if (!depth) { end = i - 1; break; } }
      }
      if (end === -1) return [];
      var inner = stripTemplates(unlink(line.slice(at + 2, end)));
      var res = [];
      inner.split("|").forEach(function (p) {
        var m = /^\s*синонимы\s*=(.*)$/.exec(p);
        if (m) m[1].split(/[,;]/).forEach(function (x) { x = cleanWord(x); if (x) res.push(x); });
      });
      return res;
    }
    function cleanWord(x) {
      x = String(x).replace(/[?!]+$/, "").replace(/\s+/g, " ").trim();
      if (!x || x.length < 2 || /[{}=<>|]/.test(x) || /^[-—]$/.test(x)) return null;
      return x;
    }
    function linkWords(line) {
      var words = [], m, re = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g;
      var clean = stripTemplates(line);
      while ((m = re.exec(clean))) {
        var wd = cleanWord(m[1]);
        if (wd && words.indexOf(wd) === -1 && wd.indexOf(":") === -1) words.push(wd);
      }
      return words;
    }
    function shortLabel(line) {
      var label = line ? unlink(stripTemplates(line)).replace(/'{2,}/g, "").replace(/\s+/g, " ")
        .replace(/^[\s,;:.]+/, "").trim() : "";
      var lw = label.split(" ").filter(Boolean);
      return lw.slice(0, 6).join(" ").replace(/[,;:.]+$/, "") + (lw.length > 6 ? "…" : "");
    }

    var groups = [], blocksWith = 0, perBlock = [];
    list.forEach(function (blk) {
      var syn = section(blk.body, "Синонимы");
      var mean = section(blk.body, "Значение");
      var title = unlink(stripTemplates(blk.title.replace(/\{\{(?:заголовок|з)\|([^}|]*)[^}]*\}\}/g, "$1"))).trim();
      var out = [];
      var n = Math.max(syn.length, mean.length);
      for (var i = 0; i < n; i++) {
        var words = linkWords(syn[i] || "");
        semSyn(mean[i] || "").forEach(function (w) { if (words.indexOf(w) === -1) words.push(w); });
        if (words.length) out.push({ label: shortLabel(mean[i]), words: words });
      }
      if (out.length) blocksWith++;
      perBlock.push({ title: title, groups: out });
    });
    perBlock.forEach(function (b) {
      b.groups.forEach(function (g) {
        if (blocksWith > 1 && b.title) g.label = b.title.replace(/^\((.*)\)$/, "$1") + (g.label ? ": " + g.label : "");
        groups.push(g);
      });
    });
    return groups;
  }

  /* ---------- 7. Совместимость: один словарь-индекс ---------- */

  // Возвращает { lemmas:[...], current, items:[{text, base}] }
  function lookup(idx, word, preferLemma) {
    var lemmas = findLemmas(idx, word);
    if (!lemmas.length) return { lemmas: [], current: null, items: [] };
    var cur = lemmas[0];
    if (preferLemma) {
      lemmas.forEach(function (l) { if (l.lemma === preferLemma) cur = l; });
    }
    var w = norm(word), seenText = {};
    var items = [];
    idx[cur.lemma].forEach(function (s) {
      var t = adapt(word, cur, s);
      var key = norm(t);
      if (key === w || key === cur.lemma || seenText[key]) return;
      seenText[key] = 1;
      items.push({ base: s, text: matchCase(word, t) });
    });
    return { lemmas: lemmas.map(function (l) { return l.lemma; }), current: cur.lemma, items: items };
  }

  var api = { buildIndex: buildIndex, findLemmas: findLemmas, lookup: lookup,
              adapt: adapt, inflectAdj: inflectAdj, matchCase: matchCase, norm: norm,
              key: key, makeDict: makeDict, ruleFor: ruleFor, prepare: prepare,
              merge: merge, parseWiki: parseWiki };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Syn = api;
})(this);
