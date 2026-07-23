// Popup script for Jd2Job UI management
/* global showToast, validateAllFields, setupValidation, checkOnboarding, jd2jobGetSession, jd2jobFetchMe, jd2jobSyncJobs, aiTailorResume, callDeepSeek */

let isRunning = false;
let lastTailoredText = null; // cached tailored resume from the last ATS analysis

// Config fields to persist via chrome.storage.sync
const SYNC_FIELDS = [
  'firstName', 'lastName', 'email', 'phone', 'phoneCountryCode', 'city',
  'yearsOfExperience', 'maxYearsRequired', 'blacklistKeywords', 'expectedSalary',
  'visaSponsorship', 'legallyAuthorized', 'willingToRelocate', 'driversLicense',
  'apiKey', 'aiAnswers', 'aiTailorResume', 'aiResumeText', 'autoNextPage',
  'linkedin', 'github', 'portfolio', 'noticePeriod', 'gender', 'race', 'veteran', 'disability',
  'jobSearchTitle', 'postalCode', 'dailyCapEnabled', 'dailyCapLimit'
];

// Local fields to persist via chrome.storage.local
const LOCAL_FIELDS = [
  'appliedCount', 'skippedCount', 'resumeFile', 'resumeFileName', 'resumeFileType'
];

document.addEventListener('DOMContentLoaded', async () => {
  setupTabs();
  setupToggleApiKey();
  setupResumeUpload();
  setupValidation();
  await loadConfig();
  await renderLearnedQAs();
  await updateStatus();
  checkOnboarding();
  await updateSyncStatusBanner();
  syncJobsToCloud();

  // Listen for session changes to update the banner instantly
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.jd2jobSession) {
      updateSyncStatusBanner();
    }
  });

  // Control Buttons
  document.getElementById('start-btn').addEventListener('click', startBot);
  document.getElementById('search-jobs-btn').addEventListener('click', searchJobs);
  document.getElementById('stop-btn').addEventListener('click', stopBot);
  document.getElementById('save-btn').addEventListener('click', saveConfigData);
  document.getElementById('reset-btn').addEventListener('click', resetCounters);
  document.getElementById('export-btn').addEventListener('click', exportAppliedJobs);

  const btnAnalyzeAts = document.getElementById('btn-analyze-ats');
  if (btnAnalyzeAts) btnAnalyzeAts.addEventListener('click', analyzeAtsScore);
  const btnDownloadTailored = document.getElementById('btn-download-tailored');
  if (btnDownloadTailored) btnDownloadTailored.addEventListener('click', downloadTailoredResume);

  // Cover Letter Buttons
  const btnGenCover = document.getElementById('btn-gen-cover');
  if (btnGenCover) btnGenCover.addEventListener('click', generateCoverLetter);
  const btnDownloadCover = document.getElementById('btn-download-cover');
  if (btnDownloadCover) btnDownloadCover.addEventListener('click', downloadCoverLetter);

  // Manual Q&A Form Toggles
  const btnToggleManual = document.getElementById('btn-toggle-manual-qa');
  if (btnToggleManual) {
    btnToggleManual.addEventListener('click', () => {
      const form = document.getElementById('manual-qa-form');
      if (form) {
        const isHidden = form.style.display === 'none';
        form.style.display = isHidden ? 'block' : 'none';
        btnToggleManual.textContent = isHidden ? 'Close Form' : '+ Add Q&A';
      }
    });
  }
  const btnSaveManual = document.getElementById('btn-save-manual-qa');
  if (btnSaveManual) btnSaveManual.addEventListener('click', saveManualQA);

  const clearLogsBtn = document.getElementById('clear-logs-btn');
  if (clearLogsBtn) {
    clearLogsBtn.addEventListener('click', () => {
      const container = document.getElementById('log-container');
      if (container) container.innerHTML = '';
    });
  }
});

// Setup tab navigation
function setupTabs() {
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));

      tab.classList.add('active');
      const tabName = tab.getAttribute('data-tab');
      document.getElementById(`${tabName}-tab`).classList.add('active');
      if (tabName === 'settings') {
        renderLearnedQAs();
      } else if (tabName === 'history') {
        renderHistory();
      }
    });
  });
}

// Show/Hide API Key
function setupToggleApiKey() {
  const apiKeyInput = document.getElementById('apiKey');
  const toggleBtn = document.getElementById('toggle-api-key');
  toggleBtn.addEventListener('click', () => {
    if (apiKeyInput.type === 'password') {
      apiKeyInput.type = 'text';
      toggleBtn.textContent = '🔒';
    } else {
      apiKeyInput.type = 'password';
      toggleBtn.textContent = '👁';
    }
  });
}



