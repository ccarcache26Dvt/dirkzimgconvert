let images = [];
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
      const urls = new Set();

      // <img> tags
      document.querySelectorAll("img").forEach((img) => {
        const src = img.currentSrc || img.src;
        if (src && /^https?:\/\//i.test(src)) {
          urls.add(JSON.stringify({
            url: src,
            w: img.naturalWidth || img.width || 0,
            h: img.naturalHeight || img.height || 0,
          }));
        }
        // srcset (highest)
        if (img.srcset) {
          const parts = img.srcset.split(",").map(s => s.trim().split(/\s+/)[0]).filter(Boolean);
          parts.forEach(u => {
            if (/^https?:\/\//i.test(u)) {
              urls.add(JSON.stringify({ url: u, w: img.naturalWidth || 0, h: img.naturalHeight || 0 }));
            }
          });
        }
      });

      // background-image
      document.querySelectorAll("*").forEach((el) => {
        const bg = getComputedStyle(el).backgroundImage;
        if (bg && bg !== "none") {
          const matches = bg.match(/url\(["']?(https?:[^"')]+)["']?\)/g) || [];
          matches.forEach(m => {
            const u = m.replace(/^url\(["']?/, "").replace(/["']?\)$/, "");
            urls.add(JSON.stringify({ url: u, w: el.clientWidth, h: el.clientHeight }));
          });
        }
      });

      // <source> in <picture>
      document.querySelectorAll("source[srcset]").forEach((s) => {
        s.srcset.split(",").map(x => x.trim().split(/\s+/)[0]).forEach(u => {
          if (/^https?:\/\//i.test(u)) urls.add(JSON.stringify({ url: u, w: 0, h: 0 }));
        });
      });

      // <a href="...jpg|png|...">
      document.querySelectorAll("a[href]").forEach((a) => {
        if (/\.(jpe?g|png|webp|gif|bmp|tiff?|heic|avif)(\?|$)/i.test(a.href)) {
          urls.add(JSON.stringify({ url: a.href, w: 0, h: 0 }));
        }
      });

      return Array.from(urls).map(s => JSON.parse(s));
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
    images = result || [];
    selected = new Set();
    render();
  } catch (e) {
    stats.textContent = "Error: " + e.message;
    grid.innerHTML = '<div class="empty">No se pudo escanear esta página.</div>';
  }
}

function filtered() {
  const minW = parseInt($("minW").value) || 0;
  const minH = parseInt($("minH").value) || 0;
  return images.filter(im => (im.w === 0 && im.h === 0) || (im.w >= minW && im.h >= minH));
}

function render() {
  const list = filtered();
  stats.innerHTML = `<strong>${list.length}</strong> imágenes · <strong>${selected.size}</strong> seleccionadas`;
  if (list.length === 0) {
    grid.innerHTML = '<div class="empty">No se encontraron imágenes que cumplan el filtro.</div>';
    return;
  }
  grid.innerHTML = "";
  list.forEach((im) => {
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
  const urls = Array.from(selected);
  if (urls.length === 0) {
    alert("Selecciona al menos una imagen.");
    return;
  }
  for (let i = 0; i < urls.length; i++) {
    try {
      await chrome.downloads.download({
        url: urls[i],
        filename: `gallery-extractor/${filenameFromUrl(urls[i], i)}`,
        conflictAction: "uniquify",
      });
    } catch (e) {
      console.error("Falló descarga:", urls[i], e);
    }
  }
}

$("scan").addEventListener("click", () => scan(false));
$("scrollScan").addEventListener("click", () => scan(true));
$("selectAll").addEventListener("click", () => {
  const list = filtered();
  if (selected.size === list.length) selected.clear();
  else list.forEach(im => selected.add(im.url));
  render();
});
$("download").addEventListener("click", downloadSelected);
$("minW").addEventListener("change", render);
$("minH").addEventListener("change", render);
