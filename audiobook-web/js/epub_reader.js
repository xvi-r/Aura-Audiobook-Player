// EPUB Reader & Synchronized Audiobook Reading Controller
import { player } from "./player.js";
import { openEditModal } from "./details.js";
import { getApiBase } from "./config.js";

// Helper to upload EPUB file to backend endpoint @PostMapping(value = "/api/uploadEpub/{id}", consumes = "multipart/form-data")
export async function uploadEpubFile(bookId, file) {
  const apiBase = getApiBase();
  const formData = new FormData();
  formData.append("file", file);
  formData.append("epub", file);

  const url = `${apiBase}/api/uploadEpub/${bookId}`;
  console.info(`[Aura EPUB] Uploading EPUB to ${url}...`);

  const response = await fetch(url, {
    method: "POST",
    credentials: "include",
    body: formData
  });

  if (!response.ok) {
    throw new Error(`Upload failed with status ${response.status}`);
  }

  localStorage.setItem(`aura_has_epub_${bookId}`, "true");
  try {
    const arrayBuf = await file.arrayBuffer();
    window[`aura_epub_buf_${bookId}`] = arrayBuf;
  } catch (e) {}

  return true;
}

// Helper to fetch EPUB binary arrayBuffer from backend endpoint
export async function fetchEpubBuffer(bookOrId) {
  const rawId = typeof bookOrId === "object" ? bookOrId.id : bookOrId;
  const audioBookId = typeof bookOrId === "object" ? bookOrId.audioBookId : null;

  if (window[`aura_epub_buf_${rawId}`]) return window[`aura_epub_buf_${rawId}`];
  if (audioBookId && window[`aura_epub_buf_${audioBookId}`]) return window[`aura_epub_buf_${audioBookId}`];

  const apiBase = getApiBase();

  let targetEbookId = rawId;
  try {
    const listRes = await fetch(`${apiBase}/api/Ebooks`, { credentials: "include" });
    if (listRes.ok) {
      const listData = await listRes.json();
      if (Array.isArray(listData)) {
        const matchedEbook = listData.find(eb => String(eb.audioBookId) === String(rawId) || String(eb.id) === String(rawId));
        if (matchedEbook) {
          targetEbookId = matchedEbook.id;
        }
      }
    }
  } catch (e) {}

  const endpoints = [
    `${apiBase}/api/Ebooks/${targetEbookId}`,
    `${apiBase}/api/epub/${targetEbookId}`,
    `${apiBase}/api/Ebooks/${rawId}`,
    `${apiBase}/api/epub/${rawId}`,
    ...(audioBookId ? [`${apiBase}/api/Ebooks/${audioBookId}`, `${apiBase}/api/epub/${audioBookId}`] : [])
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, { credentials: "include" });
      if (res.ok) {
        const contentType = (res.headers.get("content-type") || "").toLowerCase();
        if (!contentType.includes("json") && !contentType.includes("html")) {
          const buf = await res.arrayBuffer();
          if (buf && buf.byteLength > 100) {
            window[`aura_epub_buf_${rawId}`] = buf;
            if (targetEbookId) window[`aura_epub_buf_${targetEbookId}`] = buf;
            if (audioBookId) window[`aura_epub_buf_${audioBookId}`] = buf;
            return buf;
          }
        }
      }
    } catch (e) {}
  }

  return null;
}

// Helper to check backend API if EPUB exists for bookId (GET /api/epub/{id})
export async function checkEpubExists(bookId) {
  const apiBase = getApiBase();
  const checkUrl = `${apiBase}/api/epub/${bookId}`;

  try {
    const response = await fetch(checkUrl, { method: "GET", credentials: "include" });
    if (response.ok) {
      const contentType = (response.headers.get("content-type") || "").toLowerCase();
      // Ensure it returned binary or non-JSON/non-HTML text
      if (!contentType.includes("application/json") && !contentType.includes("text/html")) {
        console.info(`[Aura EPUB] Server DB check: EPUB exists at ${checkUrl}`);
        localStorage.setItem(`aura_has_epub_${bookId}`, "true");
        return true;
      }
    }
  } catch (e) {
    console.warn(`[Aura EPUB] Backend GET check for /api/epub/${bookId} failed:`, e);
  }

  // Memory buffer fallback in active session
  if (window[`aura_epub_buf_${bookId}`]) {
    return true;
  }

  localStorage.removeItem(`aura_has_epub_${bookId}`);
  return false;
}

// Helper to parse SMIL clock values (e.g. 0:04:12.350, 04:12.350, 252.35s, 252350ms, npt=0:04:12.350) into seconds
function parseSmilClock(val) {
  if (!val) return 0;
  val = String(val).trim();
  if (val.toLowerCase().startsWith("npt=")) val = val.slice(4).trim();
  if (val.endsWith("ms")) return parseFloat(val.slice(0, -2)) / 1000;
  if (val.endsWith("s")) val = val.slice(0, -1);

  const parts = val.split(":");
  if (parts.length === 3) {
    return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
  }
  if (parts.length === 2) {
    return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
  }
  return parseFloat(val) || 0;
}

// JSZip EPUB Ripped Text Extractor Helper
export async function extractEpubChapters(arrayBuffer) {
  if (!window.JSZip) throw new Error("JSZip library not available");

  const zip = await window.JSZip.loadAsync(arrayBuffer);

  // 1. Locate container.xml to find OPF path
  const containerFile = zip.file("META-INF/container.xml");
  if (!containerFile) throw new Error("Invalid EPUB file: META-INF/container.xml missing");
  const containerXmlStr = await containerFile.async("string");

  const parser = new DOMParser();
  const containerDoc = parser.parseFromString(containerXmlStr, "text/xml");
  const rootfileEl = containerDoc.querySelector("rootfile");
  const opfPath = rootfileEl ? rootfileEl.getAttribute("full-path") : "content.opf";

  const opfFile = zip.file(opfPath);
  if (!opfFile) throw new Error(`Invalid EPUB: OPF manifest at ${opfPath} missing`);

  const opfXmlStr = await opfFile.async("string");
  const opfDoc = parser.parseFromString(opfXmlStr, "text/xml");

  const opfDir = opfPath.includes("/") ? opfPath.substring(0, opfPath.lastIndexOf("/")) + "/" : "";

  // 2. Parse Manifest Items (id -> href, media-overlay)
  const manifestItems = {};
  const manifestOverlays = {};
  opfDoc.querySelectorAll("manifest > item").forEach(item => {
    const id = item.getAttribute("id");
    const href = item.getAttribute("href");
    const overlay = item.getAttribute("media-overlay");
    if (id && href) manifestItems[id] = href;
    if (id && overlay) manifestOverlays[id] = overlay;
  });

  const spineIds = [];
  opfDoc.querySelectorAll("spine > itemref").forEach(itemref => {
    spineIds.push(itemref.getAttribute("idref"));
  });

  // Try parsing NCX / TOC map if present in manifest
  const tocMap = {};
  let ncxHref = manifestItems["ncx"] || manifestItems["toc"];
  if (!ncxHref) {
    opfDoc.querySelectorAll("manifest > item").forEach(item => {
      const mediaType = item.getAttribute("media-type");
      if (mediaType === "application/x-dtbncx+xml") {
        ncxHref = item.getAttribute("href");
      }
    });
  }

  if (ncxHref) {
    const fullNcxPath = opfDir + ncxHref;
    const ncxFile = zip.file(fullNcxPath);
    if (ncxFile) {
      try {
        const ncxXmlStr = await ncxFile.async("string");
        const ncxDoc = parser.parseFromString(ncxXmlStr, "text/xml");
        ncxDoc.querySelectorAll("navPoint").forEach(np => {
          const textEl = np.querySelector("navLabel > text");
          const contentEl = np.querySelector("content");
          if (textEl && contentEl) {
            const src = contentEl.getAttribute("src");
            const cleanSrc = src ? src.split("#")[0] : "";
            if (cleanSrc && textEl.textContent.trim()) {
              tocMap[cleanSrc] = textEl.textContent.trim();
            }
          }
        });
      } catch (e) {
        console.warn("[Aura EPUB] Could not parse NCX file:", e);
      }
    }
  }

  // Extract each spine item as a chapter
  const chapters = [];
  for (let s = 0; s < spineIds.length; s++) {
    const idref = spineIds[s];
    const href = manifestItems[idref] || idref || '';
    const fullPath = opfDir + href;
    const spineFile = zip.file(fullPath);
    if (!spineFile) continue;

    try {
      const htmlStr = await spineFile.async("string");
      const doc = parser.parseFromString(htmlStr, "text/html");

      // Derive title
      let title = tocMap[href] || (doc.querySelector('title') ? (doc.querySelector('title').textContent || '').trim() : '');

      // Parse EPUB 3 SMIL Media Overlay if linked in OPF or matching chapter filename
      const overlayId = manifestOverlays[idref];
      const smilOverlay = [];

      const findZipFile = (targetPath) => {
        if (!targetPath) return null;
        let clean = targetPath.replace(/^\/+/, "");
        let f = zip.file(clean);
        if (f) return f;
        try {
          clean = decodeURIComponent(clean);
          f = zip.file(clean);
          if (f) return f;
        } catch (e) {}
        const lower = clean.toLowerCase();
        const matchedKey = Object.keys(zip.files).find(k => k.toLowerCase() === lower || k.toLowerCase().endsWith("/" + lower));
        return matchedKey ? zip.file(matchedKey) : null;
      };

      let smilHref = overlayId ? manifestItems[overlayId] : null;
      if (!smilHref) {
        const hrefBase = href.split("/").pop().split(".")[0];
        Object.keys(manifestItems).forEach(itemKey => {
          const itemHref = manifestItems[itemKey];
          if (itemHref && itemHref.endsWith(".smil") && itemHref.toLowerCase().includes(hrefBase.toLowerCase())) {
            smilHref = itemHref;
          }
        });
      }

      if (smilHref) {
        const fullSmilPath = opfDir + smilHref;
        const smilFile = findZipFile(fullSmilPath) || findZipFile(smilHref);
        if (smilFile) {
          try {
            const smilXmlStr = await smilFile.async("string");
            const smilDoc = parser.parseFromString(smilXmlStr, "text/xml");
            
            // Collect all <par> elements across XML namespaces
            const parNodes = Array.from(smilDoc.getElementsByTagNameNS("*", "par"))
              .concat(Array.from(smilDoc.getElementsByTagName("par")))
              .filter((el, idx, arr) => arr.indexOf(el) === idx);

            const getSmilAttr = (el, ...names) => {
              if (!el) return null;
              for (const n of names) {
                const val = el.getAttribute(n);
                if (val !== null && val !== undefined) return val;
              }
              if (el.attributes) {
                for (let i = 0; i < el.attributes.length; i++) {
                  const attrName = (el.attributes[i].name || "").toLowerCase();
                  for (const n of names) {
                    if (attrName === n.toLowerCase() || attrName.endsWith(":" + n.toLowerCase())) {
                      return el.attributes[i].value;
                    }
                  }
                }
              }
              return null;
            };

            parNodes.forEach(par => {
              const allChildren = Array.from(par.getElementsByTagNameNS("*", "*")).concat(Array.from(par.children));
              const textNode = allChildren.find(c => (c.localName || "").toLowerCase() === "text" || (c.tagName || "").toLowerCase().endsWith(":text") || (c.tagName || "").toLowerCase() === "text");
              const audioNode = allChildren.find(c => (c.localName || "").toLowerCase() === "audio" || (c.tagName || "").toLowerCase().endsWith(":audio") || (c.tagName || "").toLowerCase() === "audio");

              if (textNode && audioNode) {
                const textSrc = getSmilAttr(textNode, "src", "href") || "";
                const elementId = textSrc.includes("#") ? textSrc.split("#")[1].trim() : "";
                const clipBeginStr = getSmilAttr(audioNode, "clipBegin", "clip-begin", "epub:clipBegin", "epub:clip-begin");
                const clipEndStr = getSmilAttr(audioNode, "clipEnd", "clip-end", "epub:clipEnd", "epub:clip-end");
                const clipBegin = parseSmilClock(clipBeginStr);
                const clipEnd = parseSmilClock(clipEndStr);
                if (elementId) {
                  smilOverlay.push({
                    id: elementId,
                    start: clipBegin,
                    end: clipEnd
                  });
                }
              }
            });
            if (smilOverlay.length > 0) {
              console.info(`[Aura EPUB] Successfully parsed ${smilOverlay.length} SMIL Media Overlay items for chapter "${title || idref}"`);
            }
          } catch (smilErr) {
            console.warn("[Aura EPUB] Error parsing SMIL overlay file:", fullSmilPath, smilErr);
          }
        }
      }

      // Remove inline styles/classes and publisher cruft, but PRESERVE `id` attributes!
      doc.querySelectorAll("*").forEach(el => {
        el.removeAttribute("style");
        el.removeAttribute("class");
        el.removeAttribute("color");
        el.removeAttribute("bgcolor");
        el.removeAttribute("width");
        el.removeAttribute("height");
        // Preserving id attribute for Media Overlay sentence/paragraph targeting
      });

      // Remove empty headings / paragraph tags
      doc.querySelectorAll("h1, h2, h3, h4, h5, h6, a, p, div").forEach(el => {
        if (!el.textContent.trim()) el.remove();
      });

      // Remove duplicate leading chapter heading/number tags
      if (doc.body) {
        const firstHeading = doc.body.querySelector("h1, h2, h3, h4, h5, h6, p");
        if (firstHeading) {
          const txt = (firstHeading.textContent || '').trim();
          if (/^(\d+|chapter\s*\d+[:\s\-\.]*[\w\s]*)$/i.test(txt) && txt.length < 35) {
            firstHeading.remove();
          }
        }
      }

      // Unwrap nested span tags ONLY if parent has no id
      doc.querySelectorAll("span").forEach(span => {
        if (!span.getAttribute("id") && span.children.length === 1 && span.children[0].tagName && span.children[0].tagName.toLowerCase() === "span") {
          span.replaceWith(span.children[0]);
        }
      });

      // Trim trailing whitespace out of sentence spans with id attributes so highlights end right at the period!
      doc.querySelectorAll("span[id]").forEach(span => {
        const lastChild = span.lastChild;
        if (lastChild && lastChild.nodeType === 3 && /\s+$/.test(lastChild.nodeValue)) {
          const match = lastChild.nodeValue.match(/^(.*?)(\s+)$/s);
          if (match) {
            lastChild.nodeValue = match[1];
            const spaceNode = doc.createTextNode(match[2]);
            if (span.nextSibling) {
              span.parentNode.insertBefore(spaceNode, span.nextSibling);
            } else {
              span.parentNode.appendChild(spaceNode);
            }
          }
        }
      });

      // Standard E-Reader Page Sizing (1,800 characters = 1 printed book page)
      const rawText = (doc.body ? doc.body.textContent : doc.documentElement.textContent || '').trim();
      const pTags = Array.from(doc.querySelectorAll("p")).filter(el => el.textContent.trim().length > 0);
      const calcPages = Math.max(1, Math.ceil(rawText.length / 1800));

      const bodyHtml = doc.body ? doc.body.innerHTML : doc.documentElement.innerHTML;
      if (bodyHtml && bodyHtml.trim()) {
        chapters.push({
          title: title || `Chapter ${chapters.length + 1}`,
          contentHtml: bodyHtml,
          paragraphs: pTags.map(el => el.textContent.trim()),
          pageCount: calcPages,
          smilOverlay: smilOverlay
        });
      }
    } catch (e) {
      console.warn('[Aura EPUB] error extracting spine item', fullPath, e);
    }
  }

  // Deduplicate / Clean title fallback if all extracted titles are identical
  const firstTitle = chapters[0] ? chapters[0].title : "";
  const allIdentical = chapters.length > 1 && chapters.every(ch => ch.title === firstTitle);
  if (allIdentical) {
    chapters.forEach((ch, idx) => {
      ch.title = `Chapter ${idx + 1}`;
    });
  }

  return chapters;
}

