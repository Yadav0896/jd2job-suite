# Specification: Production Audit and Fixes

## Objective
Diagnose and resolve critical functional issues in the Chrome extension (autofill matching/applying), Desktop app download redirects, Interview assistant response quality, and Electron app shell stability to ensure production readiness.

## Scope & Requirements

### 1. Production Desktop App Download Redirect
- **File**: [server.js](file:///Users/raga_user/Desktop/interview%20assistant%20electron/backend/server.js)
- **Requirement**: Support a `DESKTOP_APP_DOWNLOAD_URL` environment variable in the `/api/download` route. 
- **Behavior**: If this variable is defined, redirect (`res.redirect`) user clicks to this external storage URL (e.g., Supabase storage, S3, or GitHub releases). If undefined, fall back to searching local `dist-electron/` and returning the placeholder.

### 2. Extension Form-Filling & Application Robustness
- **File**: [content-simple.js](file:///Users/raga_user/Desktop/jd2jod%20main/content-simple.js)
- **Requirement**: Verify that the content script does not fail silently, throws clear logs, handles edge cases of missing form labels gracefully, and maintains stable execution state.
- **Verification**: Walk through input matching functions, ensuring selectors are robust and fallback containers match the common LinkedIn classes.

### 3. Interview Assistant Answers & Prompting Quality
- **File**: [interviewerAgent.js](file:///Users/raga_user/Desktop/interview%20assistant%20electron/backend/agents/interviewerAgent.js), [evaluatorAgent.js](file:///Users/raga_user/Desktop/interview%20assistant%20electron/backend/agents/evaluatorAgent.js)
- **Requirement**: Optimize prompt phrasing to enforce clean JSON structure and prevent the LLM from adding verbose prefixes or wrapping blocks in extra text which breaks client-side parsing.

---

## Definition of Done
1. `/api/download` successfully redirects to `DESKTOP_APP_DOWNLOAD_URL` if set.
2. The codebase builds successfully (`npm run build`).
3. AppContext reducer test script passes cleanly.
