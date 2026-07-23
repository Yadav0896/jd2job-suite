// ULTRA SIMPLE - COPIE EXACTE DU PYTHON
/* global wait */
let isRunning = false;
let config = {};
let appliedCount = 0;
let skippedCount = 0;
let appliedJobs = []; // Liste des jobs appliqués pour export
let skippedJobs = []; // Liste des jobs non-Easy Apply (external, blacklisted, etc.)
let lastActivityTime = Date.now(); // Track last activity for stuck detection
const STUCK_TIMEOUT = 120000; // 2 minutes without activity = stuck

// SECURITY: Ultimate protection flag - bot can ONLY run if user explicitly clicked Start
let userExplicitlyClickedStart = false;

// Resume/CV data for automatic upload
let resumeFile = null; // Base64 data
let resumeFileName = null;
let resumeFileType = null;

let aiTailorResume = false;
let aiResumeText = '';
let currentTailoredPdf = null;
let currentTailoredText = '';
let customQAs = {};

function log(msg) {
  console.log('[LinkedIn Bot]', msg);
  try {
    chrome.runtime.sendMessage({ type: 'log', message: msg });
  } catch (e) {}
}

// Extraire les détails du recruteur / hiring manager
function getHiringTeamDetails() {
  try {
    // 1. Direct selector search
    const hirerCard = document.querySelector('.jobs-poster, .hirer-card, [class*="hirer-card"], [class*="jobs-poster"]');
    if (hirerCard) {
      const nameEl = hirerCard.querySelector('[class*="name"], [class*="title"], strong, h3, a[href*="/in/"]');
      const titleEl = hirerCard.querySelector('[class*="headline"], [class*="sub-title"], [class*="occupation"], [class*="job-title"], p');
      const linkEl = hirerCard.querySelector('a[href*="/in/"]');
      const imgEl = hirerCard.querySelector('img');
      
      let name = nameEl ? nameEl.textContent.replace(/\s+/g, ' ').trim() : '';
      name = name.replace(/\s*-\s*\d+(st|nd|rd|th)$/i, '').trim();
      
      const title = titleEl ? titleEl.textContent.trim() : '';
      const link = linkEl ? linkEl.href : '';
      const avatar = imgEl ? imgEl.src : '';
      
      if (name && name !== 'LinkedIn Member') {
        return { name, title, link, avatar };
      }
    }
    
    // 2. Fallback parent-traversal search starting from the header text
    const headers = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, span, p'));
    const hiringHeader = headers.find(h => {
      const txt = h.textContent.toLowerCase();
      return txt.includes('hiring team') || txt.includes('meet the hiring') || txt.includes('job poster');
    });
    
    if (hiringHeader) {
      let current = hiringHeader;
      for (let i = 0; i < 4; i++) {
        if (!current) break;
        const linkEl = current.querySelector('a[href*="/in/"]');
        if (linkEl) {
          const imgEl = current.querySelector('img');
          const nameEl = linkEl.querySelector('[class*="name"]') || linkEl || current.querySelector('strong, h3');
          
          let name = nameEl ? nameEl.textContent.replace(/\s+/g, ' ').trim() : '';
          name = name.replace(/\s*-\s*\d+(st|nd|rd|th)$/i, '').trim();
          
          const textNodes = Array.from(current.querySelectorAll('span, p, div'))
            .filter(el => el.children.length === 0 && el.textContent.trim().length > 0);
          const headlineNode = textNodes.find(n => {
            const txt = n.textContent.trim();
            return txt !== name && !txt.includes('2nd') && !txt.includes('3rd') && !txt.includes('1st') && !txt.includes('Message');
          });
          
          const title = headlineNode ? headlineNode.textContent.trim() : 'Hiring Team Member';
          const link = linkEl.href;
          const avatar = imgEl ? imgEl.src : '';
          
          if (name && name !== 'LinkedIn Member') {
            return { name, title, link, avatar };
          }
        }
        current = current.parentElement;
      }
    }
  } catch (e) {
    console.error('Error extracting hiring team:', e);
  }
  return null;
}

function isVisible(el) {
  if (!el) return false;
  if (el.offsetParent !== null) return true;
  try {
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  } catch (e) {
    return false;
  }
}

function scrollModalToBottom(modal) {
  if (!modal) return;
  try {
    // Scroll the main modal container
    modal.scrollTop = modal.scrollHeight;
    modal.scrollTo({ top: modal.scrollHeight, behavior: 'instant' });
    modal.dispatchEvent(new Event('scroll', { bubbles: true }));

    // Find and scroll all elements inside the modal
    const elements = modal.querySelectorAll('*');
    for (const el of elements) {
      if (el.scrollHeight > el.clientHeight) {
        el.scrollTop = el.scrollHeight;
        el.scrollTo({ top: el.scrollHeight, behavior: 'instant' });
        el.dispatchEvent(new Event('scroll', { bubbles: true }));
      }
    }
  } catch (e) {
    log(`Error scrolling modal: ${e.message}`);
  }
}

function notifyUser(message, type = 'warning') {
  try {
    chrome.runtime.sendMessage({ type: 'toast', message, toastType: type });
  } catch (e) {}
}

// Cliquer - PROTECTED: Only works if bot is running
async function click(element) {
  // CRITICAL SECURITY CHECK: Prevent ANY clicks if bot is not explicitly started
  if (!isRunning || !userExplicitlyClickedStart) {
    console.error('🚨 SECURITY VIOLATION: Attempted click() but bot is NOT running!');
    console.error('🔒 isRunning:', isRunning, '| userExplicitlyClickedStart:', userExplicitlyClickedStart);
    console.error('🚫 Click BLOCKED for security');
    console.trace('Call stack:'); // Show where this was called from
    return; // BLOCK THE CLICK
  }

  try {
    element.scrollIntoView({ block: 'center', behavior: 'smooth' });
    await wait(300);
  } catch(e) {}

  element.click();
  updateActivity(); // Update activity on every click
  await wait(500);
}

// Update last activity time
function updateActivity() {
  lastActivityTime = Date.now();
}

// Check if script is stuck (no activity for STUCK_TIMEOUT)
function isStuck() {
  const timeSinceActivity = Date.now() - lastActivityTime;
  return timeSinceActivity > STUCK_TIMEOUT;
}

// Check for LinkedIn's daily Easy Apply limit
function checkDailyLimit() {
  try {
    // List of limit message patterns (case-insensitive)
    const limitPatterns = [
      "You've reached today's Easy Apply limit",
      "You've reached today's easy apply limit",
      "reached today's Easy Apply limit",
      'Great effort applying today',
      'we limit daily submissions',
      'continue applying tomorrow',
      'Save this job and continue applying tomorrow',
      'exceeded the daily application limit',
      "reached today\\'s easy apply limit",
      'daily Easy Apply limit',
      'limit daily submissions'
    ];

    // Search in entire page text
    const bodyText = document.body.innerText || '';

    for (const pattern of limitPatterns) {
      if (bodyText.toLowerCase().includes(pattern.toLowerCase())) {
        log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        log('🚫 DAILY LIMIT REACHED!');
        log(`   Message detected: "${pattern}"`);
        log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        log('LinkedIn limits Easy Apply to ~50-100 per day');
        log('📊 Session stats:');
        log(`   ✅ Applied: ${appliedCount}`);
        log(`   ⏭️  Skipped: ${skippedCount}`);
        log('⏰ You can continue applying tomorrow!');
        log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        // Show visual notification to user via popup toast
        notifyUser(`LinkedIn daily limit reached. Applied: ${appliedCount}, Skipped: ${skippedCount}. Stopping.`, 'error');

        return true;
      }
    }

    // Also check for specific error messages in modal/toast elements
    const errorElements = document.querySelectorAll('.artdeco-inline-feedback, .artdeco-toast-item, .artdeco-modal__content');
    for (const element of errorElements) {
      const elementText = element.textContent || '';
      for (const pattern of limitPatterns) {
        if (elementText.toLowerCase().includes(pattern.toLowerCase())) {
          log('🚫 DAILY LIMIT DETECTED in error element!');
          return true;
        }
      }
    }

    return false;
  } catch (error) {
    log(`⚠️ Error checking daily limit: ${error.message}`);
    return false;
  }
}

// IMPROVED: Function to find and click Done button with exhaustive search
async function findAndClickDoneButton(contextElement = document, contextName = 'page', maxAttempts = 15) {
  log(`🔍 [${contextName}] Starting exhaustive search for Done button...`);

  const doneTexts = ['Done', 'Terminé', 'Submit application', 'Soumettre la candidature', 'Dismiss', 'Close', 'Fermer', 'OK', 'Got it'];
  let doneBtn = null;

  for (let attempt = 0; attempt < maxAttempts && !doneBtn; attempt++) {
    await wait(1000);

    // Log what we're looking for on first attempt
    if (attempt === 0) {
      log(`   Looking for buttons with text: ${doneTexts.join(', ')}`);
    }

    // METHOD 1: Search by SPAN text (Python method - most reliable)
    for (let targetText of doneTexts) {
      // Find ALL spans in context
      const spans = Array.from(contextElement.querySelectorAll('span.artdeco-button__text, span'));

      for (let span of spans) {
        const spanText = span.textContent.trim();

        if (spanText === targetText) {
          // Find clickable parent
          let clickableElement = span.closest('button, [role="button"], .artdeco-button');

          if (!clickableElement) {
            clickableElement = span;
          }

          // Check if visible
          if (isVisible(clickableElement)) {
            doneBtn = clickableElement;
            log(`   ✅ [METHOD 1] Found via SPAN: "${targetText}"`);
            break;
          }
        }
      }
      if (doneBtn) break;
    }

    // METHOD 2: Direct button search (fallback)
    if (!doneBtn) {
      const buttons = Array.from(contextElement.querySelectorAll('button, [role="button"]'));
      for (let btn of buttons) {
        const btnText = btn.textContent.trim();
        for (let targetText of doneTexts) {
          if (btnText === targetText && isVisible(btn)) {
            doneBtn = btn;
            log(`   ✅ [METHOD 2] Found via direct button search: "${targetText}"`);
            break;
          }
        }
        if (doneBtn) break;
      }
    }

    // METHOD 3: Search by aria-label
    if (!doneBtn) {
      for (let targetText of doneTexts) {
        const ariaBtn = contextElement.querySelector(`button[aria-label*="${targetText}"], [role="button"][aria-label*="${targetText}"]`);
        if (ariaBtn && isVisible(ariaBtn)) {
          doneBtn = ariaBtn;
          log(`   ✅ [METHOD 3] Found via aria-label: "${targetText}"`);
          break;
        }
      }
    }

    // METHOD 4: Search by data-control-name (LinkedIn specific)
    if (!doneBtn) {
      const controlNames = ['done', 'submit', 'continue_application'];
      for (let name of controlNames) {
        const controlBtn = contextElement.querySelector(`button[data-control-name*="${name}"]`);
        if (controlBtn && isVisible(controlBtn)) {
          doneBtn = controlBtn;
          log(`   ✅ [METHOD 4] Found via data-control-name: "${name}"`);
          break;
        }
      }
    }

    // Debug: Log all visible buttons on first and every 5th attempt
    if (attempt === 0 || attempt % 5 === 0) {
      if (!doneBtn) {
        const allButtons = Array.from(contextElement.querySelectorAll('button, [role="button"]'));
        const visibleButtons = allButtons.filter(isVisible);
        log(`   [DEBUG Attempt ${attempt + 1}/${maxAttempts}] Found ${visibleButtons.length} visible buttons:`);
        visibleButtons.slice(0, 10).forEach((btn, i) => {
          const text = btn.textContent.trim().substring(0, 30);
          const ariaLabel = btn.getAttribute('aria-label') || 'none';
          const dataControl = btn.getAttribute('data-control-name') || 'none';
          log(`      ${i + 1}. Text: "${text}" | Aria: "${ariaLabel}" | Data: "${dataControl}"`);
        });
      }
    }

    if (!doneBtn && (attempt === 0 || attempt % 5 === 0)) {
      log(`   ⏳ [${contextName}] Attempt ${attempt + 1}/${maxAttempts}: Still searching...`);
    }
  }

  // Try to click if found
  if (doneBtn) {
    log(`✅✅✅ [${contextName}] Done button FOUND! Attempting click...`);

    let clickSuccessful = false;

    // Method 1: Standard click
    try {
      log('   Click Method 1: Standard click...');
      doneBtn.click();
      await wait(500);
      log('   ✅ Standard click successful');
      clickSuccessful = true;
    } catch (e1) {
      log(`   ⚠️ Standard click failed: ${e1.message}`);

      // Method 2: MouseEvent
      try {
        log('   Click Method 2: MouseEvent dispatch...');
        doneBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        await wait(500);
        log('   ✅ MouseEvent click successful');
        clickSuccessful = true;
      } catch (e2) {
        log(`   ⚠️ MouseEvent failed: ${e2.message}`);

        // Method 3: Focus + Enter
        try {
          log('   Click Method 3: Keyboard Enter...');
          doneBtn.focus();
          await wait(200);
          doneBtn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
          doneBtn.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
          await wait(500);
          log('   ✅ Keyboard trigger successful');
          clickSuccessful = true;
        } catch (e3) {
          log(`   ❌ All click methods failed: ${e3.message}`);
        }
      }
    }

    if (clickSuccessful) {
      updateActivity();
      await wait(700); // Ultra optimized job card click wait
      return { success: true, clicked: true };
    } else {
      return { success: false, clicked: false, reason: 'Click failed' };
    }
  } else {
    log(`❌ [${contextName}] Done button NOT FOUND after ${maxAttempts} attempts`);
    return { success: false, clicked: false, reason: 'Button not found' };
  }
}

// Detect LinkedIn Easy Apply step progress (current / total)
function getStepInfo(modal) {
  if (!modal) return null;
  const indicators = [
    '.artdeco-stepper__step',
    'li[class*="stepper"]',
    '[class*="stepper"] li',
    '.jobs-easy-apply-modal__step',
    '[aria-current="step"]'
  ];
  for (const sel of indicators) {
    const steps = Array.from(modal.querySelectorAll(sel));
    if (steps.length > 1) {
      const current = steps.findIndex(s => s.getAttribute('aria-current') === 'step' || s.classList.contains('artdeco-stepper__step--is-active')) + 1;
      return { current: current || 1, total: steps.length };
    }
  }
  // Try to read from a step counter text like "Step 2 of 4"
  const textEls = modal.querySelectorAll('*');
  for (const el of textEls) {
    const m = el.textContent.match(/step\s*(\d+)\s*of\s*(\d+)/i);
    if (m) return { current: parseInt(m[1], 10), total: parseInt(m[2], 10) };
  }
  return null;
}

