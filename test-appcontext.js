const fs = require('fs');
const path = require('path');
const assert = require('assert');

// ── Mock Environment ────────────────────────────────────────────────────────
const localStorageMock = {
  store: {},
  getItem(key) {
    return this.store[key] || null;
  },
  setItem(key, value) {
    this.store[key] = String(value);
  },
  clear() {
    this.store = {};
  }
};

global.localStorage = localStorageMock;

// Mock window object
global.window = {
  __APP_DISPATCH__: () => {}
};

// ── Load and parse AppContext reducer ────────────────────────────────────────
const appContextPath = path.join(__dirname, 'frontend', 'src', 'context', 'AppContext.jsx');
const source = fs.readFileSync(appContextPath, 'utf8');

// Extract the appReducer function body and reconstruct it as a standard function
const reducerMatch = source.match(/function appReducer\s*\(state,\s*action\)\s*\{([\s\S]*?)\n\}/);
if (!reducerMatch) {
  console.error('Failed to find appReducer in AppContext.jsx');
  process.exit(1);
}

const reducerBody = reducerMatch[1];
// Reconstruct the function in this context
const appReducer = new Function('state', 'action', reducerBody);

// ── Run Tests ───────────────────────────────────────────────────────────────
console.log('🧪 Running AppContext Reducer Unit Tests...');

try {
  // Test Case 1: Initial State and SET_SELECTED_MODEL
  const initialState = {
    selectedModel: 'default',
    speedMode: false
  };

  localStorage.clear();
  
  console.log('  - Testing SET_SELECTED_MODEL: "llama_fast"');
  let state = appReducer(initialState, { type: 'SET_SELECTED_MODEL', payload: 'llama_fast' });
  
  assert.strictEqual(state.selectedModel, 'llama_fast', 'State selectedModel should be updated to llama_fast');
  assert.strictEqual(localStorage.getItem('selectedModel'), 'llama_fast', 'localStorage should persist selectedModel as llama_fast');

  // Test Case 2: TOGGLE_SPEED_MODE (turns speed mode ON and auto-selects fast model)
  console.log('  - Testing TOGGLE_SPEED_MODE: turn ON');
  state = appReducer(state, { type: 'TOGGLE_SPEED_MODE' });

  assert.strictEqual(state.speedMode, true, 'State speedMode should toggle to true');
  assert.strictEqual(state.selectedModel, 'llama_fast', 'State selectedModel should automatically become llama_fast in speed mode');
  assert.strictEqual(localStorage.getItem('selectedModel'), 'llama_fast', 'localStorage should persist updated selectedModel');

  // Test Case 3: TOGGLE_SPEED_MODE (turns speed mode OFF and auto-selects default model)
  console.log('  - Testing TOGGLE_SPEED_MODE: turn OFF');
  state = appReducer(state, { type: 'TOGGLE_SPEED_MODE' });

  assert.strictEqual(state.speedMode, false, 'State speedMode should toggle to false');
  assert.strictEqual(state.selectedModel, 'default', 'State selectedModel should automatically revert to default');
  assert.strictEqual(localStorage.getItem('selectedModel'), 'default', 'localStorage should persist default model selection');

  console.log('✅ All AppContext reducer tests passed successfully!');
} catch (error) {
  console.error('❌ Assertion failed:');
  console.error(error);
  process.exit(1);
}