// Load configurations from storage
async function loadConfig() {
  try {
    const syncData = await chrome.storage.sync.get(SYNC_FIELDS);
    const localData = await chrome.storage.local.get(LOCAL_FIELDS);

    // Sync Fields
    SYNC_FIELDS.forEach(field => {
      const element = document.getElementById(field);
      if (!element) return;

      if (element.type === 'checkbox') {
        element.checked = syncData[field] !== undefined ? syncData[field] : (field === 'autoNextPage' || field === 'dailyCapEnabled');
      } else {
        if (field === 'dailyCapLimit' && syncData[field] === undefined) {
          element.value = 50;
        } else {
          element.value = syncData[field] !== undefined ? syncData[field] : '';
        }
      }
    });

    // Handle conditional fields view
    toggleAiResumeTextVisibility();
    const aiTailorCheckbox = document.getElementById('aiTailorResume');
    aiTailorCheckbox.addEventListener('change', toggleAiResumeTextVisibility);

    // Local Fields (Counters)
    document.getElementById('applied-count').textContent = localData.appliedCount || 0;
    document.getElementById('skipped-count').textContent = localData.skippedCount || 0;

    // Resume file display
    if (localData.resumeFileName) {
      document.getElementById('resumeFileName').textContent = localData.resumeFileName;
      document.getElementById('removeResumeBtn').style.display = 'inline-block';
      document.getElementById('uploadResumeBtn').textContent = 'Change File';

      const sFileNameSpan = document.getElementById('settingsResumeFileName');
      if (sFileNameSpan) sFileNameSpan.textContent = localData.resumeFileName;
      const sRemoveBtn = document.getElementById('settingsRemoveResumeBtn');
      if (sRemoveBtn) sRemoveBtn.style.display = 'inline-block';
      const sUploadBtn = document.getElementById('settingsUploadResumeBtn');
      if (sUploadBtn) sUploadBtn.textContent = 'Change File';
    }
  } catch (e) {
    console.error('Error loading config:', e);
  }
}

function toggleAiResumeTextVisibility() {
  const aiTailorCheckbox = document.getElementById('aiTailorResume');
  const referenceTextGroup = document.getElementById('ai-resume-text-group');
  if (aiTailorCheckbox.checked) {
    referenceTextGroup.style.display = 'flex';
  } else {
    referenceTextGroup.style.display = 'none';
  }
}

// Save configs
async function saveConfigData() {
  if (!validateAllFields()) {
    showToast('Please fix validation errors first.', 'error');
    return;
  }

  const syncData = {};
  SYNC_FIELDS.forEach(field => {
    const element = document.getElementById(field);
    if (!element) return;

    if (element.type === 'checkbox') {
      syncData[field] = element.checked;
    } else if (element.type === 'number') {
      syncData[field] = element.value ? parseInt(element.value, 10) : '';
    } else {
      syncData[field] = element.value;
    }
  });

  try {
    await chrome.storage.sync.set(syncData);
    if ((syncData.aiAnswers || syncData.aiTailorResume) && (!syncData.aiResumeText || !syncData.aiResumeText.trim())) {
      showToast('Warning: Answering/Tailoring enabled but "AI Resume Reference Text" is empty. Please paste your plain text resume for AI features to work.', 'warning');
    } else {
      showToast('Settings saved successfully!', 'success');
    }
    updateSyncStatusBanner();
    syncJobsToCloud();
  } catch (e) {
    showToast('Failed to save settings: ' + e.message, 'error');
  }
}