// Find the primary action button inside an Easy Apply modal
function findPrimaryActionButton(modal) {
  if (!modal) return null;

  // SUBMIT/APPLY buttons take absolute priority. Only fall back to Next/Continue
  // if no terminal button is visible. This prevents advancing to the next page
  // when we are actually on the final submission step.
  const terminalTexts = ['submit', 'soumettre', 'postuler', 'send', 'envoyer'];
  const progressionTexts = ['next', 'suivant', 'review', 'continue', 'continuer', 'apply'];
  const excludeTexts = ['discard', 'cancel', 'close', 'dismiss', 'fermer', 'annuler', 'abandonner', 'descarter', 'save', 'sauvegarder', 'back', 'retour'];

  const footerSelectors = [
    '.jobs-easy-apply-footer button',
    '.artdeco-modal__actionbar button',
    '.jobs-easy-apply-modal__footer button',
    'footer button',
    'button.artdeco-button--primary'
  ];

  function matches(text, aria, list) {
    return list.some(t => text.includes(t) || aria.includes(t));
  }

  function scoreButton(btn) {
    const text = btn.textContent.trim().toLowerCase();
    const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
    if (excludeTexts.some(t => text.includes(t) || aria.includes(t))) return 0;
    if (matches(text, aria, terminalTexts)) return 3;
    if (matches(text, aria, progressionTexts)) return 2;
    return 0;
  }

  // 1. Search footer / primary action bar first
  for (const selector of footerSelectors) {
    const buttons = Array.from(modal.querySelectorAll(selector))
      .filter(isVisible)
      .map(b => ({ btn: b, score: scoreButton(b), text: b.textContent.trim() }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score);

    if (buttons.length) {
      log(`  Primary action candidates in ${selector}: ${buttons.map(x => `"${x.text}"(${x.score})`).join(', ')}`);
      return buttons[0].btn;
    }
  }

  // 2. Fallback: any visible button inside the modal
  const allButtons = Array.from(modal.querySelectorAll('button'))
    .filter(isVisible)
    .map(b => ({ btn: b, score: scoreButton(b), text: b.textContent.trim() }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score);

  if (allButtons.length) {
    log(`  Primary action candidates (modal-wide): ${allButtons.map(x => `"${x.text}"(${x.score})`).join(', ')}`);
    return allButtons[0].btn;
  }

  return null;
}

// Create a simplified signature of the modal content to detect real page changes.
// Exclude input/textarea values so typing into fields isn't mistaken for advancing.
function getModalSignature(modal) {
  if (!modal) return '';
  const clone = modal.cloneNode(true);
  clone.querySelectorAll('input, textarea').forEach(el => {
    el.value = '';
    el.removeAttribute('value');
  });
  clone.querySelectorAll('select').forEach(el => {
    const firstOption = el.querySelector('option');
    if (firstOption) firstOption.selected = true;
  });
  return clone.innerText
    .replace(/\d{4,}/g, '') // remove long numbers
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 1200);
}

// Refresh page and return to job search
async function refreshAndReturnToSearch() {
  log('🔄 REFRESHING page due to stuck detection...');
  try {
    // Reload the page
    location.reload();
    // Wait will happen automatically when page reloads
    return true;
  } catch (error) {
    log(`❌ Error refreshing page: ${error.message}`);
    return false;
  }
}

// Discard application (Python ligne 1500-1580) - ULTRA AGGRESSIVE VERSION + STUCK DETECTION
async function discardApplication() {
  log('🚀 DISCARD: Starting SAFE discard sequence...');

  // Texts for close/cancel buttons inside the main form
  const initCloseTexts = ['discard', 'annuler', 'cancel', 'abandonner', 'descarter', 'close', 'fermer'];
  // Texts for confirmation dialog buttons (explicitly excluding Cancel/Keep editing)
  const confirmCloseTexts = ['discard', 'abandonner', 'descarter', 'défausser', 'save', 'enregistrer', 'sauvegarder'];

  try {
    // Check if loading spinner is stuck
    if (checkForStuckLoadingPopup()) {
      log('⏳ Loading popup during discard, trying to close via ESC...');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
      await wait(2000);
    }

    // Helper to check if any confirmation dialog is visible
    const getActiveConfirmationDialog = () => {
      const dialogs = document.querySelectorAll('[role="dialog"], .artdeco-modal');
      for (const d of dialogs) {
        if (isVisible(d) && !d.querySelector('.jobs-easy-apply-modal__content')) {
          const txt = d.textContent.toLowerCase();
          if (txt.includes('discard') || txt.includes('abandonner') || txt.includes('save') || txt.includes('enregistrer')) {
            return d;
          }
        }
      }
      return null;
    };

    // Helper to handle confirmation dialog if present
    const handleConfirmationDialog = async () => {
      const dialog = getActiveConfirmationDialog();
      if (dialog) {
        log('🔍 Discard confirmation dialog detected. Searching for Discard/Save button...');
        const buttons = Array.from(dialog.querySelectorAll('button'));
        const confirmBtn = buttons.find(b => {
          const t = b.textContent.trim().toLowerCase();
          // Exclude Cancel/Keep/Annuler/Retour
          if (t.includes('cancel') || t.includes('annuler') || t.includes('keep') || t.includes('retour')) {
            return false;
          }
          return confirmCloseTexts.some(txt => t.includes(txt));
        });

        if (confirmBtn) {
          log(`  Clicking confirmation button: "${confirmBtn.textContent.trim()}"`);
          confirmBtn.click();
          await wait(1500);
          return true;
        }
      }
      return false;
    };

    // STEP 1: Click X / Close buttons (restricting scope to modal to avoid clicking job card dismiss buttons)
    const activeModal = document.querySelector('.jobs-easy-apply-modal, [role="dialog"], .artdeco-modal');
    const closeButtons = activeModal 
      ? activeModal.querySelectorAll('button[aria-label*="Dismiss"], button[aria-label*="Close"], button.artdeco-modal__dismiss')
      : document.querySelectorAll('.artdeco-modal button[aria-label*="Dismiss"], .artdeco-modal button[aria-label*="Close"], button.artdeco-modal__dismiss');

    for (let btn of closeButtons) {
      if (isVisible(btn)) {
        log(`  Clicking close button: ${btn.getAttribute('aria-label')}`);
        btn.click();
        await wait(1000);

        // Check and handle confirmation dialog
        await handleConfirmationDialog();

        const modal = document.querySelector('.jobs-easy-apply-modal');
        if (!modal || !isVisible(modal)) {
          log('✅✅✅ MODAL CLOSED VIA CLOSE BUTTON!');
          return true;
        }
      }
    }

    // STEP 2: Press ESC key
    log('📤 STEP 2: Pressing ESC key...');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', keyCode: 27, bubbles: true }));
    await wait(1000);

    // Check and handle confirmation dialog
    await handleConfirmationDialog();

    let modal = document.querySelector('.jobs-easy-apply-modal');
    if (!modal || !isVisible(modal)) {
      log('✅✅✅ MODAL CLOSED VIA ESC!');
      return true;
    }

    // STEP 3: Click Cancel/Discard button inside the main form to trigger close
    log('🔍 STEP 3: Searching for Cancel/Discard buttons inside the modal...');
    const modalButtons = Array.from(modal.querySelectorAll('button'));
    const formCancelBtn = modalButtons.find(b => {
      if (!isVisible(b)) return false;
      const t = b.textContent.trim().toLowerCase();
      return initCloseTexts.some(txt => t.includes(txt));
    });

    if (formCancelBtn) {
      log(`  Clicking cancel button inside form: "${formCancelBtn.textContent.trim()}"`);
      formCancelBtn.click();
      await wait(1000);

      // Check and handle confirmation dialog
      await handleConfirmationDialog();

      modal = document.querySelector('.jobs-easy-apply-modal');
      if (!modal || !isVisible(modal)) {
        log('✅✅✅ MODAL CLOSED VIA FORM CANCEL!');
        return true;
      }
    }

    log('❌ DISCARD FAILED: Could not close modal');
    return false;

  } catch (error) {
    log(`❌ Error discarding: ${error.message}`);
    return false;
  }
}

// Remplir un champ - PROTECTED: Only works if bot is running
function fill(input, value) {
  // CRITICAL SECURITY CHECK: Prevent ANY form filling if bot is not explicitly started
  if (!isRunning || !userExplicitlyClickedStart) {
    console.error('🚨 SECURITY VIOLATION: Attempted fill() but bot is NOT running!');
    console.error('🔒 isRunning:', isRunning, '| userExplicitlyClickedStart:', userExplicitlyClickedStart);
    console.error('🚫 Fill BLOCKED for security');
    return; // BLOCK THE FILL
  }

  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

// Convert base64 to File object for resume upload
function base64ToFile(base64String, filename, mimeType) {
  try {
    // Remove data URL prefix if present (e.g., "data:application/pdf;base64,")
    const base64Data = base64String.includes(',') ? base64String.split(',')[1] : base64String;

    // Convert base64 to binary
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);

    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Create File object
    const file = new File([bytes], filename, { type: mimeType });
    return file;
  } catch (error) {
    log(`❌ Error converting base64 to file: ${error.message}`);
    return null;
  }
}

// Fill file input with resume
async function fillFileInput(fileInput, file) {
  try {
    // Create a DataTransfer object to set files
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);

    // Set the files property
    fileInput.files = dataTransfer.files;

    // Trigger change event
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));

    log(`✅ Resume uploaded: ${file.name}`);
    return true;
  } catch (error) {
    log(`❌ Error filling file input: ${error.message}`);
    return false;
  }
}

// Track skipped jobs for export
function trackSkippedJob(jobTitle, jobCompany, jobLink, reason) {
  skippedJobs.push({
    title: jobTitle || 'Unknown',
    company: jobCompany || 'Unknown',
    link: jobLink || window.location.href,
    date: new Date().toISOString(),
    reason: reason
  });
  chrome.storage.local.set({ skippedJobs: skippedJobs });
}

// Load skipped jobs from storage on startup
chrome.storage.local.get(['skippedJobs'], (result) => {
  if (result.skippedJobs) skippedJobs = result.skippedJobs;
});

// ==========================================
// ATS FRIENDLY PDF GENERATOR (no libraries)
// ==========================================
function generatePDF(text) {
  const margin = 40, pageW = 612, pageH = 792;
  const contentH = pageH - 2 * margin;
  const paragraphs = text.split('\n');

  let fontSize = 10;
  let lineH = 13;
  let splitLines = [];

  // Try shrinking font size to fit on exactly one page (totalPages = 1)
  for (let fs = 10.0; fs >= 7.0; fs -= 0.5) {
    fontSize = fs;
    lineH = Math.floor(fs * 1.3);
    const contentW = pageW - 2 * margin;
    const charsPerLine = Math.floor(contentW / (fontSize * 0.55));
    
    splitLines = [];
    for (const para of paragraphs) {
      if (para.trim() === '') { splitLines.push(' '); continue; }
      const words = para.split(' ');
      let line = '';
      for (const word of words) {
        if ((line + ' ' + word).length > charsPerLine && line.length > 0) {
          splitLines.push(line.trim()); line = word;
        } else { line += (line ? ' ' : '') + word; }
      }
      if (line) splitLines.push(line.trim());
    }
    
    const linesPerPage = Math.floor(contentH / lineH);
    if (splitLines.length <= linesPerPage) {
      break;
    }
  }

  // Enforce single page truncation if it's still too long
  const linesPerPage = Math.floor(contentH / lineH);
  if (splitLines.length > linesPerPage) {
    splitLines = splitLines.slice(0, linesPerPage);
  }

  const totalLines = splitLines.length;
  const totalPages = 1;

  // Generate page stream
  let streamContent = 'BT\n';
  streamContent += `/F1 ${fontSize} Tf\n${margin} ${pageH - margin - lineH} Td\n${lineH} TL\n`;
  for (let l = 0; l < totalLines; l++) {
    const escaped = splitLines[l].replace(/([\\\(\)])/g, '\\$1').replace(/[\x00-\x1f]/g, '');
    streamContent += `(${escaped}) Tj T*\n`;
  }
  streamContent += 'ET\n';

  const fontObj = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  const pagesObj = `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`;
  const catalogObj = '<< /Type /Catalog /Pages 2 0 R >>';

  let body = '';
  body += `1 0 obj\n${catalogObj}\nendobj\n`;
  body += `2 0 obj\n${pagesObj}\nendobj\n`;
  body += `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`;
  body += `4 0 obj\n${fontObj}\nendobj\n`;

  const streamObj = `<< /Length ${streamContent.length} >>\nstream\n${streamContent}\nendstream`;
  body += `5 0 obj\n${streamObj}\nendobj\n`;

  let offsets = []; let offset = 8;
  for (const l of body.split('\n')) { offsets.push(offset); offset += l.length + 1; }
  let xref = `xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) xref += String(o).padStart(10, '0') + ' 00000 n \n';

  const pdf = `%PDF-1.4\n${body}${xref}trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

// ==========================================
// JOB DESCRIPTION SCRAPER
// ==========================================
function scrapeJobDescription() {
  const selectors = [
    '.jobs-description__content', '.jobs-description',
    '.jobs-box__html-content', '#job-details span',
    '[class*="description__text"]', '.jobs-unified-top-card__description-container'
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el?.textContent?.trim()?.length > 50) return el.textContent.trim();
  }
  return null;
}

// ==========================================
// AI TAILOR RESUME FOR JOB
// ==========================================
async function tailorResumeForJob(baseResume, jobDescription, jobTitle, companyName) {
  // Routes through the Jd2Job backend (session-based) or the user's own
  // DeepSeek key — see src/shared/ai.js. Returns tailored resume text or null.
  try {
    log('🤖 Tailoring resume for: ' + jobTitle);
    const result = await aiTailorResume({
      baseResumeText: baseResume,
      jobDescription,
      jobTitle,
      companyName
    });
    if (!result || !result.resumeText) {
      log('⚠️ Tailoring returned no resume text — using original resume');
      return null;
    }
    const atsInfo = result.atsScore != null ? ` | ATS score: ${result.atsScore}` : '';
    log(`✅ Resume tailored via ${result.source} (${result.resumeText.length} chars${atsInfo})`);
    return result.resumeText.trim();
  } catch (e) {
    log(`⚠️ Tailoring failed: ${e.message} — using original resume`);
    return null;
  }
}