export function openEpubReader(book, initialChapterIdx = 0, isPureReading = false) {
  // Remove any existing reader overlay first
  closeEpubReader();

  const activeBook = book || player.currentBook;
  if (!activeBook) return;

  // Auto-sync player's currentBook with activeBook so playbar duration, audio engine, and controls are active immediately!
  if (!player.currentBook || (String(player.currentBook.id) !== String(activeBook.id) && player.currentBook.title !== activeBook.title)) {
    player.loadBook(activeBook, initialChapterIdx, 0, false);
  }

  const bookMetaText = `${activeBook.title || ""} ${activeBook.author || ""} ${activeBook.series || ""} ${(activeBook.tags || []).join(" ")} ${(activeBook.genres || []).join(" ")}`.toLowerCase();
  const isStarWarsBook = bookMetaText.includes("star wars") || bookMetaText.includes("starwars") || bookMetaText.includes("jedi") || bookMetaText.includes("sith") || bookMetaText.includes("plagueis") || bookMetaText.includes("luceno") || bookMetaText.includes("skywalker");

  const savedEpubTheme = localStorage.getItem("aura_epub_theme");
  const currentTheme = savedEpubTheme || (isStarWarsBook ? "epub-theme-starwars" : (localStorage.getItem('aura_base_theme') ? 'epub-theme-aura' : 'epub-theme-dark'));
  const siteBaseTheme = localStorage.getItem("aura_base_theme") || null;
  let fontSizePercent = parseInt(localStorage.getItem("aura_epub_fontsize") || "105", 10);
  let epub3Enabled = localStorage.getItem("aura_epub3_enabled") === "true";
  let chapterOffset = parseInt(localStorage.getItem("aura_epub_offset") || "0", 10);
  let autoScrollEnabled = localStorage.getItem("aura_epub_autoscroll") !== "false";
  let paragraphHighlightEnabled = localStorage.getItem("aura_epub_highlight") !== "false";
  let wordHighlightEnabled = localStorage.getItem("aura_epub_word_highlight") === "true";
  let tapToSyncEnabled = localStorage.getItem("aura_epub_taptosync") !== "false";
  let fluidMarginEnabled = localStorage.getItem("aura_epub_fluidmargin") === "true";
  let focusModeEnabled = localStorage.getItem("aura_epub_focusmode") === "true";
  let layoutMode = "single";
  let currentPageSpread = 0;
  let narrationPaceRatio = parseFloat(localStorage.getItem("aura_epub_paceratio") || "1.0");
  let timelineScope = localStorage.getItem("aura_epub_scope") || "chapter"; // "chapter" or "book"
  let paragraphSpacing = parseInt(localStorage.getItem("aura_epub_paragraph_spacing") || "14", 10);

  let alignmentData = null;
  try {
    const rawAlign = localStorage.getItem("aura_epub_alignmap_" + activeBook.id);
    if (rawAlign) alignmentData = JSON.parse(rawAlign);
  } catch (e) { console.error("Error loading alignment map:", e); }

  // Parse and cache alignment data once at reader open (call deferred until state vars initialized)
  // parseAndCacheAlignmentData(alignmentData); -> called after state declarations to avoid TDZ

  // =========================================================================
  // 🎯 TOP-LEVEL ALIGNMENT ENGINE & STATE DECLARATIONS (ACCESSIBLE EVERYWHERE)
  // =========================================================================
  let activeAlignmentList = [];
  let activeAlignmentIndex = -1;
  let activeParagraphElement = null;
  let cachedParagraphElements = [];
  let chapterParagraphCounts = [];
  let chapterGlobalOffsets = [];
  let globalParagraphs = []; // array of {chapter, localIdx, text}
  let isTimelineSeeking = false;
  let lastPlayIconState = null;
  let manualPlaybackState = Boolean(player.isPlaying || (player.audio && !player.audio.paused));
  // Smooth scroll animator state (declare early to avoid TDZ when renderChapterView runs)
  let animFrameId = null;
  let targetScrollPos = 0;
  let paragraphClickTimer = null;

  // Now that alignment state vars are declared, parse & cache the alignment data
  try {
    parseAndCacheAlignmentData(alignmentData);
  } catch (e) {
    console.error("Error parsing alignment data during reader init:", e);
  }

  // Helper: determine whether a <p> element is a meaningful book paragraph
  function isMeaningfulParagraphNode(p) {
    try {
      if (!p) return false;
      const text = (p.textContent || '').trim();
      if (!text) return false;
      if (p.closest && (p.closest('nav, footer, header, aside') || p.closest('[role="navigation"]'))) return false;
      const cls = (p.className || '').toString();
      const id = (p.id || '').toString();
      const combined = (cls + ' ' + id).toLowerCase();
      if (/\b(nav|toc|breadcrumb|menu|pagination|footer|header|skip|advert|promo|sidebar)\b/.test(combined)) return false;
      return true;
    } catch (e) { return false; }
  }

  function parseAndCacheAlignmentData(data) {
    if (!data) {
      activeAlignmentList = [];
      activeAlignmentIndex = -1;
      return;
    }

    let rawList = [];
    if (Array.isArray(data)) {
      rawList = data;
    } else if (data && Array.isArray(data.alignments)) {
      rawList = data.alignments;
    } else if (data && Array.isArray(data.paragraphs)) {
      rawList = data.paragraphs;
    } else if (data && Array.isArray(data.data)) {
      rawList = data.data;
    } else if (data && Array.isArray(data.chapters)) {
      rawList = [];
      data.chapters.forEach(ch => {
        if (ch.paragraphs) rawList.push(...ch.paragraphs);
      });
    }

    activeAlignmentList = rawList
      .filter(item => item && (
        typeof item.start === "number" ||
        typeof item.timestamp === "number" ||
        typeof item.start_time === "number"
      ))
      .map(item => ({
        paragraph: typeof item.paragraph === "number"
          ? item.paragraph
          : (typeof item.paragraph_index === "number" ? item.paragraph_index : (typeof item.id === "number" ? item.id : 0)),
        start: typeof item.start === "number"
          ? item.start
          : (typeof item.timestamp === "number" ? item.timestamp : (typeof item.start_time === "number" ? item.start_time : 0))
      }))
    activeAlignmentIndex = -1;

    const cleanBox = document.getElementById("epub-clean-content");
    if (cleanBox) {
      if (activeAlignmentList && activeAlignmentList.length > 0) {
        cleanBox.classList.add("has-alignment-map");
      } else {
        cleanBox.classList.remove("has-alignment-map");
      }
    }
  }

  function updateChapterParagraphOffsets() {
    chapterParagraphCounts = [];
    chapterGlobalOffsets = [];
    let accum = 0;

    if (activeChaptersList) {
      activeChaptersList.forEach((ch) => {
        chapterGlobalOffsets.push(accum);
        let count = 0;
        if (ch.contentHtml) {
          const temp = document.createElement("div");
          temp.innerHTML = ch.contentHtml;
          const ps = Array.from(temp.querySelectorAll('p'));
          count = ps.filter(p => {
            try {
              // reuse DOM-based heuristic by creating a transient node context
              return (p.textContent || '').trim().length > 0 && !p.closest('nav, footer, header, aside');
            } catch (e) { return false; }
          }).length;
        }
        if (count < 1) count = 1; // ensure at least 1 paragraph per chapter
        chapterParagraphCounts.push(count);
        accum += count;
      });
    }
  }

  // Build a full global paragraph index across all chapters using only meaningful <p> elements.
  function buildGlobalParagraphIndex() {
    globalParagraphs = [];
    chapterParagraphCounts = [];
    chapterGlobalOffsets = [];
    let accum = 0;

    if (!activeChaptersList) return;
    activeChaptersList.forEach((ch, cIdx) => {
      chapterGlobalOffsets.push(accum);
      let localCount = 0;
      if (ch && ch.contentHtml) {
        try {
          const temp = new DOMParser().parseFromString(ch.contentHtml, 'text/html');
          const ps = Array.from(temp.querySelectorAll('p'));
          for (let i = 0; i < ps.length; i++) {
            const p = ps[i];
            const text = (p.textContent || '').trim();
            if (!text) continue;
            // Exclude nav/footer/header-like ancestors
            let ancestor = p.parentElement;
            let skip = false;
            while (ancestor) {
              const name = (ancestor.tagName || '').toLowerCase();
              if (['nav','footer','header','aside'].includes(name)) { skip = true; break; }
              ancestor = ancestor.parentElement;
            }
            if (skip) continue;
            // Heuristic class/id filter
            const cls = (p.className || '').toString().toLowerCase();
            const id = (p.id || '').toString().toLowerCase();
            if (/\b(nav|toc|breadcrumb|menu|pagination|footer|header|skip|advert|promo|sidebar)\b/.test(cls + ' ' + id)) continue;

            globalParagraphs.push({ chapter: cIdx, localIdx: localCount, text });
            localCount += 1;
            accum += 1;
          }
        } catch (e) {
          console.warn('[EPUB] buildGlobalParagraphIndex failed for chapter', cIdx, e);
        }
      }
      if (localCount < 1) localCount = 1;
      chapterParagraphCounts.push(localCount);
    });
  }

  function getChapterForGlobalParagraph(globalIdx) {
    if (chapterGlobalOffsets.length === 0) return activeChapterIndex;
    for (let cIdx = 0; cIdx < chapterGlobalOffsets.length; cIdx++) {
      const offset = chapterGlobalOffsets[cIdx];
      const count = chapterParagraphCounts[cIdx] || 1;
      if (globalIdx >= offset && globalIdx < offset + count) {
        return cIdx;
      }
    }
    return activeChapterIndex;
  }

  function updateParagraphSync(forceUpdate = false) {
    const cleanBox = document.getElementById("epub-clean-content");
    if (!cleanBox) return;

    if (!epub3Enabled) {
      cleanBox.querySelectorAll("p.active-narration-p, .epub-w.word-active").forEach(el => {
        el.classList.remove("active-narration-p", "word-active");
      });
      return;
    }

    if (!cachedParagraphElements || cachedParagraphElements.length === 0) {
      let elems = Array.from(cleanBox.querySelectorAll("p"));
      // Filter to only meaningful paragraphs using the same heuristics as offsets
      elems = elems.filter(el => isMeaningfulParagraphNode(el));
      if (elems.length === 0) {
        elems = Array.from(cleanBox.querySelectorAll("div, section, article, h1, h2, h3, h4")).filter(el => (el.textContent || '').trim().length > 0);
      }
      cachedParagraphElements = elems;
    }

    if (cachedParagraphElements.length === 0) return;

    const curTime = (player.audio && !isNaN(player.audio.currentTime)) ? player.audio.currentTime : simulatedAudioTime || 0;
    let targetEl = null;

    const curCh = activeChaptersList ? activeChaptersList[activeChapterIndex] : null;
    let effectiveAlignment = null;
    if (curCh && curCh.smilOverlay && Array.isArray(curCh.smilOverlay) && curCh.smilOverlay.length > 0) {
      effectiveAlignment = curCh.smilOverlay;
    } else if (activeAlignmentList && activeAlignmentList.length > 0) {
      effectiveAlignment = activeAlignmentList;
    }

    // Calculate audio time relative to current chapter start
    const audioIdx = player.currentChapterIndex || 0;
    const playerBookCh = (activeBook && activeBook.chapters) ? activeBook.chapters[audioIdx] : null;
    const chStart = (playerBookCh && player.getChapterStartTime) ? player.getChapterStartTime(playerBookCh) : 0;
    const relTime = Math.max(0, curTime - (chStart || 0));

    // PATH A: Use 100% Exact Alignment JSON Map or Built-in SMIL Overlay
    if (effectiveAlignment && effectiveAlignment.length > 0) {
      let matchedIdx = -1;

      // 1. Precise range matching against both relTime and curTime
      for (let i = 0; i < effectiveAlignment.length; i++) {
        const item = effectiveAlignment[i];
        const nextItem = effectiveAlignment[i + 1];
        const itemEnd = item.end !== undefined && item.end > item.start ? item.end : (nextItem ? nextItem.start : item.start + 15);

        if ((relTime >= item.start && relTime < itemEnd) || (curTime >= item.start && curTime < itemEnd)) {
          matchedIdx = i;
          break;
        }
      }

      // 2. Fallback: match closest start timestamp ONLY if within 30s threshold
      if (matchedIdx === -1) {
        let bestIdx = -1;
        let minDiff = Infinity;
        effectiveAlignment.forEach((item, i) => {
          const diffRel = Math.abs(item.start - relTime);
          const diffAbs = Math.abs(item.start - curTime);
          const diff = Math.min(diffRel, diffAbs);
          if (diff < minDiff && diff < 30) {
            minDiff = diff;
            bestIdx = i;
          }
        });
        matchedIdx = bestIdx;
      }

      if (matchedIdx === -1) {
        if (activeAlignmentIndex !== -1) {
          activeAlignmentIndex = -1;
          cleanBox.querySelectorAll(".active-narration-p").forEach(el => el.classList.remove("active-narration-p"));
          activeParagraphElement = null;
        }
        return;
      }

      if (!forceUpdate && matchedIdx === activeAlignmentIndex && activeParagraphElement) {
        return;
      }

      activeAlignmentIndex = matchedIdx;
      const matchedEntry = effectiveAlignment[matchedIdx];
      if (matchedEntry) {
        if (matchedEntry.id) {
          try {
            const escId = CSS.escape(matchedEntry.id);
            targetEl = cleanBox.querySelector(`#${escId}`) || document.getElementById(matchedEntry.id);
          } catch (e) {
            targetEl = document.getElementById(matchedEntry.id);
          }
        }
        if (!targetEl) {
          const pVal = matchedEntry.paragraph;
          if (typeof pVal === "number") {
            // If alignment uses global paragraph indexes, map to chapter-local index
            let localIdx = pVal;
            if (effectiveAlignment && effectiveAlignment.length > 0 && chapterGlobalOffsets && chapterGlobalOffsets.length > 0) {
              const targetChapter = getChapterForGlobalParagraph(pVal);
              // Debug: report alignment mapping from global paragraph -> chapter
              try {
                const snippet = (cachedParagraphElements && cachedParagraphElements[pVal - (chapterGlobalOffsets[targetChapter]||0)])
                  ? (cachedParagraphElements[pVal - (chapterGlobalOffsets[targetChapter]||0)].textContent || '').trim().slice(0,120).replace(/\s+/g,' ')
                  : null;
                console.debug('[EPUB] alignment maps globalParagraph', pVal, '-> targetChapter', targetChapter, 'matchedIdx', matchedIdx, 'curTime', curTime, 'snippet:', snippet);
              } catch (e) { /* ignore */ }
              // If alignment points to a paragraph in a different chapter, render that chapter once
              if (typeof targetChapter === 'number' && targetChapter !== activeChapterIndex) {
                // If the user is actively seeking on the timeline, do not auto-switch chapters
                if (typeof isTimelineSeeking !== 'undefined' && isTimelineSeeking) {
                  console.debug('[EPUB] skipping alignment-driven chapter switch during user timeline seek to', targetChapter);
                } else {
                  // If we recently rendered the chapter programmatically, suppress immediate jumps
                  const now = Date.now();
                  if (suppressChapterAutoSwitch || (now - (justRenderedAt || 0) < RENDER_SUPPRESS_MS)) {
                    console.debug('[EPUB] suppressed alignment-driven chapter switch to', targetChapter, 'suppressFlag', suppressChapterAutoSwitch, 'sinceLastRenderMs', now - (justRenderedAt || 0));
                  } else {
                    // Require ALIGN_SWITCH_STREAK consecutive confirmations before auto-switching
                    if (alignmentSwitchCandidate === targetChapter) {
                      alignmentCandidateStreak += 1;
                    } else {
                      alignmentSwitchCandidate = targetChapter;
                      alignmentCandidateStreak = 1;
                      alignmentCandidateSince = Date.now();
                    }

                    if (alignmentCandidateStreak >= ALIGN_SWITCH_STREAK || (Date.now() - alignmentCandidateSince) > ALIGN_SWITCH_WINDOW_MS) {
                      // perform the chapter switch
                      const confirmedStreak = alignmentCandidateStreak;
                      alignmentSwitchCandidate = null;
                      alignmentCandidateStreak = 0;
                      alignmentCandidateSince = 0;
                      console.info('[EPUB] alignment confirmed chapter switch ->', targetChapter, 'matchedEntryStart=', matchedEntry.start, 'globalParagraph=', pVal, 'streak=', confirmedStreak);
                      renderChapterView(targetChapter);
                      // After chapter render, record timestamp and re-run sync once to pick up the correct paragraph
                      justRenderedAt = Date.now();
                      setTimeout(() => updateParagraphSync(true), 40);
                      return;
                    } else {
                      console.debug('[EPUB] alignment candidate (streak', alignmentCandidateStreak, 'for)', targetChapter);
                    }
                  }
                }
              }
              localIdx = pVal - (chapterGlobalOffsets[activeChapterIndex] || 0);
            }
            if (localIdx >= 0 && cachedParagraphElements && localIdx < cachedParagraphElements.length) {
              targetEl = cachedParagraphElements[localIdx];
            } else if (cachedParagraphElements && cachedParagraphElements.length > 0) {
              const safeIdx = Math.min(Math.max(0, localIdx), cachedParagraphElements.length - 1);
              targetEl = cachedParagraphElements[safeIdx];
            }
          }
        }
      }
    } 
    // PATH B: Fallback to estimated chapter progress alignment if no JSON map loaded
    else {
      const audioIdx = player.currentChapterIndex || 0;
      const curCh = (activeBook.chapters && activeBook.chapters[audioIdx]) ? activeBook.chapters[audioIdx] : null;
      const chStart = curCh ? player.getChapterStartTime(curCh) : 0;
      const chDur = curCh ? player.getChapterDuration(curCh, audioIdx) : (player.audio?.duration || 1);
      const progress = Math.max(0, Math.min(1, (curTime - chStart) / Math.max(1, chDur)));

      const pIdx = Math.min(cachedParagraphElements.length - 1, Math.floor(progress * cachedParagraphElements.length));

      if (!forceUpdate && pIdx === activeAlignmentIndex && activeParagraphElement) {
        return;
      }

      activeAlignmentIndex = pIdx;
      targetEl = cachedParagraphElements[pIdx] || cachedParagraphElements[0];
    }

    if (!targetEl) {
      activeAlignmentIndex = -1;
      return;
    }

    if (targetEl !== activeParagraphElement || forceUpdate) {
      cleanBox.querySelectorAll(".active-narration-p").forEach(el => el.classList.remove("active-narration-p"));

      activeParagraphElement = targetEl;

      if (activeParagraphElement) {
        // Debug: report paragraph highlight application and chapter mapping
        try {
          const localIdxInChapter = cachedParagraphElements.indexOf(activeParagraphElement);
          const globalIdx = (chapterGlobalOffsets[activeChapterIndex] || 0) + (localIdxInChapter >= 0 ? localIdxInChapter : 0);
          const snippet = (activeParagraphElement.textContent || '').trim().slice(0,140).replace(/\s+/g,' ');
          console.debug('[EPUB] highlight applied -> globalIdx', globalIdx, 'chapter', activeChapterIndex, 'localIdx', localIdxInChapter, 'snippet:', snippet);
        } catch (e) { /* ignore */ }

        if (paragraphHighlightEnabled) {
          activeParagraphElement.classList.add("active-narration-p");
        }

        if ((autoScrollEnabled || focusModeEnabled) && layoutMode !== "double" && !isUserScrolling && activeParagraphElement) {
          const boxRect = cleanBox.getBoundingClientRect();
          const pRect = activeParagraphElement.getBoundingClientRect();
          const pTopRelativeToCleanBox = (pRect.top - boxRect.top) + cleanBox.scrollTop;
          const centerOffset = focusModeEnabled ? 0.42 : 0.3;
          const targetTop = Math.max(0, pTopRelativeToCleanBox - (cleanBox.clientHeight * centerOffset));
          targetScrollPos = targetTop;
        }

        // Auto-turn 2-Page Spread during SMIL narration sync
        if (layoutMode === "double" && !isUserScrolling && activeParagraphElement && cleanBox) {
          const spreadWidth = cleanBox.clientWidth + 64;
          const targetLeft = activeParagraphElement.offsetLeft;
          const targetSpread = Math.floor(targetLeft / Math.max(1, spreadWidth));
          const totalSpreads = Math.max(1, Math.ceil(cleanBox.scrollWidth / Math.max(1, spreadWidth)));
          if (targetSpread !== currentPageSpread) {
            currentPageSpread = targetSpread;
            cleanBox.scrollTo({ left: targetSpread * spreadWidth, behavior: "smooth" });
            updateSpreadCounter(currentPageSpread + 1, totalSpreads);
            console.info("[Aura EPUB] SMIL Narration auto-turned page spread to:", targetSpread + 1);
          }
        }

        // Update Fluid Margin Progress Flow Bar position/height when enabled
        if (fluidMarginEnabled && activeParagraphElement) {
          let bar = cleanBox.querySelector('.epub-fluid-margin-bar');
          if (!bar) {
            bar = document.createElement('div');
            bar.className = 'epub-fluid-margin-bar';
            cleanBox.appendChild(bar);
          }
          try {
            const boxRect = cleanBox.getBoundingClientRect();
            const pRect = activeParagraphElement.getBoundingClientRect();
            const top = Math.max(0, (pRect.top - boxRect.top) + cleanBox.scrollTop);
            const height = Math.max(20, activeParagraphElement.offsetHeight || pRect.height || 24);
            bar.style.top = `${top}px`;
            bar.style.height = `${height}px`;
          } catch (e) {}
        }
      }
    }
  }

  function parseTimeToSecs(val) {
    if (typeof val === "number" && !isNaN(val)) return val;
    if (typeof val === "string") {
      if (val.includes(":")) {
        const parts = val.split(":").map(p => parseFloat(p));
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) return parts[0] * 60 + parts[1];
        if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) return parts[0] * 3600 + parts[1] * 60 + parts[2];
      }
      const num = parseFloat(val);
      if (!isNaN(num)) return num;
    }
    return 0;
  }

  let lastSyncTimestamp = performance.now();
  let simulatedAudioTime = 0;

  function syncDockUI() {
    const now = performance.now();
    const dt = Math.max(0, Math.min(0.2, (now - lastSyncTimestamp) / 1000));
    lastSyncTimestamp = now;

    const isPlayingNow = Boolean(manualPlaybackState || player.isPlaying || (player.audio && !player.audio.paused && !player.audio.ended));

    const dockPlayBtn = document.getElementById("epub-dock-play-btn");
    const dockTimeline = document.getElementById("epub-dock-timeline");
    const dockElapsed = document.getElementById("epub-dock-time-elapsed");
    const dockDuration = document.getElementById("epub-dock-time-duration");

    const targetState = isPlayingNow ? "pause" : "play";
    if (dockPlayBtn && lastPlayIconState !== targetState) {
      lastPlayIconState = targetState;
      dockPlayBtn.innerHTML = `<i data-lucide="${isPlayingNow ? 'pause' : 'play'}"></i>`;
      dockPlayBtn.title = isPlayingNow ? 'Pause Audio' : 'Listen Along';
      dockPlayBtn.setAttribute('aria-pressed', !!isPlayingNow);
      if (window.lucide) window.lucide.createIcons();
    }

    let absoluteAudioTime = 0;
    if (player.audio && !isNaN(player.audio.currentTime) && player.audio.currentTime > 0) {
      absoluteAudioTime = player.audio.currentTime;
      simulatedAudioTime = absoluteAudioTime;
    } else if (isPlayingNow) {
      simulatedAudioTime += dt;
      absoluteAudioTime = simulatedAudioTime;
    } else {
      absoluteAudioTime = simulatedAudioTime;
    }
    
    let totalAudioDuration = 0;
    if (player.audio && !isNaN(player.audio.duration) && player.audio.duration > 0) {
      totalAudioDuration = player.audio.duration;
    } else if (activeBook.runtimeSeconds) {
      totalAudioDuration = parseTimeToSecs(activeBook.runtimeSeconds);
    } else if (activeBook.duration) {
      totalAudioDuration = parseTimeToSecs(activeBook.duration);
    }

    if (totalAudioDuration <= 0 && activeBook.chapters && activeBook.chapters.length > 0) {
      const lastIdx = activeBook.chapters.length - 1;
      const lastCh = activeBook.chapters[lastIdx];
      const lastStart = player.getChapterStartTime ? player.getChapterStartTime(lastCh) : 0;
      const lastDur = player.getChapterDuration ? player.getChapterDuration(lastCh, lastIdx) : 0;
      if (lastStart + lastDur > 0) {
        totalAudioDuration = lastStart + lastDur;
      }
    }

    if (totalAudioDuration <= 0) totalAudioDuration = 300;

    let curSecsInScope = absoluteAudioTime;
    let maxSecsInScope = totalAudioDuration;

    const currentAudioIdx = player.getCurrentChapterIndex ? player.getCurrentChapterIndex() : (player.currentChapterIndex || 0);

    if (timelineScope === "chapter" && activeBook.chapters && activeBook.chapters.length > 0) {
      const curCh = activeBook.chapters[currentAudioIdx] || activeBook.chapters[0];
      if (curCh) {
        const chStart = player.getChapterStartTime ? player.getChapterStartTime(curCh) : 0;
        const chDur = player.getChapterDuration ? player.getChapterDuration(curCh, currentAudioIdx) : 0;
        if (chDur > 0) {
          curSecsInScope = Math.max(0, absoluteAudioTime - chStart);
          maxSecsInScope = chDur;
        } else if (totalAudioDuration > chStart) {
          curSecsInScope = Math.max(0, absoluteAudioTime - chStart);
          maxSecsInScope = totalAudioDuration - chStart;
        }
      }
    }

    if (dockElapsed) {
      dockElapsed.textContent = player.showTimeRemaining 
        ? `-${player.formatTime(Math.max(0, maxSecsInScope - curSecsInScope))}`
        : player.formatTime(curSecsInScope);
    }
    if (dockDuration) dockDuration.textContent = player.formatTime(maxSecsInScope);

    if (dockTimeline && !isTimelineSeeking) {
      dockTimeline.max = maxSecsInScope.toString();
      dockTimeline.value = curSecsInScope.toString();
      const pct = Math.max(0, Math.min(100, (curSecsInScope / Math.max(1, maxSecsInScope)) * 100));
      player.updateSliderFill(dockTimeline, pct);
    }

    updateParagraphSync(false);
  }

  const overlay = document.createElement("div");
  overlay.className = "epub-reader-overlay";
  overlay.id = "epub-reader-modal";

  const isLoadedInPlayer = player.currentBook && String(player.currentBook.id) === String(activeBook.id);
  const isPlaying = isLoadedInPlayer && player.isPlaying;
  const currentChapterIdx = (initialChapterIdx !== undefined && initialChapterIdx !== null) ? initialChapterIdx : (isLoadedInPlayer ? player.currentChapterIndex : 0);
  if (isLoadedInPlayer) {
    player.currentChapterIndex = currentChapterIdx;
  }

  let activeChaptersList = activeBook.chapters && activeBook.chapters.length > 0
    ? activeBook.chapters.map((ch, idx) => ({ title: ch.title || `Chapter ${idx + 1}`, contentHtml: null }))
    : [{ title: activeBook.title || "Full Book", contentHtml: null }];

  // Pre-calc paragraph counts and global offsets for chapter-local <-> global paragraph index mapping
  buildGlobalParagraphIndex();

  const initialTargetIdx = Math.max(0, currentChapterIdx + chapterOffset);
  const currentChapter = activeChaptersList[Math.min(activeChaptersList.length - 1, initialTargetIdx)] || activeChaptersList[0];

  overlay.innerHTML = `
    <div class="epub-reader-container ${currentTheme} ${isPureReading ? 'is-pure-reading' : ''}" id="epub-reader-theme-container">
      <!-- Edge Hover Trigger Zones -->
      <div class="epub-edge-trigger-top" id="epub-edge-top"></div>
      <div class="epub-edge-trigger-bottom" id="epub-edge-bottom"></div>

      <!-- Toolbar Header -->
      <header class="epub-reader-header">
        <div class="epub-header-left">
          <button class="epub-btn player-btn" id="epub-close-btn" title="Close Reader">
            <i data-lucide="x"></i>
            <span>Close</span>
          </button>
          <div class="epub-book-info">
            <span class="epub-book-title">${activeBook.title || "Audiobook Reader"}</span>
            <span class="epub-book-author">By ${activeBook.author || "Unknown"}</span>
          </div>
        </div>

        <div class="epub-header-controls">
          <!-- Chapter Selector Dropdown -->
          <select class="epub-select" id="epub-toc-select" title="EPUB Chapter Select">
            ${activeChaptersList.map((ch, idx) => `
              <option value="${idx}" ${idx === initialTargetIdx ? "selected" : ""}>
                ${ch.title || `Chapter ${idx + 1}`}
              </option>
            `).join("")}
          </select>

          <!-- Cinematic Focus Mode Toggle Button -->
          <button class="epub-btn player-btn ${focusModeEnabled ? 'player-btn-active' : ''}" id="epub-focus-mode-btn" title="Focus Mode (Cinematic Auto-Scroll & Dim Unread Text)">
            <i data-lucide="eye"></i>
            <span>Focus Mode</span>
          </button>

          <!-- Attach / Upload EPUB File Button -->
          <label class="epub-btn player-btn" style="cursor: pointer;" title="Attach your own .epub file for this book">
            <i data-lucide="file-up"></i>
            <span>Open .EPUB</span>
            <input type="file" id="epub-file-input" accept=".epub" style="display: none;" />
          </label>

          <!-- Reader Settings Cog Button -->
          <button class="epub-btn epub-btn-icon-only player-btn" id="epub-settings-btn" title="Reader Settings & Sync Options">
            <i data-lucide="settings"></i>
          </button>

          <!-- Reader Settings Cog Popup Menu -->
          <div class="epub-settings-popup" id="epub-settings-popup" style="display: none;">
            <div class="epub-settings-group">
              <span class="epub-settings-label">Reader Theme</span>
              <select class="epub-select" id="epub-theme-select" style="max-width: 100%;">
                <option value="epub-theme-dark" ${currentTheme === "epub-theme-dark" ? "selected" : ""}>Pure Black (OLED)</option>
                <option value="epub-theme-starwars" ${currentTheme === "epub-theme-starwars" ? "selected" : ""}>🪐 Star Wars (Kyber Blue)</option>
                <option value="epub-theme-aura" ${currentTheme === "epub-theme-aura" ? "selected" : ""}>Aura Glass (Site Theme)</option>
                <option value="epub-theme-nordic" ${currentTheme === "epub-theme-nordic" ? "selected" : ""}>Nordic Dark (Teal/Ice)</option>
                <option value="epub-theme-dracula" ${currentTheme === "epub-theme-dracula" ? "selected" : ""}>Dracula Dark (Purple/Pink)</option>
                <option value="epub-theme-emerald" ${currentTheme === "epub-theme-emerald" ? "selected" : ""}>Emerald Forest</option>
                <option value="epub-theme-midnight" ${currentTheme === "epub-theme-midnight" ? "selected" : ""}>Midnight Slate</option>
                <option value="epub-theme-sepia" ${currentTheme === "epub-theme-sepia" ? "selected" : ""}>Warm Sepia</option>
                <option value="epub-theme-light" ${currentTheme === "epub-theme-light" ? "selected" : ""}>Paper White</option>
              </select>
            </div>

            <div class="epub-settings-group">
              <span class="epub-settings-label">Paragraph Spacing</span>
              <div style="display: flex; align-items: center; gap: 10px;">
                <input type="range" class="epub-dock-timeline-slider" id="epub-paragraph-spacing-slider" min="6" max="48" step="1" value="${paragraphSpacing}" />
                <span id="epub-paragraph-spacing-label" style="font-size: 0.75rem; font-weight: 700; min-width: 36px;">${paragraphSpacing}px</span>
              </div>
            </div>

            <div class="epub-settings-group">
              <span class="epub-settings-label">Reader Font Size</span>
              <div class="epub-font-control" style="display: flex; justify-content: space-between; align-items: center;">
                <button class="epub-font-btn" id="epub-font-dec" title="Decrease Font Size">A-</button>
                <span id="epub-font-label" style="font-size: 0.85rem; font-weight: 700;">${fontSizePercent}%</span>
                <button class="epub-font-btn" id="epub-font-inc" title="Increase Font Size">A+</button>
              </div>
            </div>

            <div class="epub-settings-group">
              <span class="epub-settings-label">Playback Speed</span>
              <select class="epub-select" id="epub-speed-select" style="max-width: 100%;">
                <option value="1.0" ${player.playbackSpeed === 1.0 ? "selected" : ""}>1.0x Normal</option>
                <option value="1.25" ${player.playbackSpeed === 1.25 ? "selected" : ""}>1.25x Speed</option>
                <option value="1.5" ${player.playbackSpeed === 1.5 ? "selected" : ""}>1.5x Speed</option>
                <option value="2.0" ${player.playbackSpeed === 2.0 ? "selected" : ""}>2.0x Fast</option>
              </select>
            </div>

            <div class="epub-settings-group">
              <span class="epub-settings-label">Sleep Timer</span>
              <select class="epub-select" id="epub-sleep-select" style="max-width: 100%;">
                <option value="0" ${player.sleepSecondsLeft === 0 ? "selected" : ""}>Off</option>
                <option value="10">10 Minutes</option>
                <option value="15">15 Minutes</option>
                <option value="30">30 Minutes</option>
                <option value="45">45 Minutes</option>
                <option value="60">60 Minutes</option>
                <option value="chapter">End of Chapter</option>
              </select>
            </div>

            <div class="epub-settings-group">
              <span class="epub-settings-label">Chapter Alignment Offset</span>
              <div style="display: flex; align-items: center; gap: 8px;">
                <input type="number" class="epub-select" id="epub-offset-input" value="${chapterOffset}" step="1" style="max-width: 90px; text-align: center; font-weight: 700;" title="Manual Chapter Offset (-50 to +50)" />
                <span style="font-size: 0.78rem; opacity: 0.8;">(Audio vs EPUB Chapter Offset)</span>
              </div>
            </div>

            <div class="epub-settings-group">
              <span class="epub-settings-label">Highlight Pace Speed Adjuster</span>
              <div style="display: flex; align-items: center; gap: 10px;">
                <input type="range" class="epub-dock-timeline-slider" id="epub-pace-slider" min="0.4" max="1.8" step="0.05" value="${narrationPaceRatio}" />
                <span id="epub-pace-label" style="font-size: 0.75rem; font-weight: 700; min-width: 36px;">${narrationPaceRatio}x</span>
              </div>
            </div>

            <!-- Master EPUB 3 Features Toggle -->
            <div class="epub-settings-row" style="background: rgba(56, 189, 248, 0.08); border: 1px solid rgba(56, 189, 248, 0.25); padding: 10px 12px; border-radius: 8px; margin-top: 10px; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between;">
              <div style="display: flex; flex-direction: column; gap: 2px;">
                <span style="font-size: 0.82rem; font-weight: 700; color: #38bdf8; display: flex; align-items: center; gap: 6px;" title="Enables EPUB 3 Media Overlays, SMIL timestamp synchronization, word/paragraph highlighting, and audio-synced auto-scroll.">
                  <i data-lucide="layers" style="width: 14px; height: 14px;"></i>
                  Enable EPUB 3 Features
                  <span style="cursor: help; opacity: 0.85; font-size: 0.75rem;" title="Enables EPUB 3 Media Overlays, SMIL timestamp synchronization, word/paragraph highlighting, and audio-synced auto-scroll.">ℹ️</span>
                </span>
                <span style="font-size: 0.72rem; color: var(--text-muted);">Media Overlays, SMIL Sync & Highlighting</span>
              </div>
              <label class="epub-switch">
                <input type="checkbox" id="epub3-master-toggle" ${epub3Enabled ? "checked" : ""} />
                <span class="epub-slider"></span>
              </label>
            </div>

            <!-- EPUB 3 Dependent Options Sub-Group -->
            <div id="epub3-dependent-options" style="${epub3Enabled ? '' : 'opacity: 0.45; pointer-events: none; filter: grayscale(0.5);'} transition: all 0.3s ease;">
              <div class="epub-settings-row">
                <span style="font-size: 0.8rem; font-weight: 600;">Fluid Margin Progress Flow</span>
                <label class="epub-switch">
                  <input type="checkbox" id="epub-fluidmargin-toggle" ${fluidMarginEnabled ? "checked" : ""} ${!epub3Enabled ? "disabled" : ""} />
                  <span class="epub-slider"></span>
                </label>
              </div>

              <div class="epub-settings-row">
                <span style="font-size: 0.8rem; font-weight: 600;">Cinematic Focus Mode</span>
                <label class="epub-switch">
                  <input type="checkbox" id="epub-focusmode-toggle" ${focusModeEnabled ? "checked" : ""} ${!epub3Enabled ? "disabled" : ""} />
                  <span class="epub-slider"></span>
                </label>
              </div>

              <div class="epub-settings-row">
                <span style="font-size: 0.8rem; font-weight: 600;">Paragraph Reading Line</span>
                <label class="epub-switch">
                  <input type="checkbox" id="epub-highlight-toggle" ${paragraphHighlightEnabled ? "checked" : ""} ${!epub3Enabled ? "disabled" : ""} />
                  <span class="epub-slider"></span>
                </label>
              </div>

              <div class="epub-settings-row">
                <span style="font-size: 0.8rem; font-weight: 600;">Word Narration Highlight</span>
                <label class="epub-switch">
                  <input type="checkbox" id="epub-word-highlight-toggle" ${wordHighlightEnabled ? "checked" : ""} ${!epub3Enabled ? "disabled" : ""} />
                  <span class="epub-slider"></span>
                </label>
              </div>

              <div class="epub-settings-row">
                <span style="font-size: 0.8rem; font-weight: 600;">Auto-Scroll With Narration</span>
                <label class="epub-switch">
                  <input type="checkbox" id="epub-autoscroll-toggle" ${autoScrollEnabled ? "checked" : ""} ${!epub3Enabled ? "disabled" : ""} />
                  <span class="epub-slider"></span>
                </label>
              </div>
            </div>
          </div>
        </div>
      </header>

      <!-- Reading Body Area -->
      <div class="epub-reader-body">
        <button class="epub-nav-btn epub-nav-prev player-btn" id="epub-prev-btn" title="Previous Page">
          <i data-lucide="chevron-left"></i>
        </button>

        <div class="epub-viewer-area">
          <div id="epub-render-stage"></div>
        </div>

        <button class="epub-nav-btn epub-nav-next player-btn" id="epub-next-btn" title="Next Page">
          <i data-lucide="chevron-right"></i>
        </button>
      </div>

      <!-- Bottom Audio Player Dock with Streamlined Controls & Seekbar -->
      <div class="epub-player-dock" ${isPureReading ? 'style="display: none !important;"' : ''}>
        <!-- Audio Playbar Seek Timeline -->
        <div class="epub-dock-timeline-container">
          <button class="epub-btn epub-btn-sm player-btn player-btn-secondary" id="epub-dock-scope-btn" title="Toggle Playbar Scope (${timelineScope === 'chapter' ? 'Chapter Duration' : 'Entire Book Duration'})">
            <i data-lucide="${timelineScope === 'chapter' ? 'split' : 'book-open'}" id="epub-dock-scope-icon"></i>
          </button>
          <span class="epub-dock-time-label" id="epub-dock-time-elapsed" style="cursor: pointer;" title="Click to toggle remaining time">00:00</span>
          <input type="range" class="epub-dock-timeline-slider" id="epub-dock-timeline" min="0" max="100" value="0" step="any" aria-label="Audio Timeline" />
          <span class="epub-dock-time-label" id="epub-dock-time-duration" style="cursor: pointer;" title="Click to toggle remaining time">00:00</span>
        </div>

        <div class="epub-dock-top-row">
          <div class="epub-dock-left">
            <button class="epub-btn player-btn" id="epub-dock-rewind" title="Rewind 15s"><i data-lucide="rotate-ccw"></i></button>
            <button class="epub-btn player-btn" id="epub-dock-play-btn" title="${isPlaying ? 'Pause Audio' : 'Listen Along'}" aria-pressed="${isPlaying}">
              <i data-lucide="${isPlaying ? 'pause' : 'play'}"></i>
            </button>
            <button class="epub-btn player-btn" id="epub-dock-forward" title="Forward 30s"><i data-lucide="rotate-cw"></i></button>

            <!-- Custom Aura Dark Volume Control Slider -->
            <div class="epub-volume-container">
              <button class="player-btn player-btn-secondary" id="epub-dock-volume-mute" title="Mute Toggle" style="background: none; border: none; padding: 0;">
                <i data-lucide="${player.isMuted ? 'volume-x' : 'volume-2'}" id="epub-dock-volume-icon"></i>
              </button>
              <input type="range" id="epub-dock-volume" class="epub-volume-slider" min="0" max="1" step="any" value="${player.isMuted ? 0 : player.volume}" aria-label="Volume Slider" />
            </div>

            <div class="epub-dock-status">
              <span id="epub-dock-chapter-name">${currentChapter ? (currentChapter.title || 'Chapter ' + (initialTargetIdx + 1)) : ''}</span>
              <span id="epub-dock-pages-remaining" style="opacity: 0.7; font-size: 0.75rem; margin-left: 6px;"></span>
            </div>
          </div>

            <div class="epub-dock-controls">
            <button class="epub-btn player-btn" id="epub-dock-prev-ch" title="Previous Chapter"><i data-lucide="skip-back"></i></button>
            <button class="epub-btn player-btn" id="epub-dock-next-ch" title="Next Chapter"><i data-lucide="skip-forward"></i></button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  if (window.lucide) window.lucide.createIcons();

  // Immediately grab the rendered theme container so we can toggle site-theme inheritance
  const themeContainer = document.getElementById('epub-reader-theme-container');
  if (themeContainer && currentTheme === 'epub-theme-aura') {
    themeContainer.classList.add('use-site-theme');
  }

  // If an alignment map was loaded from localStorage earlier, ensure UI shows badge and perform an immediate sync
  const syncBadge = document.getElementById('epub-sync-badge');
  if (activeAlignmentList && activeAlignmentList.length > 0) {
    if (syncBadge) syncBadge.style.display = 'inline-flex';
    // Schedule a quick re-sync so the paragraph highlight appears
    setTimeout(() => {
      try { updateParagraphSync(true); } catch (e) { /* ignore */ }
      try { syncDockUI(); } catch (e) { /* ignore */ }
    }, 60);
  }

  // State Variables
  let activeChapterIndex = initialTargetIdx;

  const renderStage = document.getElementById("epub-render-stage");
  const tocSelect = document.getElementById("epub-toc-select");
  const offsetSelect = document.getElementById("epub-offset-select");
  const fontLabel = document.getElementById("epub-font-label");
  const settingsBtn = document.getElementById("epub-settings-btn");
  const settingsPopup = document.getElementById("epub-settings-popup");

  // Synchronized Edge & Bar Hover Controller (Both bars appear together when either is hovered)
  const topTrigger = document.getElementById("epub-edge-top");
  const bottomTrigger = document.getElementById("epub-edge-bottom");
  const headerEl = themeContainer ? themeContainer.querySelector(".epub-reader-header") : null;
  const dockEl = themeContainer ? themeContainer.querySelector(".epub-player-dock") : null;

  const showBothBars = () => {
    if (themeContainer) themeContainer.classList.add("bars-visible");
  };

  const hideBothBars = () => {
    if (settingsPopup && settingsPopup.style.display !== "none") return;
    if (themeContainer) themeContainer.classList.remove("bars-visible");
  };

  if (topTrigger) topTrigger.addEventListener("mouseenter", showBothBars);
  if (bottomTrigger) bottomTrigger.addEventListener("mouseenter", showBothBars);
  if (headerEl) {
    headerEl.addEventListener("mouseenter", showBothBars);
    headerEl.addEventListener("mouseleave", hideBothBars);
  }

  // Suppress automatic alignment-driven chapter switches briefly when we programmatically
  // change the chapter due to an audio track change (prevents immediate flip-flop)
  let suppressChapterAutoSwitch = false;
  // Timestamp of the last time we programmatically rendered a chapter view
  let justRenderedAt = 0;
  // Timer used to clear suppressChapterAutoSwitch so we can manage multiple callers
  let suppressClearTimer = null;
  // Candidate state for requiring consecutive alignment confirmations before switching chapters
  let alignmentSwitchCandidate = null;
  let alignmentCandidateStreak = 0;
  let alignmentCandidateSince = 0;
  const ALIGN_SWITCH_STREAK = 2;
  const ALIGN_SWITCH_WINDOW_MS = 1000;
  const RENDER_SUPPRESS_MS = 600;

  function seekAudioToTime(seconds) {
    if (!player.audio) return;
    const targetSec = Math.max(0, seconds);
    simulatedAudioTime = targetSec;

    const targetAudioChapterIdx = Math.max(0, activeChapterIndex - chapterOffset);

    if (!player.currentBook || String(player.currentBook.id) !== String(activeBook.id)) {
      player.loadBook(activeBook, targetAudioChapterIdx, targetSec, true);
    } else {
      const playerCh = (player.currentBook && player.currentBook.chapters)
        ? player.currentBook.chapters[targetAudioChapterIdx]
        : null;

      const chStart = (playerCh && typeof player.getChapterStartTime === "function")
        ? player.getChapterStartTime(playerCh)
        : 0;

      let absoluteTime = targetSec;
      if (chStart > 0 && targetSec < chStart) {
        absoluteTime = chStart + targetSec;
      }

      console.info(`[Aura EPUB] Sentence clicked -> targetSec=${targetSec}, chStart=${chStart}, absoluteTime=${absoluteTime}, targetAudioCh=${targetAudioChapterIdx}`);

      try {
        if (player.currentChapterIndex !== targetAudioChapterIdx && typeof player.playChapter === "function") {
          player.playChapter(targetAudioChapterIdx, targetSec);
        } else {
          player.audio.currentTime = Math.min(absoluteTime, player.audio.duration || absoluteTime);
          if (typeof player.saveProgress === "function") player.saveProgress(true);
          if (typeof player.updatePlaybackProgressUI === "function") player.updatePlaybackProgressUI();
          if (typeof player.updateUI === "function") player.updateUI();
        }
      } catch (err) {
        console.warn("[Aura EPUB] Seek error:", err);
      }

      if (!player.isPlaying && typeof player.play === "function") {
        player.play();
      }
    }

    isTimelineSeeking = false;
    suppressChapterAutoSwitch = true;
    justRenderedAt = Date.now();
    if (suppressClearTimer) clearTimeout(suppressClearTimer);
    suppressClearTimer = setTimeout(() => { suppressChapterAutoSwitch = false; suppressClearTimer = null; }, RENDER_SUPPRESS_MS);
    try { syncDockUI(); } catch (e) {}
  }

  function scrollToActiveParagraph() {
    const cleanBox = document.getElementById("epub-clean-content");
    if (!cleanBox) return;

    // Force sync update to resolve active paragraph element for current audio position
    try { updateParagraphSync(true); } catch (e) {}

    const activeP = activeParagraphElement || cleanBox.querySelector(".active-narration-p");
    if (activeP) {
      isUserScrolling = false;
      const boxRect = cleanBox.getBoundingClientRect();
      const pRect = activeP.getBoundingClientRect();
      const pTopRelativeToCleanBox = (pRect.top - boxRect.top) + cleanBox.scrollTop;
      const targetTop = Math.max(0, pTopRelativeToCleanBox - (cleanBox.clientHeight * 0.3));
      targetScrollPos = targetTop;
      cleanBox.scrollTo({ top: targetTop, behavior: "smooth" });
      console.info("[EPUB] Middle-click auto-jumped to active paragraph at scroll position:", targetTop);
    }
  }

  const handleMiddleClick = (e) => {
    if (e.button === 1) {
      e.preventDefault();
      e.stopPropagation();
      scrollToActiveParagraph();
    }
  };

  const epubOverlay = document.getElementById("epub-reader-modal");
  if (epubOverlay) {
    epubOverlay.addEventListener("auxclick", handleMiddleClick);
    epubOverlay.addEventListener("mousedown", handleMiddleClick);
  }
  if (dockEl) {
    dockEl.addEventListener("mouseenter", showBothBars);
    dockEl.addEventListener("mouseleave", hideBothBars);
  }

  if (themeContainer) {
    themeContainer.addEventListener("mousemove", (e) => {
      const topEdge = 70;
      const bottomEdge = window.innerHeight - 80;
      if (e.clientY <= topEdge || e.clientY >= bottomEdge) {
        showBothBars();
      } else {
        if (headerEl && (headerEl.contains(e.target) || headerEl.matches(":hover"))) return showBothBars();
        if (dockEl && (dockEl.contains(e.target) || dockEl.matches(":hover"))) return showBothBars();
        if (settingsPopup && settingsPopup.style.display !== "none") return showBothBars();
        hideBothBars();
      }
    });

    themeContainer.addEventListener("mouseleave", hideBothBars);
  }

  // Toggle Settings Popup Menu
  if (settingsBtn && settingsPopup) {
    settingsBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isVisible = settingsPopup.style.display === "flex";
      settingsPopup.style.display = isVisible ? "none" : "flex";
    });

    document.addEventListener("click", (e) => {
      if (!settingsPopup.contains(e.target) && e.target !== settingsBtn) {
        settingsPopup.style.display = "none";
      }
    });
  }

  function applyParagraphSpacing() {
    const cleanBox = document.getElementById("epub-clean-content");
    if (cleanBox) {
      cleanBox.style.setProperty("--epub-p-spacing", `${paragraphSpacing}px`);
    }
  }

  // Paragraph Spacing Slider Handler
  const spacingSlider = document.getElementById("epub-paragraph-spacing-slider");
  const spacingLabel = document.getElementById("epub-paragraph-spacing-label");
  if (spacingSlider) {
    spacingSlider.addEventListener("input", (e) => {
      paragraphSpacing = parseInt(e.target.value, 10);
      if (spacingLabel) spacingLabel.textContent = `${paragraphSpacing}px`;
      localStorage.setItem("aura_epub_paragraph_spacing", paragraphSpacing.toString());
      applyParagraphSpacing();
    });
  }

  // Playback Speed Selector in Settings Popup
  const speedSelect = document.getElementById("epub-speed-select");
  if (speedSelect) {
    speedSelect.addEventListener("change", (e) => {
      const rate = parseFloat(e.target.value);
      player.setSpeed(rate);
    });
  }

  // Named TOC change handler so we can re-bind reliably and add debug logs
  function tocSelectChangeHandler(e) {
    try {
      const epubIdx = parseInt(e.target.value, 10);
      console.debug('[EPUB] toc change -> epubIdx', epubIdx, 'chapterOffset', chapterOffset);
      renderChapterView(epubIdx);
      if (player.currentBook && String(player.currentBook.id) === String(activeBook.id)) {
        const maxAudioCh = activeBook.chapters ? activeBook.chapters.length - 1 : 0;
        const audioTargetIdx = Math.max(0, Math.min(maxAudioCh, epubIdx - chapterOffset));
        console.debug('[EPUB] toc -> playChapter', audioTargetIdx);
        player.playChapter(audioTargetIdx);
      }
    } catch (err) { console.warn('[EPUB] toc handler error', err); }
  }

  function bindTocSelect() {
    if (!tocSelect) return;
    try { tocSelect.removeEventListener('change', tocSelectChangeHandler); } catch (e) {}
    tocSelect.addEventListener('change', tocSelectChangeHandler);
  }

  // Ensure TOC handler is bound now
  bindTocSelect();

  // Sleep Timer Selector in Settings Popup
  const sleepSelect = document.getElementById("epub-sleep-select");
  if (sleepSelect) {
    sleepSelect.addEventListener("change", (e) => {
      const val = e.target.value;
      if (val === "chapter") {
        player.setSleepTimer("chapter");
      } else {
        player.setSleepTimer(parseInt(val, 10));
      }
    });
  }

  // Manual Chapter Offset Input Handler
  const offsetInput = document.getElementById("epub-offset-input");
  if (offsetInput) {
    offsetInput.addEventListener("input", (e) => {
      const val = parseInt(e.target.value, 10);
      if (!isNaN(val)) {
        console.debug('[EPUB] offset input change from', chapterOffset, 'to', val);
        chapterOffset = val;
        localStorage.setItem("aura_epub_offset", chapterOffset.toString());
        // Re-sync UI and re-render chapter mapping for the current audio chapter
        syncDockUI();
        try {
          if (player.currentBook && String(player.currentBook.id) === String(activeBook.id)) {
            const audioIdx = player.currentChapterIndex || 0;
            const newEpubIdx = Math.max(0, Math.min(activeChaptersList.length - 1, audioIdx + chapterOffset));
            renderChapterView(newEpubIdx);
            const toc = document.getElementById('epub-toc-select');
            if (toc) toc.value = newEpubIdx.toString();
          }
        } catch (err) {
          console.warn('Failed to re-map chapter after offset change', err);
        }
      }
    });
  }
  const paceSlider = document.getElementById("epub-pace-slider");
  const paceLabel = document.getElementById("epub-pace-label");
  if (paceSlider && paceLabel) {
    paceSlider.addEventListener("input", (e) => {
      narrationPaceRatio = parseFloat(e.target.value);
      paceLabel.textContent = `${narrationPaceRatio}x`;
      localStorage.setItem("aura_epub_paceratio", narrationPaceRatio.toString());
    });
  }

  // Timeline Scope Toggle Button (Chapter Duration vs Entire Book Duration)
  const scopeBtn = document.getElementById("epub-dock-scope-btn");
  if (scopeBtn) {
    scopeBtn.addEventListener("click", () => {
      timelineScope = timelineScope === "chapter" ? "book" : "chapter";
      localStorage.setItem("aura_epub_scope", timelineScope);
      const iconEl = document.getElementById("epub-dock-scope-icon");
      if (iconEl) {
        iconEl.setAttribute("data-lucide", timelineScope === "chapter" ? "split" : "book-open");
      }
      scopeBtn.title = `Toggle Playbar Scope (${timelineScope === 'chapter' ? 'Chapter Duration' : 'Entire Book Duration'})`;
      if (window.lucide) window.lucide.createIcons();
      syncDockUI();
    });
  }

  // Master EPUB 3 Features Toggle Handler
  const epub3MasterToggle = document.getElementById("epub3-master-toggle");
  if (epub3MasterToggle) {
    epub3MasterToggle.addEventListener("change", (e) => {
      epub3Enabled = e.target.checked;
      localStorage.setItem("aura_epub3_enabled", epub3Enabled ? "true" : "false");

      const dependentBox = document.getElementById("epub3-dependent-options");
      if (dependentBox) {
        if (epub3Enabled) {
          dependentBox.style.opacity = "1";
          dependentBox.style.pointerEvents = "auto";
          dependentBox.style.filter = "none";
          dependentBox.querySelectorAll("input").forEach(inp => inp.removeAttribute("disabled"));
        } else {
          dependentBox.style.opacity = "0.45";
          dependentBox.style.pointerEvents = "none";
          dependentBox.style.filter = "grayscale(0.5)";
          dependentBox.querySelectorAll("input").forEach(inp => inp.setAttribute("disabled", "true"));
        }
      }

      if (typeof updateParagraphSync === "function") {
        updateParagraphSync(true);
      }
    });
  }

  // Auto-Scroll Toggle Handler
  const autoScrollToggle = document.getElementById("epub-autoscroll-toggle");
  if (autoScrollToggle) {
    autoScrollToggle.addEventListener("change", (e) => {
      autoScrollEnabled = e.target.checked;
      localStorage.setItem("aura_epub_autoscroll", autoScrollEnabled.toString());
    });
  }

  // Fluid Margin Progress Flow Toggle Handler
  const fluidMarginToggle = document.getElementById("epub-fluidmargin-toggle");
  if (fluidMarginToggle) {
    fluidMarginToggle.addEventListener("change", (e) => {
      fluidMarginEnabled = e.target.checked;
      localStorage.setItem("aura_epub_fluidmargin", fluidMarginEnabled.toString());
      const cleanBox = document.getElementById("epub-clean-content");
      if (cleanBox) {
        const bar = cleanBox.querySelector(".epub-fluid-margin-bar");
        if (bar && !fluidMarginEnabled) bar.remove();
      }
    });
  }

  // Cinematic Focus Mode Toggle Handler
  function applyFocusModeState() {
    const cleanBox = document.getElementById("epub-clean-content");
    const viewerArea = document.querySelector(".epub-viewer-area");
    const focusBtn = document.getElementById("epub-focus-mode-btn");
    const focusToggle = document.getElementById("epub-focusmode-toggle");

    if (cleanBox) {
      if (focusModeEnabled) {
        cleanBox.classList.add("focus-mode-active");
      } else {
        cleanBox.classList.remove("focus-mode-active");
      }
    }
    if (viewerArea) {
      if (focusModeEnabled) {
        viewerArea.classList.add("focus-vignette-active");
      } else {
        viewerArea.classList.remove("focus-vignette-active");
      }
    }
    if (focusBtn) {
      if (focusModeEnabled) {
        focusBtn.classList.add("player-btn-active");
      } else {
        focusBtn.classList.remove("player-btn-active");
      }
    }
    if (focusToggle) {
      focusToggle.checked = focusModeEnabled;
    }
  }

  function toggleFocusMode() {
    focusModeEnabled = !focusModeEnabled;
    localStorage.setItem("aura_epub_focusmode", focusModeEnabled ? "true" : "false");
    applyFocusModeState();
    if (typeof updateParagraphSync === "function") {
      updateParagraphSync(true);
    }
  }

  const focusModeHeaderBtn = document.getElementById("epub-focus-mode-btn");
  if (focusModeHeaderBtn) {
    focusModeHeaderBtn.addEventListener("click", toggleFocusMode);
  }

  const focusModeToggle = document.getElementById("epub-focusmode-toggle");
  if (focusModeToggle) {
    focusModeToggle.addEventListener("change", (e) => {
      focusModeEnabled = e.target.checked;
      localStorage.setItem("aura_epub_focusmode", focusModeEnabled ? "true" : "false");
      applyFocusModeState();
      if (typeof updateParagraphSync === "function") {
        updateParagraphSync(true);
      }
    });
  }

  // 📖 2-Page Spread Layout Engine & Page Turning Helpers
  function updateSpreadCounter(current, total) {
    const counterBar = document.getElementById("epub-spread-counter");
    const counterText = document.getElementById("epub-spread-counter-text");
    if (counterBar && counterText) {
      if (layoutMode === "double" && total > 1) {
        counterBar.style.display = "inline-flex";
        counterText.textContent = `Pages ${current * 2 - 1}–${Math.min(current * 2, total * 2)} of ${total * 2}`;
      } else {
        counterBar.style.display = "none";
      }
    }
  }

  function applyLayoutModeState() {
    const cleanBox = document.getElementById("epub-clean-content");
    const layoutBtn = document.getElementById("epub-layout-mode-btn");
    const prevBtn = document.getElementById("epub-prev-page-btn");
    const nextBtn = document.getElementById("epub-next-page-btn");

    if (cleanBox) {
      if (layoutMode === "double") {
        cleanBox.classList.add("double-page-mode");
      } else {
        cleanBox.classList.remove("double-page-mode");
      }
    }
    if (layoutBtn) {
      if (layoutMode === "double") {
        layoutBtn.classList.add("player-btn-active");
      } else {
        layoutBtn.classList.remove("player-btn-active");
      }
    }
    if (prevBtn && nextBtn) {
      if (layoutMode === "double") {
        prevBtn.style.display = "flex";
        nextBtn.style.display = "flex";
      } else {
        prevBtn.style.display = "none";
        nextBtn.style.display = "none";
      }
    }
    if (cleanBox && layoutMode === "double") {
      setTimeout(() => {
        const spreadWidth = cleanBox.clientWidth + 64;
        const totalSpreads = Math.max(1, Math.ceil(cleanBox.scrollWidth / spreadWidth));
        updateSpreadCounter(currentPageSpread + 1, totalSpreads);
      }, 50);
    } else {
      updateSpreadCounter(1, 1);
    }
  }

  function toggleLayoutMode() {
    layoutMode = layoutMode === "double" ? "single" : "double";
    localStorage.setItem("aura_epub_layout", layoutMode);
    currentPageSpread = 0;
    applyLayoutModeState();
    if (typeof updateParagraphSync === "function") {
      updateParagraphSync(true);
    }
  }

  function flipPageSpread(delta) {
    const cleanBox = document.getElementById("epub-clean-content");
    if (!cleanBox) return;

    if (layoutMode === "double") {
      const spreadWidth = cleanBox.clientWidth + 64;
      const totalSpreads = Math.max(1, Math.ceil(cleanBox.scrollWidth / spreadWidth));
      currentPageSpread = Math.max(0, Math.min(totalSpreads - 1, currentPageSpread + delta));
      cleanBox.scrollTo({ left: currentPageSpread * spreadWidth, behavior: "smooth" });
      updateSpreadCounter(currentPageSpread + 1, totalSpreads);
    } else {
      const step = cleanBox.clientHeight * 0.85;
      cleanBox.scrollBy({ top: delta * step, behavior: "smooth" });
    }
  }

  const layoutHeaderBtn = document.getElementById("epub-layout-mode-btn");
  if (layoutHeaderBtn) {
    layoutHeaderBtn.addEventListener("click", toggleLayoutMode);
  }

  const sidePrevBtn = document.getElementById("epub-prev-page-btn");
  if (sidePrevBtn) {
    sidePrevBtn.addEventListener("click", () => flipPageSpread(-1));
  }

  const sideNextBtn = document.getElementById("epub-next-page-btn");
  if (sideNextBtn) {
    sideNextBtn.addEventListener("click", () => flipPageSpread(1));
  }

  // Bind Keyboard Arrow & Page Navigation Keys
  const handleReaderKeydown = (e) => {
    const modal = document.getElementById("epub-reader-modal");
    if (!modal) return;
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT")) return;

    if (e.key === "ArrowLeft" || e.key === "PageUp") {
      e.preventDefault();
      flipPageSpread(-1);
    } else if (e.key === "ArrowRight" || e.key === "PageDown") {
      e.preventDefault();
      flipPageSpread(1);
    }
  };
  document.removeEventListener("keydown", handleReaderKeydown);
  document.addEventListener("keydown", handleReaderKeydown);

  // Paragraph Highlight Toggle Handler
  const highlightToggle = document.getElementById("epub-highlight-toggle");
  if (highlightToggle) {
    highlightToggle.addEventListener("change", (e) => {
      paragraphHighlightEnabled = e.target.checked;
      localStorage.setItem("aura_epub_highlight", paragraphHighlightEnabled.toString());
      if (!paragraphHighlightEnabled) {
        const cleanBox = document.getElementById("epub-clean-content");
        if (cleanBox) {
          cleanBox.querySelectorAll("p.active-narration-p").forEach(p => p.classList.remove("active-narration-p"));
        }
      }
    });
  }

  // Word Narration Highlight Toggle Handler
  const wordHighlightToggle = document.getElementById("epub-word-highlight-toggle");
  if (wordHighlightToggle) {
    wordHighlightToggle.addEventListener("change", (e) => {
      wordHighlightEnabled = e.target.checked;
      localStorage.setItem("aura_epub_word_highlight", wordHighlightEnabled.toString());
      if (!wordHighlightEnabled) {
        const cleanBox = document.getElementById("epub-clean-content");
        if (cleanBox) {
          cleanBox.querySelectorAll("span.epub-w.word-active").forEach(m => m.classList.remove("word-active"));
        }
      }
    });
  }

  // Pre-process paragraph text tokens into word spans for 100% reliable word-by-word highlighting
  const prepareParagraphWords = (cleanBox) => {
    cleanBox.querySelectorAll("p").forEach(p => {
      // Preserve inner SMIL Media Overlay sentence spans with id attributes!
      if (p.querySelector("[id]")) return;

      if (!p.dataset.wordPrepared) {
        p.dataset.wordPrepared = "true";
        const text = p.textContent.trim();
        if (text) {
          const tokens = text.split(/(\s+)/);
          let wordCount = 0;
          p.innerHTML = tokens.map(token => {
            if (token.trim().length > 0) {
              const html = `<span class="epub-w" data-w="${wordCount}">${token}</span>`;
              wordCount++;
              return html;
            }
            return token;
          }).join("");
          p.dataset.wordCount = wordCount.toString();
        }
      }
    });
  };

  // Renders the chapter content in ultra-clean, crisp white typography
  const renderChapterView = (idx) => {
    const nowReq = Date.now();
    if (!renderChapterView._lastReqTime) { renderChapterView._lastReqTime = 0; renderChapterView._lastReqIdx = null; }
    const lastDelta = nowReq - (renderChapterView._lastReqTime || 0);
    console.debug('[EPUB] renderChapterView start -> requested', idx, 'chapters', activeChaptersList ? activeChaptersList.length : 0, 'deltaMs', lastDelta, 'prevReq', renderChapterView._lastReqIdx);
    const isRedundant = (idx === activeChapterIndex && (renderStage.innerHTML || '').trim().length > 0);
    if (isRedundant && (nowReq - (renderChapterView._lastReqTime || 0) < 1200)) {
      console.debug('[EPUB] renderChapterView bypassed redundant render for chapter', idx);
      return;
    }

    activeChapterIndex = Math.max(0, Math.min(activeChaptersList.length - 1, idx));
    const toc = document.getElementById("epub-toc-select");
    if (toc) toc.value = activeChapterIndex.toString();

    const ch = activeChaptersList[activeChapterIndex] || activeChaptersList[0];
    const chTitle = ch.title || `Chapter ${activeChapterIndex + 1}`;

    if (ch && ch.contentHtml) {
      try {
        const preview = (ch.contentHtml || '').replace(/\s+/g, ' ').slice(0, 240);
        console.debug('[EPUB] chapter object title:', ch.title, 'activeChapterIndex:', activeChapterIndex, 'content preview:', preview);
        const debugDoc = new DOMParser().parseFromString(ch.contentHtml, 'text/html');
        const debugFirst = debugDoc.body ? debugDoc.body.querySelector('h1, h2, h3, h4, h5, h6, p') : null;
        console.debug('[EPUB] debug firstHeadingText:', debugFirst ? debugFirst.textContent.trim() : null);
      } catch (e) { console.warn('[EPUB] failed to debug-parse chapter content', e); }
    }

    const content = ch.contentHtml
      ? ch.contentHtml
      : `
        <p><em>Reading along with audiobook: <strong>${activeBook.title}</strong> by ${activeBook.author || 'Unknown Author'}</em></p>
        <p>${activeBook.description || "The expedition moved steadily through the silent corridor, the atmospheric sensors humming quietly against the ambient chill. Every step resonated through the hull, carrying the weight of unknown discoveries lying just beyond the upcoming event horizon."}</p>
        <p>As the audio progress advances, you can follow along with the narration or use the top controls to adjust your font size, themes, or load a custom <strong>.EPUB</strong> file directly from your computer.</p>
        <p>The secondary telemetry array continued transmitting periodic telemetry signals, confirming that the structural integrity remained well within nominal operating thresholds despite the gravitational field strength escalating exponentially.</p>
      `;

    let cleanContent = content || "";
    if (ch.contentHtml) {
      const tempDoc = new DOMParser().parseFromString(cleanContent, "text/html");
      const firstHeading = tempDoc.body ? tempDoc.body.querySelector("h1, h2, h3, h4, h5, h6, p") : null;
      if (firstHeading) {
        const txt = firstHeading.textContent.trim();
        if (txt === chTitle || /^(\d+|chapter\s*\d+[:\s\-\.]*[\w\s]*)$/i.test(txt) || txt.length < 5) {
          firstHeading.remove();
          cleanContent = tempDoc.body.innerHTML;
        }
      }
    }

    renderStage.innerHTML = `
      <div class="epub-clean-reader" id="epub-clean-content" style="font-size: ${fontSizePercent}%;">
        <!-- Prominent Beginning-of-Chapter Header Banner -->
        <div class="epub-chapter-header-banner">
          <span class="epub-chapter-badge">Chapter ${activeChapterIndex + 1} of ${activeChaptersList.length}</span>
          <h1 class="epub-chapter-main-title">${chTitle}</h1>
        </div>
        ${cleanContent}
      </div>
    `;
    console.debug('[EPUB] renderChapterView wrote innerHTML for chapter', activeChapterIndex);
    renderChapterView._lastReqTime = nowReq;
    renderChapterView._lastReqIdx = idx;
    // Record the render time so alignment won't immediately override it
    justRenderedAt = Date.now();
    // Clear any pending alignment-switch candidate because we just rendered intentionally
    alignmentSwitchCandidate = null;
    alignmentCandidateStreak = 0;
    alignmentCandidateSince = 0;

    const cleanBox = document.getElementById("epub-clean-content");
    // Re-bind TOC select in case the header was re-rendered or replaced
    try { bindTocSelect(); } catch (e) { console.warn('[EPUB] bindTocSelect after render failed', e); }
    if (cleanBox) {
      applyParagraphSpacing();
      applyFocusModeState();
      applyLayoutModeState();

      // Ensure trailing space inside sentence spans is moved outside so highlight ends right at period!
      cleanBox.querySelectorAll("span[id]").forEach(span => {
        const lastChild = span.lastChild;
        if (lastChild && lastChild.nodeType === 3 && /\s+$/.test(lastChild.nodeValue)) {
          const match = lastChild.nodeValue.match(/^(.*?)(\s+)$/s);
          if (match) {
            lastChild.nodeValue = match[1];
            const spaceNode = document.createTextNode(match[2]);
            if (span.nextSibling) {
              span.parentNode.insertBefore(spaceNode, span.nextSibling);
            } else {
              span.parentNode.appendChild(spaceNode);
            }
          }
        }
      });

      const curCh = activeChaptersList ? activeChaptersList[activeChapterIndex] : null;
      let effectiveAlignment = null;
      if (curCh && curCh.smilOverlay && Array.isArray(curCh.smilOverlay) && curCh.smilOverlay.length > 0) {
        effectiveAlignment = curCh.smilOverlay;
        console.info(`[Aura EPUB] Using built-in SMIL Media Overlay for Chapter ${activeChapterIndex + 1} (${curCh.smilOverlay.length} synced elements)`);
      } else if (activeAlignmentList && activeAlignmentList.length > 0) {
        effectiveAlignment = activeAlignmentList;
      }

      if (effectiveAlignment && effectiveAlignment.length > 0) {
        cleanBox.classList.add("has-alignment-map");
      } else {
        cleanBox.classList.remove("has-alignment-map");
      }

      prepareParagraphWords(cleanBox);
      cleanBox.addEventListener("scroll", updatePagesRemainingIndicator);

      // Initialize lerp animator baseline to current scroll position
      targetScrollPos = cleanBox.scrollTop || 0;
      // Ensure fluid margin bar exists if enabled
      if (fluidMarginEnabled) {
        let bar = cleanBox.querySelector('.epub-fluid-margin-bar');
        if (!bar) {
          bar = document.createElement('div');
          bar.className = 'epub-fluid-margin-bar';
          cleanBox.appendChild(bar);
        }
      }
      // Cache paragraph elements for this chapter once (avoid DOM scans during playback)
      cachedParagraphElements = Array.from(cleanBox.querySelectorAll('p')).filter(el => isMeaningfulParagraphNode(el));
      // If we have full chapter contentHtml available, rebuild the global index
      try { buildGlobalParagraphIndex(); } catch (e) {}
    }

    const chName = document.getElementById("epub-dock-chapter-name");
    if (chName && ch) {
      chName.textContent = chTitle;
    }
    updatePagesRemainingIndicator();
  };

  // Updates Pages Remaining in Chapter Status Label
  function updatePagesRemainingIndicator() {
    const cleanBox = document.getElementById("epub-clean-content");
    const pagesLabel = document.getElementById("epub-dock-pages-remaining");
    if (cleanBox && pagesLabel) {
      const pageHeight = Math.max(1, cleanBox.clientHeight * 0.82);
      const currentPg = Math.floor(cleanBox.scrollTop / pageHeight) + 1;
      const totalPgs = Math.max(1, Math.ceil(cleanBox.scrollHeight / pageHeight));
      const leftPgs = Math.max(0, totalPgs - currentPg);
      pagesLabel.textContent = `• Page ${currentPg} of ${totalPgs} (${leftPgs} left in chapter)`;
    }
  }

  renderChapterView(activeChapterIndex);

  // Auto-fetch EPUB binary from backend if available for this book
  fetchEpubBuffer(activeBook).then(async (arrayBuf) => {
    if (arrayBuf) {
      try {
        const extractedChapters = await extractEpubChapters(arrayBuf);
        if (extractedChapters && extractedChapters.length > 0) {
          activeChaptersList = extractedChapters;
          const targetEpubIdx = Math.max(0, Math.min(activeChaptersList.length - 1, initialTargetIdx));
          activeChapterIndex = targetEpubIdx;
          if (tocSelect) {
            tocSelect.innerHTML = activeChaptersList.map((ch, idx) => `
              <option value="${idx}" ${idx === targetEpubIdx ? "selected" : ""}>
                ${ch.title || `Chapter ${idx + 1}`}
              </option>
            `).join("");
          }
          try { bindTocSelect(); } catch (e) {}
          updateChapterParagraphOffsets();

          // Reset redundant render throttling so real extracted EPUB HTML renders immediately!
          renderChapterView._lastReqIdx = null;
          renderChapterView._lastReqTime = 0;
          renderChapterView(targetEpubIdx);
          console.info("[Aura EPUB] Successfully loaded chapter", targetEpubIdx, "for book:", activeBook.id);
        }
      } catch (err) {
        console.warn("[Aura EPUB] Error parsing backend EPUB binary:", err);
      }
    }
  }).catch(err => {
    console.warn("[Aura EPUB] Backend EPUB fetch skipped/unavailable:", err);
  });

  // Close Handler
  document.getElementById("epub-close-btn").addEventListener("click", closeEpubReader);

  // Theme Selector Handler
  const themeSelect = document.getElementById("epub-theme-select");
  themeSelect.addEventListener("change", (e) => {
    const newTheme = e.target.value;
    themeContainer.className = `epub-reader-container ${newTheme}`;
    localStorage.setItem("aura_epub_theme", newTheme);
    // If user picks the Aura/site theme, let the container inherit site vars
    if (newTheme === 'epub-theme-aura') {
      themeContainer.classList.add('use-site-theme');
    } else {
      themeContainer.classList.remove('use-site-theme');
    }
  });



  // Font Size Buttons inside Settings Cog Popup Menu
  const fontIncBtn = document.getElementById("epub-font-inc");
  const fontDecBtn = document.getElementById("epub-font-dec");

  if (fontIncBtn) {
    fontIncBtn.addEventListener("click", () => {
      fontSizePercent = Math.min(180, fontSizePercent + 10);
      localStorage.setItem("aura_epub_fontsize", fontSizePercent.toString());
      if (fontLabel) fontLabel.textContent = `${fontSizePercent}%`;
      const cleanContent = document.getElementById("epub-clean-content");
      if (cleanContent) cleanContent.style.fontSize = `${fontSizePercent}%`;
      updatePagesRemainingIndicator();
    });
  }

  if (fontDecBtn) {
    fontDecBtn.addEventListener("click", () => {
      fontSizePercent = Math.max(70, fontSizePercent - 10);
      localStorage.setItem("aura_epub_fontsize", fontSizePercent.toString());
      if (fontLabel) fontLabel.textContent = `${fontSizePercent}%`;
      const cleanContent = document.getElementById("epub-clean-content");
      if (cleanContent) cleanContent.style.fontSize = `${fontSizePercent}%`;
      updatePagesRemainingIndicator();
    });
  }

  // Chapter Selection Handler: bound via `bindTocSelect()` to allow re-binding after DOM updates

  // Page Prev / Next Arrow Buttons (Scroll 1 Page Height within Chapter)
  const prevPageBtn = document.getElementById("epub-prev-btn");
  const nextPageBtn = document.getElementById("epub-next-btn");

  prevPageBtn.addEventListener("click", () => {
    const cleanContent = document.getElementById("epub-clean-content");
    if (cleanContent) {
      if (cleanContent.scrollTop <= 10 && activeChapterIndex > 0) {
        const newIdx = activeChapterIndex - 1;
        renderChapterView(newIdx);
        if (player.currentBook && String(player.currentBook.id) === String(activeBook.id)) {
          const maxAudioCh = activeBook.chapters ? activeBook.chapters.length - 1 : 0;
          const audioTargetIdx = Math.max(0, Math.min(maxAudioCh, newIdx - chapterOffset));
          player.playChapter(audioTargetIdx);
        }
      } else {
        cleanContent.scrollBy({ top: -cleanContent.clientHeight * 0.82, behavior: "smooth" });
      }
    }
  });

  nextPageBtn.addEventListener("click", () => {
    const cleanContent = document.getElementById("epub-clean-content");
    if (cleanContent) {
      const isAtBottom = (cleanContent.scrollTop + cleanContent.clientHeight) >= (cleanContent.scrollHeight - 15);
      if (isAtBottom && activeChapterIndex < activeChaptersList.length - 1) {
        const newIdx = activeChapterIndex + 1;
        renderChapterView(newIdx);
        if (player.currentBook && String(player.currentBook.id) === String(activeBook.id)) {
          const maxAudioCh = activeBook.chapters ? activeBook.chapters.length - 1 : 0;
          const audioTargetIdx = Math.max(0, Math.min(maxAudioCh, newIdx - chapterOffset));
          player.playChapter(audioTargetIdx);
        }
      } else {
        cleanContent.scrollBy({ top: cleanContent.clientHeight * 0.82, behavior: "smooth" });
      }
    }
  });

  // Custom File Input for opening .epub files via JSZip Extractor
  const fileInput = document.getElementById("epub-file-input");
  fileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          renderStage.innerHTML = `<div class="epub-clean-reader"><h2>Extracting EPUB Text...</h2><p>Stripping publisher inline styles and formatting high-contrast text...</p></div>`;
          
          const extractedChapters = await extractEpubChapters(evt.target.result);
          if (extractedChapters && extractedChapters.length > 0) {
            activeChaptersList = extractedChapters;

            // Re-populate TOC select
            tocSelect.innerHTML = activeChaptersList.map((ch, idx) => `
              <option value="${idx}" ${idx === initialTargetIdx ? "selected" : ""}>
                ${ch.title || `Chapter ${idx + 1}`}
              </option>
            `).join("");

            // Re-bind TOC change handler after replacing options
            try { bindTocSelect(); } catch (e) { console.warn('[EPUB] bindTocSelect failed', e); }

            const currentAudioIdx = (player.currentBook && String(player.currentBook.id) === String(activeBook.id))
              ? player.currentChapterIndex
              : 0;
            // Recalculate chapter paragraph offsets for the newly extracted chapters
            updateChapterParagraphOffsets();

            const targetEpubIdx = Math.max(0, Math.min(activeChaptersList.length - 1, currentAudioIdx + chapterOffset));
            renderChapterView(targetEpubIdx);
          } else {
            throw new Error("No chapter text found in EPUB package");
          }
        } catch (err) {
          console.warn("Failed to extract EPUB file text:", err);
          renderChapterView(activeChapterIndex);
        }
      };
      reader.readAsArrayBuffer(file);
    }
  });

  // Player Dock Controls & Timeline Seekbar
  const dockPlayBtn = document.getElementById("epub-dock-play-btn");
  const dockTimeline = document.getElementById("epub-dock-timeline");
  const dockElapsed = document.getElementById("epub-dock-time-elapsed");
  const dockDuration = document.getElementById("epub-dock-time-duration");
  const dockVolume = document.getElementById("epub-dock-volume");
  const dockMuteBtn = document.getElementById("epub-dock-volume-mute");

  // Time Elapsed / Remaining Display Mode Toggle
  const toggleTimeDisplay = () => {
    player.toggleTimeDisplayMode();
    syncDockUI();
  };
  if (dockElapsed) dockElapsed.addEventListener("click", toggleTimeDisplay);
  if (dockDuration) dockDuration.addEventListener("click", toggleTimeDisplay);

  // Volume slider & mute
  if (dockVolume) {
    // initialize fill for volume slider
    try {
      const initialVol = parseFloat(dockVolume.value) || 0;
      player.updateSliderFill(dockVolume, Math.round(initialVol * 100));
    } catch (err) { /* ignore */ }

    dockVolume.addEventListener("input", (e) => {
      const vol = parseFloat(e.target.value);
      player.setVolume(vol);
      try { player.updateSliderFill(dockVolume, Math.round(vol * 100)); } catch (err) { /* ignore */ }
    });
  }

  if (dockMuteBtn) {
    dockMuteBtn.addEventListener("click", () => {
      player.toggleMute();
      const muteIcon = document.getElementById("epub-dock-volume-icon");
      if (muteIcon) {
        muteIcon.setAttribute("data-lucide", player.isMuted ? "volume-x" : "volume-2");
        if (window.lucide) window.lucide.createIcons();
      }
    });
  }

  dockPlayBtn.addEventListener("click", () => {
    manualPlaybackState = !manualPlaybackState;

    const isSameBook = player.currentBook && (
      String(player.currentBook.id) === String(activeBook.id) ||
      player.currentBook.title === activeBook.title
    );
    if (!isSameBook) {
      const maxAudioCh = activeBook.chapters ? activeBook.chapters.length - 1 : 0;
      const audioIdx = Math.max(0, Math.min(maxAudioCh, activeChapterIndex - chapterOffset));
      const startSecs = activeBook.chapters && activeBook.chapters[audioIdx]
        ? (player.getChapterStartTime ? player.getChapterStartTime(activeBook.chapters[audioIdx]) : 0)
        : 0;
      player.loadBook(activeBook, audioIdx, startSecs, manualPlaybackState);
    } else {
      if (manualPlaybackState) {
        player.play();
      } else {
        player.pause();
      }
    }
    lastPlayIconState = null;
    syncDockUI();
    setTimeout(syncDockUI, 50);
  });

  document.getElementById("epub-dock-rewind").addEventListener("click", () => {
    simulatedAudioTime = Math.max(0, simulatedAudioTime - 15);
    player.skip(-15);
    syncDockUI();
  });
  document.getElementById("epub-dock-forward").addEventListener("click", () => {
    simulatedAudioTime += 30;
    player.skip(30);
    syncDockUI();
  });

  document.getElementById("epub-dock-prev-ch").addEventListener("click", () => {
    if (activeChapterIndex > 0) {
      const newIdx = activeChapterIndex - 1;
      renderChapterView(newIdx);
      if (player.currentBook && String(player.currentBook.id) === String(activeBook.id)) {
        const maxAudioCh = activeBook.chapters ? activeBook.chapters.length - 1 : 0;
        const audioTargetIdx = Math.max(0, Math.min(maxAudioCh, newIdx - chapterOffset));
        player.playChapter(audioTargetIdx);
      }
    }
  });

  document.getElementById("epub-dock-next-ch").addEventListener("click", () => {
    if (activeChapterIndex < activeChaptersList.length - 1) {
      const newIdx = activeChapterIndex + 1;
      renderChapterView(newIdx);
      if (player.currentBook && String(player.currentBook.id) === String(activeBook.id)) {
        const maxAudioCh = activeBook.chapters ? activeBook.chapters.length - 1 : 0;
        const audioTargetIdx = Math.max(0, Math.min(maxAudioCh, newIdx - chapterOffset));
        player.playChapter(audioTargetIdx);
      }
    }
  });

  // Timeline Slider Scrubbing & Seeking (Robust Chapter vs Book Scope mapping)
  if (dockTimeline) {
    const startSeeking = () => {
      isTimelineSeeking = true;
    };

    dockTimeline.addEventListener("pointerdown", startSeeking);
    dockTimeline.addEventListener("mousedown", startSeeking);
    dockTimeline.addEventListener("touchstart", startSeeking, { passive: true });

    dockTimeline.addEventListener("input", (e) => {
      isTimelineSeeking = true;
      const valSecs = parseFloat(e.target.value);
      simulatedAudioTime = valSecs;
      const maxVal = parseFloat(e.target.max) || 1;
      const percent = Math.min(100, Math.max(0, (valSecs / maxVal) * 100));
      player.updateSliderFill(e.target, percent);

      let displayTime = player.formatTime(valSecs);
      if (player.showTimeRemaining) {
        displayTime = `-${player.formatTime(Math.max(0, maxVal - valSecs))}`;
      }
      if (dockElapsed) dockElapsed.textContent = displayTime;
    });

    const commitSeek = (e) => {
      const valSecs = parseFloat(dockTimeline.value);
      const isSameBook = !!(player.currentBook && (
        String(player.currentBook.id) === String(activeBook.id) ||
        player.currentBook.title === activeBook.title
      ));
      // Compute a sensible simulatedAudioTime preview (absolute seconds) so the
      // reader UI maps properly during the subsequent sync pass.
      try {
        const isBookScope = timelineScope === 'book';
        if (isSameBook) {
          if (isBookScope) {
            // valSecs is absolute seconds across the whole book
            simulatedAudioTime = Math.max(0, valSecs);
          } else {
            // valSecs is chapter-relative seconds; compute absolute using chapter start
            const audioIdx = Math.max(0, activeChapterIndex - chapterOffset);
            const curCh = (player.currentBook && player.currentBook.chapters && player.currentBook.chapters[audioIdx]) ? player.currentBook.chapters[audioIdx] : null;
            const chStart = curCh ? player.getChapterStartTime(curCh) : 0;
            simulatedAudioTime = Math.max(0, (chStart || 0) + (isNaN(valSecs) ? 0 : valSecs));
          }
        } else {
          // For other books: if the timeline is book-scoped, valSecs is absolute; if chapter-scoped, treat as chapter-relative to activeChapterIndex
          if (timelineScope === 'book') {
            simulatedAudioTime = valSecs;
          } else {
            simulatedAudioTime = valSecs;
          }
        }
      } catch (e) { simulatedAudioTime = valSecs; }

      if (!isSameBook) {
        // When loading another book, compute target audio chapter and elapsed depending on scope
        if (timelineScope === 'book') {
          // valSecs is absolute across the book; find the chapter containing this time
          let foundIdx = 0;
          try {
            if (activeBook.chapters && player.getChapterStartTime) {
              for (let i = 0; i < activeBook.chapters.length; i++) {
                const s = player.getChapterStartTime(activeBook.chapters[i]) || 0;
                const d = player.getChapterDuration ? player.getChapterDuration(activeBook.chapters[i], i) : 0;
                if (valSecs >= s && valSecs < s + (d || 0)) { foundIdx = i; break; }
                if (i === activeBook.chapters.length - 1 && valSecs >= s) { foundIdx = i; break; }
              }
            }
          } catch (e) { foundIdx = Math.max(0, activeChapterIndex - chapterOffset); }
          const chStart = (activeBook.chapters && activeBook.chapters[foundIdx]) ? (player.getChapterStartTime ? player.getChapterStartTime(activeBook.chapters[foundIdx]) : 0) : 0;
          const elapsed = Math.max(0, valSecs - (chStart || 0));
          player.loadBook(activeBook, foundIdx, elapsed, true);
        } else {
          const audioIdx = Math.max(0, activeChapterIndex - chapterOffset);
          player.loadBook(activeBook, audioIdx, valSecs, true);
        }
      } else {
        // Same book: seek audio to absolute simulatedAudioTime
        try {
          const absoluteTarget = Math.max(0, simulatedAudioTime);
          if (player.audio) {
            player.audio.currentTime = absoluteTarget;
            if (typeof player.saveProgress === 'function') player.saveProgress(true);
            if (typeof player.updateUI === 'function') player.updateUI();
            if (typeof player.notifyTimeUpdate === 'function') player.notifyTimeUpdate();
          } else {
            player.seek(absoluteTarget);
          }
        } catch (err) {
          console.warn('[EPUB] commitSeek: direct seek failed, falling back to player.seek', err);
          player.seek(valSecs);
        }
      }

      // After user-initiated seek, suppress immediate alignment-driven chapter switches
      isTimelineSeeking = false;
      suppressChapterAutoSwitch = true;
      justRenderedAt = Date.now();
      if (suppressClearTimer) clearTimeout(suppressClearTimer);
      suppressClearTimer = setTimeout(() => { suppressChapterAutoSwitch = false; suppressClearTimer = null; }, RENDER_SUPPRESS_MS);
      syncDockUI();
    };

    dockTimeline.addEventListener("change", commitSeek);
    dockTimeline.addEventListener("pointerup", commitSeek);
    dockTimeline.addEventListener("mouseup", commitSeek);
    dockTimeline.addEventListener("touchend", commitSeek);
  }

  const handleGlobalPointerRelease = () => {
    isTimelineSeeking = false;
  };
  window.addEventListener("pointerup", handleGlobalPointerRelease);
  window.addEventListener("mouseup", handleGlobalPointerRelease);
  window.addEventListener("touchend", handleGlobalPointerRelease);

  // Listen to Global Player Events to keep Reader Dock & Chapter View in Sync
  let isUserScrolling = false;
  let userScrollTimer = null;

  const bindScrollTracker = () => {
    const cleanBox = document.getElementById("epub-clean-content");
    if (cleanBox) {
      cleanBox.addEventListener("scroll", () => {
        isUserScrolling = true;
        targetScrollPos = cleanBox.scrollTop;
        updatePagesRemainingIndicator();
        repositionCardToTarget();
        clearTimeout(userScrollTimer);
        userScrollTimer = setTimeout(() => {
          isUserScrolling = false;
        }, 1200);
      });
    }
  };
  bindScrollTracker();

  // 60fps Silky Smooth Lerp Auto-Scroll Animation Engine
  const lerpScrollLoop = () => {
    const isSameBook = player.currentBook && String(player.currentBook.id) === String(activeBook.id);
    const isPlayingNow = isSameBook && player.isPlaying;
    const cleanBox = document.getElementById("epub-clean-content");

    if (cleanBox && isPlayingNow && autoScrollEnabled && !isUserScrolling) {
      const diff = targetScrollPos - cleanBox.scrollTop;
      if (Math.abs(diff) > 0.5) {
        cleanBox.scrollTop += diff * 0.08;
      }
    }
    animFrameId = requestAnimationFrame(lerpScrollLoop);
  };

  // Start the lerp scroll loop once
  animFrameId = requestAnimationFrame(lerpScrollLoop);



  // Instant Word Dictionary & Wikipedia Lookup Engine
  let activeLookupCard = null;
  let activeWordTargetEl = null;
  let cardAnimFrameId = null;

  const closeLookupCard = () => {
    if (cardAnimFrameId) {
      cancelAnimationFrame(cardAnimFrameId);
      cardAnimFrameId = null;
    }
    if (activeLookupCard) {
      activeLookupCard.remove();
      activeLookupCard = null;
      activeWordTargetEl = null;
    }
  };

  const repositionCardToTarget = () => {
    const card = document.getElementById("epub-lookup-card");
    if (!card) return;

    let rect = null;
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0 && selection.toString().trim()) {
      const range = selection.getRangeAt(0);
      const r = range.getBoundingClientRect();
      if (r && r.width > 0 && r.height > 0) rect = r;
    }

    if (!rect && activeWordTargetEl && activeWordTargetEl.getBoundingClientRect) {
      rect = activeWordTargetEl.getBoundingClientRect();
    }

    if (!rect) return;

    const cleanBox = document.getElementById("epub-clean-content");
    const containerRect = cleanBox ? cleanBox.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };

    // If target word has scrolled out of viewport bounds, close card
    if (rect.bottom < containerRect.top + 40 || rect.top > containerRect.bottom - 40) {
      closeLookupCard();
      return;
    }

    const cardWidth = Math.min(320, window.innerWidth - 32);
    const cardHeight = card.offsetHeight || 280;

    // Horizontal alignment centered over word
    let left = rect.left + (rect.width / 2) - (cardWidth / 2);
    left = Math.min(window.innerWidth - cardWidth - 16, Math.max(16, left));

    // Vertical positioning: Flip ABOVE word if word is near screen bottom!
    let top = 0;
    const spaceBelow = window.innerHeight - rect.bottom - 20;
    const spaceAbove = rect.top - 70;

    if (spaceBelow >= cardHeight || spaceBelow >= spaceAbove) {
      // Place BELOW word
      top = rect.bottom + 8;
      card.style.maxHeight = `${Math.min(380, window.innerHeight - top - 16)}px`;
    } else {
      // Place ABOVE word
      top = Math.max(70, rect.top - cardHeight - 8);
      card.style.maxHeight = `${Math.min(380, rect.top - 78)}px`;
    }

    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
  };

  const cardAnchoringLoop = () => {
    if (activeLookupCard) {
      repositionCardToTarget();
      cardAnimFrameId = requestAnimationFrame(cardAnchoringLoop);
    }
  };

  const showWordLookup = async (word, clientX, clientY, targetEl = null) => {
    closeLookupCard();
    const cleanWord = word
      .replace(/[’‘`′]/g, "'")
      .replace(/[^a-zA-Z0-9'\-\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!cleanWord || cleanWord.length < 2) return;

    activeWordTargetEl = targetEl;

    const card = document.createElement("div");
    card.className = "epub-lookup-card";
    card.id = "epub-lookup-card";
    
    // Initial position
    const left = Math.min(window.innerWidth - 340, Math.max(16, clientX - 160));
    const top = Math.min(window.innerHeight - 380, Math.max(70, clientY + 16));
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;

    document.getElementById("epub-reader-modal").appendChild(card);
    if (window.lucide) window.lucide.createIcons();
    activeLookupCard = card;

    if (cardAnimFrameId) cancelAnimationFrame(cardAnimFrameId);
    cardAnchoringLoop();

    // Intelligent Franchise Lore & Context Detection
    const bookMetaText = `${activeBook.title || ""} ${activeBook.author || ""} ${activeBook.series || ""} ${(activeBook.tags || []).join(" ")} ${(activeBook.genres || []).join(" ")}`.toLowerCase();
    const isStarWarsBook = bookMetaText.includes("star wars") || bookMetaText.includes("starwars") || bookMetaText.includes("jedi") || bookMetaText.includes("sith") || bookMetaText.includes("plagueis") || bookMetaText.includes("luceno") || bookMetaText.includes("skywalker");

    card.innerHTML = `
      <div class="epub-lookup-header">
        <div class="epub-lookup-title-area">
          <span class="epub-lookup-word">${cleanWord}</span>
          <span class="epub-lookup-phonetic" id="lookup-phonetic">Searching...</span>
        </div>
        <button class="epub-font-btn" id="lookup-close-btn" title="Close"><i data-lucide="x"></i></button>
      </div>

      <div class="epub-lookup-tabs">
        <button class="epub-lookup-tab active" id="tab-dict">Dictionary</button>
        <button class="epub-lookup-tab" id="tab-wiki">Wikipedia</button>
        ${isStarWarsBook ? `<button class="epub-lookup-tab" id="tab-wookiee" style="color: #fbbf24;">Wookieepedia</button>` : ''}
      </div>

      <div class="epub-lookup-content" id="lookup-body">
        <p><em>Loading definition for <strong>"${cleanWord}"</strong>...</em></p>
      </div>
    `;

    document.getElementById("epub-reader-modal").appendChild(card);
    if (window.lucide) window.lucide.createIcons();
    activeLookupCard = card;

    const closeBtn = document.getElementById("lookup-close-btn");
    if (closeBtn) closeBtn.addEventListener("click", closeLookupCard);

    let dictData = null;
    let wikiData = null;
    let wookieeData = null;

    const renderDict = () => {
      const body = document.getElementById("lookup-body");
      const phonetic = document.getElementById("lookup-phonetic");
      
      if (!dictData || dictData.title === "No Definitions Found") {
        if (body) body.innerHTML = `<p>No dictionary definition found for "<strong>${cleanWord}</strong>". Try checking the Wikipedia tab!</p>`;
        if (phonetic) phonetic.textContent = "";
        return;
      }

      const entry = dictData[0];
      if (phonetic) {
        const text = entry.phonetic || (entry.phonetics && entry.phonetics[0] ? entry.phonetics[0].text : "");
        phonetic.textContent = text || "";
      }

      let html = "";
      if (entry._lemmaWord) {
        html += `<div style="font-size: 0.75rem; color: #a78bfa; margin-bottom: 6px; font-style: italic;">Showing definition for root word "<strong>${entry._lemmaWord}</strong>"</div>`;
      }

      if (entry.meanings && entry.meanings.length > 0) {
        entry.meanings.slice(0, 2).forEach(m => {
          html += `<div class="epub-lookup-def-type">${m.partOfSpeech}</div>`;
          if (m.definitions && m.definitions.length > 0) {
            html += `<ol style="padding-left: 18px; margin: 4px 0;">`;
            m.definitions.slice(0, 2).forEach(d => {
              html += `<li>${d.definition}${d.example ? `<br><em style="opacity: 0.8; font-size: 0.8em;">"${d.example}"</em>` : ''}</li>`;
            });
            html += `</ol>`;
          }
        });
      }
      if (body) body.innerHTML = html || `<p>No definition entries available.</p>`;
    };

    const renderWiki = () => {
      const body = document.getElementById("lookup-body");
      const phonetic = document.getElementById("lookup-phonetic");
      if (phonetic) phonetic.textContent = "";

      if (!wikiData || wikiData.type === "https://mediawiki.org/wiki/HyperSwitch/errors/not_found" || !wikiData.extract) {
        if (body) {
          body.innerHTML = `
            <p>No direct Wikipedia article found for "<strong>${cleanWord}</strong>".</p>
            <div style="margin-top: 12px;">
              <a href="https://www.google.com/search?q=${encodeURIComponent(cleanWord + ' ' + (activeBook.title || ''))}" target="_blank" class="epub-btn" style="display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 0.8rem; background: var(--reader-border);">
                <i data-lucide="search"></i>
                <span>Search "${cleanWord}" on Web →</span>
              </a>
            </div>
          `;
          if (window.lucide) window.lucide.createIcons();
        }
        return;
      }

      let cleanWikiText = (wikiData.extract || "")
        .replace(/This article is about [^\.\n]+\./gi, "")
        .replace(/You may be looking for [^\.\n]+\./gi, "")
        .replace(/For other uses[^\.]*\./gi, "")
        .trim();

      let html = "";
      if (wikiData.thumbnail && wikiData.thumbnail.source) {
        html += `<img src="${wikiData.thumbnail.source}" style="width: 100%; max-height: 140px; object-fit: cover; border-radius: 6px; margin-bottom: 10px;" />`;
      }
      html += `<p><strong>${wikiData.title}</strong> — ${cleanWikiText}</p>`;
      if (wikiData.content_urls && wikiData.content_urls.desktop) {
        html += `<a href="${wikiData.content_urls.desktop.page}" target="_blank" style="font-size: 0.78rem; font-weight: 700; color: #a78bfa; text-decoration: underline; margin-top: 8px; display: inline-block;">Read full Wikipedia article →</a>`;
      }
      if (body) body.innerHTML = html;
    };

    const renderWookiee = () => {
      const body = document.getElementById("lookup-body");
      const phonetic = document.getElementById("lookup-phonetic");
      if (phonetic) phonetic.textContent = "";

      if (!wookieeData || !wookieeData.extract) {
        if (body) {
          body.innerHTML = `
            <p>No Wookieepedia article found for "<strong>${cleanWord}</strong>".</p>
            <div style="margin-top: 10px;">
              <a href="https://starwars.fandom.com/wiki/Special:Search?query=${encodeURIComponent(cleanWord)}" target="_blank" class="epub-btn" style="display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 0.78rem; background: var(--reader-border); color: #fbbf24;">
                <span>Search Wookieepedia →</span>
              </a>
            </div>
          `;
        }
        return;
      }

      let html = "";
      if (wookieeData.thumbnail) {
        html += `<img src="${wookieeData.thumbnail}" style="width: 100%; max-height: 140px; object-fit: cover; border-radius: 6px; margin-bottom: 10px;" />`;
      }
      html += `<p><strong style="color: #fbbf24;">${wookieeData.title}</strong> — ${wookieeData.extract.slice(0, 340)}...</p>`;
      html += `<a href="https://starwars.fandom.com/wiki/${encodeURIComponent(wookieeData.title)}" target="_blank" style="font-size: 0.78rem; font-weight: 700; color: #fbbf24; text-decoration: underline; margin-top: 8px; display: inline-block;">Read full Wookieepedia article →</a>`;
      if (body) body.innerHTML = html;
    };

    // Helper for Stemming, US/UK Root Word, and Wiktionary API Fallbacks
    const fetchDictWithFallback = async (term) => {
      const lower = term.toLowerCase();
      try {
        const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${lower}`);
        if (res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data) && data[0]) return data;
        }
      } catch (e) {}

      // Stemming & US/UK spelling fallbacks (-ored, -ing, -ed, -s, -es, -ly)
      const fallbacks = [lower];
      if (lower.endsWith("ored")) {
        fallbacks.push(lower.slice(0, -2)); // favored -> favor
        fallbacks.push(lower.slice(0, -2) + "ur"); // favored -> favour
        fallbacks.push(lower.slice(0, -2) + "ured"); // favored -> favoured
      }
      if (lower.endsWith("ing")) {
        fallbacks.push(lower.slice(0, -3));
        fallbacks.push(lower.slice(0, -3) + "e");
      } else if (lower.endsWith("ed")) {
        fallbacks.push(lower.slice(0, -2));
        fallbacks.push(lower.slice(0, -1));
      } else if (lower.endsWith("es")) {
        fallbacks.push(lower.slice(0, -2));
        fallbacks.push(lower.slice(0, -1));
      } else if (lower.endsWith("s")) {
        fallbacks.push(lower.slice(0, -1));
      } else if (lower.endsWith("ly")) {
        fallbacks.push(lower.slice(0, -2));
      }

      for (const fb of fallbacks) {
        if (fb.length >= 3) {
          try {
            const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${fb}`);
            if (res.ok) {
              const data = await res.json();
              if (data && Array.isArray(data) && data[0]) {
                data[0]._lemmaWord = fb !== lower ? fb : null;
                return data;
              }
            }
          } catch (e) {}
        }
      }

      // Wiktionary REST API Fallback (Guarantees 100% dictionary coverage for all English words)
      try {
        const wiktRes = await fetch(`https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(lower)}`);
        if (wiktRes.ok) {
          const wJson = await wiktRes.json();
          const enData = wJson.en || wJson.English || (Object.keys(wJson).length > 0 ? wJson[Object.keys(wJson)[0]] : null);
          if (enData && Array.isArray(enData) && enData.length > 0) {
            const meanings = [];
            enData.slice(0, 3).forEach(sec => {
              if (sec.definitions && sec.definitions.length > 0) {
                const defs = sec.definitions.slice(0, 2).map(d => ({
                  definition: d.definition.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim(),
                  example: ""
                })).filter(d => d.definition.length > 0);
                if (defs.length > 0) {
                  meanings.push({
                    partOfSpeech: sec.partOfSpeech || "Definition",
                    definitions: defs
                  });
                }
              }
            });
            if (meanings.length > 0) {
              return [{
                word: term,
                meanings: meanings
              }];
            }
          }
        }
      } catch (e) {}

      return null;
    };

    const fetchWookieepediaData = async (term) => {
      try {
        let titleToFetch = term;

        // 1. Search Fandom first to resolve exact canonical article title (e.g. baldemnic -> Bal'demnic)
        const searchRes = await fetch(`https://starwars.fandom.com/api.php?action=query&list=search&srsearch=${encodeURIComponent(term)}&format=json&origin=*`).catch(() => null);
        if (searchRes && searchRes.ok) {
          const sJson = await searchRes.json();
          if (sJson.query && sJson.query.search && sJson.query.search.length > 0) {
            titleToFetch = sJson.query.search[0].title;
          }
        }

        // 2. Fetch thumbnail and lead section HTML in parallel
        const [imgRes, parseRes] = await Promise.all([
          fetch(`https://starwars.fandom.com/api.php?action=query&prop=pageimages&titles=${encodeURIComponent(titleToFetch)}&pithumbsize=400&format=json&origin=*`).catch(() => null),
          fetch(`https://starwars.fandom.com/api.php?action=parse&page=${encodeURIComponent(titleToFetch)}&prop=text&section=0&format=json&origin=*`).catch(() => null)
        ]);

        let imgSrc = null;
        if (imgRes && imgRes.ok) {
          const iJson = await imgRes.json();
          const pages = iJson.query ? iJson.query.pages : {};
          const pid = Object.keys(pages)[0];
          if (pid && pages[pid].thumbnail) imgSrc = pages[pid].thumbnail.source;
        }

        let cleanText = "";
        if (parseRes && parseRes.ok) {
          const pJson = await parseRes.json();
          if (pJson.parse && pJson.parse.text && pJson.parse.text["*"]) {
            const rawHtml = pJson.parse.text["*"];
            const parser = new DOMParser();
            const doc = parser.parseFromString(rawHtml, "text/html");
            doc.querySelectorAll(".hatnote, .dablink, .portable-infobox, aside, table, style, script, .topicon, .navbox, .notice, .mw-empty-elt").forEach(el => el.remove());
            
            cleanText = doc.body.textContent
              .replace(/&#\d+;/g, "")
              .replace(/\[\d+\]/g, "")
              .replace(/\[note \d+\]/gi, "")
              .replace(/This article is about [^\.\n]+\./gi, "")
              .replace(/You may be looking for [^\.\n]+\./gi, "")
              .replace(/For the [^\.\n]+, see [^\.\n]+\./gi, "")
              .replace(/For other uses[^\.]*\./gi, "")
              .replace(/For [^\.\n]+, see [^\.\n]+\./gi, "")
              .replace(/\s+/g, " ")
              .trim();
          }
        }

        if (cleanText) {
          return {
            title: titleToFetch,
            extract: cleanText,
            thumbnail: imgSrc
          };
        }
      } catch (e) {
        console.warn("Wookieepedia fetch error:", e);
      }
      return null;
    };

    // Fetch Dictionary, Wikipedia, and Wookieepedia in parallel
    try {
      const [dictResult, wikiRes, wookieeResult] = await Promise.all([
        fetchDictWithFallback(cleanWord),
        fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(cleanWord)}`).catch(() => null),
        isStarWarsBook ? fetchWookieepediaData(cleanWord) : Promise.resolve(null)
      ]);

      dictData = dictResult;
      if (wikiRes && wikiRes.ok) wikiData = await wikiRes.json();
      wookieeData = wookieeResult;

      // Tab Event Listeners
      const tabDict = document.getElementById("tab-dict");
      const tabWiki = document.getElementById("tab-wiki");
      const tabWookiee = document.getElementById("tab-wookiee");

      const deactivateAllTabs = () => {
        if (tabDict) tabDict.classList.remove("active");
        if (tabWiki) tabWiki.classList.remove("active");
        if (tabWookiee) tabWookiee.classList.remove("active");
      };

      if (tabDict) {
        tabDict.addEventListener("click", () => {
          deactivateAllTabs();
          tabDict.classList.add("active");
          renderDict();
        });
      }
      if (tabWiki) {
        tabWiki.addEventListener("click", () => {
          deactivateAllTabs();
          tabWiki.classList.add("active");
          renderWiki();
        });
      }
      if (tabWookiee) {
        tabWookiee.addEventListener("click", () => {
          deactivateAllTabs();
          tabWookiee.classList.add("active");
          renderWookiee();
        });
      }

      // Smart Priority Auto-Switch Strategy:
      // 1. Normal English words (e.g. favored, swirling) with Dictionary definition -> ALWAYS default to Dictionary tab!
      // 2. Next, check general Wikipedia for concepts/topics!
      // 3. ONLY auto-switch to Wookieepedia if Dictionary & Wikipedia returned NO match!
      deactivateAllTabs();
      if (dictData && Array.isArray(dictData) && dictData.length > 0 && !dictData.title) {
        if (tabDict) tabDict.classList.add("active");
        renderDict();
      } else if (wikiData && wikiData.type !== "https://mediawiki.org/wiki/HyperSwitch/errors/not_found" && wikiData.extract) {
        if (tabWiki) tabWiki.classList.add("active");
        renderWiki();
      } else if (wookieeData && wookieeData.extract && tabWookiee) {
        if (tabWookiee) tabWookiee.classList.add("active");
        renderWookiee();
      } else {
        if (tabDict) tabDict.classList.add("active");
        renderDict();
      }
    } catch (err) {
      console.warn("Lookup failed:", err);
    }
  };

  // Saved Highlights Storage Engine
  const HL_KEY = `aura_epub_highlights_${activeBook.id}`;
  let savedHighlights = [];
  try {
    savedHighlights = JSON.parse(localStorage.getItem(HL_KEY) || "[]");
  } catch (e) {
    savedHighlights = [];
  }

  const saveHighlightsToStorage = () => {
    try {
      localStorage.setItem(HL_KEY, JSON.stringify(savedHighlights));
    } catch (e) {}
  };

  const createQuoteCard = (quoteText) => {
    const backdrop = document.createElement("div");
    backdrop.className = "epub-quote-modal-backdrop";
    backdrop.innerHTML = `
      <div class="epub-quote-card">
        <div class="epub-quote-mark">“</div>
        <div class="epub-quote-text">${quoteText}</div>
        <div class="epub-quote-meta">
          <div>
            <div style="font-weight: 700; color: #ffffff; font-size: 0.95rem;">${activeBook.title}</div>
            <div style="opacity: 0.8; font-size: 0.82rem;">By ${activeBook.author || "Unknown"} • Chapter ${activeChapterIndex + 1}</div>
          </div>
          <button class="epub-btn" id="copy-quote-btn" style="background: rgba(56, 189, 248, 0.2); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.4);">
            <i data-lucide="copy"></i>
            <span>Copy Quote</span>
          </button>
        </div>
        <button class="epub-font-btn" id="close-quote-btn" style="position: absolute; top: 16px; right: 16px;"><i data-lucide="x"></i></button>
      </div>
    `;

    document.getElementById("epub-reader-modal").appendChild(backdrop);
    if (window.lucide) window.lucide.createIcons();

    backdrop.querySelector("#close-quote-btn").addEventListener("click", () => backdrop.remove());
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) backdrop.remove();
    });

    backdrop.querySelector("#copy-quote-btn").addEventListener("click", () => {
      const formatted = `"${quoteText}"\n— ${activeBook.title} by ${activeBook.author || "Unknown"}`;
      navigator.clipboard.writeText(formatted).then(() => {
        const btn = backdrop.querySelector("#copy-quote-btn span");
        if (btn) btn.textContent = "Copied!";
        setTimeout(() => { if (btn) btn.textContent = "Copy Quote"; }, 2000);
      });
    });
  };

  let activeSelectionToolbar = null;
  const closeSelectionToolbar = () => {
    if (activeSelectionToolbar) {
      activeSelectionToolbar.remove();
      activeSelectionToolbar = null;
    }
  };

  const showSelectionToolbar = (selectedText, range) => {
    closeSelectionToolbar();
    if (!selectedText || selectedText.length < 2) return;

    const rect = range.getBoundingClientRect();
    const toolbar = document.createElement("div");
    toolbar.className = "epub-selection-toolbar";

    const left = Math.min(window.innerWidth - 320, Math.max(16, rect.left + (rect.width / 2) - 140));
    const top = Math.max(65, rect.top - 46);

    toolbar.style.left = `${left}px`;
    toolbar.style.top = `${top}px`;

    toolbar.innerHTML = `
      <div style="display: flex; gap: 6px; align-items: center; border-right: 1px solid #27272a; padding-right: 8px;">
        <span class="epub-hl-color-dot" data-color="gold" style="background: #eab308;" title="Highlight Gold"></span>
        <span class="epub-hl-color-dot" data-color="cyan" style="background: #38bdf8;" title="Highlight Cyan"></span>
        <span class="epub-hl-color-dot" data-color="emerald" style="background: #22c55e;" title="Highlight Emerald"></span>
        <span class="epub-hl-color-dot" data-color="rose" style="background: #f43f5e;" title="Highlight Rose"></span>
      </div>
      <button class="epub-hl-btn" id="hl-add-note-btn" title="Add Note">
        <i data-lucide="file-text"></i>
        <span>Note</span>
      </button>
      <button class="epub-hl-btn" id="hl-quote-card-btn" title="Create Quote Card">
        <i data-lucide="sparkles"></i>
        <span>Quote</span>
      </button>
    `;

    document.getElementById("epub-reader-modal").appendChild(toolbar);
    if (window.lucide) window.lucide.createIcons();
    activeSelectionToolbar = toolbar;

    // Color Dots
    toolbar.querySelectorAll(".epub-hl-color-dot").forEach(dot => {
      dot.addEventListener("click", () => {
        const color = dot.dataset.color;
        savedHighlights.push({
          id: Date.now().toString(),
          chapterIndex: activeChapterIndex,
          text: selectedText,
          color: color,
          note: "",
          timestamp: Date.now()
        });
        saveHighlightsToStorage();
        closeSelectionToolbar();
        window.getSelection().removeAllRanges();
      });
    });

    // Note Button
    toolbar.querySelector("#hl-add-note-btn").addEventListener("click", () => {
      const noteText = prompt("Add a personal note to this highlight:");
      if (noteText !== null) {
        savedHighlights.push({
          id: Date.now().toString(),
          chapterIndex: activeChapterIndex,
          text: selectedText,
          color: "gold",
          note: noteText.trim(),
          timestamp: Date.now()
        });
        saveHighlightsToStorage();
      }
      closeSelectionToolbar();
      window.getSelection().removeAllRanges();
    });

    // Quote Card Button
    toolbar.querySelector("#hl-quote-card-btn").addEventListener("click", () => {
      createQuoteCard(selectedText);
      closeSelectionToolbar();
      window.getSelection().removeAllRanges();
    });
  };

  // Highlights Drawer Modal
  const bookmarksBtn = document.getElementById("epub-bookmarks-btn");
  if (bookmarksBtn) {
    bookmarksBtn.addEventListener("click", () => {
      let drawer = document.getElementById("epub-highlights-drawer");
      if (drawer) {
        drawer.remove();
        return;
      }

      drawer = document.createElement("div");
      drawer.id = "epub-highlights-drawer";
      drawer.className = "epub-quote-modal-backdrop";
      
      const renderDrawerContent = () => {
        let html = `
          <div class="epub-quote-card" style="max-width: 520px; max-height: 80vh; overflow-y: auto;">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 12px;">
              <h2 style="font-size: 1.1rem; font-weight: 700; margin: 0; display: flex; align-items: center; gap: 8px;">
                <i data-lucide="bookmark" style="color: #38bdf8;"></i>
                <span>Saved Highlights & Notes (${savedHighlights.length})</span>
              </h2>
              <button class="epub-font-btn" id="close-drawer-btn"><i data-lucide="x"></i></button>
            </div>
            <div style="display: flex; flex-direction: column; gap: 12px; margin-top: 12px;">
        `;

        if (savedHighlights.length === 0) {
          html += `<p style="opacity: 0.7; font-style: italic; font-size: 0.85rem;">No saved highlights yet. Select text in the book to add highlights, notes, or quote cards!</p>`;
        } else {
          savedHighlights.slice().reverse().forEach(hl => {
            const colorHex = hl.color === "cyan" ? "#38bdf8" : hl.color === "emerald" ? "#22c55e" : hl.color === "rose" ? "#f43f5e" : "#eab308";
            html += `
              <div style="background: rgba(255,255,255,0.04); border-left: 3px solid ${colorHex}; border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 6px;">
                <div style="font-size: 0.9rem; font-style: italic; color: #e2e8f0;">"${hl.text}"</div>
                ${hl.note ? `<div style="font-size: 0.8rem; color: #fbbf24; background: rgba(251, 191, 36, 0.1); padding: 4px 8px; border-radius: 4px;">📝 Note: ${hl.note}</div>` : ''}
                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; color: #94a3b8; margin-top: 4px;">
                  <span>Chapter ${hl.chapterIndex + 1}</span>
                  <div style="display: flex; gap: 8px;">
                    <button class="epub-hl-btn make-quote-btn" data-id="${hl.id}" style="font-size: 0.72rem; padding: 2px 6px;">🎨 Quote Card</button>
                    <button class="epub-hl-btn del-hl-btn" data-id="${hl.id}" style="font-size: 0.72rem; color: #f43f5e; padding: 2px 6px;">🗑️ Delete</button>
                  </div>
                </div>
              </div>
            `;
          });
        }

        html += `</div></div>`;
        drawer.innerHTML = html;
        if (window.lucide) window.lucide.createIcons();

        const closeDrawer = drawer.querySelector("#close-drawer-btn");
        if (closeDrawer) closeDrawer.addEventListener("click", () => drawer.remove());

        drawer.querySelectorAll(".make-quote-btn").forEach(btn => {
          btn.addEventListener("click", () => {
            const hl = savedHighlights.find(h => h.id === btn.dataset.id);
            if (hl) createQuoteCard(hl.text);
          });
        });

        drawer.querySelectorAll(".del-hl-btn").forEach(btn => {
          btn.addEventListener("click", () => {
            savedHighlights = savedHighlights.filter(h => h.id !== btn.dataset.id);
            saveHighlightsToStorage();
            renderDrawerContent();
          });
        });
      };

      renderDrawerContent();
      document.getElementById("epub-reader-modal").appendChild(drawer);
      drawer.addEventListener("click", (e) => {
        if (e.target === drawer) drawer.remove();
      });
    });
  }

  // Bulletproof Word & Phrase Selection Delegate
  const readerModal = document.getElementById("epub-reader-modal");
  let lastLookupTime = 0;

  const handleTextLookupTrigger = (e) => {
    const sel = window.getSelection();
    const selText = sel ? sel.toString().trim() : "";

    let word = selText;
    let targetNode = e.target;

    if (!word && e.target) {
      if (e.target.classList && e.target.classList.contains("epub-w")) {
        word = e.target.textContent.trim();
        targetNode = e.target;
      } else if (e.target.closest && e.target.closest("p")) {
        const targetP = e.target.closest("p");
        word = targetP ? targetP.textContent.trim().split(/\s+/)[0] : "";
        targetNode = targetP;
      }
    }

    if (!word || word.length < 2) return;

    // Clean word / phrase punctuation
    const cleanWord = word.replace(/^[^\w\u00C0-\u024F]+|[^\w\u00C0-\u024F]+$/g, "");
    if (!cleanWord || cleanWord.length < 2) return;

    const wordCount = cleanWord.split(/\s+/).length;

    if (wordCount <= 6) {
      lastLookupTime = Date.now();
      showWordLookup(cleanWord, e.clientX || 120, e.clientY || 120, targetNode);
    } else {
      if (sel && sel.rangeCount > 0) {
        showSelectionToolbar(selText, sel.getRangeAt(0));
      }
    }
  };

  if (readerModal) {
    readerModal.addEventListener("dblclick", (e) => {
      if (e.target.closest("#epub-render-stage")) {
        handleTextLookupTrigger(e);
      }
    });

    readerModal.addEventListener("mouseup", (e) => {
      const sel = window.getSelection();
      const selText = sel ? sel.toString().trim() : "";
      if (selText && selText.length >= 2 && e.target.closest("#epub-render-stage")) {
        handleTextLookupTrigger(e);
      }
    });
  }

  const handleGlobalClickToClose = (e) => {
    const card = document.getElementById("epub-lookup-card");
    if (card && !card.contains(e.target) && (Date.now() - lastLookupTime > 250)) {
      closeLookupCard();
    }
  };
  document.addEventListener("mousedown", handleGlobalClickToClose);

  let syncAnimFrameId = null;
  const continuousSyncLoop = () => {
    try {
      syncDockUI();
    } catch (e) {
      console.warn("[Aura EPUB] Sync loop error:", e);
    }
    syncAnimFrameId = requestAnimationFrame(continuousSyncLoop);
  };
  syncAnimFrameId = requestAnimationFrame(continuousSyncLoop);

  const handleAudioEvent = () => {
    try {
      syncDockUI();
    } catch (e) {}
  };

  if (player.audio) {
    player.audio.addEventListener("timeupdate", handleAudioEvent);
    player.audio.addEventListener("play", handleAudioEvent);
    player.audio.addEventListener("pause", handleAudioEvent);
    player.audio.addEventListener("seeked", handleAudioEvent);
  }

  // When the audio track (chapter) changes, update the EPUB view to reflect offset
  const handleTrackChange = () => {
    try {
      if (player.currentBook && String(player.currentBook.id) === String(activeBook.id)) {
        const audioIdx = player.currentChapterIndex || 0;
        const newEpubIdx = Math.max(0, Math.min(activeChaptersList.length - 1, audioIdx + chapterOffset));
        console.debug('[EPUB] track-change -> audioIdx', audioIdx, 'chapterOffset', chapterOffset, 'newEpubIdx', newEpubIdx);
        // Render requested chapter and temporarily suppress auto-switches from alignment
        suppressChapterAutoSwitch = true;
        if (suppressClearTimer) clearTimeout(suppressClearTimer);
        try { renderChapterView(newEpubIdx); } catch (e) { console.warn('[EPUB] renderChapterView failed in track-change', e); }
        suppressClearTimer = setTimeout(() => { suppressChapterAutoSwitch = false; suppressClearTimer = null; }, 400);
        // force a paragraph sync to update highlights/margin bar immediately
        try { updateParagraphSync(true); } catch (e) {}
      }
    } catch (e) {}
  };

  window.addEventListener("audiobook-play-state-change", syncDockUI);
  window.addEventListener("audiobook-track-change", syncDockUI);
  window.addEventListener("audiobook-track-change", handleTrackChange);

  overlay.cleanupListeners = () => {
    if (animFrameId) cancelAnimationFrame(animFrameId);
    if (cardAnimFrameId) cancelAnimationFrame(cardAnimFrameId);
    if (syncAnimFrameId) cancelAnimationFrame(syncAnimFrameId);
    document.removeEventListener("mousedown", handleGlobalClickToClose);
    window.removeEventListener("pointerup", handleGlobalPointerRelease);
    window.removeEventListener("mouseup", handleGlobalPointerRelease);
    window.removeEventListener("touchend", handleGlobalPointerRelease);
    window.removeEventListener("audiobook-play-state-change", syncDockUI);
    window.removeEventListener("audiobook-track-change", syncDockUI);
    window.removeEventListener("audiobook-track-change", handleTrackChange);
    if (player.audio) {
      player.audio.removeEventListener("timeupdate", handleAudioEvent);
      player.audio.removeEventListener("play", handleAudioEvent);
      player.audio.removeEventListener("pause", handleAudioEvent);
      player.audio.removeEventListener("seeked", handleAudioEvent);
    }
  };
}

export function closeEpubReader() {
  const existing = document.getElementById("epub-reader-modal");
  if (existing) {
    if (existing.cleanupListeners) existing.cleanupListeners();
    existing.remove();
  }
}
