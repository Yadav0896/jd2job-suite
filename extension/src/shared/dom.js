// Shared DOM helpers for content scripts
/* global wait */
/* exported waitForElement, querySelectorAllStable, waitForAnyText, findButtonByText, clickWhenVisible, fillInput, waitForStableDOM, isVisible */

async function waitForElement(selectors, timeout = 10000) {
  const selectorList = Array.isArray(selectors) ? selectors : [selectors];
  const start = Date.now();

  while (Date.now() - start < timeout) {
    for (const selector of selectorList) {
      const el = document.querySelector(selector);
      if (el && el.offsetParent !== null) return el;
    }
    await wait(300);
  }
  return null;
}

async function waitForAnyText(texts, context = document, timeout = 10000) {
  const textList = Array.isArray(texts) ? texts : [texts];
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const buttons = context.querySelectorAll('button, [role="button"], a, span');
    for (const btn of buttons) {
      const txt = (btn.textContent || '').trim();
      if (textList.some(t => txt.includes(t)) && btn.offsetParent !== null) {
        return btn;
      }
    }
    await wait(300);
  }
  return null;
}

// Find button by exact text matching or partial aria-label matches
function findButtonByText(texts, context = document) {
  const textList = Array.isArray(texts) ? texts : [texts];

  // Method 1: direct button/role text match
  const buttons = context.querySelectorAll('button, [role="button"]');
  for (const btn of buttons) {
    const txt = btn.textContent.trim();
    for (const target of textList) {
      if (txt === target && btn.offsetParent !== null) return btn;
    }
  }

  // Method 2: span text inside button
  const spans = context.querySelectorAll('span');
  for (const span of spans) {
    const txt = span.textContent.trim();
    for (const target of textList) {
      if (txt === target) {
        const clickable = span.closest('button, [role="button"]') || span;
        if (clickable.offsetParent !== null) return clickable;
      }
    }
  }

  // Method 3: aria-label
  for (const target of textList) {
    const aria = context.querySelector(`button[aria-label*="${target}"], [role="button"][aria-label*="${target}"]`);
    if (aria && aria.offsetParent !== null) return aria;
  }

  return null;
}

async function clickWhenVisible(element, delay = 500) {
  if (!element) return false;
  element.scrollIntoView({ block: 'center', behavior: 'smooth' });
  await wait(delay);
  element.click();
  return true;
}

async function fillInput(input, value) {
  if (!input || value === undefined || value === null) return false;
  input.focus();
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.blur();
  await wait(100);
  return true;
}

function isVisible(el) {
  return el && el.offsetParent !== null;
}

// Wait for DOM to settle (no mutations for ms)
async function waitForStableDOM(ms = 1000) {
  return new Promise(resolve => {
    let timer;
    const observer = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        observer.disconnect();
        resolve();
      }, ms);
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    timer = setTimeout(() => { observer.disconnect(); resolve(); }, ms);
  });
}

// Query selector with stability wait
async function querySelectorAllStable(selector, timeout = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const els = document.querySelectorAll(selector);
    if (els.length > 0) return [...els];
    await wait(300);
  }
  return [];
}