// BOUCLE PRINCIPALE - EXACTEMENT COMME PYTHON
async function mainLoop() {
  // SECURITY: Triple-layer protection - bot MUST be explicitly started by user
  if (!isRunning) {
    log('⚠️ SECURITY BLOCK 1/3: mainLoop called but isRunning=false - ABORTING');
    return;
  }

  if (!userExplicitlyClickedStart) {
    log('🚨 SECURITY BLOCK 2/3: mainLoop called but user did NOT click Start - ABORTING');
    log('🔒 This prevents any automatic execution. Bot ONLY runs when you click Start.');
    isRunning = false; // Force stop for safety
    await chrome.storage.local.set({ isRunning: false });
    return;
  }

  // Final sanity check
  if (!config || !config.email) {
    log('⚠️ SECURITY BLOCK 3/3: No config loaded - ABORTING');
    isRunning = false;
    userExplicitlyClickedStart = false;
    await chrome.storage.local.set({ isRunning: false });
    return;
  }

  console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: green; font-weight: bold;');
  console.log('%c🚀 BOT STARTED - User clicked START button', 'color: green; font-weight: bold; font-size: 14px;');
  console.log('%c✅ ALL SECURITY CHECKS PASSED', 'color: green; font-weight: bold;');
  console.log('%c🔓 Click() and Fill() functions are now ENABLED', 'color: green; font-weight: bold;');
  console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: green; font-weight: bold;');
  log('🚀 ✅ ALL SECURITY CHECKS PASSED - Bot started by user');

  // Detect page type ONCE at start
  const isCollectionsPage = window.location.href.includes('/jobs/collections/');
  if (isCollectionsPage) {
    log('📋 Page type: COLLECTIONS (infinite scroll mode)');
  } else {
    log('📋 Page type: SEARCH (pagination mode)');
  }
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  while (isRunning) {
    try {
      // 🆕 CHECK: Daily limit reached?
      if (checkDailyLimit()) {
        log('⛔ Stopping bot: Daily limit reached');
        isRunning = false;
        userExplicitlyClickedStart = false; // Clear security flag

        // Update storage
        await chrome.storage.local.set({ isRunning: false });

        // Notify popup
        try {
          chrome.runtime.sendMessage({
            type: 'updateStatus',
            status: 'stopped',
            message: 'Daily limit reached'
          });
        } catch (e) {
          // Popup may be closed
        }
        break;
      }

      // 🆕 CHECK: Script stuck? (no activity for 2 minutes)
      if (isStuck()) {
        log('🚨 SCRIPT STUCK DETECTED: No activity for 2 minutes!');
        log('🔄 Refreshing page to recover...');
        await refreshAndReturnToSearch();
        await wait(2500); // Optimized stuck recovery wait
        updateActivity(); // Reset activity after refresh
        continue;
      }

      // Python ligne 1695: job_listings = driver.find_elements(By.XPATH, "//li[@data-occludable-job-id]")
      let jobCards = document.querySelectorAll('li[data-occludable-job-id]');

      // ONLY on collections page: use fallback selectors if no jobs found with standard selector
      if (jobCards.length === 0 && isCollectionsPage) {
        jobCards = document.querySelectorAll('.jobs-search-results__list-item, .scaffold-layout__list-item');
        if (jobCards.length > 0) {
          log(`📋 Collections mode: found ${jobCards.length} jobs with fallback selectors`);
        }
      }

      if (jobCards.length === 0) {
        log('Aucune offre trouvée. Attente 5s...');

        // Check if page is unrecognized (no jobs for too long)
        if (isStuck()) {
          log('🚨 Page might be unrecognized (no jobs found + stuck)');
          log('🔄 Refreshing to return to job search...');
          await refreshAndReturnToSearch();
          await wait(2500); // Optimized refresh recovery wait
          updateActivity();
        }

        await wait(2500); // Optimized no jobs wait
        continue;
      }

      log(`${jobCards.length} offres trouvées`);
      updateActivity(); // Found jobs = activity

      // Get initial job count
      const initialJobCount = jobCards.length;

      // Python ligne 1701: for job in job_listings
      for (let i = 0; i < initialJobCount; i++) {
        if (!isRunning) break;

        // Re-query job cards to get the live, attached node at index i (with retry to handle dynamic SPA re-renders)
        let liveCards = [];
        for (let attempt = 1; attempt <= 5; attempt++) {
          liveCards = document.querySelectorAll('li[data-occludable-job-id]');
          if (liveCards.length === 0 && isCollectionsPage) {
            liveCards = document.querySelectorAll('.jobs-search-results__list-item, .scaffold-layout__list-item');
          }
          if (liveCards.length > i) {
            break;
          }
          if (attempt < 5) {
            // Scroll the job list container down to trigger lazy loading of more jobs
            const jobListContainer = document.querySelector('.jobs-search-results-list, .scaffold-layout__list-container, .jobs-search-results__list');
            if (jobListContainer) {
              jobListContainer.scrollTop = jobListContainer.scrollTop + 300;
              log(`📜 Scrolling job list container down (attempt ${attempt}/5) to load more cards...`);
            }
            await wait(800);
          }
        }

        if (i >= liveCards.length) {
          log(`Index ${i + 1} is out of bounds for live cards list (total: ${liveCards.length})`);
          break;
        }

        const job = liveCards[i];
        const jobId = job.getAttribute('data-occludable-job-id') || job.getAttribute('id') || i;

        log(`\n--- Job ${i + 1}/${liveCards.length} (ID: ${jobId}) ---`);

        // CRITICAL: Check if modal from previous job is still open (stuck scenario)
        const leftoverModal = document.querySelector('.jobs-easy-apply-modal');
        if (leftoverModal && isVisible(leftoverModal)) {
          log('⚠️ WARNING: Modal from previous job still open! Cleaning up...');
          await discardApplication();
          await wait(1000); // Optimized cleanup wait

          // Verify it's closed
          const stillOpen = document.querySelector('.jobs-easy-apply-modal');
          if (stillOpen && isVisible(stillOpen)) {
            log('❌ CRITICAL: Could not close leftover modal, skipping this job');
            skippedCount++;
            updateSkippedCount();
            continue;
          } else {
            log('✅ Leftover modal cleaned up successfully');
          }
        }

        // Get job info for filtering
        // Use extended selectors ONLY on collections page
        let capturedHiringTeam = null;
        let jobTitle, jobCompany, jobDescription;
        if (isCollectionsPage) {
          jobTitle = job.querySelector('.job-card-list__title, .artdeco-entity-lockup__title, .job-card-container__link strong, a[class*="job-card"] strong')?.textContent.trim() || '';
          jobCompany = job.querySelector('.job-card-container__primary-description, .artdeco-entity-lockup__subtitle, .artdeco-entity-lockup__caption')?.textContent.trim() || '';
          jobDescription = job.querySelector('.job-card-container__metadata-item, .job-card-list__insight')?.textContent.trim() || '';
        } else {
          // Standard selectors for /jobs/search/
          jobTitle = job.querySelector('.job-card-list__title, .artdeco-entity-lockup__title')?.textContent.trim() || '';
          jobCompany = job.querySelector('.job-card-container__primary-description, .artdeco-entity-lockup__subtitle')?.textContent.trim() || '';
          jobDescription = job.querySelector('.job-card-container__metadata-item')?.textContent.trim() || '';
        }

        const jobLink = job.querySelector('a')?.href || window.location.href;

        // Check blacklist keywords
        if (shouldSkipByBlacklist(jobTitle, jobCompany, jobDescription, config.blacklistKeywords)) {
          trackSkippedJob(jobTitle, jobCompany, jobLink, 'Blacklisted keyword');
          skippedCount++;
          updateSkippedCount();
          continue;
        }

        // Check max years required
        if (shouldSkipByExperience(job, parseInt(config.maxYearsRequired))) {
          trackSkippedJob(jobTitle, jobCompany, jobLink, 'Max experience exceeded');
          skippedCount++;
          updateSkippedCount();
          continue;
        }

        // Auto-dismiss blocking/messaging popups
        dismissInterruptivePopups();

        // Scroll and click (Python line 371)
        job.scrollIntoView({ block: 'start', behavior: 'smooth' });
        await wait(500);

        // Prefer the job title link which reliably triggers the right-side split pane on LinkedIn
        const titleLink = job.querySelector('.job-card-list__title, .artdeco-entity-lockup__title, .job-card-container__link, a.job-card-list__title');
        
        if (titleLink) {
          await click(titleLink);
        } else {
          // Fallback to clicking the job card container itself
          await click(job);
        }
        await wait(600); // Ultra optimized job link wait

        // Capture hiring team details BEFORE launching the apply modal when DOM is fully loaded and visible
        try {
          capturedHiringTeam = getHiringTeamDetails();
          if (capturedHiringTeam) {
            log(`👥 Pre-captured hiring team: ${capturedHiringTeam.name} (${capturedHiringTeam.title})`);
          }
        } catch (e) {
          log(`⚠️ Failed to pre-capture hiring team: ${e.message}`);
        }

        // AI TAILORING: scrape JD and tailor resume before applying
        if (aiTailorResume && aiResumeText) {
          log('🔍 Scraping job description...');
          await wait(800);
          const jd = scrapeJobDescription();
          if (jd) {
            log(`📋 JD found (${jd.length} chars)`);
            const tailored = await tailorResumeForJob(aiResumeText, jd, jobTitle, jobCompany);
            if (tailored) {
              currentTailoredText = tailored;
              currentTailoredPdf = generatePDF(tailored);
              if (currentTailoredPdf) {
                log(`📄 Tailored PDF generated (${(currentTailoredPdf.length / 1024).toFixed(1)} KB)`);
              }
            }
          } else {
            log('⚠️ Could not scrape JD, using original resume');
          }
        }

        // Find Easy Apply button with polling (supports alternative labels like "Apply", "LinkedIn Apply", etc.)
        let easyApplyBtn = null;
        let easyApplyRetries = 12; // Wait up to 3.6 seconds (12 * 300ms)
        while (easyApplyRetries > 0) {
          easyApplyBtn = document.querySelector('button.jobs-apply-button') ||
                         document.querySelector('button[aria-label*="Easy Apply"]') ||
                         document.querySelector('button[aria-label*="Easy"]') ||
                         document.querySelector('button[aria-label*="LinkedIn Apply"]') ||
                         document.querySelector('button[aria-label*="Apply now"]');
          if (easyApplyBtn) {
            log(`📋 Found Easy Apply button (retries remaining: ${easyApplyRetries})`);
            break;
          }
          await wait(300);
          easyApplyRetries--;
        }

        if (!easyApplyBtn) {
          log('Pas Easy Apply, skip');
          trackSkippedJob(jobTitle, jobCompany, jobLink, 'External / No Easy Apply');
          skippedCount++;
          updateSkippedCount();
          continue;
        }

        await click(easyApplyBtn);
        await wait(800); // Ultra optimized Easy Apply wait

        // Safety reminder modal ("Continue applying")
        // LinkedIn sometimes shows a "Job search safety reminder" dialog
        const safetyModal = document.querySelector('[role="dialog"], .artdeco-modal');
        if (safetyModal && isVisible(safetyModal)) {
          const safetyText = safetyModal.textContent.toLowerCase();
          if (safetyText.includes('safety reminder') || safetyText.includes('rappel de sécurité') ||
              safetyText.includes('continue applying') || safetyText.includes('continuer à postuler')) {
            log('Safety reminder detected — clicking Continue applying...');
            const continueBtn = Array.from(safetyModal.querySelectorAll('button')).find(btn => {
              const t = btn.textContent.trim().toLowerCase();
              return t.includes('continue applying') || t.includes('continuer à postuler') ||
                     t.includes('continue') || t.includes('continuer');
            });
            if (continueBtn) {
              await click(continueBtn);
              log('Safety reminder dismissed');
              await wait(1000);
            }
          }
        }

        // CRITICAL: Check for daily limit immediately after clicking Easy Apply
        // This catches the network error case where modal doesn't appear
        if (checkDailyLimit()) {
          log('');
          log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          log('🚫 LINKEDIN DAILY LIMIT REACHED!');
          log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          log('LinkedIn limits Easy Apply to ~50-100 per day');
          log(`✅ Applied today: ${appliedCount}`);
          log(`⏭️  Skipped today: ${skippedCount}`);
          log('⏰ You can continue applying tomorrow!');
          log('🛑 Bot stopped automatically');
          log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          log('');

          isRunning = false;
          userExplicitlyClickedStart = false; // Clear security flag

          // Update storage
          await chrome.storage.local.set({ isRunning: false });

          try {
            chrome.runtime.sendMessage({
              type: 'updateStatus',
              status: 'stopped',
              message: 'Daily limit reached'
            });
          } catch (e) {
            // Popup might be closed
          }

          break; // Exit job loop
        }

        // Verify that modal appeared (if not, might be limit reached)
        const modalCheck = document.querySelector('.jobs-easy-apply-modal');
        if (!modalCheck || !isVisible(modalCheck)) {
          log('⚠️ Easy Apply modal did not appear - checking for limit...');
          await wait(1000); // Optimized modal check wait

          if (checkDailyLimit()) {
            log('');
            log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            log('🚫 LINKEDIN DAILY LIMIT REACHED!');
            log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            log('LinkedIn limits Easy Apply to ~50-100 per day');
            log(`✅ Applied today: ${appliedCount}`);
            log(`⏭️  Skipped today: ${skippedCount}`);
            log('⏰ You can continue applying tomorrow!');
            log('🛑 Bot stopped automatically');
            log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            log('');

            isRunning = false;
            userExplicitlyClickedStart = false; // Clear security flag

            // Update storage
            await chrome.storage.local.set({ isRunning: false });

            try {
              chrome.runtime.sendMessage({
                type: 'updateStatus',
                status: 'stopped',
                message: 'Daily limit reached'
              });
            } catch (e) {
              // Popup might be closed
            }

            break; // Exit job loop
          }

          // Modal still not there and no limit message - skip job
          log('❌ Modal did not appear (unknown reason), skipping job');
          skippedCount++;
          updateSkippedCount();
          continue;
        }

        // jobLink already defined above

        // Remplir formulaire multi-étapes avec TIMEOUT (Python ligne 528-529)
        let step = 0;
        let samePageRetries = 0;
        const maxSamePageRetries = 3;
        const applicationStartTime = Date.now();
        const applicationTimeout = 180000; // 3 minutes max par candidature
        let loadingScreenTimeout = 30000; // 30 secondes pour écran de chargement (Python ligne 1481-1497)

        while (step < 10) {
          step++;

          if (samePageRetries > 0) {
            log(`🔁 Retry ${samePageRetries}/${maxSamePageRetries} on step ${step}`);
          }

          // TIMEOUT CHECK (Python ligne 639)
          if (Date.now() - applicationStartTime > applicationTimeout) {
            log('⏰ TIMEOUT 3min - Discarding application');
            await discardApplication();
            skippedCount++;
            updateSkippedCount();
            break;
          }

          // 🆕 RE-CHECK: Popup bloqué avant chaque step (Python ligne 1563-1568)
          if (checkForStuckLoadingPopup()) {
            log('⏳ Loading spinner detected, waiting for it to clear...');
            let maxWait = 15;
            while (maxWait > 0 && checkForStuckLoadingPopup()) {
              await wait(1000);
              maxWait--;
            }
            if (checkForStuckLoadingPopup()) {
              log('⚠️ Spinner stuck after 15s, skipping this job');
              await discardApplication();
              skippedCount++;
              updateSkippedCount();
              break;
            }
            log('✅ Spinner cleared, continuing...');
          }

          // CHECK FOR VALIDATION ERRORS EARLY (stuck scenario)
          let modal = document.querySelector('.jobs-easy-apply-modal');
          if (modal) {
            const errors = modal.querySelectorAll('[role="alert"], .artdeco-inline-feedback--error, .fb-form-element-label__error');
            for (let error of errors) {
              if (error.offsetParent !== null) {
                const errorText = error.textContent.toLowerCase();
                if (errorText.includes('please enter') ||
                    errorText.includes('valid answer') ||
                    errorText.includes('required') ||
                    errorText.includes('must be') ||
                    errorText.includes('invalid')) {

                  log(`❌ STUCK: Validation error detected: ${error.textContent.substring(0, 50)}`);
                  log('⚠️ Discarding application due to validation error');

                  await discardApplication();
                  skippedCount++;
                  updateSkippedCount();
                  step = 999; // Force break
                  break;
                }
              }
            }
            if (step === 999) break;
          }

          // CHECK LOADING SCREEN (Python ligne 1481-1497)
          if (await isPageLoadingSlow()) {
            log('⏳ Loading screen detected...');
            const loadingStart = Date.now();

            while (await isPageLoadingSlow()) {
              if (Date.now() - loadingStart > loadingScreenTimeout) {
                log('⏰ Loading screen TIMEOUT 20s - Discarding application');

                // Use the discardApplication function to properly close modal
                const discarded = await discardApplication();

                if (discarded) {
                  log('✅ Modal closed successfully, moving to next job');
                } else {
                  log('⚠️ Modal may not be closed, forcing break anyway');
                }

                skippedCount++;
                updateSkippedCount();

                // Wait to ensure modal is closed and page is stable
                await wait(1000); // Optimized modal stable wait

                // Exit the step loop to move to next job
                break;
              }
              await wait(1000);
            }

            if (Date.now() - loadingStart > loadingScreenTimeout) {
              break; // Sortir du while principal pour passer au job suivant
            }
          }

          log(`Step ${step}`);

          // Find modal (reuse variable from earlier)
          modal = document.querySelector('.jobs-easy-apply-modal');
          if (!modal) {
            log('Modal closed');
            break;
          }

          // 1. TEXT FIELDS (Python line 1102) - Multilingual support
          const textInputs = modal.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"], input[type="number"]');
          for (let input of textInputs) {
            if (input.value) continue; // Skip if already filled

            // Get label from multiple sources
            let labelText = '';

            // aria-label
            labelText += ' ' + (input.getAttribute('aria-label') || '');

            // name attribute
            labelText += ' ' + (input.getAttribute('name') || '');

            // Associated <label> element
            const inputId = input.getAttribute('id');
            if (inputId) {
              const labelEl = modal.querySelector(`label[for="${inputId}"]`);
              if (labelEl) labelText += ' ' + labelEl.textContent;
            }

            // Parent label
            const parentLabel = input.closest('label');
            if (parentLabel) labelText += ' ' + parentLabel.textContent;

            // Sibling/Parent Container Label Fallback (handles LinkedIn unassociated labels)
            const formElement = input.closest('.jobs-easy-apply-form-element, .fb-dash-form-element, .jobs-easy-apply-form-section__grouping, .fb-form-element');
            if (formElement) {
              const labelEl = formElement.querySelector('label, .fb-form-element-label, .t-14, span[class*="label"]');
              if (labelEl) labelText += ' ' + labelEl.textContent;
            }

            const label = labelText.toLowerCase();

            // Years of experience (EN/FR/ES/DE/IT)
            if (label.match(/experience|years|expérience|années|años|jahre|anni|esperienza/)) {
              fill(input, config.yearsOfExperience || '2');
              log(`Years exp: ${config.yearsOfExperience || '2'}`);
            }
            // LinkedIn URL
            else if (label.match(/linkedin/)) {
              if (config.linkedin) {
                fill(input, config.linkedin);
                log(`LinkedIn URL filled: ${config.linkedin}`);
              }
            }
            // GitHub URL
            else if (label.match(/github/)) {
              if (config.github) {
                fill(input, config.github);
                log(`GitHub URL filled: ${config.github}`);
              }
            }
            // Portfolio URL
            else if (label.match(/portfolio|website|site|homepage/)) {
              if (config.portfolio) {
                fill(input, config.portfolio);
                log(`Portfolio URL filled: ${config.portfolio}`);
              }
            }
            // Notice Period
            else if (label.match(/notice|availability|préavis/)) {
              if (config.noticePeriod !== undefined) {
                fill(input, config.noticePeriod.toString());
                log(`Notice Period filled: ${config.noticePeriod}`);
              }
            }
            // Salary / Compensation (EN/FR/ES/DE/IT)
            else if (label.match(/salary|compensation|remuneration|salaire|rémunération|sueldo|salario|gehalt|stipendio|ctc/)) {
              const isCurrentOrPrevious = label.match(/current|previous|present|actuel|précédent|anterior|attuale/);
              const isExpected = label.match(/expected|target|desired|expectation|attendu|souhaité|deseado/);
              
              if (isCurrentOrPrevious && !isExpected) {
                log('⏭️ Current/previous salary field detected; skipping to let user fill manually or use learned memory');
              } else if (config.expectedSalary) {
                fill(input, config.expectedSalary);
                log(`Salary filled: ${config.expectedSalary}`);
              } else {
                log('⚠️ Salary question detected but no expected salary configured');
              }
            }
            // Email
            else if (label.match(/email|e-mail|courriel|correo/)) fill(input, config.email);
            // First name (EN/FR/ES/DE/IT)
            else if (label.match(/first|prénom|prenom|nombre|vorname|nome/)) fill(input, config.firstName);
            // Last name (EN/FR/ES/DE/IT)
            else if (label.match(/last|nom|apellido|nachname|cognome/)) fill(input, config.lastName);
            // Phone (EN/FR/ES/DE/IT) - includes "portable", "cell", "móvil"
            else if (label.match(/phone|téléphone|telefono|telefon|mobile|portable|cell|móvil|cellulare/)) {
              fill(input, config.phone);
              log(`Phone filled: ${config.phone}`);
            }
            // City/Location (EN/FR/ES/DE/IT) - with autocomplete handling
            else if (label.match(/city|ville|ciudad|stadt|città|location|localisation|ubicación|standort/)) {
              fill(input, config.city || '');
              log(`Location filled: ${config.city}`);

              // Wait for autocomplete dropdown to appear
              await wait(1000);

              // Try multiple selectors for autocomplete dropdown
              let dropdown = null;
              const dropdownSelectors = [
                '[role="listbox"]',
                '.basic-typeahead__selectable',
                '.artdeco-typeahead__results',
                '.artdeco-dropdown__content-inner',
                'ul[role="listbox"]',
                '.typeahead-results'
              ];

              for (let selector of dropdownSelectors) {
                dropdown = document.querySelector(selector);
                if (dropdown && dropdown.offsetParent !== null) { // Visible
                  break;
                }
              }

              if (dropdown) {
                // Find first option
                const optionSelectors = [
                  '[role="option"]:first-child',
                  'li:first-child',
                  '.basic-typeahead__selectable-item:first-child'
                ];

                let firstOption = null;
                for (let selector of optionSelectors) {
                  firstOption = dropdown.querySelector(selector);
                  if (firstOption) break;
                }

                if (firstOption) {
                  firstOption.click();
                  log(`✓ Location autocomplete: ${firstOption.textContent.substring(0, 30)}`);
                  await wait(500);
                }
              } else {
                // Fallback: Keyboard navigation (Arrow Down + Enter)
                log('Using keyboard fallback for location');
                input.focus();
                await wait(300);
                input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', keyCode: 40, bubbles: true }));
                await wait(500);
                input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
                await wait(300);
              }
            }
            // Check in custom QAs (Learned Memory)
            else if ((() => {
              const cleanLabel = extractLabelText(input, modal);
              const rememberedAnswer = findRememberedAnswer(cleanLabel, customQAs);
              if (rememberedAnswer !== null) {
                fill(input, rememberedAnswer);
                log(`🧠 Filled from Learned Memory: "${cleanLabel}" -> "${rememberedAnswer}"`);
                return true;
              }
              return false;
            })()) {
              // Filled from learned memory
            }
            // AI-powered answer for unknown questions
            else if (config.aiAnswers && config.aiResumeText) {
              const text = label.replace(/\s+/g, ' ').trim();
              if (text.length > 5) {
                log(`🤖 AI answering: "${text.substring(0, 50)}..."`);
                const answer = await getAIAnswer(text, 'text');
                if (answer) {
                  fill(input, answer);
                  log(`✅ AI answered: "${answer.substring(0, 60)}"`);
                } else {
                  log('⚠️ AI could not generate answer');
                }
              }
            }
          }

          // 2. FILE INPUTS (Resume/CV Upload) - SMART: Select existing or upload once
          // LinkedIn remembers previously uploaded CVs - we should select those instead of re-uploading

          // STEP 2a: First, try to select an existing/previously uploaded resume
          let resumeAlreadySelected = false;

          if (!currentTailoredPdf) {
            // Look for resume selection cards/radio buttons (LinkedIn shows previously uploaded resumes)
            const resumeSelectors = [
              // Radio buttons for resume selection
              'input[type="radio"][name*="resume"]',
              'input[type="radio"][name*="cv"]',
              'input[type="radio"][id*="resume"]',
              'input[type="radio"][id*="document"]',
              // Clickable resume cards
              '[data-test-document-upload-item]',
              '.jobs-document-upload-redesign-card',
              '.jobs-document-upload__container',
              '.document-upload-item',
              // Resume list items
              '[class*="resume-card"]',
              '[class*="document-card"]'
            ];

            for (let selector of resumeSelectors) {
              const resumeOptions = modal.querySelectorAll(selector);
              if (resumeOptions.length > 0) {
                // Find the first/most recent visible resume option
                for (let option of resumeOptions) {
                  if (option.offsetParent !== null) { // Visible
                    // For radio buttons
                    if (option.type === 'radio') {
                      if (!option.checked) {
                        const label = modal.querySelector(`label[for="${option.id}"]`);
                        if (label) {
                          await click(label);
                          log(`✅ Selected existing resume: ${label.textContent.substring(0, 40)}`);
                        } else {
                          await click(option);
                          log('✅ Selected existing resume (radio)');
                        }
                        resumeAlreadySelected = true;
                      } else {
                        log('✅ Resume already selected');
                        resumeAlreadySelected = true;
                      }
                      await wait(800);
                      break;
                    } else {
                      // For clickable cards - click if not already selected
                      const isSelected = option.classList.contains('selected') ||
                                        option.getAttribute('aria-selected') === 'true' ||
                                        option.querySelector('input[type="radio"]:checked');
                      if (!isSelected) {
                        await click(option);
                        log('✅ Selected existing resume card');
                        resumeAlreadySelected = true;
                      } else {
                        log('✅ Resume card already selected');
                        resumeAlreadySelected = true;
                      }
                      await wait(800);
                      break;
                    }
                  }
                }
                if (resumeAlreadySelected) break;
              }
            }
          }

          // STEP 2b: If no existing resume found/selected, upload new one
          if (!resumeAlreadySelected) {
            // Prefer tailored PDF if AI is ON
            if (currentTailoredPdf) {
              log('📎 Using AI-tailored PDF for this job');
              const fileInputs = modal.querySelectorAll('input[type="file"]');
              for (let fi of fileInputs) {
                if (fi.files?.length > 0) continue;
                const safeName = `${(config.firstName||'candidate').replace(/[^a-z0-9]/gi,'_')}_${(config.lastName||'').replace(/[^a-z0-9]/gi,'_')}_${(jobCompany||'company').replace(/[^a-z0-9]/gi,'_').substring(0,30)}.pdf`;
                const file = new File([currentTailoredPdf], safeName, { type: 'application/pdf' });
                const dt = new DataTransfer();
                dt.items.add(file);
                fi.files = dt.files;
                fi.dispatchEvent(new Event('change', { bubbles: true }));
                log('✅ Tailored PDF uploaded');
                resumeAlreadySelected = true;
                // Wait for LinkedIn to process the uploaded PDF
                log('⏳ Waiting for LinkedIn to process the PDF...');
                await wait(3000);
                let waitCount = 0;
                while (checkForStuckLoadingPopup() && waitCount < 15) {
                  log(`   PDF still processing... (${waitCount+1}/15)`);
                  await wait(1000);
                  waitCount++;
                }
                log('✅ PDF processing complete');
                break;
              }
            }

            // Fall back to original resume upload if no tailored PDF
            if (!resumeAlreadySelected && resumeFile && resumeFileName && resumeFileType) {
              const fileInputs = modal.querySelectorAll('input[type="file"]');

              for (let fileInput of fileInputs) {
                // Check if already has a file
                if (fileInput.files && fileInput.files.length > 0) {
                  log(`⏭️ File input already has file: ${fileInput.files[0].name}`);
                  continue;
                }

                // Get label to understand what file is requested
                let labelText = '';
                labelText += ' ' + (fileInput.getAttribute('aria-label') || '');
                labelText += ' ' + (fileInput.getAttribute('name') || '');

                const inputId = fileInput.getAttribute('id');
                if (inputId) {
                  const labelEl = modal.querySelector(`label[for="${inputId}"]`);
                  if (labelEl) labelText += ' ' + labelEl.textContent;
                }

                const parentLabel = fileInput.closest('label');
                if (parentLabel) labelText += ' ' + parentLabel.textContent;

                const label = labelText.toLowerCase();

                // Check if it's asking for resume/CV (multilingual)
                const isResumeInput = label.match(/resume|cv|curriculum|vitae|upload.*document|file/);

                if (isResumeInput) {
                  log(`📎 File input detected (no existing resume found): ${labelText.substring(0, 50)}`);

                  // Convert base64 to File object
                  const file = base64ToFile(resumeFile, resumeFileName, resumeFileType);

                  if (file) {
                    const success = await fillFileInput(fileInput, file);

                    if (success) {
                      log('✅ Resume uploaded successfully (first time upload)');
                      await wait(500); // Wait for LinkedIn to process the upload
                    } else {
                      log('⚠️ Failed to upload resume to file input');
                    }
                  } else {
                    log('❌ Failed to convert resume to File object');
                  }
                } else {
                  log(`⏭️ Skipping file input (not resume): ${labelText.substring(0, 50)}`);
                }
              }
            }
          } else if (!resumeAlreadySelected && modal.querySelector('input[type="file"]')) {
            // File input found but no resume uploaded in extension
            const fileInputsCount = modal.querySelectorAll('input[type="file"]').length;
            log(`⚠️ ${fileInputsCount} file input(s) found but no resume uploaded in extension`);
            log('   Upload your resume in the extension popup to auto-fill file uploads');
          }

          // 3. CHECKBOXES (consent, terms, etc.)
          const checkboxes = modal.querySelectorAll('input[type="checkbox"]');
          for (let checkbox of checkboxes) {
            if (checkbox.id === 'follow-company-checkbox') continue; // Skip follow company (handled later)

            // Get associated label
            const checkboxLabel = modal.querySelector(`label[for="${checkbox.id}"]`);
            const labelText = checkboxLabel ? checkboxLabel.textContent.toLowerCase() : '';

            // Check for consent, terms, conditions, etc.
            if (labelText.match(/consent|agree|terms|conditions|policy|privacy|accept|j'accepte|j'autorise|consentement/)) {
              if (!checkbox.checked) {
                checkboxLabel ? checkboxLabel.click() : checkbox.click();
                log(`✓ Checkbox: ${labelText.substring(0, 40)}`);
                await wait(300);
              }
            }
          }

          // 4. RADIO BUTTONS (Python ligne 1037)
          const radios = modal.querySelectorAll('fieldset[data-test-form-builder-radio-button-form-component]');
          for (let fieldset of radios) {
            const questionLabel = fieldset.querySelector('legend, span[class*="title"]');
            const questionText = questionLabel ? questionLabel.textContent.toLowerCase() : '';

            const radioInputs = fieldset.querySelectorAll('input[type="radio"]');
            let answered = false;

            // SMART DETECTION: Check for specific questions and use user's configuration
            let desiredAnswer = 'yes'; // default

            // Check in custom QAs (Learned Memory)
            const cleanQuestion = questionLabel ? questionLabel.textContent.replace(/\s+/g, ' ').trim() : '';
            const rememberedAnswer = findRememberedAnswer(cleanQuestion, customQAs);
            if (rememberedAnswer !== null) {
              const targetLower = rememberedAnswer.toLowerCase();
              for (let radio of radioInputs) {
                const radioLabel = fieldset.querySelector(`label[for="${radio.id}"]`);
                const radioText = radioLabel ? radioLabel.textContent.trim().toLowerCase() : '';
                if (radioText === targetLower || radioText.includes(targetLower)) {
                  desiredAnswer = targetLower === 'no' ? 'no' : 'yes';
                  break;
                }
              }
            }
            // Visa sponsorship question
            else if (questionText.match(/visa|sponsor|sponsorship/i) && config.visaSponsorship) {
              desiredAnswer = config.visaSponsorship;
              log(`⚙️ Visa question detected, answering: ${desiredAnswer}`);
            }
            // Work authorization question
            else if (questionText.match(/author|legal.*work|permit.*work|eligib.*work|right.*work/i) && config.legallyAuthorized) {
              desiredAnswer = config.legallyAuthorized;
              log(`⚙️ Work authorization question detected, answering: ${desiredAnswer}`);
            }
            // Relocation question
            else if (questionText.match(/relocat|move.*locat|willing.*move/i) && config.willingToRelocate) {
              desiredAnswer = config.willingToRelocate;
              log(`⚙️ Relocation question detected, answering: ${desiredAnswer}`);
            }
            // Security clearance question (always answer No)
            else if (questionText.match(/security.*clearance|clearance/i)) {
              desiredAnswer = 'no';
              log('⚙️ Security clearance question detected, answering: no (default)');
            }
            // Driver's license question
            else if (questionText.match(/driver.*license|driving.*license|valid.*license/i) && config.driversLicense) {
              desiredAnswer = config.driversLicense;
              log(`⚙️ Driver's license question detected, answering: ${desiredAnswer}`);
            }
            // Notice Period radio question
            else if (questionText.match(/notice|availability|préavis/) && config.noticePeriod !== undefined) {
              const days = parseInt(config.noticePeriod, 10);
              for (let radio of radioInputs) {
                const radioLabel = fieldset.querySelector(`label[for="${radio.id}"]`);
                const radioText = radioLabel ? radioLabel.textContent.trim().toLowerCase() : '';
                if (days === 0 && (radioText.includes('immediate') || radioText.includes('no notice') || radioText.includes('immédiat'))) {
                  desiredAnswer = radioText;
                  break;
                }
                if (radioText.includes(days.toString())) {
                  desiredAnswer = radioText;
                  break;
                }
                if (days === 30 && (radioText.includes('1 month') || radioText.includes('one month') || radioText.includes('4 weeks') || radioText.includes('1 mois'))) {
                  desiredAnswer = radioText;
                  break;
                }
                if (days === 60 && (radioText.includes('2 month') || radioText.includes('two month') || radioText.includes('8 weeks') || radioText.includes('2 mois'))) {
                  desiredAnswer = radioText;
                  break;
                }
                if (days === 90 && (radioText.includes('3 month') || radioText.includes('three month') || radioText.includes('12 weeks') || radioText.includes('3 mois'))) {
                  desiredAnswer = radioText;
                  break;
                }
              }
              if (desiredAnswer !== 'yes') {
                for (let radio of radioInputs) {
                  const radioLabel = fieldset.querySelector(`label[for="${radio.id}"]`);
                  const radioText = radioLabel ? radioLabel.textContent.trim().toLowerCase() : '';
                  if (radioText === desiredAnswer) {
                    if (!radio.checked) {
                      radioLabel ? radioLabel.click() : radio.click();
                      log(`Radio Notice Period: ${radioText}`);
                      answered = true;
                    }
                    break;
                  }
                }
              }
            }

            // Click the appropriate answer (Yes or No)
            for (let radio of radioInputs) {
              const radioLabel = fieldset.querySelector(`label[for="${radio.id}"]`);
              const radioText = radioLabel ? radioLabel.textContent.trim().toLowerCase() : '';

              // Match Yes/No in multiple languages
              const isYes = radioText.match(/^(yes|oui|sí|si|ja|y)$/);
              const isNo = radioText.match(/^(no|non|nein|n)$/);

              if ((desiredAnswer === 'yes' && isYes) || (desiredAnswer === 'no' && isNo)) {
                if (!radio.checked) {
                  radioLabel ? radioLabel.click() : radio.click();
                  log(`Radio ${desiredAnswer}: ${questionText.substring(0, 30)}`);
                  answered = true;
                }
                break;
              }
            }

            // If no specific answer found, look for "Yes" as default (backward compatibility)
            if (!answered) {
              for (let radio of radioInputs) {
                const radioLabel = fieldset.querySelector(`label[for="${radio.id}"]`);
                const radioText = radioLabel ? radioLabel.textContent.trim().toLowerCase() : '';

                // Yes in multiple languages: EN, FR, ES, DE, IT
                if (radioText.match(/^(yes|oui|sí|si|ja|y)$/)) {
                  if (!radio.checked) {
                    radioLabel ? radioLabel.click() : radio.click();
                    log(`Radio Yes (default): ${questionText.substring(0, 30)}`);
                    answered = true;
                  }
                  break;
                }
              }
            }

            // If still no answer, check first option as last resort
            if (!answered && radioInputs.length > 0 && !radioInputs[0].checked) {
              const firstLabel = fieldset.querySelector(`label[for="${radioInputs[0].id}"]`);
              firstLabel ? firstLabel.click() : radioInputs[0].click();
              log(`Radio first option: ${questionText.substring(0, 30)}`);
            }
          }

          // 5. DROPDOWN/SELECT (Python ligne 661)
          const selects = modal.querySelectorAll('select');
          for (let select of selects) {
            if (select.selectedIndex > 0) continue; // Skip si déjà sélectionné

            // Get label from multiple sources
            let labelText = '';
            labelText += ' ' + (select.getAttribute('aria-label') || '');
            labelText += ' ' + (select.getAttribute('name') || '');
            const selectId = select.getAttribute('id');
            if (selectId) {
              const labelEl = modal.querySelector(`label[for="${selectId}"]`);
              if (labelEl) labelText += ' ' + labelEl.textContent;
            }
            const parentLabel = select.closest('label');
            if (parentLabel) labelText += ' ' + parentLabel.textContent;

            // Sibling/Parent Container Label Fallback (handles LinkedIn unassociated labels)
            const formElement = select.closest('.jobs-easy-apply-form-element, .fb-dash-form-element, .jobs-easy-apply-form-section__grouping, .fb-form-element');
            if (formElement) {
              const labelEl = formElement.querySelector('label, .fb-form-element-label, .t-14, span[class*="label"]');
              if (labelEl) labelText += ' ' + labelEl.textContent;
            }

            const label = labelText.toLowerCase();
            const options = Array.from(select.options);

            // Essayer de trouver une option intelligente
            let selectedOption = null;

            // Check in custom QAs (Learned Memory)
            const cleanSelectLabel = extractLabelText(select, modal);
            const rememberedSelectAnswer = findRememberedAnswer(cleanSelectLabel, customQAs);
            if (rememberedSelectAnswer !== null) {
              selectedOption = options.find(opt => opt.text.trim().toLowerCase() === rememberedSelectAnswer.toLowerCase() || opt.text.trim().includes(rememberedSelectAnswer));
              if (selectedOption) log(`🧠 Dropdown filled from Learned Memory: "${cleanSelectLabel}" -> "${selectedOption.text}"`);
            }

            // Notice Period dropdown selection
            else if (label.match(/notice|availability|préavis/)) {
              if (config.noticePeriod !== undefined) {
                const days = parseInt(config.noticePeriod, 10);
                selectedOption = options.find(opt => {
                  const text = opt.text.toLowerCase();
                  if (days === 0 && (text.includes('immediate') || text.includes('no notice') || text.includes('immédiat'))) return true;
                  if (text.includes(days.toString())) return true;
                  if (days === 30 && (text.includes('1 month') || text.includes('one month') || text.includes('4 weeks') || text.includes('1 mois'))) return true;
                  if (days === 60 && (text.includes('2 month') || text.includes('two month') || text.includes('8 weeks') || text.includes('2 mois'))) return true;
                  if (days === 90 && (text.includes('3 month') || text.includes('three month') || text.includes('12 weeks') || text.includes('3 mois'))) return true;
                  return false;
                });
                if (!selectedOption && options.length > 1) {
                  selectedOption = options[1];
                }
              }
            }

            // Gender dropdown
            if (label.match(/gender|genre|sex/)) {
              const val = config.gender || 'decline';
              selectedOption = options.find(opt => {
                const text = opt.text.toLowerCase();
                if (val === 'decline') return text.includes('decline') || text.includes('prefer not') || text.includes('non-disclosed');
                if (val === 'male') return text.match(/^male\b/) || text.match(/^homme\b/);
                if (val === 'female') return text.match(/^female\b/) || text.match(/^femme\b/);
                return false;
              });
              if (selectedOption) log(`Dropdown Gender: ${selectedOption.text}`);
            }
            // Race / Ethnicity dropdown
            else if (label.match(/race|ethnicity|ethnie/)) {
              const val = config.race || 'decline';
              selectedOption = options.find(opt => {
                const text = opt.text.toLowerCase();
                if (val === 'decline') return text.includes('decline') || text.includes('prefer not');
                return text.includes(val);
              });
              if (selectedOption) log(`Dropdown Race: ${selectedOption.text}`);
            }
            // Veteran status dropdown
            else if (label.match(/veteran|vétéran/)) {
              const val = config.veteran || 'decline';
              selectedOption = options.find(opt => {
                const text = opt.text.toLowerCase();
                if (val === 'decline') return text.includes('decline') || text.includes('prefer not');
                if (val === 'yes') return text.includes('identify as') || text.includes('am a veteran') || text.match(/\byes\b/);
                if (val === 'no') return text.includes('not a veteran') || text.match(/\bno\b/);
                return false;
              });
              if (selectedOption) log(`Dropdown Veteran: ${selectedOption.text}`);
            }
            // Disability status dropdown
            else if (label.match(/disabilit/)) {
              const val = config.disability || 'decline';
              selectedOption = options.find(opt => {
                const text = opt.text.toLowerCase();
                if (val === 'decline') return text.includes('decline') || text.includes('prefer not');
                if (val === 'yes') return text.includes('have a disability') || text.match(/\byes\b/);
                if (val === 'no') return text.includes('do not have') || text.match(/\bno\b/);
                return false;
              });
              if (selectedOption) log(`Dropdown Disability: ${selectedOption.text}`);
            }
            // Language proficiency questions (English, French, Spanish, etc.)
            // "What is your level of proficiency in English?"
            else if (label.match(/proficiency|level.*english|level.*french|level.*spanish|level.*german|niveau.*anglais|niveau.*français|nivel.*inglés/)) {
              // Priority order: Native > Fluent > Professional > Intermediate
              selectedOption = options.find(opt => {
                const text = opt.text.toLowerCase();
                return text.includes('native') || text.includes('bilingual') || text.includes('bilingue') || text.includes('langue maternelle');
              });

              if (!selectedOption) {
                selectedOption = options.find(opt => {
                  const text = opt.text.toLowerCase();
                  return text.includes('fluent') || text.includes('courant') || text.includes('fluide');
                });
              }

              if (!selectedOption) {
                selectedOption = options.find(opt => {
                  const text = opt.text.toLowerCase();
                  return text.includes('professional') || text.includes('professionnel') || text.includes('advanced');
                });
              }

              log(`Dropdown language proficiency: ${selectedOption ? selectedOption.text : 'fallback'}`);
            }
            // General language questions
            else if (label.match(/english|anglais|language|langue|french|français|spanish|español|german|deutsch/)) {
              selectedOption = options.find(opt => {
                const text = opt.text.toLowerCase();
                return text.includes('native') || text.includes('bilingual') || text.includes('fluent') ||
                       text.includes('courant') || text.includes('professionnel') || text.includes('bilingue');
              });
              log(`Dropdown language: ${selectedOption ? selectedOption.text : 'fallback'}`);
            }

            // Smart general heuristics for select options
            if (!selectedOption) {
              const q = label;
              // Relocation
              if (q.match(/relocate|commute|travel|hybrid|remote/)) {
                const target = config.willingToRelocate ? 'yes' : 'no';
                selectedOption = options.find(opt => opt.text.toLowerCase().trim() === target || opt.text.toLowerCase().includes(target));
              }
              // Sponsorship
              else if (q.match(/sponsor|visa/)) {
                const target = config.visaSponsorship ? 'yes' : 'no';
                selectedOption = options.find(opt => opt.text.toLowerCase().trim() === target || opt.text.toLowerCase().includes(target));
              }
              // Legally authorized
              else if (q.match(/authorized|legal/)) {
                const target = config.legallyAuthorized ? 'yes' : 'no';
                selectedOption = options.find(opt => opt.text.toLowerCase().trim() === target || opt.text.toLowerCase().includes(target));
              }
              // Driver's license
              else if (q.match(/driver|license/)) {
                const target = config.driversLicense ? 'yes' : 'no';
                selectedOption = options.find(opt => opt.text.toLowerCase().trim() === target || opt.text.toLowerCase().includes(target));
              }
              // Generic Yes/No skill or experience questions
              else if (q.match(/have you|do you|experience|bachelor|degree|diploma/)) {
                selectedOption = options.find(opt => opt.text.toLowerCase().trim() === 'yes' || opt.text.toLowerCase().includes('yes'));
              }
            }

            // Si pas trouvé, prendre option 1 (pas 0 car souvent "Select...")
            if (!selectedOption && options.length > 1) {
              selectedOption = options[1];
            }

            if (selectedOption) {
              select.value = selectedOption.value;
              select.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }

          // 6. DROPDOWN CUSTOM LINKEDIN (Python ligne 668)
          const customDropdowns = modal.querySelectorAll('button[aria-haspopup="listbox"], button.artdeco-dropdown__trigger');
          for (let dropdown of customDropdowns) {
            // Get label/question text for smart selection
            let questionText = '';
            questionText += ' ' + (dropdown.getAttribute('aria-label') || '');
            questionText += ' ' + (dropdown.textContent || '');

            // Look for associated label
            const dropdownId = dropdown.getAttribute('id');
            if (dropdownId) {
              const labelEl = modal.querySelector(`label[for="${dropdownId}"]`);
              if (labelEl) questionText += ' ' + labelEl.textContent;
            }
            const parentDiv = dropdown.closest('div[class*="form-component"]');
            if (parentDiv) {
              const label = parentDiv.querySelector('label, legend, span[class*="label"]');
              if (label) questionText += ' ' + label.textContent;
            }

            const question = questionText.toLowerCase();

            // Cliquer pour ouvrir
            dropdown.click();
            await wait(500);

            // Chercher les options
            const listbox = document.querySelector('[role="listbox"]');
            if (listbox) {
              const options = Array.from(listbox.querySelectorAll('[role="option"]'));
              if (options.length > 0) {
                let selectedOption = null;

                // Language proficiency questions
                if (question.match(/proficiency|level.*english|level.*french|level.*spanish|niveau.*anglais|nivel.*inglés/)) {
                  // Try: Native/Bilingual first
                  selectedOption = options.find(opt => {
                    const text = opt.textContent.toLowerCase();
                    return text.includes('native') || text.includes('bilingual') || text.includes('bilingue');
                  });

                  // Then: Fluent
                  if (!selectedOption) {
                    selectedOption = options.find(opt => {
                      const text = opt.textContent.toLowerCase();
                      return text.includes('fluent') || text.includes('courant');
                    });
                  }

                  // Then: Professional
                  if (!selectedOption) {
                    selectedOption = options.find(opt => {
                      const text = opt.textContent.toLowerCase();
                      return text.includes('professional') || text.includes('professionnel') || text.includes('advanced');
                    });
                  }

                  log(`Custom dropdown language: ${selectedOption ? selectedOption.textContent.substring(0, 30) : 'fallback'}`);
                }

                // If no smart match, take first valid option (not "Select...")
                if (!selectedOption) {
                  selectedOption = options.find(opt =>
                    !opt.textContent.toLowerCase().includes('select') &&
                    !opt.textContent.toLowerCase().includes('choose') &&
                    !opt.textContent.toLowerCase().includes('choisir')
                  );
                }

                if (selectedOption) {
                  selectedOption.click();
                  log(`Dropdown custom: ${selectedOption.textContent.substring(0, 30)}`);
                  await wait(300);
                }
              }
            }
          }

          await wait(1500);

          // Scroll ALL scrollable containers inside modal to make buttons visible
          scrollModalToBottom(modal);
          window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' });
          await wait(1000);

          // Find Next/Submit/Review/Continue button (with retry)
          const stepInfo = getStepInfo(modal);
          if (stepInfo) {
            log(`📄 Easy Apply step ${stepInfo.current} of ${stepInfo.total}`);
          }

          let nextBtn = null;
          for (let btnAttempt = 0; btnAttempt < 3; btnAttempt++) {
            if (btnAttempt > 0) { log(`Retrying primary action button search (${btnAttempt}/2)...`); await wait(2000); }
            nextBtn = findPrimaryActionButton(modal);
            if (nextBtn) break;
          }

          // Safety: if we are on the last step but the chosen button is not a
          // submit/apply button, look harder for a terminal button.
          const terminalTexts = ['submit', 'soumettre', 'postuler', 'envoyer', 'send'];
          if (nextBtn && stepInfo && stepInfo.current >= stepInfo.total) {
            const chosenText = nextBtn.textContent.toLowerCase();
            const isTerminal = terminalTexts.some(t => chosenText.includes(t)) ||
                               (chosenText.includes('apply') && !chosenText.includes('application') && !chosenText.includes('review'));
            if (!isTerminal) {
              log('⚠️ Last step detected but selected button is not terminal; searching for Submit/Apply explicitly');
              const terminalBtn = Array.from(modal.querySelectorAll('button'))
                .filter(isVisible)
                .find(b => {
                  const t = b.textContent.toLowerCase();
                  const a = (b.getAttribute('aria-label') || '').toLowerCase();
                  return terminalTexts.some(txt => t.includes(txt) || a.includes(txt));
                });
              if (terminalBtn) {
                log(`  Found explicit terminal button: "${terminalBtn.textContent.trim().substring(0,30)}"`);
                nextBtn = terminalBtn;
              }
            }
          }

          if (!nextBtn) {
            log('No Next/Submit/Review/Continue button found, skipping job');
            await discardApplication();
            skippedCount++;
            updateSkippedCount();
            break;
          }

          log(`Found button: "${nextBtn.textContent.trim().substring(0,30)}" (disabled: ${nextBtn.disabled})`);

          // Capture state BEFORE clicking so we can tell if the page really advanced
          const beforeStepInfo = getStepInfo(modal);
          const beforeBtnText = nextBtn.textContent.trim().toLowerCase();
          const beforeSignature = getModalSignature(modal);

          // Learning Mode: Capture QAs on the current step before clicking Next/Submit
          try {
            await captureFormQAs(modal);
          } catch (e) {
            log('Error capturing QAs: ' + e.message);
          }

          // Force scroll button into view - scroll multiple ways
          nextBtn.scrollIntoView({ block: 'center', behavior: 'instant' });
          await wait(400);
          // Scroll again with different block to ensure visibility
          nextBtn.scrollIntoView({ block: 'end', behavior: 'instant' });
          await wait(400);

          const btnText = nextBtn.textContent.toLowerCase();
          const isSubmit = ['submit', 'soumettre', 'postuler', 'envoyer', 'send', 'terminer', 'terminé', 'done'].some(t => btnText.includes(t)) ||
                           (btnText.includes('apply') && !btnText.includes('application') && !btnText.includes('review'));

          // IMPORTANT: Unfollow AVANT de cliquer Submit (Python ligne 1974)
          if (isSubmit) {
            log('Avant Submit: unfollow entreprise...');

            // Chercher checkbox Follow company (Python ligne 1319)
            const followCheckbox = modal.querySelector('input[id="follow-company-checkbox"]') ||
                                  modal.querySelector('input[id*="follow-company"][type="checkbox"]');

            if (followCheckbox && followCheckbox.checked) {
              followCheckbox.scrollIntoView({ block: 'center', behavior: 'instant' });
              await wait(300);

              // Click checkbox itself first
              followCheckbox.click();
              await wait(200);

              // If still checked, try clicking label or parent
              if (followCheckbox.checked) {
                const label = modal.querySelector(`label[for="${followCheckbox.id}"]`) ||
                              followCheckbox.closest('label') ||
                              followCheckbox.parentElement;
                if (label) {
                  await click(label);
                }
              }
              log(`✅ Entreprise UNFOLLOWED status: ${!followCheckbox.checked}`);
            } else {
              log('Checkbox Follow déjà décochée ou non trouvée');
            }

            await wait(500);

            // Re-find the submit button in case it was re-rendered after DOM mutation
            modal = document.querySelector('.jobs-easy-apply-modal') || modal;
            nextBtn = findPrimaryActionButton(modal);
          }

          if (!nextBtn) {
            // Give one final try by querying the modal from live DOM again
            modal = document.querySelector('.jobs-easy-apply-modal') || modal;
            nextBtn = findPrimaryActionButton(modal);
          }

          if (!nextBtn) {
            log('No Next/Submit/Review/Continue button found, skipping job');
            await discardApplication();
            skippedCount++;
            updateSkippedCount();
            break;
          }

          // Ensure button is scrolled back into view
          scrollModalToBottom(modal);
          nextBtn.scrollIntoView({ block: 'center', behavior: 'instant' });
          await wait(300);

          // Vérifier que le bouton n'est pas disabled (attendre jusqu'à 5s s'il l'est)
          let buttonDisabledRetries = 0;
          while (nextBtn.disabled || nextBtn.getAttribute('aria-disabled') === 'true') {
            log('⚠️ Button is disabled, waiting for it to enable (validation/processing in progress)...');
            await wait(1000);
            buttonDisabledRetries++;

            // Re-find in case of re-render
            modal = document.querySelector('.jobs-easy-apply-modal') || modal;
            nextBtn = findPrimaryActionButton(modal);
            if (!nextBtn) break;

            if (buttonDisabledRetries > 5) {
              log('❌ STUCK: Button remains disabled after 5 seconds');
              log('⚠️ Probably validation error - DISCARDING');
              await discardApplication();
              skippedCount++;
              updateSkippedCount();
              break;
            }
          }

          if (!nextBtn || nextBtn.disabled || nextBtn.getAttribute('aria-disabled') === 'true') {
            break; // Exit step loop to move to next job
          }

          // Re-find right before click to ensure it's not a detached node
          modal = document.querySelector('.jobs-easy-apply-modal') || modal;
          nextBtn = findPrimaryActionButton(modal) || nextBtn;

          // Click with multiple methods for robustness
          try {
            log(`Clicking: "${nextBtn.textContent.trim().substring(0,30)}"`);
            nextBtn.click();
            nextBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
          } catch (e) {
            log(`⚠️ Click methods failed: ${e.message}`);
            // Last resort: Enter key
            nextBtn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
            nextBtn.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', keyCode: 13, bubbles: true }));
          }
          await wait(500);

          // Attendre que la page change
          await wait(1000); // Optimized page change wait

          // Vérifier si vraiment passé à l'étape suivante
          const stillSameModal = document.querySelector('.jobs-easy-apply-modal');
          if (stillSameModal && !isSubmit) {
            // Vérifier si une erreur est affichée (validation failed)
            const errorMessages = [
              '[role="alert"]',
              '.artdeco-inline-feedback--error',
              '.fb-form-element-label__error'
            ];

            for (let selector of errorMessages) {
              const errors = stillSameModal.querySelectorAll(selector);
              for (let error of errors) {
                if (error.offsetParent !== null) { // Visible
                  const errorText = error.textContent.toLowerCase();

                  // Check for validation errors
                  if (errorText.includes('please enter') ||
                      errorText.includes('valid answer') ||
                      errorText.includes('required') ||
                      errorText.includes('must be') ||
                      errorText.includes('invalid') ||
                      errorText.includes('veuillez') ||
                      errorText.includes('requis')) {

                    log(`❌ VALIDATION ERROR: ${error.textContent.substring(0, 60)}`);
                    log('⚠️ Cannot fix validation error - DISCARDING application');

                    await discardApplication();
                    skippedCount++;
                    updateSkippedCount();

                    // Break out of step loop
                    step = 999;
                    break;
                  }
                }
              }
              if (step === 999) break;
            }

            // If we're discarding, break out
            if (step === 999) break;
          }

          // Detect whether the modal actually advanced to a new page
          if (!isSubmit) {
            const modalAfter = document.querySelector('.jobs-easy-apply-modal');
            const afterStepInfo = getStepInfo(modalAfter);
            const afterBtn = findPrimaryActionButton(modalAfter);
            const afterBtnText = afterBtn ? afterBtn.textContent.trim().toLowerCase() : '';
            const afterSignature = getModalSignature(modalAfter);

            const stepAdvanced = beforeStepInfo && afterStepInfo &&
                                 afterStepInfo.current > beforeStepInfo.current;
            const buttonChanged = beforeBtnText && afterBtnText &&
                                  beforeBtnText !== afterBtnText;
            const signatureChanged = beforeSignature && afterSignature &&
                                     beforeSignature !== afterSignature;
            const modalClosed = !modalAfter || modalAfter.offsetParent === null;

            const advanced = modalClosed || stepAdvanced || buttonChanged || signatureChanged;

            log(`  Advancement check: stepAdvanced=${stepAdvanced}, buttonChanged=${buttonChanged}("${beforeBtnText}"->"${afterBtnText}"), signatureChanged=${signatureChanged}, modalClosed=${modalClosed}`);

            if (!advanced && modalAfter) {
              samePageRetries++;
              if (samePageRetries > maxSamePageRetries) {
                log('❌ Stuck on same page after retries, discarding application');
                await discardApplication();
                skippedCount++;
                updateSkippedCount();
                break;
              }
              log(`⏳ Page did not advance after click, retrying same step (${samePageRetries}/${maxSamePageRetries})`);
              step--; // retry same step
              await wait(2000);
              continue;
            }

            // Page advanced (or modal closed) - reset retry counter
            samePageRetries = 0;
          }

          if (isSubmit) {
            log('✅ Submit cliqué !');
            appliedCount++;

            // Sauvegarder le job appliqué pour export
            appliedJobs.push({
              title: jobTitle,
              company: jobCompany,
              link: jobLink,
              date: new Date().toISOString(),
              tailoredResume: currentTailoredText || '',
              hiringTeam: capturedHiringTeam || getHiringTeamDetails()
            });
            updateAppliedCount();
            saveAppliedJobsToStorage();

            const capReached = await checkDailyAppLimitAndIncrement();
            if (capReached) {
              break;
            }

            // OPTIMIZED: Check modal status immediately after Submit
            log('🔍 Checking if modal closed after Submit...');
            await wait(1000); // Short wait to let page process

            // OPTIMIZATION: Check if modal already closed (means application is complete)
            let modalCheck = document.querySelector('.jobs-easy-apply-modal, [role="dialog"], .artdeco-modal');
            if (!modalCheck || !isVisible(modalCheck)) {
              log('✅ Modal closed immediately - Application completed!');
              updateActivity();

              // Skip all waiting - application is done
              log('--- End of job processing, moving to next ---');
              await wait(500); // Ultra optimized wait before next job
              break;
            }

            // Modal still open - need to find Done button
            log('⏳ Modal still open, searching for Done button...');
            await wait(1000); // Optimized Done button wait

            // Use improved Done button finder
            const result = await findAndClickDoneButton(document, 'Main Modal', 15);

            if (!result.clicked) {
              log('⚠️ Done button not found, checking modal status...');
              const modal = document.querySelector('.jobs-easy-apply-modal');
              if (modal && isVisible(modal)) {
                log('⚠️ Modal still open, trying to close it...');
                await discardApplication();
              } else {
                log('✅ Modal closed during search');
              }
            }

            // Final check: is there an "Application sent" modal?
            await wait(1500);
            let sentModal = document.querySelector('.jobs-easy-apply-modal, [role="dialog"], .artdeco-modal');
            if (sentModal && isVisible(sentModal)) {
              log('📨 "Application sent" modal detected, clicking Done...');
              const sentResult = await findAndClickDoneButton(sentModal, 'Application Sent Modal', 8);

              if (!sentResult.clicked) {
                log('⚠️ Done button not found in sent modal, forcing discard');
                await discardApplication();
              }
            }

            // Application completed
            log('✅ Application completed, moving to next job');
            log('--- End of job processing ---');
            await wait(500); // Ultra optimized wait before next job
            break;
          }
        }
      }

      // Check if bot was stopped during job processing (e.g., daily limit reached)
      if (!isRunning) {
        log('🛑 Bot stopped during job processing - Exiting main loop');
        break; // Exit the while loop
      }

      // Ensure no apply modal is open before pagination to prevent breaking the flow
      const openModalCheck = document.querySelector('.jobs-easy-apply-modal, [role="dialog"], .artdeco-modal');
      if (openModalCheck && isVisible(openModalCheck)) {
        log('⚠️ Warning: Application modal/dialog is still open before pagination. Discarding it...');
        await discardApplication();
        await wait(1000);
      }

      // Store current first job ID to detect SPA page change
      const firstJobCard = document.querySelector('li[data-occludable-job-id]');
      const oldFirstJobId = firstJobCard ? firstJobCard.getAttribute('data-occludable-job-id') : null;

      // Page suivante (Python ligne 2047) - IMPROVED WITH FALLBACKS
      log('🔍 Recherche page suivante...');
      let nextPageClicked = false;

      // COLLECTIONS PAGE: Use infinite scroll instead of pagination
      if (isCollectionsPage) {
        log('📜 Collections page - using infinite scroll');

        // Get the job list container
        const jobListContainer = document.querySelector('.jobs-search-results-list, .scaffold-layout__list-container, .jobs-search-results__list');

        if (jobListContainer) {
          const currentJobCount = jobCards.length;

          // Scroll to bottom to trigger loading more jobs
          jobListContainer.scrollTo({ top: jobListContainer.scrollHeight, behavior: 'smooth' });
          window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });

          log('📜 Scrolled down to load more jobs...');
          await wait(2000);

          // Check if new jobs were loaded
          const newJobCount = document.querySelectorAll('li[data-occludable-job-id], .jobs-search-results__list-item, .scaffold-layout__list-item').length;

          if (newJobCount > currentJobCount) {
            log(`✅ Loaded ${newJobCount - currentJobCount} more jobs (total: ${newJobCount})`);
            nextPageClicked = true;
          } else {
            log('📋 No more jobs to load (reached end of collection)');
          }
        }
      }

      // SEARCH PAGE: Use standard pagination
      // METHOD 1: Try pagination by page number
      const pagination = document.querySelector('.jobs-search-pagination__pages');
      if (!nextPageClicked) {
        if (pagination) {
          const activeBtn = pagination.querySelector('button.active, button[aria-current="true"], li.active button, li.selected button');
          if (activeBtn) {
            const currentPage = parseInt(activeBtn.textContent);
            log(`📄 Page actuelle: ${currentPage}`);

            // Try to find next page button
            const nextPageBtn = pagination.querySelector(`button[aria-label="Page ${currentPage + 1}"]`) ||
                               pagination.querySelector(`button[data-test-pagination-page-btn="${currentPage + 1}"]`);

            if (nextPageBtn && isVisible(nextPageBtn)) {
              log(`✅ Clique sur page ${currentPage + 1}`);
              await click(nextPageBtn);
              await wait(1000); // Ultra optimized page load wait
              nextPageClicked = true;
            }
          }
        }
      }

      // METHOD 2: Try "Next" button (fallback)
      if (!nextPageClicked) {
        log('🔍 Recherche bouton "Next"...');
        const nextButtons = Array.from(document.querySelectorAll('button, [role="button"]'));

        for (let btn of nextButtons) {
          if (!isVisible(btn)) continue; // Skip hidden

          const btnText = btn.textContent.trim().toLowerCase();
          const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();

          // Check for "Next" in multiple languages
          if (btnText === 'next' || btnText === 'suivant' || btnText === 'siguiente' ||
              ariaLabel.includes('next') || ariaLabel.includes('suivant')) {

            // Make sure it's the pagination next, not a form next
            const isPaginationNext = btn.closest('.jobs-search-pagination') ||
                                    btn.closest('[class*="pagination"]') ||
                                    btn.getAttribute('aria-label')?.includes('page');

            if (isPaginationNext) {
              log('✅ Clique sur bouton Next');
              await click(btn);
              await wait(1000); // Ultra optimized page load wait
              nextPageClicked = true;
              break;
            }
          }
        }
      }

      // METHOD 3: Try icon-based next button (LinkedIn uses icons)
      if (!nextPageClicked) {
        const iconNextBtn = document.querySelector('.jobs-search-pagination button[aria-label*="Next"], .jobs-search-pagination button svg[class*="chevron-right"]')?.closest('button');
        if (iconNextBtn && isVisible(iconNextBtn) && !iconNextBtn.disabled) {
          log('✅ Clique sur bouton Next (icône)');
          await click(iconNextBtn);
          await wait(1000); // Ultra optimized page load wait
          nextPageClicked = true;
        }
      }

      if (nextPageClicked) {
        log('✅ Passage à la page suivante réussi. Attente du chargement des nouvelles offres...');
        
        let pageLoaded = false;
        const pageLoadStart = Date.now();
        while (Date.now() - pageLoadStart < 8000) { // Max 8 seconds wait
          await wait(500);
          const currentFirstJob = document.querySelector('li[data-occludable-job-id]');
          const currentFirstJobId = currentFirstJob ? currentFirstJob.getAttribute('data-occludable-job-id') : null;
          
          if (currentFirstJobId && currentFirstJobId !== oldFirstJobId) {
            pageLoaded = true;
            break;
          }
        }
        
        if (pageLoaded) {
          log('✅ Nouvelles offres chargées avec succès !');
        } else {
          log('⚠️ Offres identiques ou délai d\'attente dépassé, continuation...');
        }
        continue;
      } else {
        log('📋 Fin des pages - Aucune page suivante trouvée');
        break;
      }
    } catch (error) {
      log(`Erreur: ${error.message}`);
      await wait(1500); // Optimized error wait
    }
  }

  log('Arrêt');
}