// Resume Upload & Base64 parsing
function setupResumeUpload() {
  const uploadBtn = document.getElementById('uploadResumeBtn');
  const fileInput = document.getElementById('resumeFile');
  const fileNameSpan = document.getElementById('resumeFileName');
  const removeBtn = document.getElementById('removeResumeBtn');

  const sUploadBtn = document.getElementById('settingsUploadResumeBtn');
  const sFileInput = document.getElementById('settingsResumeFile');
  const sFileNameSpan = document.getElementById('settingsResumeFileName');
  const sRemoveBtn = document.getElementById('settingsRemoveResumeBtn');

  const triggerUpload = () => fileInput.click();
  const triggerSettingsUpload = () => sFileInput.click();

  if (uploadBtn) uploadBtn.addEventListener('click', triggerUpload);
  if (sUploadBtn) sUploadBtn.addEventListener('click', triggerSettingsUpload);

  const handleFileChange = (file) => {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const base64Data = reader.result;
      await chrome.storage.local.set({
        resumeFile: base64Data,
        resumeFileName: file.name,
        resumeFileType: file.type
      });

      fileNameSpan.textContent = file.name;
      if (sFileNameSpan) sFileNameSpan.textContent = file.name;

      removeBtn.style.display = 'inline-block';
      if (sRemoveBtn) sRemoveBtn.style.display = 'inline-block';

      uploadBtn.textContent = 'Change File';
      if (sUploadBtn) sUploadBtn.textContent = 'Change File';

      showToast('Resume uploaded successfully!', 'success');
    };
    reader.readAsDataURL(file);

    if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
      const arrayBufferReader = new FileReader();
      arrayBufferReader.onload = async () => {
        const arrayBuffer = arrayBufferReader.result;
        try {
          const text = extractTextFromPdf(arrayBuffer);
          if (text && text.trim().length > 0) {
            document.getElementById('aiResumeText').value = text;
            await parseResumeAndAutoFill(text);
          } else {
            showToast('PDF text extraction returned no text (it may be scanned or compressed). Please paste your resume text in the "AI Resume Reference Text" area.', 'warning');
          }
        } catch (err) {
          console.error('Failed to extract text from PDF:', err);
          showToast('Failed to extract text from PDF. Please paste your resume text in the "AI Resume Reference Text" area.', 'warning');
        }
      };
      arrayBufferReader.readAsArrayBuffer(file);
    } else {
      showToast('Uploaded non-PDF file. Please paste your plain text resume in the "AI Resume Reference Text" area for AI features.', 'warning');
    }
  };

  fileInput.addEventListener('change', (e) => handleFileChange(e.target.files[0]));
  if (sFileInput) sFileInput.addEventListener('change', (e) => handleFileChange(e.target.files[0]));

  const removeResume = async () => {
    await chrome.storage.local.remove(['resumeFile', 'resumeFileName', 'resumeFileType']);
    fileInput.value = '';
    if (sFileInput) sFileInput.value = '';

    fileNameSpan.textContent = 'No file chosen';
    if (sFileNameSpan) sFileNameSpan.textContent = 'No file chosen';

    removeBtn.style.display = 'none';
    if (sRemoveBtn) sRemoveBtn.style.display = 'none';

    uploadBtn.textContent = 'Choose File';
    if (sUploadBtn) sUploadBtn.textContent = 'Choose File';

    showToast('Resume removed.', 'info');
  };

  removeBtn.addEventListener('click', removeResume);
  if (sRemoveBtn) sRemoveBtn.addEventListener('click', removeResume);
}

// Update running status representation
async function updateStatus() {
  const local = await chrome.storage.local.get(['isRunning']);
  isRunning = local.isRunning || false;
  
  const statusEl = document.getElementById('status');
  const startBtn = document.getElementById('start-btn');
  const stopBtn = document.getElementById('stop-btn');

  if (isRunning) {
    statusEl.textContent = 'Running';
    statusEl.className = 'status-value running';
    startBtn.disabled = true;
    stopBtn.disabled = false;
  } else {
    statusEl.textContent = 'Stopped';
    statusEl.className = 'status-value stopped';
    startBtn.disabled = false;
    stopBtn.disabled = true;
  }
}

