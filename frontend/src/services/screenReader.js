/**
 * screenReader - Captures a screen frame and extracts interview questions
 *               using the DeepSeek/Together Vision LLM.
 *
 * Works in both browser and Electron:
 *   Browser:  Uses ImageCapture API on an active getDisplayMedia video track,
 *             or prompts for a new screen share if none is active.
 *   Electron: Falls back to window.electronAPI.captureScreenshot() (legacy).
 *
 * Flow:
 *   captureFrameAndExtract(apiKey, videoTrack?)
 *     → grab frame → base64 JPEG
 *     → DeepSeek/Together vision model
 *     → returns { text, screenshotUrl }
 */
import { getSession } from './supabaseClient';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const DEEPSEEK_VISION_URL = `${API_BASE}/api/deepseek/vision`;
const VISION_MODEL      = 'deepseek-chat'; // Might fail if no vision support
const TOGETHER_MODEL    = 'meta-llama/Llama-3.2-11B-Vision-Instruct-Turbo';

async function downscaleBase64Image(base64Str, maxDim = 600) {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const { width, height } = getScaledDimensions(img.width, img.height, maxDim);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.5));
    };
    img.onerror = () => {
      resolve(base64Str);
    };
  });
}

/**
 * Capture a frame from the screen and extract the interview question visible on it.
 *
 * @param {string}       apiKey     - DeepSeek API key
 * @param {MediaStreamTrack|null} videoTrack - Active video track from getDisplayMedia (optional)
 * @returns {Promise<{ text: string, screenshotUrl: string }>}
 */
export async function captureFrameAndExtract(apiKey, videoTrack = null) {
  let screenshotUrl  = null;
  let streamToStop   = null;

  // Detect Electron environment to dynamically exclude window from capture
  const isElectron = typeof window !== 'undefined' && window.require && window.require('electron');

  if (isElectron) {
    try {
      console.log('[ScreenReader] Electron environment detected. Hiding window before screenshot...');
      const { ipcRenderer } = window.require('electron');
      ipcRenderer.send('hide-app');
      // Wait for 150ms to allow macOS WindowServer to update the frame buffer
      await new Promise(resolve => setTimeout(resolve, 150));
    } catch (err) {
      console.warn('[ScreenReader] Failed to hide Electron window:', err.message);
    }
  }

  try {
    // Try native backend screen capture first (reliable and full-screen on macOS)
    try {
      const session = await getSession();
      const token = session?.access_token || '';
      console.log('[ScreenReader] Fetching native backend screen capture...');
      const response = await fetch(`${API_BASE}/api/capture-screen`, {
        headers: {
          'Authorization': token ? `Bearer ${token}` : ''
        }
      });
      if (response.ok) {
        const data = await response.json();
        if (data.screenshotUrl) {
          screenshotUrl = await downscaleBase64Image(data.screenshotUrl, 600);
          console.log('[ScreenReader] Backend screen capture succeeded.');
        }
      }
    } catch (e) {
      console.warn('[ScreenReader] Backend screenshot failed, falling back to WebRTC:', e.message);
    }

    if (!screenshotUrl) {
      if (videoTrack && videoTrack.readyState === 'live') {
        screenshotUrl = await captureFrameFromVideoTrack(videoTrack);
      } else if (window.electronAPI?.captureScreenshot) {
        screenshotUrl = await window.electronAPI.captureScreenshot(null);
        if (!screenshotUrl) throw new Error('Electron screenshot failed.');
      } else {
        const stream   = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        streamToStop   = stream;
        const track    = stream.getVideoTracks()[0];
        screenshotUrl  = await captureFrameFromVideoTrack(track);
      }
    }

    const session = await getSession();
    const token = session?.access_token || '';

    const response = await fetch(DEEPSEEK_VISION_URL, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
      },
      body: JSON.stringify({
        messages: [
          {
            role:    'user',
            content: [
              {
                type: 'text',
                text: 'Look at this screenshot from a computer screen. ' +
                      'If you see a coding problem, interview question, or technical task description, extract and return it. ' +
                      'If there is NO coding problem, interview question, or technical task description clearly visible, you MUST return exactly the string "NO_QUESTION_DETECTED" and nothing else. ' +
                      'Do not make up, hallucinate, or assume a question if one is not clearly shown. ' +
                      'Return only the extracted question or "NO_QUESTION_DETECTED" without any markdown formatting, commentary, or introduction.'
              },
              {
                type:      'image_url',
                image_url: { url: screenshotUrl },
              },
            ],
          },
        ],
        max_tokens:  512,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const err = await response.text().catch(() => response.statusText);
      throw new Error(`Vision API error ${response.status}: ${err}`);
    }

    const data = await response.json();
    let text = data.choices?.[0]?.message?.content?.trim() || '';
    if (text.toUpperCase().includes('NO_QUESTION_DETECTED')) {
      text = '';
    }

    return { text, screenshotUrl };
  } finally {
    streamToStop?.getTracks().forEach(t => t.stop());
    if (isElectron) {
      try {
        console.log('[ScreenReader] Restoring Electron window...');
        const { ipcRenderer } = window.require('electron');
        ipcRenderer.send('show-app');
      } catch (err) {
        console.warn('[ScreenReader] Failed to show Electron window:', err.message);
      }
    }
  }
}

function getScaledDimensions(width, height, maxDim = 1024) {
  if (width <= maxDim && height <= maxDim) {
    return { width, height };
  }
  const ratio = width / height;
  if (width > height) {
    return { width: maxDim, height: Math.round(maxDim / ratio) };
  } else {
    return { width: Math.round(maxDim * ratio), height: maxDim };
  }
}

async function captureFrameFromVideoTrack(videoTrack) {
  if (typeof ImageCapture !== 'undefined') {
    try {
      const capture = new ImageCapture(videoTrack);
      const bitmap  = await capture.grabFrame();
      return bitmapToDataUrl(bitmap);
    } catch { /* ImageCapture not supported — fall through to canvas approach */ }
  }
  return videoElementSnapshot(videoTrack);
}

function bitmapToDataUrl(bitmap) {
  const canvas = document.createElement('canvas');
  const { width, height } = getScaledDimensions(bitmap.width, bitmap.height, 600);
  canvas.width  = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', 0.5);
}

async function videoElementSnapshot(videoTrack) {
  return new Promise((resolve, reject) => {
    const stream = new MediaStream([videoTrack]);
    const video  = document.createElement('video');
    video.muted  = true;
    video.srcObject = stream;
    video.onloadedmetadata = () => {
      video.play().then(() => {
        const canvas  = document.createElement('canvas');
        const { width, height } = getScaledDimensions(video.videoWidth, video.videoHeight, 600);
        canvas.width  = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(video, 0, 0, width, height);
        video.pause();
        resolve(canvas.toDataURL('image/jpeg', 0.5));
      }).catch(reject);
    };
    video.onerror = reject;
  });
}