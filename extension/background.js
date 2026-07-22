// Jd2Job service worker (Manifest V3)

importScripts('src/shared/api-client.js');
/* global jd2jobSyncJobs */

chrome.runtime.onInstalled.addListener((details) => {
  console.log('Jd2Job v2.0 - Extension installed');

  if (details.reason === 'install') {
    chrome.storage.local.set({
      isRunning: false,
      appliedCount: 0,
      skippedCount: 0,
      appliedJobs: [],
      skippedJobs: [],
      onboardingCompleted: false
    });
  }
});

// Sync applied jobs to the Jd2Job cloud dashboard (authenticated).
async function syncJobsToCloud() {
  try {
    const { appliedJobs } = await chrome.storage.local.get(['appliedJobs']);
    if (!appliedJobs || appliedJobs.length === 0) return { synced: 0 };

    const result = await jd2jobSyncJobs(appliedJobs);
    console.log(`[Jd2Job Sync] Cloud sync ok — inserted ${result.inserted ?? 0} new jobs`);
    return { synced: result.inserted ?? 0 };
  } catch (err) {
    // Not connected / offline / expired session — jobs stay local and retry on next apply.
    console.warn('[Jd2Job Sync] Cloud sync skipped:', err.message);
    return { synced: 0, error: err.message };
  }
}

// Forward messages between content scripts and popup, and persist counters.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      if (message.type === 'incrementCount') {
        const { appliedCount = 0 } = await chrome.storage.local.get(['appliedCount']);
        await chrome.storage.local.set({ appliedCount: appliedCount + 1 });
        sendResponse({ success: true, count: appliedCount + 1 });
      } else if (message.type === 'incrementSkippedCount') {
        const { skippedCount = 0 } = await chrome.storage.local.get(['skippedCount']);
        await chrome.storage.local.set({ skippedCount: skippedCount + 1 });
        sendResponse({ success: true, count: skippedCount + 1 });
      } else if (message.type === 'setRunning') {
        await chrome.storage.local.set({ isRunning: message.value });
        sendResponse({ success: true });
      } else if (message.type === 'log') {
        console.log('[Content Script]', message.message);
        sendResponse({ success: true });
      } else if (message.type === 'toast') {
        try {
          await chrome.runtime.sendMessage({ type: 'showToast', ...message });
        } catch (e) {
          // Popup not open; ignore.
        }
        sendResponse({ success: true });
      } else if (message.type === 'syncNow') {
        const result = await syncJobsToCloud();
        sendResponse({ success: !result.error, ...result });
      } else if (message.type === 'jobApplied' || message.type === 'updateCount' || message.type === 'updateSkippedCount' || message.type === 'botStarted' || message.type === 'botStopped') {
        if (message.type === 'jobApplied') {
          syncJobsToCloud(); // fire and forget
        }
        try {
          await chrome.runtime.sendMessage(message);
        } catch (e) {
          // Popup not open; ignore.
        }
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, error: 'Unknown message type' });
      }
    } catch (err) {
      console.error('Background message error:', err);
      sendResponse({ success: false, error: err.message });
    }
  })();

  return true; // async sendResponse
});

// Enable Chrome Side Panel behavior to open on browser action icon click
if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error(error));
}

// Fallback action click listener to force open the side panel
if (chrome.action && chrome.action.onClicked) {
  chrome.action.onClicked.addListener(async (tab) => {
    if (chrome.sidePanel && chrome.sidePanel.open) {
      try {
        await chrome.sidePanel.open({ tabId: tab.id });
      } catch (error) {
        console.error('Failed to open side panel via click listener:', error);
      }
    }
  });
}
