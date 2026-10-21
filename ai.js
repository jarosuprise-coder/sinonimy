/*
 * Перефразирование через бесплатные ИИ-сервисы (OpenAI-совместимый формат запросов).
 * Ключи хранятся только на этом компьютере (localStorage панели) и уходят только выбранному сервису.
 */
(function (root) {
  "use strict";

  // Порядок = порядок в списке настроек. avail — что проверено с компьютера пользователя (22.10.2026).
  var PROVIDERS = {
    ovh: {
      name: "OVHcloud AI Endpoints — без ключа",
      base: "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1",
      key: "optional",
      signup: "https://endpoints.ai.cloud.ovh.net/",
      prefer: [/llama-3_3-70b/i, /mistral-small/i, /qwen3\.\d+-27b/i, /gpt-oss-120b/i, /qwen/i],
      skip: /guard|vl|diffusion|whisper|embed|bge|xtts|nvr|tts|sdxl|rerank|9b|20b|nemo/i,
      note: "Работает сразу, без регистрации: Llama 3.3 70B и другие открытые модели, ответ за 2–4 секунды. " +
            "Без ключа — около 2 запросов в минуту (при превышении панель сама подождёт и повторит)."
    },
    pollinations: {
      name: "Pollinations — без ключа",
      url: "https://text.pollinations.ai/openai",
      key: false,
      fixedModels: ["openai"],
      note: "Работает без регистрации, но медленно (до 30 секунд) и не чаще раза в 30 секунд. Качество среднее."
    },
    groq: {
      name: "Groq",
      base: "https://api.groq.com/openai/v1",
      key: true,
      signup: "https://console.groq.com/keys",
      prefer: [/llama-3\.3-70b/i, /llama-4/i, /gpt-oss-120b/i, /qwen/i, /llama/i],
      skip: /whisper|guard|tts|orpheus|playai|compound/i,
      note: "Бесплатный ключ (вход через Google или GitHub), очень быстрые ответы, около 1000 запросов в день."
    },
    openrouter: {
      name: "OpenRouter — бесплатные модели",
      base: "https://openrouter.ai/api/v1",
      key: true,
      signup: "https://openrouter.ai/keys",
      freeOnly: true,
      prefer: [/deepseek/i, /gemma-4-31b/i, /gemma/i, /nemotron.*super/i, /qwen/i, /llama/i],
      note: "Бесплатный ключ без карты, в списке только бесплатные модели (:free). Около 50 запросов в день."
    },
    gemini: {
      name: "Google Gemini",
      base: "https://generativelanguage.googleapis.com/v1beta/openai",
      key: true,
      signup: "https://aistudio.google.com/apikey",
      prefer: [/gemini-[\d.]+-flash$/i, /gemini-[\d.]+-flash-lite$/i, /flash/i],
      skip: /image|tts|audio|live|embedding|aqa|vision|veo|imagen/i,
      note: "Бесплатный ключ в Google AI Studio. Из России нужен VPN."
    },
    mistral: {
      name: "Mistral",
      base: "https://api.mistral.ai/v1",
      key: true,
      signup: "https://console.mistral.ai/api-keys",
      prefer: [/mistral-small-latest/i, /mistral-medium-latest/i, /mistral-large-latest/i, /small/i],
      skip: /embed|moderation|ocr|codestral|pixtral|voxtral|devstral/i,
      note: "Бесплатный тариф Experiment, нужно подтвердить номер телефона."
    },
    hf: {
      name: "Hugging Face",
      base: "https://router.huggingface.co/v1",
      key: true,
      signup: "https://huggingface.co/settings/tokens",
      prefer: [/deepseek-v4.*flash/i, /gemma-4-31b/i, /qwen3\.\d+-27b/i, /llama-3\.3-70b/i, /gemma/i, /qwen/i],
      skip: /coder|vl|vision|omni|distill/i,
      note: "Бесплатный токен с небольшим ежемесячным лимитом. Есть DeepSeek, Qwen, Gemma, Llama."
    },
    cohere: {
      name: "Cohere",
      base: "https://api.cohere.ai/compatibility/v1",
      modelsUrl: "https://api.cohere.ai/v1/models?endpoint=chat",
      key: true,
      signup: "https://dashboard.cohere.com/api-keys",
      defaultModel: "command-a-03-2025",
      prefer: [/^command-a-\d/i, /command-r-plus/i, /command-r/i],
      skip: /vision|reasoning|translate|embed|rerank|light|nightly/i,
      note: "Бесплатный пробный ключ (Trial), около 1000 запросов в месяц, только для некоммерческого использования."
    },
    siliconflow: {
      name: "SiliconFlow",
      base: "https://api.siliconflow.com/v1",
      modelsUrl: "https://api.siliconflow.com/v1/models?type=text&sub_type=chat",
      key: true,
      signup: "https://cloud.siliconflow.com/account/ak",
      defaultModel: "Qwen/Qwen2.5-7B-Instruct",
      prefer: [/qwen2\.5-7b-instruct$/i, /qwen3-8b$/i, /glm-4.*9b/i],
      note: "Бесплатный ключ. Бесплатны небольшие модели (Qwen 7–8B, GLM 9B), на сайте они помечены Free."
    },
    chutes: {
      name: "Chutes",
      base: "https://llm.chutes.ai/v1",
      key: true,
      signup: "https://chutes.ai/app/api",
      prefer: [/deepseek-v3/i, /deepseek/i, /qwen3/i, /llama/i],
      skip: /coder|vl|vision|embed/i,
      note: "Ключ после регистрации. Бесплатный доступ ограничен по числу запросов в день, условия часто меняются."
    },
    deepseek: {
      name: "DeepSeek",
      base: "https://api.deepseek.com",
      key: true,
      signup: "https://platform.deepseek.com/api_keys",
      defaultModel: "deepseek-chat",
      prefer: [/^deepseek-chat$/i, /chat/i],
      skip: /reasoner/i,
      note: "Официальный API DeepSeek: не бесплатный, но очень дешёвый (нужно пополнить баланс). " +
            "Бесплатно DeepSeek доступен через Hugging Face и иногда через OpenRouter."
    },
    custom: {
      name: "Свой адрес (Ollama и др.)",
      base: "",
      key: "optional",
      custom: true,
      note: "Любой OpenAI-совместимый адрес, например http://localhost:11434/v1 для Ollama."
    }
  };

  var STYLES = [
    { id: "same", name: "Другими словами", hint: "в том же стиле, но другими словами" },
    { id: "simple", name: "Проще", hint: "проще и понятнее, разговорнее" },
    { id: "short", name: "Короче", hint: "заметно короче, без потери смысла" },
    { id: "formal", name: "Официальнее", hint: "в официально-деловом или научном стиле" }
  ];

  /* ---------- Настройки ---------- */

  var KEY = "sin-ai";
  function loadSettings() {
    var s = null;
    try { s = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { s = null; }
    s = s || {};
    if (!PROVIDERS[s.provider]) s.provider = "ovh";
    // в версии 1.2 по умолчанию был Pollinations; если сервис не выбирали вручную, переходим на OVHcloud
    if (!s.chosen && s.provider === "pollinations") s.provider = "ovh";
    s.keys = s.keys || {};
    s.models = s.models || {};
    s.customBase = s.customBase || "";
    s.count = s.count || 5;
    return s;
  }
  function saveSettings(s) {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* без сохранения */ }
  }

  function baseOf(s) {
    var p = PROVIDERS[s.provider];
    return (p.custom ? s.customBase : p.base || "").replace(/\/+$/, "");
  }
  function endpoint(s) {
    var p = PROVIDERS[s.provider];
    return p.url || baseOf(s) + "/chat/completions";
  }
  function headers(s) {
    var h = { "Content-Type": "application/json" };
    var k = (s.keys[s.provider] || "").trim();
    if (k) h.Authorization = "Bearer " + k;
    if (s.provider === "openrouter") h["X-Title"] = "Sinonimy for Word";
    return h;
  }

  function s_limitMessage(url, msg) {
    if (/pollinations/.test(url)) {
      return "Pollinations без ключа отвечает не чаще раза в 30 секунд. Подождите немного или выберите " +
             "в настройках ⚙ сервис OVHcloud (тоже без ключа) или Groq с бесплатным ключом.";
    }
    if (/ovh/.test(url)) return "OVHcloud без ключа отвечает примерно на 2 запроса в минуту. Подождите или выберите другой сервис в настройках ⚙.";
    return "Достигнут лимит бесплатного тарифа. Подождите минуту или выберите другой сервис в настройках ⚙.";
  }

  async function fetchJson(url, opts, ms) {
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var t = ctrl ? setTimeout(function () { ctrl.abort(); }, ms || 60000) : null;
    if (ctrl) opts = Object.assign({}, opts, { signal: ctrl.signal });
    var r;
    try { r = await fetch(url, opts); }
    catch (e) {
      throw new Error(e && e.name === "AbortError" ? "Сервис не ответил вовремя. Попробуйте ещё раз."
                                                   : "Нет связи с сервисом. Проверьте интернет или выберите другой сервис.");
    } finally { if (t) clearTimeout(t); }
    var text = await r.text(), data = null;
    try { data = JSON.parse(text); } catch (e) { data = null; }
    if (!r.ok) {
      var msg = data && (data.error && (data.error.message || data.error) || data.detail || data.message) || text.slice(0, 200);
      if (typeof msg !== "string") msg = JSON.stringify(msg).slice(0, 200);
      if (r.status === 401 || r.status === 403) msg = "Ключ не подошёл (" + r.status + "). Проверьте ключ в настройках. " + msg;
      else if (r.status === 429 || r.status === 402 || /limit/i.test(msg)) {
        var err = new Error(s_limitMessage(url, msg));
        // сколько ждать до повтора: у OVHcloud без ключа окно — минута, у Pollinations — 30 секунд
        err.retryAfter = /ovh/.test(url) ? 30 : /pollinations/.test(url) ? 30 : Math.min(60, +r.headers.get("retry-after") || 20);
        throw err;
      }
      else if (/location|region|country/i.test(msg)) msg = "Сервис недоступен из вашей страны. Выберите другой сервис или включите VPN.";
      throw new Error(msg);
    }
    return data;
  }

  // Список моделей у сервиса: бесплатные/подходящие, лучшие первыми
  async function listModels(s) {
    var p = PROVIDERS[s.provider];
    if (p.fixedModels) return p.fixedModels.slice();
    var data = await fetchJson(p.modelsUrl || baseOf(s) + "/models", { headers: headers(s) }, 20000);
    var ids = (data.data || data.models || []).map(function (m) {
      var id = String(m.id || m.name || "");
      if (p.freeOnly && !/:free$/.test(id)) return null;
      return id.replace(/^models\//, "");
    }).filter(function (id) { return id && !(p.skip && p.skip.test(id)); });
    if (!ids.length && p.defaultModel) ids = [p.defaultModel];
    var prefer = p.prefer || [];
    function rank(id) { for (var i = 0; i < prefer.length; i++) if (prefer[i].test(id)) return i; return prefer.length; }
    ids.sort(function (a, b) { return rank(a) - rank(b) || a.localeCompare(b); });
    return ids;
  }

  /* ---------- Запрос ---------- */

  function buildMessages(fragment, context, styleId, count) {
    var style = STYLES.filter(function (x) { return x.id === styleId; })[0] || STYLES[0];
    var oneWord = !/\s/.test(fragment.trim());
    var sys =
      "Ты — редактор русского текста. Тебе дают фрагмент из предложения. " +
      "Предложи варианты, которыми можно заменить этот фрагмент прямо на его месте в предложении. " +
      "Сохрани смысл, грамматическую форму (падеж, число, род, время, лицо) и согласование с соседними словами, " +
      "чтобы предложение после замены осталось правильным. Не добавляй слов вне фрагмента, кавычек и пояснений. " +
      "Ответ — только JSON-массив строк, например [\"вариант 1\", \"вариант 2\"].";
    var hasCtx = !!(context && context.indexOf(fragment) !== -1 && context.trim() !== fragment.trim());
    var task = oneWord
      ? "Подбери синонимы (" + count + " шт.) к слову «" + fragment + "»" +
        (hasCtx ? ", подходящих по смыслу именно в этом предложении," : "") +
        " в той же грамматической форме. Стиль: " + style.hint + "."
      : "Перефразируй " + (hasCtx ? "фрагмент «" + fragment + "»" : "«" + fragment + "»") +
        " (" + count + " разных вариантов). Стиль: " + style.hint + ".";
    var ctx = hasCtx ? "Предложение: «" + context + "»\n" : "";
    return [
      { role: "system", content: sys },
      { role: "user", content: ctx + task }
    ];
  }

  // Достаём варианты из ответа модели: JSON-массив или список строк
  function parseVariants(text, fragment) {
    text = String(text || "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    var list = null;
    var m = text.match(/\[[\s\S]*\]/);
    if (m) { try { list = JSON.parse(m[0]); } catch (e) { list = null; } }
    if (!Array.isArray(list)) {
      list = text.split(/\n+/).map(function (l) {
        return l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "");
      });
    }
    var key = function (s) { return String(s).toLowerCase().replace(/ё/g, "е").replace(/[\s.,!?;:«»"']+/g, " ").trim(); };
    var seen = {}, out = [];
    seen[key(fragment)] = 1;
    list.forEach(function (v) {
      if (typeof v !== "string") return;
      v = v.replace(/^["«»'“”„\s]+|["«»'“”„\s]+$/g, "").replace(/\s+/g, " ").trim();
      if (!v || v.length > 400 || /:$/.test(v) || /^(вот|ответ|варианты?)[\s:.,!]*$/i.test(v)) return;
      // знаки по краям фрагмента Word сохраняет сам, лишняя точка в конце не нужна
      if (!/[.!?…]$/.test(fragment)) v = v.replace(/[.;,:]+$/, "").trim();
      v = v.replace(/^["«»'“”„\s]+|["«»'“”„\s]+$/g, "");
      // регистр первой буквы как у исходного фрагмента
      var f0 = String(fragment).charAt(0);
      if (f0 && f0 === f0.toLowerCase() && f0 !== f0.toUpperCase() && v.charAt(1) !== v.charAt(1).toUpperCase()) {
        v = v.charAt(0).toLowerCase() + v.slice(1);
      } else if (f0 && f0 !== f0.toLowerCase()) {
        v = v.charAt(0).toUpperCase() + v.slice(1);
      }
      var k = key(v);
      if (!k || seen[k]) return;
      seen[k] = 1;
      out.push(v);
    });
    return out;
  }

  async function paraphrase(s, fragment, context, styleId) {
    var p = PROVIDERS[s.provider];
    if (p.key === true && !(s.keys[s.provider] || "").trim()) {
      throw new Error("Для сервиса «" + p.name + "» нужен ключ. Откройте настройки ⚙.");
    }
    if (p.custom && !baseOf(s)) throw new Error("Укажите адрес сервиса в настройках ⚙.");
    var model = s.models[s.provider];
    if (!model) {
      var ms = [];
      try { ms = await listModels(s); } catch (e) { if (!p.defaultModel) throw e; }
      if (!ms.length && p.defaultModel) ms = [p.defaultModel];
      if (!ms.length) throw new Error("У сервиса не нашлось подходящих моделей.");
      model = s.models[s.provider] = ms[0];
      saveSettings(s);
    }
    var body = {
      model: model,
      messages: buildMessages(fragment, context, styleId, s.count),
      temperature: 0.8,
      max_tokens: 700
    };
    var data = await fetchJson(endpoint(s), { method: "POST", headers: headers(s), body: JSON.stringify(body) });
    var msg = data && data.choices && data.choices[0] && data.choices[0].message;
    var text = msg && (msg.content || msg.reasoning_content || "");
    var variants = parseVariants(text, fragment);
    if (!variants.length) throw new Error("Сервис ответил, но без вариантов. Попробуйте ещё раз или другую модель.");
    return { model: model, variants: variants.slice(0, Math.max(s.count, 3) + 2) };
  }

  var api = { PROVIDERS: PROVIDERS, STYLES: STYLES, loadSettings: loadSettings, saveSettings: saveSettings,
              listModels: listModels, paraphrase: paraphrase, parseVariants: parseVariants, buildMessages: buildMessages };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AI = api;
})(this);