// Vérifier si le job contient des mots blacklistés
function shouldSkipByBlacklist(title, company, description, blacklistKeywords) {
  if (!blacklistKeywords || blacklistKeywords.trim() === '') return false;

  // Parse keywords (comma-separated)
  const keywords = blacklistKeywords.toLowerCase().split(',').map(k => k.trim()).filter(k => k);
  if (keywords.length === 0) return false;

  // Combine all job text
  const jobText = (title + ' ' + company + ' ' + description).toLowerCase();

  // Check each keyword
  for (let keyword of keywords) {
    if (jobText.includes(keyword)) {
      log(`⏭️ Skip (Blacklist): "${keyword}" found in job`);
      log(`   Title: ${title.substring(0, 50)}`);
      return true;
    }
  }

  return false;
}

// Extraire années d'expérience requises du texte (multilingue)
function extractYearsRequired(text) {
  if (!text) return 0;

  // Patterns multilingues pour années d'expérience
  const patterns = [
    // English: "5+ years", "5-8 years", "5 years"
    /(\d+)\+?\s*(?:years?|yrs?)/gi,
    // French: "5 ans", "5+ ans", "5 années"
    /(\d+)\+?\s*(?:ans?|années?)/gi,
    // Spanish: "5 años"
    /(\d+)\+?\s*años?/gi,
    // German: "5 Jahre"
    /(\d+)\+?\s*jahre?/gi,
    // Italian: "5 anni"
    /(\d+)\+?\s*anni?/gi
  ];

  const years = [];
  patterns.forEach(pattern => {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const num = parseInt(match[1]);
      if (num > 0 && num <= 20) years.push(num);
    }
  });

  return years.length > 0 ? Math.max(...years) : 0;
}

