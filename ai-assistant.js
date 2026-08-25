/* ai-assistant.js — Ms. Effie Marking AI (separated from index.html)
   Handles: typed text + photo upload + file upload, marking-scheme-based hints
   Requires: index.html to load this AFTER its main script's `el`/`state`/`formatMathHTML` are defined.
   If OpenAI key is set, uses gpt-4o vision; otherwise falls back to offline tutorReply.
*/
(function () {
  // ---------- MARKING SCHEME: TEST ME Graph Sketching (a)-(o) ----------
  // Each entry mirrors the Suggested Answer table from the provided PDF.
  const MARKING_SCHEME = {
    a: { id: "a", question: "f(x) = -6", marks: 3, type: "constant",
      expected: { graph: "Horizontal line y = -6", domain: "(-∞, +∞)", range: "{-6}" },
      breakdown: [
        { code: "M1", desc: "Graph is horizontal line at y = -6", mark: 1 },
        { code: "M1", desc: "Domain Df = (-∞, +∞)", mark: 1 },
        { code: "A1", desc: "Range Rf = {-6}", mark: 1 }
      ],
      commonErrors: ["Drawing line at y=6 instead of y=-6", "Writing range as (-∞,∞) instead of single value"] },
    b: { id: "b", question: "f(x) = -3x + 4", marks: 3, type: "linear",
      expected: { graph: "Decreasing line, y-intercept 4, x-intercept 4/3", domain: "(-∞, +∞)", range: "(-∞, +∞)" },
      breakdown: [
        { code: "M1", desc: "Gradient negative → decreasing line", mark: 1 },
        { code: "M1", desc: "Intercepts correct: (0,4) and (4/3,0)", mark: 1 },
        { code: "A1", desc: "Domain & range both (-∞,+∞)", mark: 1 }
      ],
      commonErrors: ["Drawing increasing line (wrong sign)", "Wrong intercept"] },
    c: { id: "c", question: "f(x) = x² - 4", marks: 3, type: "quadratic",
      expected: { graph: "U-shaped parabola, vertex (0,-4)", domain: "(-∞, +∞)", range: "[-4, +∞)" },
      breakdown: [
        { code: "M1", desc: "Parabola opens upward", mark: 1 },
        { code: "M1", desc: "Vertex at (0,-4)", mark: 1 },
        { code: "A1", desc: "Range from -4 inclusive", mark: 1 }
      ] },
    d: { id: "d", question: "f(x) = 9 - x²", marks: 3, type: "quadratic",
      expected: { graph: "Inverted parabola, max at (0,9)", domain: "(-∞, +∞)", range: "(-∞, 9]" },
      breakdown: [
        { code: "M1", desc: "Parabola opens downward", mark: 1 },
        { code: "M1", desc: "Vertex/maximum at (0,9)", mark: 1 },
        { code: "A1", desc: "Range (-∞,9]", mark: 1 }
      ] },
    e: { id: "e", question: "f(x) = x³ - 3", marks: 2, type: "cubic",
      expected: { graph: "Cubic S-shape, inflection at (0,-3)", domain: "(-∞, +∞)", range: "(-∞, +∞)" },
      breakdown: [
        { code: "M1", desc: "Correct cubic shape through (0,-3)", mark: 1 },
        { code: "A1", desc: "Domain & range both (-∞,∞)", mark: 1 }
      ] },
    f: { id: "f", question: "f(x) = |2x+1|", marks: 3, type: "absolute",
      expected: { graph: "V-shape, vertex at (-1/2,0)", domain: "(-∞, +∞)", range: "[0, +∞)" },
      breakdown: [
        { code: "M1", desc: "V-shape with vertex at x=-1/2", mark: 1 },
        { code: "M1", desc: "Vertex touches x-axis at y=0", mark: 1 },
        { code: "A1", desc: "Range [0,∞)", mark: 1 }
      ] },
    g: { id: "g", question: "f(x) = |2x-1| + 1", marks: 3, type: "absolute",
      expected: { graph: "V-shape vertex (0.5,1), y-intercept 2", domain: "(-∞, +∞)", range: "[1, +∞)" },
      breakdown: [
        { code: "M1", desc: "Vertex at (0.5,1)", mark: 1 },
        { code: "M1", desc: "Correct V opening upward, intercept 2", mark: 1 },
        { code: "A1", desc: "Range [1,∞)", mark: 1 }
      ] },
    h: { id: "h", question: "f(x) = √(3x-2)", marks: 3, type: "surd",
      expected: { graph: "Square-root curve starting at (2/3,0)", domain: "[2/3, +∞)", range: "[0, +∞)" },
      breakdown: [
        { code: "M1", desc: "Domain condition 3x-2 ≥ 0 → x ≥ 2/3", mark: 1 },
        { code: "M1", desc: "Starts at (2/3,0), increasing", mark: 1 },
        { code: "A1", desc: "Range [0,∞)", mark: 1 }
      ] },
    i: { id: "i", question: "f(x) = √(2-3x)", marks: 3, type: "surd",
      expected: { graph: "Decreasing root curve ending at (2/3,0)", domain: "(-∞, 2/3]", range: "[0, +∞)" },
      breakdown: [
        { code: "M1", desc: "Domain 2-3x ≥ 0 → x ≤ 2/3", mark: 1 },
        { code: "M1", desc: "Curve ends at (2/3,0)", mark: 1 },
        { code: "A1", desc: "Range [0,∞)", mark: 1 }
      ] },
    j: { id: "j", question: "f(x) = 5/(2+x)", marks: 4, type: "rational",
      expected: { graph: "Hyperbola asymptotes x=-2, y=0", domain: "(-∞,-2)∪(-2,+∞) or ℝ\\{-2}", range: "(-∞,0)∪(0,+∞) or ℝ\\{0}" },
      breakdown: [
        { code: "M1", desc: "Vertical asymptote x=-2", mark: 1 },
        { code: "M1", desc: "Horizontal asymptote y=0", mark: 1 },
        { code: "A1", desc: "Domain excludes -2", mark: 1 },
        { code: "A1", desc: "Range excludes 0", mark: 1 }
      ] },
    k: { id: "k", question: "f(x) = 5/(2-x)", marks: 4, type: "rational",
      expected: { graph: "Hyperbola asymptotes x=2, y=0", domain: "(-∞,+2)∪(2,+∞) or ℝ\\{2}", range: "(-∞,0)∪(0,+∞) or ℝ\\{0}" },
      breakdown: [
        { code: "M1", desc: "Vertical asymptote x=2", mark: 1 },
        { code: "M1", desc: "Horizontal asymptote y=0", mark: 1 },
        { code: "A1", desc: "Domain excludes 2", mark: 1 },
        { code: "A1", desc: "Range excludes 0", mark: 1 }
      ] },
    l: { id: "l", question: "f(x) = e^{2x} + 1", marks: 3, type: "exponential",
      expected: { graph: "Exponential rising, asymptote y=1, via (0,2)", domain: "(-∞, +∞)", range: "(1, +∞)" },
      breakdown: [
        { code: "M1", desc: "Horizontal asymptote y=1", mark: 1 },
        { code: "M1", desc: "Increasing through (0,2)", mark: 1 },
        { code: "A1", desc: "Range (1,∞)", mark: 1 }
      ] },
    m: { id: "m", question: "f(x) = e^{-x} - 2", marks: 3, type: "exponential",
      expected: { graph: "Decreasing exponential, asymptote y=-2, via (0,-1)", domain: "(-∞, +∞)", range: "(-2, +∞)" },
      breakdown: [
        { code: "M1", desc: "Horizontal asymptote y=-2", mark: 1 },
        { code: "M1", desc: "Decreasing, passes (0,-1)", mark: 1 },
        { code: "A1", desc: "Range (-2,∞)", mark: 1 }
      ] },
    n: { id: "n", question: "f(x) = ln(x-3)", marks: 3, type: "logarithmic",
      expected: { graph: "Log curve asymptote x=3, via (4,0)", domain: "(3, +∞)", range: "(-∞, +∞)" },
      breakdown: [
        { code: "M1", desc: "Vertical asymptote x=3", mark: 1 },
        { code: "M1", desc: "Passes (4,0), increasing slowly", mark: 1 },
        { code: "A1", desc: "Domain (3,∞)", mark: 1 }
      ] },
    o: { id: "o", question: "f(x) = ln(3-x)", marks: 3, type: "logarithmic",
      expected: { graph: "Reflected log, asymptote x=3, via (2,0), decreasing", domain: "(-∞, 3)", range: "(-∞, +∞)" },
      breakdown: [
        { code: "M1", desc: "Vertical asymptote x=3, reflected shape", mark: 1 },
        { code: "M1", desc: "Passes (2,0)", mark: 1 },
        { code: "A1", desc: "Domain (-∞,3)", mark: 1 }
      ] }
  };

  // ---------- System prompt: hint-only marking ----------
  function buildSystemPrompt() {
    const schemeText = Object.values(MARKING_SCHEME).map(function (s) {
      return "(" + s.id + ") " + s.question + " | Expected: " + s.expected.graph + " ; Domain " + s.expected.domain + " ; Range " + s.expected.range
        + " | Marks " + s.marks + " (" + s.breakdown.map(function (b) { return b.code + ":" + b.desc; }).join(", ") + ")";
    }).join("\n");
    return "You are Ms. Effie, Matriculation Mathematics marker for Function Junction (Topic 5: Graph Sketching, Domain & Range).\n"
      + "STRICT RULES:\n"
      + "1) Mark STRICTLY against the marking scheme below. Award marks only if the student's step matches the scheme exactly.\n"
      + "2) NEVER give the full correct answer directly. Instead give HINTS, CLUES and CORRECTIONS that guide the student to self-correct.\n"
      + "   - Say what type of error: concept error / procedure error / algebra slip / carelessness / not answered.\n"
      + "   - Explain WHY it is wrong using the graph property (e.g. negative gradient means decreasing).\n"
      + "   - Give a directional hint: what to check, what to recalculate, what to redraw — but do NOT state the full final line.\n"
      + "3) If the student's image/handwriting is unclear, say so and ask for a clearer photo, do NOT guess marks.\n"
      + "4) Output format always:\n"
      + "   - For each question attempted: marks obtained / full marks + error tag\n"
      + "   - Hint paragraph for each wrong/partial question (2-3 lines, Socratic)\n"
      + "   - Overall encouragement\n"
      + "5) Use simple English, mix Malay terms for domain/range if student uses them. Render maths as plain text: Df, Rf, -infinity, etc.\n"
      + "6) If no marking scheme question matches, use general function-graph knowledge but still hint-only.\n\n"
      + "MARKING SCHEME (TEST ME a-o):\n" + schemeText;
  }

  // ---------- State for pending uploads ----------
  let pendingImages = []; // { dataUrl, mime, name }
  let pendingFiles = [];  // { name, textSnippet }

  // Wait for the main page's `el` object to exist
  function ready(fn) {
    if (window.el && window.el.chatLog) fn();
    else setTimeout(function () { ready(fn); }, 100);
  }

  ready(function initMarkingAI() {
    const chatLog = window.el.chatLog;
    const chatInput = window.el.chatLog ? document.getElementById("chatInput") : null;
    const inputEl = document.getElementById("chatInput");
    const sendBtn = document.getElementById("sendChat");
    const chatControls = document.querySelector(".chat-controls");

    // ---- Inject upload buttons and config UI ----
    if (chatControls && !document.getElementById("attachPhotoBtn")) {
      const photoBtn = document.createElement("button");
      photoBtn.id = "attachPhotoBtn";
      photoBtn.type = "button";
      photoBtn.className = "icon-btn-attach";
      photoBtn.title = "Attach photo / handwriting";
      photoBtn.setAttribute("aria-label", "Attach photo");
      photoBtn.textContent = "📷";
      const fileBtn = document.createElement("button");
      fileBtn.id = "attachFileBtn";
      fileBtn.type = "button";
      fileBtn.className = "icon-btn-attach";
      fileBtn.title = "Attach file / PDF (marking scheme)";
      fileBtn.setAttribute("aria-label", "Attach file");
      fileBtn.textContent = "📄";
      chatControls.insertBefore(fileBtn, chatControls.firstChild);
      chatControls.insertBefore(photoBtn, chatControls.firstChild);
    }

    // hidden file inputs
    let photoInput = document.getElementById("photoInput");
    if (!photoInput) {
      photoInput = document.createElement("input");
      photoInput.id = "photoInput";
      photoInput.type = "file";
      photoInput.accept = "image/*";
      photoInput.multiple = true;
      photoInput.style.display = "none";
      document.body.appendChild(photoInput);
    }
    let fileInput = document.getElementById("fileInput");
    if (!fileInput) {
      fileInput = document.createElement("input");
      fileInput.id = "fileInput";
      fileInput.type = "file";
      fileInput.accept = ".pdf,.txt,.docx,image/*";
      fileInput.multiple = true;
      fileInput.style.display = "none";
      document.body.appendChild(fileInput);
    }

    // preview strip
    let preview = document.getElementById("attachPreview");
    if (!preview) {
      preview = document.createElement("div");
      preview.id = "attachPreview";
      preview.className = "attach-preview";
      const chatLogEl = document.getElementById("chatLog");
      chatLogEl.parentNode.insertBefore(preview, chatLogEl.nextSibling);
    }

    // config strip (API key + scheme picker)
    let config = document.getElementById("aiConfig");
    if (!config) {
      config = document.createElement("div");
      config.id = "aiConfig";
      config.className = "ai-config";
      config.innerHTML =
        '<div class="ai-config-row">'
        + '<label for="openaiKey">OpenAI Key</label>'
        + '<input id="openaiKey" type="password" placeholder="sk-... (optional, for vision)" />'
        + '<button class="tiny" id="saveKeyBtn" type="button">Save</button>'
        + '<span id="keyStatus" class="hint"></span>'
        + '</div>'
        + '<div class="ai-config-row">'
        + '<label for="schemePick">Question</label>'
        + '<select id="schemePick"><option value="">Auto-detect (a-o)</option>'
        + Object.values(MARKING_SCHEME).map(function (s) { return '<option value="' + s.id + '">(' + s.id + ') ' + escHtml(s.question) + '</option>'; }).join("")
        + '</select>'
        + '<span class="hint">Tip: type + attach photo/handwriting. AI hints only.</span>'
        + '</div>';
      const chatLogEl2 = document.getElementById("chatLog");
      chatLogEl2.parentNode.insertBefore(config, chatLogEl2);
      const saved = localStorage.getItem("fj_openai_key");
      if (saved) {
        document.getElementById("openaiKey").value = saved;
        document.getElementById("keyStatus").textContent = "saved ✓";
      }
      document.getElementById("saveKeyBtn").addEventListener("click", function () {
        const v = document.getElementById("openaiKey").value.trim();
        if (v) localStorage.setItem("fj_openai_key", v);
        else localStorage.removeItem("fj_openai_key");
        document.getElementById("keyStatus").textContent = v ? "saved ✓" : "cleared";
        setTimeout(function () { document.getElementById("keyStatus").textContent = ""; }, 2000);
      });
    }

    function escHtml(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

    function renderPreview() {
      preview.innerHTML = "";
      pendingImages.forEach(function (img, idx) {
        const chip = document.createElement("span");
        chip.className = "attach-chip";
        chip.innerHTML = '<img src="' + img.dataUrl + '" alt="preview" /><span>' + escHtml(img.name) + '</span>';
        const rm = document.createElement("button");
        rm.type = "button";
        rm.textContent = "×";
        rm.addEventListener("click", function () { pendingImages.splice(idx, 1); renderPreview(); });
        chip.appendChild(rm);
        preview.appendChild(chip);
      });
      pendingFiles.forEach(function (f, idx) {
        const chip = document.createElement("span");
        chip.className = "attach-chip";
        chip.innerHTML = '<span>📄 ' + escHtml(f.name) + '</span>';
        const rm = document.createElement("button");
        rm.type = "button";
        rm.textContent = "×";
        rm.addEventListener("click", function () { pendingFiles.splice(idx, 1); renderPreview(); });
        chip.appendChild(rm);
        preview.appendChild(chip);
      });
    }

    function fileToDataUrl(file) {
      return new Promise(function (resolve, reject) {
        const r = new FileReader();
        r.onload = function () { resolve(r.result); };
        r.onerror = reject;
        r.readAsDataURL(file);
      });
    }

    function fileToTextSnippet(file) {
      return new Promise(function (resolve) {
        if (file.type.startsWith("image/")) { resolve(""); return; }
        const r = new FileReader();
        r.onload = function () { resolve(String(r.result).slice(0, 6000)); };
        r.onerror = function () { resolve(""); };
        // pdf as text will be garbled; we just take first bytes as hint and let vision handle images
        if (file.type === "application/pdf") {
          // read as data URL and let GPT-4o handle? fallback: indicate pdf uploaded
          resolve("[PDF file: " + file.name + " - content will be read via vision if image-based]");
          return;
        }
        r.readAsText(file);
      });
    }

    document.getElementById("attachPhotoBtn").addEventListener("click", function () { photoInput.click(); });
    document.getElementById("attachFileBtn").addEventListener("click", function () { fileInput.click(); });

    photoInput.addEventListener("change", async function () {
      const files = Array.from(photoInput.files || []);
      for (const f of files) {
        if (!f.type.startsWith("image/")) continue;
        const dataUrl = await fileToDataUrl(f);
        // compress if huge (>1.5MB base64)
        pendingImages.push({ dataUrl: dataUrl, mime: f.type || "image/jpeg", name: f.name });
        if (pendingImages.length > 4) pendingImages = pendingImages.slice(-4);
      }
      photoInput.value = "";
      renderPreview();
    });

    fileInput.addEventListener("change", async function () {
      const files = Array.from(fileInput.files || []);
      for (const f of files) {
        if (f.type.startsWith("image/")) {
          const dataUrl = await fileToDataUrl(f);
          pendingImages.push({ dataUrl: dataUrl, mime: f.type || "image/jpeg", name: f.name });
        } else {
          const snippet = await fileToTextSnippet(f);
          pendingFiles.push({ name: f.name, textSnippet: snippet });
        }
        if (pendingFiles.length > 3) pendingFiles = pendingFiles.slice(-3);
      }
      fileInput.value = "";
      renderPreview();
    });

    // drag & drop on chatLog
    const logEl = document.getElementById("chatLog");
    ["dragenter", "dragover"].forEach(function (ev) {
      logEl.addEventListener(ev, function (e) { e.preventDefault(); logEl.classList.add("drag-over"); });
    });
    ["dragleave", "drop"].forEach(function (ev) {
      logEl.addEventListener(ev, function () { logEl.classList.remove("drag-over"); });
    });
    logEl.addEventListener("drop", async function (e) {
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files || []);
      for (const f of files) {
        if (f.type.startsWith("image/")) {
          const dataUrl = await fileToDataUrl(f);
          pendingImages.push({ dataUrl: dataUrl, mime: f.type, name: f.name });
        } else {
          const snippet = await fileToTextSnippet(f);
          pendingFiles.push({ name: f.name, textSnippet: snippet });
        }
      }
      renderPreview();
    });

    // ---------- Override send handler to use marking AI ----------
    const origSend = window.el.sendChat.onclick; // not used; we replace listener
    // Remove old listeners by cloning buttons
    const oldSendBtn = document.getElementById("sendChat");
    const newSendBtn = oldSendBtn.cloneNode(true);
    oldSendBtn.parentNode.replaceChild(newSendBtn, oldSendBtn);
    window.el.sendChat = newSendBtn;

    const oldInput = document.getElementById("chatInput");
    const newInput = oldInput.cloneNode(true);
    oldInput.parentNode.replaceChild(newInput, oldInput);
    window.el.chatInput = newInput;

    // remove old suggestion listeners and re-add
    document.querySelectorAll(".suggestions button").forEach(function (btn) {
      const clone = btn.cloneNode(true);
      btn.parentNode.replaceChild(clone, btn);
    });

    function addUserWithAttachments(text) {
      const wrap = document.createElement("div");
      wrap.className = "msg user";
      let html = "";
      if (text) html += "<div>" + escHtml(text).replace(/\n/g, "<br>") + "</div>";
      pendingImages.forEach(function (img) {
        html += '<div style="margin-top:8px"><img src="' + img.dataUrl + '" alt="uploaded" style="max-width:100%;max-height:180px;border-radius:8px;border:1px solid rgba(0,0,0,0.12)" /></div>';
      });
      pendingFiles.forEach(function (f) {
        html += '<div style="margin-top:6px;font-size:0.82rem;opacity:0.8">📄 ' + escHtml(f.name) + '</div>';
      });
      if (!html) html = "<em>(image/file only)</em>";
      wrap.innerHTML = html;
      window.el.chatLog.appendChild(wrap);
      scrollChatToBottom();
    }

    function scrollChatToBottom() {
      requestAnimationFrame(function () {
        window.el.chatLog.scrollTop = window.el.chatLog.scrollHeight;
        setTimeout(function () { window.el.chatLog.scrollTop = window.el.chatLog.scrollHeight; }, 80);
      });
    }

    function addBotHTML(html) {
      const msg = document.createElement("div");
      msg.className = "msg bot";
      // use existing formatMathHTML if available for nice maths
      if (window.formatMathHTML) msg.innerHTML = window.formatMathHTML(html);
      else msg.innerHTML = html;
      window.el.chatLog.appendChild(msg);
      scrollChatToBottom();
      if (window.speak) { try { window.speak(msg.textContent.slice(0, 400)); } catch (e) {} }
    }

    function offlineHintReply(text) {
      // keep original tutorReply as fallback when no API key
      if (window.tutorReply) return window.tutorReply(text);
      return "Hello! Attach a photo of your work or type the question (e.g. f(x)=√(3x-2)). I'll hint based on the marking scheme.";
    }

    function getSchemeForInput(text) {
      const pick = document.getElementById("schemePick");
      const sel = pick && pick.value ? pick.value.toLowerCase() : "";
      if (sel && MARKING_SCHEME[sel]) return MARKING_SCHEME[sel];
      const q = (text || "").toLowerCase();
      // crude detect: look for (a)-(o) or function string
      for (const k in MARKING_SCHEME) {
        const s = MARKING_SCHEME[k];
        // if student mentions the exact question snippet
        if (q.includes(s.question.toLowerCase().replace(/\s+/g, "")) || q.includes("(" + k + ")")) return s;
      }
      // try to detect by type keywords
      if (q.includes("sqrt") || q.includes("√")) {
        if (q.includes("3x-2")) return MARKING_SCHEME.h;
        if (q.includes("2-3x")) return MARKING_SCHEME.i;
      }
      if (q.includes("5/") || q.includes("5 ")) {
        if (q.includes("2+x") || q.includes("2 + x")) return MARKING_SCHEME.j;
        if (q.includes("2-x") || q.includes("2 - x")) return MARKING_SCHEME.k;
      }
      return null;
    }

    async function callOpenAI(text) {
      const key = (localStorage.getItem("fj_openai_key") || "").trim();
      if (!key) return null;
      const scheme = getSchemeForInput(text);
      const schemeNote = scheme ? "Student is asking about question (" + scheme.id + ") " + scheme.question + ". Use this scheme entry for marking." : "Auto-detect the question (a-o).";
      const userContent = [];
      const combinedText = [
        text || "(no typed text — please read the attached image/handwriting)",
        schemeNote,
        pendingFiles.length ? "Attached files: " + pendingFiles.map(function (f) { return f.name + ": " + f.textSnippet; }).join(" | ") : ""
      ].filter(Boolean).join("\n\n");

      userContent.push({ type: "text", text: combinedText });
      pendingImages.forEach(function (img) {
        userContent.push({ type: "image_url", image_url: { url: img.dataUrl, detail: "high" } });
      });

      const body = {
        model: "gpt-4o",
        temperature: 0.3,
        max_tokens: 900,
        messages: [
          { role: "system", content: buildSystemPrompt() },
          { role: "user", content: userContent }
        ]
      };

      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error("OpenAI " + res.status + ": " + err.slice(0, 400));
      }
      const data = await res.json();
      return (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
    }

    async function handleSend() {
      const text = window.el.chatInput.value.trim();
      if (!text && pendingImages.length === 0 && pendingFiles.length === 0) return;
      const snapshotImages = pendingImages.slice();
      const snapshotFiles = pendingFiles.slice();
      addUserWithAttachments(text);
      window.el.chatInput.value = "";
      // keep snapshots for this turn, then clear preview
      pendingImages = [];
      pendingFiles = [];
      renderPreview();

      // typing indicator
      const typing = document.createElement("div");
      typing.className = "msg bot";
      typing.textContent = "Ms. Effie is checking against the marking scheme…";
      typing.style.opacity = "0.7";
      window.el.chatLog.appendChild(typing);
      scrollChatToBottom();

      try {
        const key = (localStorage.getItem("fj_openai_key") || "").trim();
        let reply = "";
        if (key && (snapshotImages.length > 0 || snapshotFiles.length > 0 || text.length > 5)) {
          // temporarily restore snapshots for API call
          pendingImages = snapshotImages;
          pendingFiles = snapshotFiles;
          reply = await callOpenAI(text);
          pendingImages = [];
          pendingFiles = [];
        }
        if (!reply) {
          // offline fallback: produce a structured hint using scheme data
          const scheme = getSchemeForInput(text);
          if (scheme) {
            reply = offlineSchemeHint(scheme, text, snapshotImages.length > 0);
          } else {
            reply = offlineHintReply(text);
          }
        }
        typing.remove();
        addBotHTML(reply);
      } catch (err) {
        typing.remove();
        addBotHTML("⚠️ Could not reach OpenAI: " + escHtml(err.message).slice(0, 500)
          + "<br><br>Offline hint: " + offlineHintReply(text));
      }
    }

    function offlineSchemeHint(scheme, text, hasImage) {
      // Structured offline marking when no API key / no vision
      const q = (text || "").toLowerCase();
      let verdict = "partial";
      // very light heuristic: if student mentions correct domain/range words, guess partial
      const mentionsDomain = q.includes("domain") || q.includes("df");
      const mentionsRange = q.includes("range") || q.includes("rf");
      let html = "<strong>Question (" + scheme.id + ") " + escHtml(scheme.question) + "</strong><br>"
        + "<em>Marking scheme: " + scheme.marks + " marks</em> — "
        + scheme.breakdown.map(function (b) { return b.code + " " + escHtml(b.desc) + " (" + b.mark + "m)"; }).join(" · ")
        + "<br><br>";
      if (hasImage) {
        html += "I can see you attached a photo. <span class='badge-partial'>Image received</span> — with an OpenAI key I would read your handwriting automatically. "
          + "Without a key, here is a <strong>hint-only</strong> check:<br>";
      }
      html += "<table class='mark-table'><tr><th>Criterion</th><th>Full</th><th>Status</th></tr>";
      scheme.breakdown.forEach(function (b) {
        html += "<tr><td>" + escHtml(b.desc) + "</td><td>" + b.mark + "</td><td><span class='badge-partial'>check</span></td></tr>";
      });
      html += "</table>";
      html += "<br><strong>Hint (do not copy — think first):</strong><br>";
      if (scheme.type === "linear" && scheme.id === "b") {
        html += "Check the sign of the gradient. A negative gradient means the line goes <em>down</em> from left to right. What is your slope? Is your y-intercept at 4?";
      } else if (scheme.type === "constant") {
        html += "A constant function y = k is a <em>horizontal</em> line. Is your line horizontal? What is its y-value? Domain is all x, range is just that one value.";
      } else if (scheme.type === "surd") {
        html += "For a square-root, the inside must be ≥ 0. Solve the inequality first — that gives the starting x. Where does your curve start on the x-axis?";
      } else if (scheme.type === "rational") {
        html += "Find the value that makes the denominator zero — that is the vertical asymptote (excluded from domain). What happens as x gets close to it? And what value can y never be?";
      } else if (scheme.type === "quadratic") {
        html += "Decide if the parabola opens up or down from the sign of x². Where is the vertex? That decides the start of the range.";
      } else if (scheme.type === "absolute") {
        html += "An absolute graph is V-shaped. Solve 2x+1=0 (or 2x-1=0) to find the vertex x-coordinate. Is your V corner at the right place?";
      } else if (scheme.type === "exponential") {
        html += "An exponential has a horizontal asymptote y = c (the +1 or -2 shift). Does your graph approach that line? What is f(0)?";
      } else if (scheme.type === "logarithmic") {
        html += "A log has a vertical asymptote where the inside = 0 → x = 3. Is your asymptote correct? Check that x must be on the right (or left) side of it.";
      } else {
        html += "Compare your graph shape and your Df/Rf to the expected values. Which part differs — the shape, the domain condition, or the range?";
      }
      html += "<br><br><em>Next step:</em> Correct only the part that is off, then re-send a clearer photo or your updated Df/Rf.";
      return html;
    }

    newSendBtn.addEventListener("click", handleSend);
    newInput.addEventListener("keydown", function (e) { if (e.key === "Enter") handleSend(); });

    document.querySelectorAll(".suggestions button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        window.el.chatInput.value = btn.dataset.prompt;
        handleSend();
      });
    });

    // welcome message update
    // keep original welcome, add marking hint
    setTimeout(function () {
      addBotHTML("Hi! I’m <strong>Ms. Effie — Marking Mode</strong> for TEST ME (a)–(o).<br>"
        + "Send <strong>typed text + photo/handwriting + files</strong>. I mark against the scheme and give <em>hints only</em>, not the full answer.<br>"
        + "Lecturer: upload the marking scheme PDF via 📄 and set an OpenAI key for vision. Student: snap your graph & Df/Rf and I’ll tell you what to fix.");
    }, 600);

    console.log("ai-assistant.js loaded — marking schemes (a-o) ready, upload enabled.");
  });
})();
