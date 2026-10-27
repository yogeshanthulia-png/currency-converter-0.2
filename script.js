let exchangeChart = null;
let latestRequestId = 0;
let graphRequestId = 0;

const CURRENCY_OPTIONS = {
  USD: "USD - US Dollar",
  EUR: "EUR - Euro",
  GBP: "GBP - British Pound",
  INR: "INR - Indian Rupee",
  JPY: "JPY - Japanese Yen",
  AUD: "AUD - Australian Dollar",
  CAD: "CAD - Canadian Dollar",
  AED: "AED - UAE Dirham",
  CNY: "CNY - Chinese Yuan",
  PKR: "PKR - Pakistani Rupee",
  SGD: "SGD - Singapore Dollar",
  CHF: "CHF - Swiss Franc",
  SEK: "SEK - Swedish Krona",
  NZD: "NZD - New Zealand Dollar",
  SAR: "SAR - Saudi Riyal"
};

function safeText(selector, text) {
  const el = document.querySelector(selector);
  if (el) el.textContent = text;
}

function applyTheme(theme) {
  const root = document.body;
  const isDark = theme === "dark";
  root.dataset.theme = isDark ? "dark" : "light";
  const toggle = document.getElementById("theme-toggle");
  if (toggle) {
    toggle.textContent = isDark ? "☀️" : "🌙";
    toggle.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
  }
  localStorage.setItem("currency-theme", theme);
}

function showConverter(isLoggedIn) {
  const loginScreen = document.getElementById("login");
  const converterScreen = document.getElementById("converter-screen");
  const appNav = document.getElementById("app-nav");
  const logoutButton = document.getElementById("logout-btn");

  loginScreen.hidden = isLoggedIn;
  converterScreen.hidden = !isLoggedIn;
  appNav.hidden = !isLoggedIn;
  logoutButton.hidden = !isLoggedIn;

  if (isLoggedIn) {
    convertCurrency();
    loadRateGraph();
  } else {
    window.location.hash = "";
    document.getElementById("login-identity")?.focus();
  }
}

async function convertCurrency() {
  const amountField = document.getElementById("amount");
  const result = document.getElementById("result");

  if (!amountField || !result) return;

  const amount = Number(amountField.value);
  const from = document.getElementById("from")?.value || "USD";
  const to = document.getElementById("to")?.value || "INR";

  if (amountField.value.trim() === "" || !Number.isFinite(amount) || amount <= 0) {
    result.innerHTML = "<p>Conversion Result</p><h2>Please enter a valid amount.</h2><span>Use a positive number greater than zero.</span>";
    return;
  }

  const requestId = ++latestRequestId;
  result.innerHTML = "<p>Conversion Result</p><h2>Converting...</h2><span>Fetching latest exchange rate...</span>";

  try {
    let rate = 1;

    if (from !== to) {
      const response = await fetch(`https://open.er-api.com/v6/latest/${encodeURIComponent(from)}`);

      if (!response.ok) throw new Error("Unable to fetch exchange rates.");

      const data = await response.json();

      if (data.result !== "success" || !Number.isFinite(data.rates?.[to])) {
        throw new Error("Exchange rate is unavailable for this pair.");
      }

      rate = data.rates[to];
    }

    if (requestId !== latestRequestId) return;

    const converted = amount * rate;

    result.innerHTML = `
      <p>Conversion Result</p>
      <h2>${amount.toLocaleString()} ${from} = ${converted.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${to}</h2>
      <span>Exchange Rate: 1 ${from} = ${rate.toFixed(4)} ${to}</span>
    `;
  } catch (error) {
    if (requestId === latestRequestId) {
      result.innerHTML = `
        <p>Conversion Result</p>
        <h2>Conversion failed</h2>
        <span>${error.message || "Something went wrong while converting."}</span>
      `;
    }
  }
}