// Vérifier si le job doit être skippé selon années requises
function shouldSkipByExperience(jobCard, maxYearsRequired) {
  if (!maxYearsRequired || maxYearsRequired <= 0) return false;

  try {
    // Chercher dans le titre et la description visible
    const title = jobCard.querySelector('.job-card-list__title, .artdeco-entity-lockup__title')?.textContent || '';
    const subtitle = jobCard.querySelector('.job-card-container__metadata-item')?.textContent || '';
    const combinedText = title + ' ' + subtitle;

    const yearsRequired = extractYearsRequired(combinedText);

    if (yearsRequired > 0 && yearsRequired > maxYearsRequired) {
      log(`⏭️ Skip: ${yearsRequired}+ years required (max: ${maxYearsRequired})`);
      return true;
    }
  } catch (error) {
    // Si erreur, ne pas skipper
  }

  return false;
}

// Fonction pour détecter si la page charge lentement (Python ligne 1440-1479)
async function isPageLoadingSlow() {
  try {
    // Check document readyState (Python ligne 1446)
    if (document.readyState === 'loading') {
      log(`⏳ Page still loading (readyState: ${document.readyState})`);
      return true;
    }

    // Chercher des spinners/loaders visibles (Python ligne 1517-1528)
    const spinners = document.querySelectorAll('[role="progressbar"], .artdeco-loader, .loading-spinner, .spinner, .loading');
    for (let spinner of spinners) {
      if (spinner.offsetParent !== null) { // Visible
        return true;
      }
    }

    // Vérifier si la modal est visible (Python ligne 1466-1469)
    const modal = document.querySelector('.jobs-easy-apply-modal');
    if (!modal || !isVisible(modal)) {
      return true; // Modal pas visible = en chargement
    }

    return false;
  } catch (error) {
    return true; // Assume slow loading on error (Python ligne 1477)
  }
}