// Start Bot automation
// Search Jobs and redirect active tab to a filtered search URL
async function searchJobs() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      showToast('No active tab found.', 'error');
      return;
    }

    if (!tab.url?.includes('linkedin.com')) {
      showToast('Please open LinkedIn first.', 'warning');
      return;
    }

    // Auto-save settings first
    await saveConfigData();

    const jobSearchTitle = document.getElementById('jobSearchTitle').value.trim();
    if (!jobSearchTitle) {
      showToast('Please enter a Target Job Title first.', 'warning');
      return;
    }

    const yearsOfExperience = parseInt(document.getElementById('yearsOfExperience').value || '2', 10);
    let targetUrl = '';

    if (tab.url.includes('linkedin.com')) {
      let expParam = '&f_E=2%2C3%2C4'; // mid level
      if (yearsOfExperience <= 1) expParam = '&f_E=1%2C2';
      else if (yearsOfExperience > 5) expParam = '&f_E=4%2C5%2C6';
      targetUrl = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(jobSearchTitle)}&f_AL=true&sortBy=DD${expParam}`;
    }

    if (targetUrl) {
      showToast('Navigating to job search page...', 'info');
      chrome.tabs.update(tab.id, { url: targetUrl });
    }
  } catch (e) {
    showToast('Search error: ' + e.message, 'error');
  }
}

// Start Bot automation on the current page
async function startBot() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      showToast('No active tab found.', 'error');
      return;
    }

    if (!tab.url?.includes('linkedin.com')) {
      showToast('Please open LinkedIn Jobs page first.', 'warning');
      return;
    }

    // Auto-save settings first
    await saveConfigData();

    appendLog('Sending start command to page...', 'system-msg');
    
    chrome.tabs.sendMessage(tab.id, { action: 'start' }, async (response) => {
      if (chrome.runtime.lastError) {
        appendLog('Error: Content script not loaded. Refresh the page and try again.', 'error-msg');
        showToast('Failed to start: Content script not detected.', 'error');
      } else if (response && response.success) {
        await chrome.storage.local.set({ isRunning: true });
        await updateStatus();
        showToast('Automation started!', 'success');
        appendLog('Bot successfully started by user.', 'system-msg');
      } else {
        const errorMsg = response?.message || 'Unknown response';
        appendLog(`Start failed: ${errorMsg}`, 'error-msg');
        showToast(`Could not start: ${errorMsg}`, 'error');
      }
    });
  } catch (e) {
    showToast('Start error: ' + e.message, 'error');
  }
}

// Stop Bot automation
async function stopBot() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    chrome.tabs.sendMessage(tab.id, { action: 'stop' }, async (response) => {
      await chrome.storage.local.set({ isRunning: false });
      await updateStatus();
      showToast('Automation stopped.', 'info');
      appendLog('Bot stopped by user.', 'system-msg');
    });
  } catch (e) {
    console.error('Stop error:', e);
  }
}

// Reset counters
async function resetCounters() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url?.includes('linkedin.com')) {
      chrome.tabs.sendMessage(tab.id, { action: 'resetCounters' });
    }
    await chrome.storage.local.set({ appliedCount: 0, skippedCount: 0, appliedJobs: [], skippedJobs: [] });
    document.getElementById('applied-count').textContent = 0;
    document.getElementById('skipped-count').textContent = 0;
    showToast('Counters reset.', 'info');
    appendLog('Counters reset.', 'system-msg');
  } catch (e) {
    console.error('Reset error:', e);
  }
}

// Export applied jobs list as CSV
async function exportAppliedJobs() {
  try {
    const local = await chrome.storage.local.get(['appliedJobs']);
    const jobs = local.appliedJobs || [];

    if (jobs.length === 0) {
      showToast('No applied jobs to export.', 'info');
      return;
    }

    let csvContent = 'data:text/csv;charset=utf-8,';
    csvContent += 'Title,Company,Link,Date Applied\n';

    jobs.forEach(job => {
      const title = (job.title || '').replace(/"/g, '""');
      const company = (job.company || '').replace(/"/g, '""');
      const link = job.link || '';
      const date = job.date || '';
      csvContent += `"${title}","${company}","${link}","${date}"\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `applied_jobs_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('CSV export downloaded!', 'success');
  } catch (e) {
    showToast('Failed to export: ' + e.message, 'error');
  }
}

// Real-time logs output
function appendLog(text, className = '') {
  const container = document.getElementById('log-container');
  if (!container) return;

  const timeString = new Date().toLocaleTimeString();
  const line = document.createElement('div');
  line.className = `log-line ${className}`;
  line.textContent = `[${timeString}] ${text}`;
  container.appendChild(line);

  // Scroll to bottom
  container.scrollTop = container.scrollHeight;
}

// Listen for log broadcasts from background service worker
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'log') {
    appendLog(message.message);
  } else if (message.type === 'toast') {
    showToast(message.message, message.toastType || 'info');
  } else if (message.type === 'showToast') {
    showToast(message.message, message.toastType || 'info');
  } else if (message.type === 'updateCount') {
    document.getElementById('applied-count').textContent = message.count;
  } else if (message.type === 'updateSkippedCount') {
    document.getElementById('skipped-count').textContent = message.count;
  } else if (message.type === 'botStarted' || message.type === 'botStopped') {
    updateStatus();
  }
  sendResponse({ received: true });
});

// PDF Text Extraction Helper (zero-dependency regex extractor)
function extractTextFromPdf(arrayBuffer) {
  const decoder = new TextDecoder('utf-8');
  const text = decoder.decode(arrayBuffer);
  
  // Extract text inside Tj brackets
  const matches = text.match(/\((.*?)\)\s*Tj/gi) || [];
  let extracted = matches.map(m => {
    const content = m.substring(1, m.length - 3);
    return content.replace(/\\(.)/g, '$1');
  }).join(' ');
  
  if (extracted.trim().length === 0) {
    const tjMatches = text.match(/\[(.*?)\]\s*TJ/gi) || [];
    extracted = tjMatches.map(m => {
      const contentMatches = m.match(/\((.*?)\)/gi) || [];
      return contentMatches.map(cm => cm.substring(1, cm.length - 1)).join('');
    }).join(' ');
  }
  
  // Strip common PDF binary noise
  extracted = extracted.replace(/\\[0-7]{3}/g, '');
  return extracted;
}

// Regex + DeepSeek AI parser to auto-fill configurations
async function parseResumeAndAutoFill(text) {
  const loaderBanner = document.getElementById('parsing-loader');
  if (loaderBanner) loaderBanner.style.display = 'flex';

  try {
    // 1. First Pass: Local Regex Extraction
    const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (emailMatch) {
      document.getElementById('email').value = emailMatch[0];
    }

    const phoneMatch = text.match(/(?:\+?\d{1,3}[- ]?)?\(?\d{3}\)?[- ]?\d{3}[- ]?\d{4}/);
    if (phoneMatch) {
      document.getElementById('phone').value = phoneMatch[0].replace(/[^\d+]/g, '');
    }

    const nameMatch = text.substring(0, 100).match(/([A-Z][a-zA-Z]+)\s+([A-Z][a-zA-Z]+)/);
    if (nameMatch) {
      document.getElementById('firstName').value = nameMatch[1];
      document.getElementById('lastName').value = nameMatch[2];
    }

    const linkedinMatch = text.match(/linkedin\.com\/in\/[a-zA-Z0-9_-]+/i);
    if (linkedinMatch) {
      document.getElementById('linkedin').value = 'https://' + linkedinMatch[0];
    }
    const githubMatch = text.match(/github\.com\/[a-zA-Z0-9_-]+/i);
    if (githubMatch) {
      document.getElementById('github').value = 'https://' + githubMatch[0];
    }

    // 2. Second Pass: DeepSeek AI Parsing (If API key configured)
    const apiKey = document.getElementById('apiKey').value.trim();
    if (apiKey) {
      showToast('Calling DeepSeek AI to parse resume...', 'info');
      
      const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            {
              role: 'system',
              content: `You are an expert resume parsing AI. Extract the candidate information from the provided resume text. Return a valid JSON object matching the following fields (DO NOT include markdown block wrappers, return ONLY the raw JSON string):
              {
                "firstName": "String",
                "lastName": "String",
                "email": "String",
                "phone": "String (digits only)",
                "city": "String (e.g. San Francisco, CA)",
                "yearsOfExperience": "Number",
                "linkedin": "String (URL)",
                "github": "String (URL)",
                "portfolio": "String (URL)",
                "noticePeriod": "Number (estimate notice days or 0 if none/unspecified)"
              }`
            },
            {
              role: 'user',
              content: text
            }
          ],
          temperature: 0.1,
          response_format: { type: 'json_object' }
        })
      });

      if (response.ok) {
        const data = await response.json();
        const jsonText = data.choices[0].message.content;
        const parsed = JSON.parse(jsonText);
        
        if (parsed.firstName) document.getElementById('firstName').value = parsed.firstName;
        if (parsed.lastName) document.getElementById('lastName').value = parsed.lastName;
        if (parsed.email) document.getElementById('email').value = parsed.email;
        if (parsed.phone) document.getElementById('phone').value = parsed.phone;
        if (parsed.city) document.getElementById('city').value = parsed.city;
        if (parsed.yearsOfExperience) document.getElementById('yearsOfExperience').value = parsed.yearsOfExperience;
        if (parsed.linkedin) document.getElementById('linkedin').value = parsed.linkedin;
        if (parsed.github) document.getElementById('github').value = parsed.github;
        if (parsed.portfolio) document.getElementById('portfolio').value = parsed.portfolio;
        if (parsed.noticePeriod) document.getElementById('noticePeriod').value = parsed.noticePeriod;
        
        showToast('AI successfully parsed resume!', 'success');
      } else {
        showToast('AI Parsing failed, using basic local extraction.', 'warning');
      }
    } else {
      showToast('Form filled using basic extraction. Add API Key for full AI auto-fill!', 'info');
    }

    // Save automatically after filling
    await saveConfigData();

  } catch (err) {
    console.error('Error auto-filling from resume:', err);
    showToast('Failed to auto-fill details: ' + err.message, 'error');
  } finally {
    if (loaderBanner) loaderBanner.style.display = 'none';
  }
}

// Render the list of learned custom QAs in Settings tab
async function renderLearnedQAs() {
  const container = document.getElementById('learned-qa-list');
  if (!container) return;

  const local = await chrome.storage.local.get(['customQAs']);
  const customQAs = local.customQAs || {};

  const keys = Object.keys(customQAs);
  if (keys.length === 0) {
    container.innerHTML = `<p style="font-size: 12px; color: var(--text-light); text-align: center; margin: 10px 0;">No custom questions learned yet. Answer them manually during applications to train the bot!</p>`;
    return;
  }

  let html = '';
  for (let q of keys) {
    const a = customQAs[q];
    html += `
      <div class="learned-qa-item" style="display: flex; justify-content: space-between; align-items: flex-start; padding: 8px 10px; background: white; border: 1px solid var(--border); border-radius: 8px; font-size: 12px; gap: 8px; box-shadow: 0 1px 2px rgba(0,0,0,0.02);">
        <div style="flex: 1; word-break: break-word;">
          <strong style="color: var(--primary); display: block; margin-bottom: 2px;">${escapeHtml(q)}</strong>
          <span style="color: var(--text-muted); font-weight: 500;">${escapeHtml(a)}</span>
        </div>
        <button type="button" class="delete-qa-btn" data-key="${encodeURIComponent(q)}" style="background: transparent; border: none; color: var(--danger); font-size: 16px; font-weight: bold; cursor: pointer; padding: 0 4px; line-height: 1;">×</button>
      </div>
    `;
  }
  container.innerHTML = html;

  // Bind deletion listeners
  const deleteButtons = container.querySelectorAll('.delete-qa-btn');
  deleteButtons.forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const key = decodeURIComponent(btn.getAttribute('data-key'));
      const localData = await chrome.storage.local.get(['customQAs']);
      const currentQAs = localData.customQAs || {};
      delete currentQAs[key];
      await chrome.storage.local.set({ customQAs: currentQAs });
      showToast('Learned question removed.', 'info');
      await renderLearnedQAs();
    });
  });
}

// Simple HTML escaping helper to prevent XSS
function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ATS Score Analyzer — routes through the Jd2Job backend (or own DeepSeek key)
async function analyzeAtsScore() {
  const jdText = document.getElementById('ats-target-jd').value?.trim();
  const resumeText = document.getElementById('aiResumeText').value?.trim();

  if (!resumeText) {
    showToast('Please upload a resume first!', 'warning');
    return;
  }
  if (!jdText) {
    showToast('Please paste a Job Description (JD) to analyze.', 'warning');
    return;
  }

  const btnAnalyze = document.getElementById('btn-analyze-ats');
  btnAnalyze.disabled = true;
  btnAnalyze.textContent = 'Analyzing...';

  try {
    const result = await aiTailorResume({
      baseResumeText: resumeText,
      jobDescription: jdText,
      jobTitle: '',
      companyName: ''
    });

    document.getElementById('ats-results').style.display = 'block';

    const score = result.atsScore ?? 0;
    document.getElementById('ats-score-text').textContent = `${score}%`;

    const circle = document.getElementById('ats-circle');
    circle.style.background = `conic-gradient(#912f56 ${score}%, #d8e6e0 ${score}%)`;

    document.getElementById('ats-feedback').textContent =
      result.changesSummary || 'Tailored resume analysis complete.';

    const matchedContainer = document.getElementById('ats-matched-list');
    matchedContainer.innerHTML = (result.keywords || [])
      .slice(0, 8)
      .map(kw => `<span class="ats-tag ats-tag-matched">${escapeHtml(kw)}</span>`).join('');

    const missingContainer = document.getElementById('ats-missing-list');
    missingContainer.innerHTML = (result.missingKeywords || [])
      .slice(0, 8)
      .map(kw => `<span class="ats-tag ats-tag-missing">${escapeHtml(kw)}</span>`).join('');

    // Stash the tailored text for the PDF download
    lastTailoredText = result.resumeText || null;
    document.getElementById('btn-download-tailored').disabled = !lastTailoredText;
    showToast(`ATS Analysis complete (via ${result.source === 'jd2job' ? 'Jd2Job AI' : 'your API key'})!`, 'success');
  } catch (err) {
    console.error('ATS Analysis Error:', err);
    showToast('Analysis failed: ' + err.message, 'error');
  } finally {
    btnAnalyze.disabled = false;
    btnAnalyze.textContent = 'Analyze ATS Match';
  }
}

