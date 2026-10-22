// Синонимы: индекс словарей, начальная форма слова, согласование окончаний, разбор Викисловаря.
(function (root) {
  "use strict";

  var norm = function (s) {
    return String(s).toLowerCase().replace(/ё/g, "е").trim();
  };

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
      var def = String(e.definition || "").split("||")[0];
      var re = /см\.\s*([^.;|]+)/gi, m;
      while ((m = re.exec(def))) {
        m[1].split(/,|\sи\s/).forEach(function (r) {
          cleanSyn(r).forEach(function (c) { if (norm(c) !== k) add(refs, k, c); });
        });
      }
    });

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

  var RULES = [
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

  var IRREG = {
    "люди": "человек", "людей": "человек", "людям": "человек", "людьми": "человек", "людях": "человек",
    "шел": "идти", "шла": "идти", "шло": "идти", "шли": "идти",
    "пошел": "пойти", "пошла": "пойти", "пошло": "пойти", "пошли": "пойти",
    "дети": "ребенок", "детей": "ребенок", "детям": "ребенок", "детьми": "ребенок", "детях": "ребенок",
    "лучше": "хороший", "лучший": "хороший", "хуже": "плохой", "худший": "плохой",
    "больше": "большой", "меньше": "маленький", "мог": "мочь", "могла": "мочь", "могли": "мочь",
    "может": "мочь", "могут": "мочь", "хочет": "хотеть", "хотят": "хотеть", "хочу": "хотеть"
  };

  function hasSyn(idx, w) {
    return typeof idx === "function" ? idx(w) : Object.prototype.hasOwnProperty.call(idx, w);
  }

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

  function adapt(original, found, syn) {
    if (!found || !found.rule || found.rule[2] !== "adj") return syn;
    var formEnd = found.rule[0];
    if (!adjType(found.lemma)) return syn;
    var canon = CANON[formEnd] || formEnd;
    var parts = syn.split(" ");
    if (!adjType(parts[0])) return syn;
    var inf = inflectAdj(parts[0], canon);
    if (!inf) return syn;
    parts[0] = inf;
    return parts.join(" ");
  }

  function matchCase(original, repl) {
    var letters = original.replace(/[^A-Za-zА-Яа-яЁё]/g, "");
    if (letters.length > 1 && letters === letters.toUpperCase()) return repl.toUpperCase();
    if (/^[A-ZА-ЯЁ]/.test(original)) return repl.charAt(0).toUpperCase() + repl.slice(1);
    return repl;
  }

  function key(s) {
    return norm(s).replace(/[\s \-‐–—]+/g, " ").trim();
  }

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

  function ruleFor(word, lemma) {
    var all = findLemmas(null, word), l = key(lemma);
    for (var i = 0; i < all.length; i++) if (key(all[i].lemma) === l) return all[i];
    return { lemma: key(lemma), rule: null };
  }

  function prepare(word, lemmaInfo, groups) {
    var w = key(word), lem = key(lemmaInfo.lemma), seen = {};
    var out = [];
    groups.forEach(function (grp) {
      var items = [];
      grp.words.forEach(function (s) {
        var k = key(s);
        if (!k || k === w || k === lem || seen[k]) return;
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

  function stripTemplates(s) {
    var prev;
    do { prev = s; s = s.replace(/\{\{[^{}]*\}\}/g, ""); } while (s !== prev);
    return s;
  }
  function unlink(s) {
    return s.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1");
  }

  function parseWiki(text) {
    var parts = String(text).split(/^=\s*\{\{-([a-z-]+)-\}\}\s*=\s*$/m);
    var ru = null;
    for (var i = 1; i < parts.length; i += 2) if (parts[i] === "ru") { ru = parts[i + 1]; break; }
    if (ru === null) return [];

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


  var PARTICLES = { "то": 1, "либо": 1, "нибудь": 1, "таки": 1, "кое": 1, "кой": 1 };
  var HYPH = /[‐‑]/g;

  function compoundParts(word) {
    var w = String(word).replace(HYPH, "-");
    if (!/^[A-Za-zА-Яа-яЁё]+(-[A-Za-zА-Яа-яЁё]+){1,2}$/.test(w)) return null;
    var parts = w.split("-");
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].length < 3 || PARTICLES[norm(parts[i])]) return null;
    }
    return parts;
  }

  function combForm(adj) {
    var t = adjType(adj);
    if (!t) return null;
    if (/ический$/.test(adj)) return adj.slice(0, -6) + "ико";
    return adj.slice(0, -2) + (t === "hard" || t === "velar" ? "о" : "е");
  }

  function adjFromComb(part) {
    var p = norm(part);
    if (p.length < 4 || !/[ое]$/.test(p)) return [];
    var stem = p.slice(0, -1);
    var c = [stem + "ый", stem + "ий", stem + "ой"];
    if (/ико$/.test(p)) c.unshift(p.slice(0, -2) + "ческий");
    return c.filter(function (a) { return combForm(a) === p; });
  }

  function single(s) { return !/[\s-]/.test(s); }
  function isVerb(s) { return /(ть|ти|чь)(ся|сь)?$/.test(s); }

  function compound(word, d) {
    var parts = compoundParts(word);
    if (!parts) return [];
    var seen = {}, out = [];
    seen[key(word)] = 1;
    function group(label, texts) {
      var items = [];
      texts.forEach(function (x) {
        var t = matchCase(word, x[0]), k = key(t);
        if (seen[k]) return;
        seen[k] = 1;
        items.push({ base: x[1], key: k, text: t });
      });
      if (items.length) out.push({ label: label, items: items });
    }

    var low = parts.map(norm);
    function derived(np, oldStem) { return low.indexOf(np) !== -1 || (oldStem.length > 3 && np.indexOf(oldStem) !== -1); }
    var last = parts[parts.length - 1], head = parts.slice(0, -1).join("-");
    var lastInfo = findLemmas(d.has, last)[0] || null;
    var lastAdj = !!(lastInfo && adjType(lastInfo.lemma) && (!lastInfo.rule || lastInfo.rule[2] === "adj"));
    if (lastInfo) {
      var t1 = [];
      prepare(last.toLowerCase(), lastInfo, d.groups(lastInfo.lemma)).forEach(function (g) {
        g.items.forEach(function (it) {
          if (!single(it.text) || (lastAdj && !adjType(norm(it.base)))) return;
          if (derived(norm(it.text), lastInfo.lemma.slice(0, -2))) return;
          t1.push([head.toLowerCase() + "-" + it.text, it.base]);
        });
      });
      group("вместо «" + last.toLowerCase() + "»", t1);
    }

    var first = parts[0], rest = parts.slice(1).join("-").toLowerCase(), t2 = [];
    var adjs = adjFromComb(first).filter(function (a) { return d.has(a); });
    adjs.forEach(function (a) {
      d.groups(a).forEach(function (g) {
        g.words.forEach(function (w) {
          var cf = single(w) && combForm(norm(w));
          if (cf && !derived(cf, low[0].slice(0, -1))) t2.push([cf + "-" + rest, w]);
        });
      });
    });
    if (!adjs.length && d.has(norm(first))) {
      d.groups(norm(first)).forEach(function (g) {
        g.words.forEach(function (w) {
          var n = norm(w);
          if (single(w) && !adjType(n) && !isVerb(n) && !derived(n, low[0].length > 4 ? low[0].slice(0, -1) : "")) t2.push([n + "-" + rest, w]);
        });
      });
    }
    group("вместо «" + first.toLowerCase() + "»", t2);

    if (parts.length === 2 && lastAdj && adjs.length) {
      var a1 = adapt(last, lastInfo, adjs[0]);
      group("раздельно", [[a1 + " и " + last.toLowerCase(), adjs[0]]]);
    }
    return out;
  }

  var api = { buildIndex: buildIndex, findLemmas: findLemmas,
              adapt: adapt, inflectAdj: inflectAdj, matchCase: matchCase, norm: norm,
              key: key, makeDict: makeDict, ruleFor: ruleFor, prepare: prepare,
              merge: merge, parseWiki: parseWiki,
              compound: compound, compoundParts: compoundParts, combForm: combForm };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Syn = api;
})(this);