// Fonction pour détecter si popup de chargement est BLOQUÉ (Python ligne 1513-1545)
function checkForStuckLoadingPopup() {
  try {
    // Auto-dismiss blocking dialogs during wait phases
    dismissInterruptivePopups();

    // Chercher les spinners/loaders de LinkedIn (Python ligne 1517-1528)
    const loadingIndicators = document.querySelectorAll(
      '.artdeco-loader, .loading, .spinner, [role="progressbar"]'
    );

    if (loadingIndicators.length > 0) {
      for (let indicator of loadingIndicators) {
        if (isVisible(indicator)) { // Visible
          log('⚠️ POPUP DE CHARGEMENT DÉTECTÉ ET VISIBLE!');
          return true;
        }
      }
    }

    // Vérifier aussi si le modal est figé (pas de boutons cliquables) (Python ligne 1531-1540)
    const modal = document.querySelector('.jobs-easy-apply-modal');
    if (modal && isVisible(modal)) {
      const buttons = modal.querySelectorAll('button');
      const clickableButtons = Array.from(buttons).filter(b =>
        !b.disabled && isVisible(b)
      );

      if (clickableButtons.length === 0) {
        log('⚠️ MODAL FIGÉ DÉTECTÉ (aucun bouton cliquable)!');
        return true;
      }
    }

    return false;
  } catch (error) {
    log(`⚠️ Erreur lors de la vérification du popup: ${error.message}`);
    return false;
  }
}

