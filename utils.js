/**
 * utils.js - Shared utilities for performance optimization
 * Cache, lazy loading, and common functions
 */

(function () {
// DOM Element Cache
class DOMCache {
  constructor() {
    this.cache = new Map();
  }

  get(id) {
    if (!this.cache.has(id)) {
      this.cache.set(id, document.getElementById(id));
    }
    return this.cache.get(id);
  }

  clear() {
    this.cache.clear();
  }

  // Bulk get for multiple elements
  getBulk(ids) {
    return ids.reduce((acc, id) => {
      acc[id] = this.get(id);
      return acc;
    }, {});
  }
}

// Global cache instance
const domCache = new DOMCache();

// Fast element retrieval
const $ = (id) => domCache.get(id);
const $$ = (ids) => domCache.getBulk(ids);

// Safe event listener wrapper
function addEventListener(elementId, event, handler) {
  const element = $(elementId);
  if (element) element.addEventListener(event, handler);
}

// Safe element manipulation
function setElementValue(elementId, value) {
  const element = $(elementId);
  if (element) element.value = value;
}

function getElementValue(elementId) {
  const element = $(elementId);
  return element ? element.value : "";
}

function setElementText(elementId, text) {
  const element = $(elementId);
  if (element) element.textContent = text;
}

function setElementHTML(elementId, html) {
  const element = $(elementId);
  if (element) element.innerHTML = html;
}

function addElementClass(elementId, className) {
  const element = $(elementId);
  if (element) element.classList.add(className);
}

function removeElementClass(elementId, className) {
  const element = $(elementId);
  if (element) element.classList.remove(className);
}

function toggleElementClass(elementId, className) {
  const element = $(elementId);
  if (element) element.classList.toggle(className);
}

function hasElementClass(elementId, className) {
  const element = $(elementId);
  return element ? element.classList.contains(className) : false;
}

// API call with error handling
async function apiCall(url, options = {}) {
  try {
    const response = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
      ...options,
    });

    if (!response.ok) throw new Error(`API error: ${response.status}`);
    return await response.json();
  } catch (error) {
    throw new Error(`API call failed: ${error.message}`);
  }
}

// POST helper
async function apiPost(url, data) {
  return apiCall(url, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// GET helper
async function apiGet(url) {
  return apiCall(url, { method: "GET" });
}

// PUT helper
async function apiPut(url, data) {
  return apiCall(url, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

// DELETE helper
async function apiDelete(url) {
  return apiCall(url, { method: "DELETE" });
}

// Debounce function for input handling
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Throttle function for scroll/resize
function throttle(func, limit) {
  let inThrottle;
  return function (...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

// Format currency
function formatCurrency(value, currency = "EUR") {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: currency,
  }).format(value);
}

// Format date
function formatDate(date, locale = "it-IT") {
  return new Date(date).toLocaleDateString(locale);
}

// Validate email
function isValidEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

// Validate phone
function isValidPhone(phone) {
  const re = /^[+]?[0-9\s-()]{10,}$/;
  return re.test(phone);
}

// Safe JSON parse
function safeJSONParse(jsonString, defaultValue = null) {
  try {
    return JSON.parse(jsonString);
  } catch {
    return defaultValue;
  }
}

// Safe JSON stringify
function safeJSONStringify(obj, defaultValue = "{}") {
  try {
    return JSON.stringify(obj);
  } catch {
    return defaultValue;
  }
}

// Get value from local storage
function getFromStorage(key, defaultValue = null) {
  try {
    const item = localStorage.getItem(key);
    return item ? safeJSONParse(item, defaultValue) : defaultValue;
  } catch {
    return defaultValue;
  }
}

// Save value to local storage
function saveToStorage(key, value) {
  try {
    localStorage.setItem(key, safeJSONStringify(value));
  } catch {
    // Storage full or disabled
  }
}

// Remove from local storage
function removeFromStorage(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Storage disabled
  }
}

// Show notification (minimal)
function showNotification(message, type = "info", duration = 3000) {
  const notificationId = `notification-${Date.now()}`;
  const notification = document.createElement("div");
  notification.id = notificationId;
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 1rem;
    background: var(--${type === "error" ? "danger" : type === "success" ? "success" : "primary"});
    color: white;
    border-radius: 8px;
    z-index: 9999;
    animation: slideIn 0.3s ease;
  `;
  document.body.appendChild(notification);
  setTimeout(() => notification.remove(), duration);
}

// Lazy load images
function lazyLoadImages() {
  if ("IntersectionObserver" in window) {
    const imageObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const img = entry.target;
          img.src = img.dataset.src;
          img.classList.remove("lazy");
          imageObserver.unobserve(img);
        }
      });
    });

    document.querySelectorAll("img.lazy").forEach((img) => {
      imageObserver.observe(img);
    });
  }
}

// Ready promise - waits for DOM ready
const ready = new Promise((resolve) => {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", resolve);
  } else {
    resolve();
  }
});

// Make functions available globally for browser use
window.domCache = domCache;
window.setElementValue = setElementValue;
window.getElementValue = getElementValue;
window.setElementText = setElementText;
window.setElementHTML = setElementHTML;
window.addElementClass = addElementClass;
window.removeElementClass = removeElementClass;
window.toggleElementClass = toggleElementClass;
window.hasElementClass = hasElementClass;
window.apiCall = apiCall;
window.apiPost = apiPost;
window.apiGet = apiGet;
window.apiPut = apiPut;
window.apiDelete = apiDelete;
window.debounce = debounce;
window.throttle = throttle;
window.formatCurrency = formatCurrency;
window.formatDate = formatDate;
window.isValidEmail = isValidEmail;
window.isValidPhone = isValidPhone;
window.safeJSONParse = safeJSONParse;
window.safeJSONStringify = safeJSONStringify;
window.getFromStorage = getFromStorage;
window.saveToStorage = saveToStorage;
window.removeFromStorage = removeFromStorage;
window.showNotification = showNotification;
window.lazyLoadImages = lazyLoadImages;
window.ready = ready;

// Export for Node.js/CommonJS if available
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    domCache,
    $,
    $$,
    addEventListener,
    setElementValue,
    getElementValue,
    setElementText,
    setElementHTML,
    addElementClass,
    removeElementClass,
    toggleElementClass,
    hasElementClass,
    apiCall,
    apiPost,
    apiGet,
    apiPut,
    apiDelete,
    debounce,
    throttle,
    formatCurrency,
    formatDate,
    isValidEmail,
    isValidPhone,
    safeJSONParse,
    safeJSONStringify,
    getFromStorage,
    saveToStorage,
    removeFromStorage,
    showNotification,
    lazyLoadImages,
    ready,
  };
}
})();
