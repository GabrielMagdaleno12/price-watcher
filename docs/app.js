const OWNER = "GabrielMagdaleno12";
const REPO = "price-watcher";
const ITEMS_PATH = "docs/data/items.json";

let itemsCache = [];
let historyCache = {};
let chartInstance = null;

// Only http(s) URLs are safe to use as an anchor href or to submit as a new
// item's url - a javascript: URI would execute page-origin script (able to
// read the GitHub PAT from localStorage) if a user ever clicked the link.
function isHttpUrl(url) {
  return /^https?:\/\//i.test(url);
}

async function loadData() {
  const [itemsRes, historyRes] = await Promise.all([
    fetch("data/items.json", { cache: "no-store" }),
    fetch("data/history.json", { cache: "no-store" }),
  ]);
  itemsCache = itemsRes.ok ? await itemsRes.json() : [];
  historyCache = historyRes.ok ? await historyRes.json() : {};
}

function lastPoint(url) {
  const points = historyCache[url];
  return points && points.length ? points[points.length - 1] : null;
}

function renderItems() {
  const list = document.getElementById("items-list");
  list.innerHTML = "";
  itemsCache.forEach((item) => {
    const last = lastPoint(item.url);

    const price = last ? `R$ ${last.price.toFixed(2)}` : "sem checagem ainda";
    const target = item.target_price != null ? `R$ ${item.target_price.toFixed(2)}` : "qualquer queda";
    const checkedAt = last ? new Date(last.checked_at).toLocaleString("pt-BR") : "-";

    const li = document.createElement("li");
    li.className = "item-card";

    const info = document.createElement("div");
    info.className = "item-info";

    // item.name/item.url are user-supplied via the add-item form below, so
    // build this DOM with textContent/property assignment rather than
    // innerHTML string interpolation - no field can inject markup.
    const link = document.createElement("a");
    // Defensively re-check the scheme even though addItem() now validates it
    // before submitting - this protects against data that predates that
    // validation or was hand-edited into docs/data/items.json. A non-http(s)
    // url renders as plain, non-clickable text (no href set).
    if (isHttpUrl(item.url)) {
      link.href = item.url;
      link.target = "_blank";
      link.rel = "noopener";
    }
    link.textContent = item.name;

    const priceEl = document.createElement("span");
    priceEl.className = "price";
    priceEl.textContent = price;

    const targetEl = document.createElement("span");
    targetEl.className = "target";
    targetEl.textContent = `alvo: ${target}`;

    const checkedAtEl = document.createElement("span");
    checkedAtEl.className = "checked-at";
    checkedAtEl.textContent = `checado em: ${checkedAt}`;

    info.append(link, priceEl, targetEl, checkedAtEl);

    // Same rationale as above: item.url is user-supplied, so set it via
    // .dataset rather than interpolating into an HTML string.
    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-btn";
    removeBtn.dataset.url = item.url;
    removeBtn.textContent = "remover";

    li.append(info, removeBtn);
    list.appendChild(li);
  });

  list.querySelectorAll(".remove-btn").forEach((btn) => {
    btn.addEventListener("click", () => removeItem(btn.dataset.url));
  });
}

function populateItemSelect() {
  const select = document.getElementById("item-select");
  select.innerHTML = "";
  itemsCache.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.url;
    option.textContent = item.name;
    select.appendChild(option);
  });
}

// Chart color tokens, from the dataviz skill's validated default palette
// (categorical slot 1 / "blue" - references/palette.md). This chart only ever
// shows one series at a time (the item picked in the selector), so it uses the
// single-hue line spec rather than a multi-series categorical set.
function getChartTheme() {
  const isDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  return isDark
    ? {
        line: "#3987e5",
        fill: "rgba(57, 135, 229, 0.10)",
        pointRing: "#1e293b", // matches --card-bg (dark) so point rings sit on the card surface
        grid: "#2c2c2a",
        axis: "#898781",
      }
    : {
        line: "#2a78d6",
        fill: "rgba(42, 120, 214, 0.10)",
        pointRing: "#ffffff", // matches --card-bg (light)
        grid: "#e1e0d9",
        axis: "#898781",
      };
}