// Mettre à jour le compteur appliqués
function updateAppliedCount() {
  chrome.storage.local.set({ appliedCount: appliedCount });
  try {
    chrome.runtime.sendMessage({ type: 'updateCount', count: appliedCount });
    chrome.runtime.sendMessage({ type: 'jobApplied' });
  } catch (e) {}
}

// Mettre à jour le compteur skipped
function updateSkippedCount() {
  chrome.storage.local.set({ skippedCount: skippedCount });
  try {
    chrome.runtime.sendMessage({ type: 'updateSkippedCount', count: skippedCount });
  } catch (e) {}
}

// Sauvegarder les jobs appliqués dans le storage
function saveAppliedJobsToStorage() {
  chrome.storage.local.set({ appliedJobs: appliedJobs });
}

// ==========================================
// AI-POWERED QUESTION ANSWERING
// ==========================================
async function getAIAnswer(questionText, fieldType) {
  if (!config.aiAnswers || !config.aiResumeText) return null;

  try {
    const answer = await aiGenerateAnswer({
      question: questionText,
      fieldType,
      baseResumeText: config.aiResumeText
    });
    return answer ? answer.trim() : null;
  } catch (e) {
    log(`AI answer error: ${e.message}`);
    return null;
  }
}

// Listen for config changes in storage and update config dynamically
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync') {
    for (let key in changes) {
      if (!config) config = {};
      config[key] = changes[key].newValue;
      if (key === 'aiTailorResume') aiTailorResume = changes[key].newValue;
      if (key === 'aiResumeText') aiResumeText = changes[key].newValue;
    }
    log('🔄 Settings updated dynamically from storage');
  }
});