function swapCurrency() {
  const from = document.getElementById("from");
  const to = document.getElementById("to");

  if (!from || !to) return;

  [from.value, to.value] = [to.value, from.value];
  convertCurrency();
  loadRateGraph();
}

async function loadRateGraph() {
  const from = document.getElementById("from")?.value || "USD";
  const to = document.getElementById("to")?.value || "INR";
  const days = Number(document.getElementById("graph-period")?.value || 30);
  const status = document.getElementById("graph-status");
  const current = document.getElementById("graph-current");
  const pair = document.getElementById("graph-pair");
  const canvas = document.getElementById("exchangeChart");

  if (!status || !current || !pair || !canvas) return;

  const requestId = ++graphRequestId;

  pair.textContent = `${from} / ${to}`;
  status.textContent = "Fetching historical exchange rates...";
  current.textContent = "Loading...";

  if (exchangeChart) {
    exchangeChart.destroy();
    exchangeChart = null;
  }

  if (from === to) {
    current.textContent = `1 ${from} = 1.0000 ${to}`;
    status.textContent = "Both currencies are the same.";

    if (typeof Chart !== "undefined") {
      exchangeChart = new Chart(canvas, {
        type: "line",
        data: {
          labels: ["Today"],
          datasets: [{
            label: `${from} to ${to}`,
            data: [1],
            borderColor: "#22c55e",
            backgroundColor: "rgba(34,197,94,0.12)",
            fill: true,
            tension: 0.3
          }]
        },
        options: graphChartOptions(to)
      });
    }
    return;
  }

  try {
    if (typeof Chart === "undefined") {
      throw new Error("Chart.js is not loaded.");
    }

    const end = new Date();
    const start = new Date();
    start.setUTCDate(start.getUTCDate() - days);

    const formatDate = (date) => date.toISOString().slice(0, 10);
    const url = `https://api.frankfurter.dev/v1/${formatDate(start)}..${formatDate(end)}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;

    const response = await fetch(url);
    if (!response.ok) throw new Error("Historical rates could not be loaded.");

    const data = await response.json();
    if (requestId !== graphRequestId) return;

    const dates = Object.keys(data.rates || {}).sort();
    const values = dates.map((date) => Number(data.rates[date]?.[to]));

    if (!dates.length || values.some((value) => !Number.isFinite(value))) {
      throw new Error("No historical rates available for this currency pair.");
    }

    const latestValue = values[values.length - 1];
    current.textContent = `1 ${from} = ${latestValue.toFixed(4)} ${to}`;
    status.textContent = `Latest available rate: ${dates[dates.length - 1]}`;

    exchangeChart = new Chart(canvas, {
      type: "line",
      data: {
        labels: dates,
        datasets: [{
          label: `${from} to ${to}`,
          data: values,
          borderColor: "#22c55e",
          backgroundColor: "rgba(34,197,94,0.12)",
          fill: true,
          tension: 0.3,
          borderWidth: 2,
          pointRadius: dates.length > 35 ? 0 : 2
        }]
      },
      options: graphChartOptions(to)
    });
  } catch (error) {
    if (requestId !== graphRequestId) return;
    current.textContent = "Rate unavailable";
    status.textContent = error.message || "Could not load graph.";
  }
}

function graphChartOptions(currency) {
  const isLight = document.body.dataset.theme === "light";
  const textColor = isLight ? "#475569" : "#e5e7eb";
  const tickColor = isLight ? "#64748b" : "#94a3b8";
  const gridColor = isLight ? "rgba(100,116,139,0.15)" : "rgba(148,163,184,0.12)";

  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { intersect: false, mode: "index" },
    plugins: {
      legend: { labels: { color: textColor } },
      tooltip: {
        callbacks: {
          label: (context) => `${context.parsed.y.toFixed(4)} ${currency}`
        }
      }
    },
    scales: {
      x: {
        ticks: { color: tickColor, maxTicksLimit: 7 },
        grid: { color: gridColor }
      },
      y: {
        ticks: { color: tickColor },
        grid: { color: gridColor }
      }
    }
  };
}

document.addEventListener("DOMContentLoaded", () => {
  const from = document.getElementById("from");
  const to = document.getElementById("to");
  const graphPeriod = document.getElementById("graph-period");
  const convertBtn = document.getElementById("convert-btn");
  const swapBtn = document.getElementById("swap-btn");
  const amountField = document.getElementById("amount");
  const themeToggle = document.getElementById("theme-toggle");
  const loginForm = document.getElementById("login-form");
  const resetForm = document.getElementById("reset-form");
  const loginMessage = document.getElementById("login-message");
  const resetMessage = document.getElementById("reset-message");
  const logoutButton = document.getElementById("logout-btn");

  const savedTheme = localStorage.getItem("currency-theme") || "dark";
  applyTheme(savedTheme);
  const isLoggedIn = sessionStorage.getItem("ratewise-demo-session") === "active";
  showConverter(isLoggedIn);

  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      const nextTheme = document.body.dataset.theme === "dark" ? "light" : "dark";
      applyTheme(nextTheme);
      if (!document.getElementById("converter-screen").hidden) loadRateGraph();
    });
  }

  if (amountField) amountField.addEventListener("input", convertCurrency);
  if (from) from.addEventListener("change", () => { convertCurrency(); loadRateGraph(); });
  if (to) to.addEventListener("change", () => { convertCurrency(); loadRateGraph(); });
  if (graphPeriod) graphPeriod.addEventListener("change", loadRateGraph);
  if (convertBtn) convertBtn.addEventListener("click", convertCurrency);
  if (swapBtn) swapBtn.addEventListener("click", swapCurrency);

  document.querySelectorAll(".main-nav a").forEach((link) => {
    link.addEventListener("click", () => {
      document.querySelectorAll(".main-nav a").forEach((item) => item.classList.remove("active"));
      if (link.classList.contains("nav-link")) link.classList.add("active");
    });
  });

  const forgotPasswordLink = document.getElementById("forgot-password-link");
  const backToLogin = document.getElementById("back-to-login");
  if (forgotPasswordLink && loginForm && resetForm) {
    forgotPasswordLink.addEventListener("click", () => {
      loginForm.hidden = true;
      resetForm.hidden = false;
      resetMessage.textContent = "";
      document.getElementById("reset-identity")?.focus();
    });
  }
  if (backToLogin && loginForm && resetForm) {
    backToLogin.addEventListener("click", () => {
      resetForm.hidden = true;
      loginForm.hidden = false;
      loginMessage.textContent = "";
      document.getElementById("login-identity")?.focus();
    });
  }

  const isEmailOrPhone = (value) => {
    const trimmed = value.trim();
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phonePattern = /^\+?[\d\s().-]{7,20}$/;
    return emailPattern.test(trimmed) || phonePattern.test(trimmed);
  };

  if (loginForm) {
    loginForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const identity = document.getElementById("login-identity").value;
      const password = document.getElementById("login-password").value;

      if (!isEmailOrPhone(identity)) {
        loginMessage.textContent = "Enter a valid email address or phone number.";
        return;
      }
      if (!password) {
        loginMessage.textContent = "Enter your password.";
        return;
      }

      sessionStorage.setItem("ratewise-demo-session", "active");
      loginMessage.textContent = "Opening the currency converter...";
      showConverter(true);
    });
  }

  if (logoutButton) {
    logoutButton.addEventListener("click", () => {
      sessionStorage.removeItem("ratewise-demo-session");
      if (exchangeChart) {
        exchangeChart.destroy();
        exchangeChart = null;
      }
      showConverter(false);
    });
  }

  if (resetForm) {
    resetForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const identity = document.getElementById("reset-identity").value;

      if (!isEmailOrPhone(identity)) {
        resetMessage.textContent = "Enter a valid email address or phone number.";
        return;
      }

      resetMessage.textContent = "Password reset is not available until a secure account service is connected.";
    });
  }

});
