/**
 * NO-API RAG Starter:
 * - Loads business.csv + faq_kb.csv
 * - Builds TF-IDF index in the browser
 * - Retrieves top matches for a query
 * - Returns an answer + sources
 *
 * NOTE: This is retrieval (R) without generation (G) to keep it static/no API.
 * You can add local generation later if you want.
 */

window.RAG = (() => {
  const STOP = new Set([
    "the",
    "a",
    "an",
    "and",
    "or",
    "but",
    "if",
    "then",
    "else",
    "when",
    "what",
    "how",
    "why",
    "to",
    "of",
    "in",
    "on",
    "for",
    "with",
    "at",
    "by",
    "from",
    "as",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "being",
    "this",
    "that",
    "these",
    "those",
    "it",
    "its",
    "we",
    "you",
    "your",
  ]);

  function tokenize(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t && t.length > 1 && !STOP.has(t));
  }

  function parseCSV(csvText) {
    const rows = [];
    let i = 0,
      field = "",
      row = [],
      inQuotes = false;

    const pushField = () => {
      row.push(field);
      field = "";
    };
    const pushRow = () => {
      rows.push(row);
      row = [];
    };

    while (i < csvText.length) {
      const c = csvText[i];

      if (c === '"') {
        if (inQuotes && csvText[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = !inQuotes;
        i++;
        continue;
      }
      if (!inQuotes && c === ",") {
        pushField();
        i++;
        continue;
      }
      if (!inQuotes && (c === "\n" || c === "\r")) {
        if (c === "\r" && csvText[i + 1] === "\n") i++;
        pushField();
        pushRow();
        i++;
        continue;
      }
      field += c;
      i++;
    }
    if (field.length || row.length) {
      pushField();
      pushRow();
    }

    const header = rows.shift().map((h) => h.trim());
    return rows
      .filter((r) => r.some((x) => String(x).trim().length))
      .map((r) => {
        const obj = {};
        header.forEach((h, idx) => (obj[h] = (r[idx] ?? "").trim()));
        return obj;
      });
  }

  function tfidfBuild(docs) {
    const N = docs.length;
    const df = new Map();
    const docTF = [];

    docs.forEach((d) => {
      const tokens = tokenize(d.text);
      const tf = new Map();
      tokens.forEach((t) => tf.set(t, (tf.get(t) || 0) + 1));
      docTF.push(tf);

      const seen = new Set(tokens);
      seen.forEach((t) => df.set(t, (df.get(t) || 0) + 1));
    });

    const idf = new Map();
    df.forEach((val, term) => {
      idf.set(term, Math.log((N + 1) / (val + 1)) + 1);
    });

    const vectors = docs.map((d, idx) => {
      const tf = docTF[idx];
      let norm = 0;
      const vec = new Map();
      tf.forEach((count, term) => {
        const w = (1 + Math.log(count)) * (idf.get(term) || 0);
        vec.set(term, w);
        norm += w * w;
      });
      return { vec, norm: Math.sqrt(norm) || 1, doc: d };
    });

    return { vectors, idf };
  }

  function buildQueryVec(query, idf) {
    const tokens = tokenize(query);
    const tf = new Map();
    tokens.forEach((t) => tf.set(t, (tf.get(t) || 0) + 1));

    let norm = 0;
    const vec = new Map();
    tf.forEach((count, term) => {
      const w = (1 + Math.log(count)) * (idf.get(term) || 0);
      vec.set(term, w);
      norm += w * w;
    });
    return { vec, norm: Math.sqrt(norm) || 1 };
  }

  function cosine(qVec, qNorm, dVec, dNorm) {
    let dot = 0;
    qVec.forEach((wq, term) => {
      const wd = dVec.get(term);
      if (wd) dot += wq * wd;
    });
    return dot / ((qNorm || 1) * (dNorm || 1));
  }

  function buildAnswer(query, hits) {
    if (!hits.length) {
      return {
        answer: `I didn’t find a strong match in the CSV.\n
Try:\n• “hours”, “address”, “parking”, “booking”, “menu”, “pricing”\n• or add more detail in data/faq_kb.csv and data/business.csv.`,
        sources: [],
      };
    }

    const lines = hits.map((h, i) => {
      const m = h.doc.meta;
      if (m.type === "faq") return `${i + 1}) FAQ: ${m.topic} — ${m.content}`;
      if (m.type === "business") {
        const img = m.image_url ? `\n   Image: ${m.image_url}` : "";
        return `${i + 1}) ${m.name} (${m.category}) — ${m.summary}${img}`;
      }
      return `${i + 1}) ${h.doc.text}`;
    });

    return {
      answer: `Here’s what I found:\n\n${lines.join("\n\n")}\n\nIf you want, tell me what you’re trying to do next (call, directions, booking, pricing).`,
      sources: hits.map((h) => h.sourceLabel),
    };
  }

  async function init({ businessCsvPath, faqCsvPath }) {
    const [bizRaw, faqRaw] = await Promise.all([
      fetch(businessCsvPath).then((r) => r.text()),
      fetch(faqCsvPath).then((r) => r.text()),
    ]);

    const biz = parseCSV(bizRaw);
    const faq = parseCSV(faqRaw);

    const docs = [];

    biz.forEach((b) => {
      const text = [
        b.name,
        b.category,
        b.summary,
        b.offerings,
        b.keywords,
        b.address,
        b.city,
        b.state,
        b.zip,
        b.hours,
      ]
        .filter(Boolean)
        .join(" ");

      docs.push({
        id: `biz_${b.id || b.name}`,
        text,
        meta: { type: "business", ...b },
      });
    });

    faq.forEach((f) => {
      const text = [f.topic, f.content, f.tags].filter(Boolean).join(" ");
      docs.push({
        id: `faq_${f.id || f.topic}`,
        text,
        meta: { type: "faq", ...f },
      });
    });

    const index = tfidfBuild(docs);
    return { index, docs };
  }

  function query(state, userQuery, { k = 3 } = {}) {
    const { index } = state;
    const { vec: qVec, norm: qNorm } = buildQueryVec(userQuery, index.idf);

    const scored = index.vectors
      .map((v) => {
        const score = cosine(qVec, qNorm, v.vec, v.norm);
        const m = v.doc.meta;
        const label =
          m.type === "faq"
            ? `FAQ: ${m.topic || "entry"}`
            : m.type === "business"
              ? `Biz: ${m.name || "entry"}`
              : `Doc: ${v.doc.id}`;
        return { score, doc: v.doc, sourceLabel: label };
      })
      .sort((a, b) => b.score - a.score);

    const hits = scored.filter((x) => x.score > 0.08).slice(0, k);
    return buildAnswer(userQuery, hits);
  }

  return { init, query, parseCSV };
})();
