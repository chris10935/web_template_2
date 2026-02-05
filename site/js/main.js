// ===== basics
(() => {
  const y = document.getElementById("year");
  if (y) y.textContent = new Date().getFullYear();
})();

// ===== mobile nav with hamburger animation
(() => {
  const btn = document.querySelector(".menuBtn");
  const nav = document.querySelector(".navlinks");
  if (!btn || !nav) return;

  btn.addEventListener("click", () => {
    nav.classList.toggle("open");
    btn.classList.toggle("active");
  });

  // Close menu when clicking a link
  nav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      nav.classList.remove("open");
      btn.classList.remove("active");
    });
  });
})();

// ===== load primary business record from CSV (first row) and fill above-the-fold
(async () => {
  // If you want multiple locations, choose by id or slug. For now, pick the first row.
  try {
    const res = await fetch("data/business.csv", { cache: "no-store" });
    const text = await res.text();
    const rows = window.RAG.parseCSV(text);
    if (!rows.length) return;

    const b = rows[0];

    // Topbar + hero info
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el && val) el.textContent = val;
    };
    set(
      "bizAddress",
      `${b.address || ""}, ${b.city || ""}, ${b.state || ""} ${b.zip || ""}`
        .replace(/\s+/g, " ")
        .trim(),
    );
    set("bizHours", b.hours);
    set("openHours", b.hours);

    const phoneEl = document.getElementById("bizPhone");
    const phoneEl2 = document.getElementById("bizPhone2");
    const callLink = document.getElementById("callLink");
    const callBtn = document.getElementById("callBtn");
    const footPhone = document.getElementById("footPhone");
    const formatTel = (p) => (p || "").replace(/[^\d+]/g, "");
    const tel = formatTel(b.phone) || "+15555555555";

    [phoneEl, phoneEl2, callLink, callBtn, footPhone].forEach((el) => {
      if (!el) return;
      el.setAttribute("href", `tel:${tel}`);
      el.textContent = b.phone || "(555) 555-5555";
    });

    const addr =
      `${b.address || ""}, ${b.city || ""}, ${b.state || ""} ${b.zip || ""}`.trim();
    const q = encodeURIComponent(addr || `${b.city || ""} ${b.state || ""}`);
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${q}`;

    const directionsLink = document.getElementById("directionsLink");
    const mapOpenLink = document.getElementById("mapOpenLink");
    const directionsBtn = document.getElementById("directionsBtn");
    const footAddress = document.getElementById("footAddress");
    const bizAddress2 = document.getElementById("bizAddress2");
    const bizHours2 = document.getElementById("bizHours2");
    const footAddress2 = document.getElementById("footAddress");

    [directionsLink, mapOpenLink, directionsBtn].forEach((el) => {
      if (!el) return;
      el.setAttribute("href", mapsUrl);
    });

    if (footAddress)
      footAddress.textContent =
        `${b.address || ""}, ${b.city || ""}, ${b.state || ""}`
          .replace(/\s+/g, " ")
          .trim();
    if (bizAddress2) bizAddress2.textContent = addr;
    if (bizHours2) bizHours2.textContent = b.hours || "";
    if (footAddress2)
      footAddress2.textContent =
        `${b.address || ""}, ${b.city || ""}, ${b.state || ""}`
          .replace(/\s+/g, " ")
          .trim();

    const website = document.getElementById("bizWebsite");
    if (website && b.website) {
      website.setAttribute("href", b.website);
      website.textContent = b.website
        .replace(/^https?:\/\//, "")
        .replace(/\/$/, "");
    }

    // Image link support
    const heroImg = document.getElementById("heroImage");
    if (heroImg && b.image_url) heroImg.src = b.image_url;

    // Map embed (simple query embed)
    const mapFrame = document.getElementById("mapFrame");
    if (mapFrame) {
      // If you have lat/lng, you can use those instead for more accuracy
      const mapQ = encodeURIComponent(
        addr || `${b.city || ""} ${b.state || ""}`,
      );
      mapFrame.src = `https://www.google.com/maps?q=${mapQ}&output=embed`;
    }
  } catch (e) {
    // silent on purpose, but useful during dev:
    console.warn("Business CSV not loaded:", e);
  }
})();

// ===== Chat widget
(() => {
  const fab = document.getElementById("chatFab");
  const panel = document.getElementById("chatPanel");
  const closeBtn = document.getElementById("chatClose");
  const body = document.getElementById("chatBody");
  const input = document.getElementById("chatInput");
  const send = document.getElementById("chatSend");
  const toggle = document.getElementById("ragToggle");
  const openHero = document.getElementById("openChatHero");

  if (!fab || !panel || !body || !input || !send || !toggle) return;

  const addMsg = (role, text, sources = []) => {
    const wrap = document.createElement("div");
    wrap.className = `msg ${role}`;
    const bub = document.createElement("div");
    bub.className = "bubble";
    bub.textContent = text;

    if (sources.length) {
      const s = document.createElement("div");
      s.className = "sources";
      s.innerHTML = sources
        .map((x) => `<span class="sourceChip">${escapeHtml(x)}</span>`)
        .join("");
      bub.appendChild(s);
    }

    wrap.appendChild(bub);
    body.appendChild(wrap);
    body.scrollTop = body.scrollHeight;
  };

  const escapeHtml = (str) =>
    String(str).replace(
      /[&<>"']/g,
      (m) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[m],
    );

  const show = () => {
    panel.style.display = "block";
    panel.setAttribute("aria-hidden", "false");
    input.focus();
  };
  const hide = () => {
    panel.style.display = "none";
    panel.setAttribute("aria-hidden", "true");
  };

  fab.addEventListener("click", show);
  if (openHero) openHero.addEventListener("click", show);
  closeBtn.addEventListener("click", hide);

  // Init RAG index
  let ragState = null;
  let ragReady = false;

  window.RAG.init({
    businessCsvPath: "data/business.csv",
    faqCsvPath: "data/faq_kb.csv",
  })
    .then((state) => {
      ragState = state;
      ragReady = true;
    })
    .catch((e) => {
      ragReady = false;
      console.warn("RAG init failed:", e);
    });

  const handle = () => {
    const q = input.value.trim();
    if (!q) return;
    input.value = "";
    addMsg("user", q);

    if (toggle.checked && ragReady && ragState) {
      const out = window.RAG.query(ragState, q, { k: 3 });
      addMsg("assistant", out.answer, out.sources);
    } else {
      addMsg(
        "assistant",
        "Ask about hours, location, pricing, or services. Toggle RAG to retrieve answers from your CSV files.",
      );
    }
  };

  send.addEventListener("click", handle);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handle();
  });

  // greet once
  addMsg(
    "assistant",
    "Hi! Ask about hours, services, pricing, or directions. (This is a no-API CSV RAG starter.)",
  );
})();
