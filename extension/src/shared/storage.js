// Shared storage helpers
/* exported getConfig, setConfig, migrateApiKeyToLocal, loadConfig, saveConfig, migrateApiKey */

const CONFIG_KEYS = [
  'firstName', 'lastName', 'email', 'phone', 'phoneCountryCode', 'city',
  'yearsOfExperience', 'maxYearsRequired', 'blacklistKeywords', 'autoNextPage', 'expectedSalary',
  'visaSponsorship', 'legallyAuthorized', 'willingToRelocate', 'driversLicense',
  'apiKey', 'aiAnswers', 'aiResumeText', 'aiTailorResume',
  'linkedin', 'github', 'portfolio', 'noticePeriod', 'gender', 'race', 'veteran',
  'disability', 'jobSearchTitle', 'postalCode', 'dailyCapEnabled', 'dailyCapLimit'
];

const LOCAL_KEYS = [
  'isRunning', 'appliedCount', 'skippedCount', 'appliedJobs', 'skippedJobs',
  'resumeFile', 'resumeFileName', 'resumeFileType',
  'resumeBuilderSkills', 'resumeBuilderExperience', 'resumeBuilderEducation',
  'searchHistory', 'onboardingCompleted'
];

async function loadConfig() {
  const sync = await chrome.storage.sync.get(CONFIG_KEYS);
  const local = await chrome.storage.local.get(LOCAL_KEYS);
  return { ...sync, ...local };
}

async function saveConfig(config) {
  const syncConfig = {};
  const localConfig = {};

  for (const key of Object.keys(config)) {
    if (CONFIG_KEYS.includes(key)) {
      syncConfig[key] = config[key];
    } else if (LOCAL_KEYS.includes(key)) {
      localConfig[key] = config[key];
    }
  }

  const promises = [];
  if (Object.keys(syncConfig).length) promises.push(chrome.storage.sync.set(syncConfig));
  if (Object.keys(localConfig).length) promises.push(chrome.storage.local.set(localConfig));
  await Promise.all(promises);
}

async function migrateApiKeyToLocal() {
  try {
    const sync = await chrome.storage.sync.get(['apiKey']);
    if (sync.apiKey) {
      const local = await chrome.storage.local.get(['apiKey']);
      if (!local.apiKey) {
        await chrome.storage.local.set({ apiKey: sync.apiKey });
      }
    }
  } catch (e) {
    console.error('Migration error:', e);
  }
}

// Aliases for exported names
const getConfig = loadConfig;
const setConfig = saveConfig;
const migrateApiKey = migrateApiKeyToLocal;
