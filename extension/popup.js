let sections = []; // [{ title, images: [{url,w,h}] }]
let selected = new Set();

const $ = (id) => document.getElementById(id);
const grid = $("grid");
const stats = $("stats");

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function scrapePage(autoScroll) {
  return new Promise((resolve) => {
    const collect = () => {
      const sectionsMap = []; // ordered
      let current = { title: "general", images: [], seen: new Set() };
      sectionsMap.push(current);

      const startSection = (raw) => {
        const title = (raw || "").replace(/\s+/g, " ").trim();
        if (!title) return;
        if (current.images.length === 0 && current.title === "general") {
          current.title = title;
          return;
        }
        if (current.title.toLowerCase() === title.toLowerCase()) return;
        current = { title, images: [], seen: new Set() };
        sectionsMap.push(current);
      };

      const pushUrl = (url, w, h) => {
        if (!url || !/^https?:\/\//i.test(url)) return;
        // dedupe globally so the same image only appears in the first matching section
        if (globalSeen.has(url)) return;
        globalSeen.add(url);
        current.seen.add(url);
        current.images.push({ url, w: w || 0, h: h || 0 });
      };

      const globalSeen = new Set();

      const all = document.body ? document.body.querySelectorAll("*") : [];
      all.forEach((el) => {
        const tag = el.tagName;

        if (/^H[1-4]$/.test(tag)) {
          startSection(el.textContent || "");
          return;
        }

        if (tag === "IMG") {
          const src = el.currentSrc || el.src;
          pushUrl(src, el.naturalWidth || el.width, el.naturalHeight || el.height);
          if (el.srcset) {
            el.srcset.split(",").map((s) => s.trim().split(/\s+/)[0]).forEach((u) => {
              pushUrl(u, el.naturalWidth, el.naturalHeight);
            });
          }
          for (const a of ["data-src", "data-original", "data-lazy-src", "data-hi-res-src"]) {
            const v = el.getAttribute(a);
            if (v) pushUrl(v, el.naturalWidth, el.naturalHeight);
          }
        } else if (tag === "SOURCE" && el.srcset) {
          el.srcset.split(",").map((s) => s.trim().split(/\s+/)[0]).forEach((u) => pushUrl(u, 0, 0));
        } else if (tag === "A" && el.href && /\.(jpe?g|png|webp|gif|bmp|tiff?|heic|avif)(\?|$)/i.test(el.href)) {
          pushUrl(el.href, 0, 0);
        }

        // background-image
        const bg = getComputedStyle(el).backgroundImage;
        if (bg && bg !== "none") {
          const matches = bg.match(/url\(["']?(https?:[^"')]+)["']?\)/g) || [];
          matches.forEach((m) => {
            const u = m.replace(/^url\(["']?/, "").replace(/["']?\)$/, "");
            pushUrl(u, el.clientWidth, el.clientHeight);
          });
        }
      });

      // Strip helper `seen` field; keep title/images
      return sectionsMap
        .filter((s) => s.images.length > 0)
        .map((s) => ({ title: s.title, images: s.images }));
    };

    if (!autoScroll) {
      resolve(collect());
      return;
    }

    // Auto-scroll to trigger lazy loading
    const distance = 400;
    const delay = 250;
    let total = 0;
    const max = document.body.scrollHeight * 2;
    const timer = setInterval(() => {
      window.scrollBy(0, distance);
      total += distance;
      if (total >= max || (window.innerHeight + window.scrollY) >= document.body.scrollHeight) {
        clearInterval(timer);
        setTimeout(() => {
          window.scrollTo(0, 0);
          resolve(collect());
        }, 600);
      }
    }, delay);
  });
}

async function scan(autoScroll) {
  const tab = await getActiveTab();
  if (!tab?.id) return;
  stats.textContent = autoScroll ? "Haciendo scroll y escaneando..." : "Escaneando...";
  grid.innerHTML = '<div class="empty">Cargando...</div>';

  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: scrapePage,
      args: [autoScroll],
    });
    sections = result || [];
    selected = new Set();
    render();
  } catch (e) {
    stats.textContent = "Error: " + e.message;
    grid.innerHTML = '<div class="empty">No se pudo escanear esta página.</div>';
  }
}

function filteredSections() {
  const minW = parseInt($("minW").value) || 0;
  const minH = parseInt($("minH").value) || 0;
  return sections
    .map((s) => ({
      title: s.title,
      images: s.images.filter((im) => (im.w === 0 && im.h === 0) || (im.w >= minW && im.h >= minH)),
    }))
    .filter((s) => s.images.length > 0);
}

function sanitizeFolder(s) {
  const clean = (s || "")
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return clean || "general";
}

function render() {
  const list = filteredSections();
  const total = list.reduce((n, s) => n + s.images.length, 0);
  stats.innerHTML = `<strong>${total}</strong> imágenes en <strong>${list.length}</strong> carpeta(s) · <strong>${selected.size}</strong> seleccionadas`;
  if (list.length === 0) {
    grid.innerHTML = '<div class="empty">No se encontraron imágenes que cumplan el filtro.</div>';
    return;
  }
  grid.innerHTML = "";
  list.forEach((section) => {
    const header = document.createElement("div");
    header.className = "section-head";
    const selCount = section.images.filter((im) => selected.has(im.url)).length;
    header.innerHTML = `<span class="folder">📁 ${section.title}</span><span class="count">${selCount}/${section.images.length}</span>`;
    header.addEventListener("click", () => {
      const allIn = section.images.every((im) => selected.has(im.url));
      if (allIn) section.images.forEach((im) => selected.delete(im.url));
      else section.images.forEach((im) => selected.add(im.url));
      render();
    });
    grid.appendChild(header);

    section.images.forEach((im) => {
      const div = document.createElement("div");
      div.className = "thumb" + (selected.has(im.url) ? " selected" : "");
      div.innerHTML = `<img src="${im.url}" loading="lazy" referrerpolicy="no-referrer"/><div class="check">✓</div>`;
      div.addEventListener("click", () => {
        if (selected.has(im.url)) selected.delete(im.url);
        else selected.add(im.url);
        render();
      });
      grid.appendChild(div);
    });
  });
}

function filenameFromUrl(url, i) {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").pop() || `image-${i}`;
    const clean = last.split("?")[0] || `image-${i}`;
    if (/\.(jpe?g|png|webp|gif|bmp|tiff?|heic|avif)$/i.test(clean)) return clean;
    return `${clean}-${i}.jpg`;
  } catch {
    return `image-${i}.jpg`;
  }
}

async function downloadSelected() {
  if (selected.size === 0) {
    alert("Selecciona al menos una imagen.");
    return;
  }
  const list = filteredSections();
  let i = 0;
  for (const section of list) {
    const folder = sanitizeFolder(section.title);
    for (const im of section.images) {
      if (!selected.has(im.url)) continue;
      try {
        await chrome.downloads.download({
          url: im.url,
          filename: `extracion_img/${folder}/${filenameFromUrl(im.url, i)}`,
          conflictAction: "uniquify",
        });
      } catch (e) {
        console.error("Falló descarga:", im.url, e);
      }
      i++;
    }
  }
}

$("scan").addEventListener("click", () => scan(false));
$("scrollScan").addEventListener("click", () => scan(true));
$("selectAll").addEventListener("click", () => {
  const list = filteredSections();
  const allUrls = list.flatMap((s) => s.images.map((im) => im.url));
  if (selected.size === allUrls.length) selected.clear();
  else allUrls.forEach((u) => selected.add(u));
  render();
});
$("download").addEventListener("click", downloadSelected);
$("minW").addEventListener("change", render);
$("minH").addEventListener("change", render);