// Écouter les messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Handle async operations properly
  (async () => {
    try {
      if (request.action === 'ping') {
        sendResponse({ pong: true });
      } else if (request.action === 'start') {
        config = await chrome.storage.sync.get(null);

        // Charger les compteurs depuis storage
        const local = await chrome.storage.local.get(['appliedCount', 'skippedCount', 'appliedJobs', 'resumeFile', 'resumeFileName', 'resumeFileType', 'customQAs']);
        appliedCount = local.appliedCount || 0;
        skippedCount = local.skippedCount || 0;
        appliedJobs = local.appliedJobs || [];
        customQAs = local.customQAs || {};

        // Load resume data if available
        resumeFile = local.resumeFile || null;
        resumeFileName = local.resumeFileName || null;
        resumeFileType = local.resumeFileType || null;

        if (resumeFile) {
          log(`📄 Resume loaded: ${resumeFileName}`);
        } else {
          log('ℹ️ No resume uploaded - file upload fields will be skipped');
        }

        // Load AI tailoring flags
        aiTailorResume = config.aiTailorResume || false;
        aiResumeText = config.aiResumeText || '';
        currentTailoredPdf = null;
        currentTailoredText = '';
        if (aiTailorResume && aiResumeText) {
          log('🤖 AI Resume Tailoring ENABLED');
        } else if (aiTailorResume && !aiResumeText) {
          log('⚠️ AI Tailoring ON but no resume text uploaded — upload your resume in Settings');
        }

        log(`Config: ${config.firstName} ${config.lastName}, exp: ${config.yearsOfExperience || 2}, max required: ${config.maxYearsRequired || 3}`);
        log(`Counters: Applied ${appliedCount}, Skipped ${skippedCount}`);

        // SECURITY: Set both protection flags
        isRunning = true;
        userExplicitlyClickedStart = true; // CRITICAL: Only set when user clicks Start

        log('✅ Bot started by USER');
        log('🔒 Security flags set: isRunning=true, userExplicitlyClickedStart=true');

        // Update storage
        await chrome.storage.local.set({ isRunning: true });

        // Send response before starting main loop
        sendResponse({ success: true, message: 'Bot started' });

        // Notify popup that bot has started
        try {
          chrome.runtime.sendMessage({ type: 'botStarted' });
        } catch (e) {
          // Popup may be closed
        }

        // Start main loop (don't await - let it run in background)
        mainLoop().catch(err => console.error('[AutoApply] Main loop crashed:', err.message));
      } else if (request.action === 'stop') {
        isRunning = false;
        userExplicitlyClickedStart = false; // Clear security flag
        log('⏸️ Bot stopped by user');
        log('🔒 Security flags cleared: isRunning=false, userExplicitlyClickedStart=false');

        // Update storage
        await chrome.storage.local.set({ isRunning: false });

        sendResponse({ success: true, message: 'Bot stopped' });

        // Notify popup that bot has stopped
        try {
          chrome.runtime.sendMessage({ type: 'botStopped' });
        } catch (e) {
          // Popup may be closed
        }
      } else if (request.action === 'exportJobs') {
        // Exporter les jobs en CSV
        sendResponse({ jobs: appliedJobs });
      } else if (request.action === 'resetCounters') {
        appliedCount = 0;
        skippedCount = 0;
        appliedJobs = [];
        await chrome.storage.local.set({ appliedCount: 0, skippedCount: 0, appliedJobs: [] });
        updateAppliedCount();
        updateSkippedCount();
        sendResponse({ success: true, message: 'Counters reset' });
      } else if (request.action === 'clearAppliedJobs') {
        appliedJobs = [];
        await chrome.storage.local.set({ appliedJobs: [] });
        log('🗑️ Applied jobs list cleared');
        sendResponse({ success: true, message: 'Applied jobs cleared' });
      }
    } catch (error) {
      log(`❌ Message handler error: ${error.message}`);
      sendResponse({ success: false, error: error.message });
    }
  })();

  // Return true to indicate we will send a response asynchronously
  return true;
});

console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #0a66c2; font-weight: bold;');
console.log('%c🔒 AUTOAPPLYPRO v1.6.1 - DECLARATIVE CONTENT SCRIPT MODE', 'color: #0a66c2; font-weight: bold; font-size: 16px');
console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #0a66c2; font-weight: bold;');
console.log('%c✅ Script injected ONLY when you clicked START', 'color: green; font-weight: bold;');
console.log('%c🔒 NO automatic loading on LinkedIn pages', 'color: green; font-weight: bold;');
console.log('%c🚀 Bot will start automatically after injection', 'color: orange; font-weight: bold;');
console.log('%c📋 Supports: /jobs/search/ AND /jobs/collections/', 'color: cyan; font-weight: bold;');
console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #0a66c2; font-weight: bold;');
log('Script loaded v1.6.1 - Supports /jobs/search/ and /jobs/collections/');

// SECURITY: Clear ALL running state on page load to prevent auto-start
// Bot will ONLY start when user explicitly clicks "Start" button
(async () => {
  try {
    // CRITICAL: Clear ALL security flags
    isRunning = false;
    userExplicitlyClickedStart = false;

    // PURGE: Clean any residual running state from storage
    await chrome.storage.local.set({ isRunning: false });

    // Load counters and state for display only (don't start bot)
    const state = await chrome.storage.local.get(['appliedCount', 'skippedCount', 'appliedJobs']);
    appliedCount = state.appliedCount || 0;
    skippedCount = state.skippedCount || 0;
    appliedJobs = state.appliedJobs || [];

    console.log('%c⏸️ BOT STATUS: STOPPED (Waiting for START button)', 'background: #ff9800; color: white; font-weight: bold; padding: 4px 8px; border-radius: 3px;');
    log('ℹ️ Content script loaded - Bot ready (NOT running)');
    log('🔒 Security initialized: isRunning=false, userExplicitlyClickedStart=false');
    log(`📊 Current stats: Applied ${appliedCount}, Skipped ${skippedCount}`);
    log('⏸️ Waiting for user to click START button...');
    console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #0a66c2; font-weight: bold;');
    console.log('%c⚠️ IF YOU SEE ANY CLICKS WITHOUT CLICKING START:', 'color: red; font-weight: bold;');
    console.log('%c   Check console for 🚨 SECURITY VIOLATION errors', 'color: red; font-weight: bold;');
    console.log('%c   These will show WHERE the unauthorized click came from', 'color: red; font-weight: bold;');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  } catch (error) {
    log(`⚠️ Initialization error: ${error.message}`);
  }
})();

// Learning Mode: Capture form questions and answers
async function captureFormQAs(modal) {
  const local = await chrome.storage.local.get(['customQAs']);
  const storedQAs = local.customQAs || {};
  let updated = false;

  // 1. Text Inputs & Textareas
  const textInputs = modal.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"], input[type="number"], textarea');
  for (let input of textInputs) {
    const val = input.value?.trim();
    if (!val) continue; // Skip if empty

    const cleanLabel = extractLabelText(input, modal);
    if (cleanLabel.length > 3 && cleanLabel.length < 150) {
      const labelLower = cleanLabel.toLowerCase();
      // Exclude standard profile fields
      const isStandard = labelLower.match(/first|last|email|phone|city|experience|years|salary|compensation|linkedin|github|portfolio|resume|cv/);
      if (!isStandard) {
        if (storedQAs[cleanLabel] !== val) {
          storedQAs[cleanLabel] = val;
          updated = true;
          log(`🧠 Learned: "${cleanLabel}" -> "${val}"`);
        }
      }
    }
  }

  // 2. Select Dropdowns
  const selects = modal.querySelectorAll('select');
  for (let select of selects) {
    if (select.selectedIndex <= 0) continue;
    const val = select.options[select.selectedIndex].text?.trim();
    if (!val) continue;

    const cleanLabel = extractLabelText(select, modal);
    if (cleanLabel.length > 3 && cleanLabel.length < 150) {
      const labelLower = cleanLabel.toLowerCase();
      // Exclude standard dropdown fields
      const isStandard = labelLower.match(/gender|race|veteran|disabilit|proficiency|level|language/);
      if (!isStandard) {
        if (storedQAs[cleanLabel] !== val) {
          storedQAs[cleanLabel] = val;
          updated = true;
          log(`🧠 Learned Dropdown: "${cleanLabel}" -> "${val}"`);
        }
      }
    }
  }
  // 3. Radio Buttons
  const fieldsets = modal.querySelectorAll('fieldset[data-test-form-builder-radio-button-form-component], fieldset');
  for (let fieldset of fieldsets) {
    const radioInputs = fieldset.querySelectorAll('input[type="radio"]');
    if (radioInputs.length === 0) continue;

    const checkedRadio = Array.from(radioInputs).find(r => r.checked);
    if (!checkedRadio) continue;

    const radioLabel = fieldset.querySelector(`label[for="${checkedRadio.id}"]`);
    const val = radioLabel ? radioLabel.textContent.trim() : '';
    if (!val) continue;

    const questionLabel = fieldset.querySelector('legend, span[class*="title"], label');
    const cleanLabel = questionLabel ? questionLabel.textContent.replace(/\s+/g, ' ').trim() : '';

    if (cleanLabel.length > 3 && cleanLabel.length < 150) {
      const labelLower = cleanLabel.toLowerCase();
      const isStandard = labelLower.match(/gender|race|veteran|disabilit|visa|sponsor|author|legal.*work|permit.*work/);
      if (!isStandard) {
        if (storedQAs[cleanLabel] !== val) {
          storedQAs[cleanLabel] = val;
          updated = true;
          log(`🧠 Learned Radio: "${cleanLabel}" -> "${val}"`);
        }
      }
    }
  }
  if (updated) {
    await chrome.storage.local.set({ customQAs: storedQAs });
    customQAs = storedQAs;
  }
}

// Standardized Label Extraction Helper
function extractLabelText(input, modal) {
  let labelText = '';
  // aria-label
  labelText += ' ' + (input.getAttribute('aria-label') || '');
  // name attribute
  labelText += ' ' + (input.getAttribute('name') || '');
  // Associated <label> element
  const inputId = input.getAttribute('id');
  if (inputId) {
    const labelEl = modal.querySelector(`label[for="${inputId}"]`);
    if (labelEl) labelText += ' ' + labelEl.textContent;
  }
  // Parent label
  const parentLabel = input.closest('label');
  if (parentLabel) labelText += ' ' + parentLabel.textContent;

  // Sibling/Parent Container Label Fallback (handles LinkedIn unassociated labels)
  const formElement = input.closest('.jobs-easy-apply-form-element, .fb-dash-form-element, .jobs-easy-apply-form-section__grouping, .fb-form-element');
  if (formElement) {
    const labelEl = formElement.querySelector('label, .fb-form-element-label, .t-14, span[class*="label"]');
    if (labelEl) labelText += ' ' + labelEl.textContent;
  }

  return labelText.replace(/\s+/g, ' ').trim();
}

// Fuzzy matching Q&A locator
function findRememberedAnswer(currentLabel, customQAs) {
  const cleanCurrent = currentLabel.toLowerCase().trim();
  if (!cleanCurrent) return null;

  // 1. Direct or Substring match first
  for (let storedQ in customQAs) {
    const cleanStored = storedQ.toLowerCase().trim();
    if (cleanCurrent.includes(cleanStored) || cleanStored.includes(cleanCurrent)) {
      return customQAs[storedQ];
    }
  }

  // 2. Fuzzy Token similarity match
  const currentWords = cleanCurrent.replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2);
  if (currentWords.length === 0) return null;

  let bestMatch = null;
  let highestScore = 0;

  for (let storedQ in customQAs) {
    const storedWords = storedQ.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2);
    if (storedWords.length === 0) continue;

    const common = currentWords.filter(w => storedWords.includes(w));
    const score = common.length / Math.min(currentWords.length, storedWords.length);

    if (score >= 0.70 && score > highestScore) {
      highestScore = score;
      bestMatch = customQAs[storedQ];
    }
  }

  return bestMatch;
}

// Auto-dismiss interruptive non-essential popups and messaging windows
function dismissInterruptivePopups() {
  try {
    // 1. Dismiss non-Easy-Apply Artdeco modals (premium prompts, survey popups, etc.)
    const modals = document.querySelectorAll('.artdeco-modal');
    for (let modal of modals) {
      const modalText = modal.textContent.toLowerCase();
      const isEasyApply = modal.querySelector('.jobs-easy-apply-modal') || 
                          modal.querySelector('form') ||
                          modalText.includes('easy apply') ||
                          modalText.includes('application');
      if (!isEasyApply) {
        const closeBtn = modal.querySelector('button[aria-label="Dismiss"]') || 
                         modal.querySelector('button[aria-label="Close"]') ||
                         modal.querySelector('.artdeco-modal__dismiss');
        if (closeBtn) {
          log(`🧹 Auto-dismissed interruptive popup: "${modal.textContent.substring(0, 40).trim()}..."`);
          closeBtn.click();
        }
      }
    }

    // 2. Collapse expanded messaging overlay chat bubbles
    const expandedChat = document.querySelector('.msg-overlay-bubble-header[aria-expanded="true"]');
    if (expandedChat) {
      log('🧹 Collapsing blocking messaging window overlay');
      expandedChat.click();
    }
  } catch (e) {
    console.error('Error in dismissInterruptivePopups:', e);
  }
}

// Daily safety limit check and increment helper
async function checkDailyAppLimitAndIncrement() {
  try {
    const sync = await chrome.storage.sync.get(['dailyCapEnabled', 'dailyCapLimit']);
    const isCapEnabled = sync.dailyCapEnabled !== undefined ? sync.dailyCapEnabled : true;
    const capLimit = sync.dailyCapLimit !== undefined ? parseInt(sync.dailyCapLimit, 10) : 50;

    if (!isCapEnabled) return false;

    const local = await chrome.storage.local.get(['dailyAppDate', 'dailyAppCount']);
    const today = new Date().toLocaleDateString();
    
    let currentCount = local.dailyAppCount || 0;
    const lastDate = local.dailyAppDate;

    if (lastDate !== today) {
      currentCount = 0;
    }

    currentCount++;
    await chrome.storage.local.set({ dailyAppDate: today, dailyAppCount: currentCount });
    log(`📊 Daily Application Cap Progress: ${currentCount}/${capLimit}`);

    if (currentCount >= capLimit) {
      log(`🚨 DAILY LIMIT REACHED (${capLimit} jobs)! Auto-stopping bot for safety.`);
      isRunning = false;
      await chrome.storage.local.set({ isRunning: false });
      return true;
    }
    return false;
  } catch (e) {
    console.error('Error checking daily application cap:', e);
    return false;
  }
}