function formatBRL(value) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Single source of truth for the "nothing to chart" UI state: destroys any
// live Chart.js instance, hides the canvas, and shows the empty-state
// message. Used both when a selected item has no history points yet
// (renderChart) and when the last remaining item is removed (removeItem).
function clearChart() {
  const canvas = document.getElementById("price-chart");
  const emptyMsg = document.getElementById("chart-empty");
  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }
  canvas.hidden = true;
  emptyMsg.hidden = false;
}

function renderChart(url) {
  const canvas = document.getElementById("price-chart");
  const emptyMsg = document.getElementById("chart-empty");
  const points = historyCache[url] || [];

  if (points.length === 0) {
    clearChart();
    return;
  }

  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }

  canvas.hidden = false;
  emptyMsg.hidden = true;

  const theme = getChartTheme();

  chartInstance = new Chart(canvas, {
    type: "line",
    data: {
      labels: points.map((p) => new Date(p.checked_at).toLocaleString("pt-BR")),
      datasets: [{
        label: "Preço (R$)",
        data: points.map((p) => p.price),
        borderColor: theme.line,
        backgroundColor: theme.fill,
        borderWidth: 2,
        tension: 0,
        fill: true,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointBackgroundColor: theme.line,
        pointBorderColor: theme.pointRing,
        pointBorderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      // A single series names itself via the section heading and item
      // selector, so no legend box is needed (dataviz: legends are for >= 2
      // series; a lone series just restates the title).
      plugins: {
        legend: { display: false },
        tooltip: {
          mode: "index",
          intersect: false,
          displayColors: false,
          callbacks: {
            // Value leads, series name follows (dataviz tooltip convention).
            label: (ctx) => formatBRL(ctx.parsed.y),
          },
        },
      },
      interaction: {
        mode: "index",
        intersect: false,
      },
      scales: {
        x: {
          grid: { color: theme.grid },
          ticks: { color: theme.axis },
        },
        y: {
          beginAtZero: false,
          grid: { color: theme.grid },
          ticks: {
            color: theme.axis,
            callback: (value) => formatBRL(value),
          },
        },
      },
    },
  });
}

const TOKEN_KEY = "pw_github_token";

function getToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

function base64ToUtf8(base64) {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function githubGetItemsFile() {
  const response = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/contents/${ITEMS_PATH}`,
    { headers: { Authorization: `Bearer ${getToken()}` }, cache: "no-store" }
  );
  if (!response.ok) {
    throw new Error(`GitHub API retornou ${response.status} ao ler items.json`);
  }
  const data = await response.json();
  const items = JSON.parse(base64ToUtf8(data.content));
  return { items, sha: data.sha };
}

async function githubPutItemsFile(items, sha, message) {
  const content = utf8ToBase64(JSON.stringify(items, null, 2));
  const response = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/contents/${ITEMS_PATH}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${getToken()}`,
        "Content-Type": "application/json",
      },
      // No `branch` key: let the GitHub API default to the repository's
      // actual default branch, so this keeps working if that branch is ever
      // renamed (hardcoding "main" here previously broke every write, since
      // this repo's default branch is "master").
      body: JSON.stringify({ message, content, sha }),
    }
  );
  if (!response.ok) {
    const error = new Error(`GitHub API retornou ${response.status} ao gravar items.json`);
    error.status = response.status;
    throw error;
  }
}

function setStatus(elementId, text, isError) {
  const el = document.getElementById(elementId);
  el.textContent = text;
  el.classList.toggle("error", Boolean(isError));
}