// Download Tailored Resume PDF — reuses the analysis result or tailors fresh
async function downloadTailoredResume() {
  const jdText = document.getElementById('ats-target-jd').value?.trim();
  const resumeText = document.getElementById('aiResumeText').value?.trim();

  if (!resumeText || !jdText) return;

  const btnDownload = document.getElementById('btn-download-tailored');
  btnDownload.disabled = true;
  btnDownload.textContent = 'Generating...';

  try {
    let tailoredText = lastTailoredText;
    if (!tailoredText) {
      const result = await aiTailorResume({
        baseResumeText: resumeText,
        jobDescription: jdText,
        jobTitle: '',
        companyName: ''
      });
      tailoredText = result?.resumeText;
    }
    if (!tailoredText) throw new Error('No tailored resume was generated.');

    const pdfBytes = generatePDF(tailoredText);

    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tailored_resume.pdf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('Tailored PDF downloaded!', 'success');
  } catch (err) {
    console.error('Tailored PDF Download Error:', err);
    showToast('Download failed: ' + err.message, 'error');
  } finally {
    btnDownload.disabled = false;
    btnDownload.textContent = 'Download Tailored PDF';
  }
}

// Client-Side PDF Compiler
function generatePDF(text) {
  const fontSize = 10, margin = 50, pageW = 612, pageH = 792;
  const contentW = pageW - 2 * margin, lineH = 14;
  const charsPerLine = Math.floor(contentW / (fontSize * 0.6));
  const linesPerPage = Math.floor((pageH - 2 * margin) / lineH);

  const splitLines = [];
  const paragraphs = text.split('\n');
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

  const totalLines = splitLines.length;
  const totalPages = Math.ceil(totalLines / linesPerPage) || 1;

  const pageStreams = [];
  let lineIdx = 0;
  for (let pg = 0; pg < totalPages; pg++) {
    let streamContent = 'BT\n';
    streamContent += `/F1 ${fontSize} Tf\n${margin} ${pageH - margin - lineH} Td\n${lineH} TL\n`;
    for (let l = 0; l < linesPerPage && lineIdx < totalLines; l++, lineIdx++) {
      const escaped = splitLines[lineIdx].replace(/([\\\(\)])/g, '\\$1').replace(/[\x00-\x1f]/g, '');
      streamContent += `(${escaped}) Tj T*\n`;
    }
    streamContent += 'ET\n';
    pageStreams.push(streamContent);
  }

  const fontObj = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  const pageKids = Array.from({length: totalPages}, (_, i) => `${3 + i} 0 R`).join(' ');
  const pagesObj = `<< /Type /Pages /Kids [${pageKids}] /Count ${totalPages} >>`;
  const catalogObj = '<< /Type /Catalog /Pages 2 0 R >>';

  let body = '';
  body += `1 0 obj\n${catalogObj}\nendobj\n`;
  body += `2 0 obj\n${pagesObj}\nendobj\n`;

  const fontObjIdx = 3 + totalPages;
  const startStreamIdx = 3 + totalPages + 1;

  for (let pg = 0; pg < totalPages; pg++) {
    const pageObjIdx = 3 + pg;
    const contentsIdx = startStreamIdx + pg;
    body += `${pageObjIdx} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /Font << /F1 ${fontObjIdx} 0 R >> >> /Contents ${contentsIdx} 0 R >>\nendobj\n`;
  }
  
  body += `${fontObjIdx} 0 obj\n${fontObj}\nendobj\n`;

  for (let pg = 0; pg < totalPages; pg++) {
    const contentsIdx = startStreamIdx + pg;
    const streamContent = pageStreams[pg];
    const streamObj = `<< /Length ${streamContent.length} >>\nstream\n${streamContent}\nendstream`;
    body += `${contentsIdx} 0 obj\n${streamObj}\nendobj\n`;
  }

  let offsets = []; let offset = 8;
  for (const l of body.split('\n')) { offsets.push(offset); offset += l.length + 1; }
  let xref = `xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) xref += String(o).padStart(10, '0') + ' 00000 n \n';

  const pdf = `%PDF-1.4\n${body}${xref}trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

// Render applied job history list
async function renderHistory() {
  const container = document.getElementById('history-list');
  if (!container) return;

  const local = await chrome.storage.local.get(['appliedJobs']);
  const appliedJobs = local.appliedJobs || [];

  if (appliedJobs.length === 0) {
    container.innerHTML = `<p style="font-size: 12px; color: var(--text-light); text-align: center; margin: 20px 0;">No jobs applied yet. Run the bot to build your history log!</p>`;
    return;
  }

  let html = '';
  const reversedJobs = [...appliedJobs].reverse();
  for (let job of reversedJobs) {
    const titleEscaped = escapeHtml(job.title || 'Unknown Title');
    const companyEscaped = escapeHtml(job.company || 'Unknown Company');
    const dateEscaped = escapeHtml(job.date || 'Unknown Date');
    const jobLink = job.link || '#';

    html += `
      <div class="history-item">
        <div class="history-header">
          <a class="history-title" href="${jobLink}" target="_blank">${titleEscaped}</a>
          <span class="history-date">${dateEscaped}</span>
        </div>
        <div class="history-company">${companyEscaped}</div>
      </div>
    `;
  }
  container.innerHTML = html;
}

// Generate Cover Letter (uses the user's own DeepSeek key — no backend endpoint)
async function generateCoverLetter() {
  const jdText = document.getElementById('ats-target-jd').value?.trim();
  const resumeText = document.getElementById('aiResumeText').value?.trim();

  if (!resumeText) {
    showToast('Please upload a resume first!', 'warning');
    return;
  }
  if (!jdText) {
    showToast('Please paste a Job Description (JD) to generate cover letter.', 'warning');
    return;
  }

  const btnGen = document.getElementById('btn-gen-cover');
  btnGen.disabled = true;
  btnGen.textContent = 'Generating...';

  try {
    const text = await callDeepSeek([
      {
        role: 'system',
        content: `You are an expert career advisor. Write a tailored, persuasive cover letter matching the user's resume to the Job Description.
Keep it strictly under 350 words, using standard professional business letter formats.
Output ONLY the cover letter text, no markdown wrapping, no metadata, and no conversational introductions.`
      },
      {
        role: 'user',
        content: `Resume:\n${resumeText}\n\nJob Description:\n${jdText}`
      }
    ], { temperature: 0.3 });

    const previewDiv = document.getElementById('cover-letter-section');
    previewDiv.style.display = 'block';
    document.getElementById('cover-letter-text').value = text;
    showToast('Cover letter generated!', 'success');
  } catch (err) {
    console.error('Cover letter generation error:', err);
    showToast('Generation failed: ' + err.message, 'error');
  } finally {
    btnGen.disabled = false;
    btnGen.textContent = 'Generate Cover Letter';
  }
}

// Download Cover Letter PDF
async function downloadCoverLetter() {
  const text = document.getElementById('cover-letter-text').value?.trim();
  if (!text) return;

  const btnDownload = document.getElementById('btn-download-cover');
  btnDownload.disabled = true;
  btnDownload.textContent = 'Downloading...';

  try {
    const pdfBytes = generatePDF(text);
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cover_letter.pdf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Cover Letter PDF downloaded!', 'success');
  } catch (err) {
    showToast('Failed to download cover letter PDF: ' + err.message, 'error');
  } finally {
    btnDownload.disabled = false;
    btnDownload.textContent = 'Download Cover Letter PDF';
  }
}

// Save Manual Custom Q&A
async function saveManualQA() {
  const qInput = document.getElementById('manual-q-input');
  const aInput = document.getElementById('manual-a-input');
  const qVal = qInput.value?.trim();
  const aVal = aInput.value?.trim();

  if (!qVal || !aVal) {
    showToast('Please fill in both Question and Answer fields!', 'warning');
    return;
  }

  try {
    const local = await chrome.storage.local.get(['customQAs']);
    const customQAs = local.customQAs || {};

    customQAs[qVal] = aVal;
    await chrome.storage.local.set({ customQAs });

    qInput.value = '';
    aInput.value = '';
    document.getElementById('manual-qa-form').style.display = 'none';
    
    const btnToggle = document.getElementById('btn-toggle-manual-qa');
    if (btnToggle) btnToggle.textContent = '+ Add Q&A';

    showToast('Learned Q&A saved successfully!', 'success');
    await renderLearnedQAs();
  } catch (err) {
    showToast('Failed to save manual Q&A: ' + err.message, 'error');
  }
}

// Sync applied jobs to the Jd2Job cloud dashboard
async function syncJobsToCloud() {
  try {
    const session = await jd2jobGetSession();
    if (!session) {
      console.log('[Jd2Job Sync] Not connected to a Jd2Job account, skipping sync.');
      return;
    }

    const localData = await chrome.storage.local.get(['appliedJobs']);
    const jobs = localData.appliedJobs || [];
    if (jobs.length === 0) {
      console.log('[Jd2Job Sync] No applied jobs to sync.');
      return;
    }

    console.log(`[Jd2Job Sync] Syncing ${jobs.length} jobs to cloud dashboard...`);
    const data = await jd2jobSyncJobs(jobs);
    console.log(`[Jd2Job Sync] Successfully synced! Inserted: ${data.inserted ?? 'n/a'}`);
  } catch (err) {
    console.error('[Jd2Job Sync] Error syncing to cloud:', err.message);
  }
}

// Dynamically update connection banner state
async function updateSyncStatusBanner() {
  const banner = document.getElementById('sync-status-banner');
  if (!banner) return;

  const session = await jd2jobGetSession();
  let account = null;
  if (session) {
    try {
      account = await jd2jobFetchMe();
    } catch (err) {
      console.warn('[Jd2Job] Account fetch failed:', err.message);
    }
  }

  if (session) {
    const name = account?.displayName || session.email || 'Jd2Job account';
    const planLabel = account?.unlimited
      ? 'Unlimited plan'
      : `${account?.credits ?? '?'} credit${(account?.credits ?? 0) === 1 ? '' : 's'} left`;

    banner.style.background = 'rgba(145, 47, 86, 0.06)';
    banner.style.borderColor = 'rgba(145, 47, 86, 0.2)';
    banner.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px; color: #912f56; font-weight: 500;">
        <span style="font-size: 1.1rem;">✓</span>
        <span id="sync-status-text">${escapeHtml(name)} · ${escapeHtml(planLabel)}</span>
      </div>
      <button id="btn-sync-logout" style="
        background: rgba(239, 68, 68, 0.12);
        color: #b91c1c;
        border: 1px solid rgba(239, 68, 68, 0.25);
        border-radius: 6px;
        padding: 4px 8px;
        font-size: 0.75rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        white-space: nowrap;
      ">Disconnect</button>
    `;
    const logoutBtn = document.getElementById('btn-sync-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        await chrome.storage.local.remove('jd2jobSession');
        showToast('Disconnected from Jd2Job', 'info');
        await updateSyncStatusBanner();
      });
    }
  } else {
    banner.style.background = 'rgba(239, 68, 68, 0.06)';
    banner.style.borderColor = 'rgba(239, 68, 68, 0.18)';
    banner.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px; color: #b91c1c; font-weight: 500;">
        <span style="font-size: 1.1rem;">⚠️</span>
        <span id="sync-status-text">Not connected — AI tailoring & sync are off</span>
      </div>
      <button id="btn-sync-login" style="
        background: #912f56;
        color: white;
        border: none;
        border-radius: 6px;
        padding: 5px 10px;
        font-size: 0.75rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        white-space: nowrap;
      ">Connect</button>
    `;
    const loginBtn = document.getElementById('btn-sync-login');
    if (loginBtn) {
      loginBtn.addEventListener('click', () => {
        chrome.tabs.create({ url: 'https://jd2job.com/' });
      });
    }
  }
}
