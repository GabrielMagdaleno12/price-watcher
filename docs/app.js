const OWNER = "GabrielMagdaleno12";
const REPO = "price-watcher";
const ITEMS_PATH = "docs/data/items.json";

let itemsCache = [];
let historyCache = {};
let chartInstance = null;

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

    // item.name/item.url come from data that a later task will let users
    // edit, so build this DOM with textContent/property assignment rather
    // than innerHTML string interpolation - no field can inject markup.
    const link = document.createElement("a");
    link.href = item.url;
    link.target = "_blank";
    link.rel = "noopener";
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
    li.appendChild(info);
    list.appendChild(li);
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

function renderChart(url) {
  const canvas = document.getElementById("price-chart");
  const emptyMsg = document.getElementById("chart-empty");
  const points = historyCache[url] || [];

  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }

  if (points.length === 0) {
    canvas.hidden = true;
    emptyMsg.hidden = false;
    return;
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

async function init() {
  await loadData();
  renderItems();
  populateItemSelect();
  if (itemsCache.length > 0) {
    renderChart(itemsCache[0].url);
  }
  document.getElementById("item-select").addEventListener("change", (e) => {
    renderChart(e.target.value);
  });

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
}

init();