// Single implementation of the "someone else wrote items.json while I was
// editing" recovery flow (a GitHub Contents API 409): show a friendly
// message on the given status element, then reload from disk and re-render
// so the UI reflects the current remote state. Shared by addItem and
// removeItem's catch blocks.
async function handleConflict(statusElId) {
  setStatus(statusElId, "Algo mudou no repositório enquanto você editava. Recarregando a lista, tente de novo.", true);
  await loadData();
  renderItems();
  populateItemSelect();
}

async function addItem(event) {
  event.preventDefault();
  if (!getToken()) {
    setStatus("add-status", "Cole seu token do GitHub na seção abaixo antes de adicionar.", true);
    return;
  }

  const name = document.getElementById("add-name").value.trim();
  const url = document.getElementById("add-url").value.trim();
  const targetRaw = document.getElementById("add-target").value.trim();
  const target_price = targetRaw === "" ? null : Number(targetRaw);

  if (!isHttpUrl(url)) {
    setStatus("add-status", "A URL precisa começar com http:// ou https://.", true);
    return;
  }

  setStatus("add-status", "Adicionando...", false);
  try {
    const { items, sha } = await githubGetItemsFile();
    items.push({ name, url, target_price });
    await githubPutItemsFile(items, sha, `Add item: ${name}`);
    itemsCache = items;
    renderItems();
    populateItemSelect();
    if (itemsCache.length > 0) {
      renderChart(itemsCache[0].url);
    }
    document.getElementById("add-form").reset();
    setStatus("add-status", "Item adicionado. O gráfico populará após a próxima checagem.", false);
  } catch (err) {
    if (err.status === 409) {
      await handleConflict("add-status");
      return;
    }
    setStatus("add-status", err.message, true);
  }
}

async function removeItem(url) {
  if (!getToken()) {
    setStatus("add-status", "Cole seu token do GitHub na seção abaixo antes de remover.", true);
    return;
  }
  if (!confirm("Remover este item da lista de monitoramento?")) {
    return;
  }

  try {
    const { items, sha } = await githubGetItemsFile();
    const remaining = items.filter((item) => item.url !== url);
    await githubPutItemsFile(remaining, sha, `Remove item: ${url}`);
    itemsCache = remaining;
    renderItems();
    populateItemSelect();
    if (itemsCache.length > 0) {
      renderChart(itemsCache[0].url);
    } else {
      clearChart();
    }
  } catch (err) {
    if (err.status === 409) {
      await handleConflict("add-status");
      return;
    }
    setStatus("add-status", err.message, true);
  }
}

function handleTokenSubmit(event) {
  event.preventDefault();
  const input = document.getElementById("token-input");
  setToken(input.value.trim());
  input.value = "";
  setStatus("token-status", "Token salvo neste navegador.", false);
}

async function init() {
  // Attach all event listeners unconditionally, before loading any data, so
  // the add form / token form / item selector stay usable even if loadData()
  // below throws (network error, malformed JSON, etc). Previously these were
  // only attached after a successful load, which left the whole page inert
  // with no indication anything had gone wrong.
  document.getElementById("item-select").addEventListener("change", (e) => {
    renderChart(e.target.value);
  });
  document.getElementById("add-form").addEventListener("submit", addItem);
  document.getElementById("token-form").addEventListener("submit", handleTokenSubmit);

  // Re-theme the chart if the OS/browser color scheme flips while the page
  // is open (dataviz: dark mode is a selected state re-run against its own
  // ramp, not an automatic filter over the light render).
  if (window.matchMedia) {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      const select = document.getElementById("item-select");
      if (select.value) {
        renderChart(select.value);
      }
    });
  }

  try {
    await loadData();
    renderItems();
    populateItemSelect();
    if (itemsCache.length > 0) {
      renderChart(itemsCache[0].url);
    } else {
      clearChart();
    }
  } catch (err) {
    const list = document.getElementById("items-list");
    list.innerHTML = "";
    const li = document.createElement("li");
    li.textContent = "Erro ao carregar os dados. Recarregue a página.";
    list.appendChild(li);
  }
}

init();
