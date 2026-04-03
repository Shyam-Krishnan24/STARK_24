// ============================================================
// LearnFlow AI — Content Script (content.js)
// Live transcript extraction from YouTube, Coursera, etc.
// ============================================================

(function () {
  'use strict';

  let liveTranscriptBuffer = [];
  let captionObserver = null;
  let isCapturing = false;

  // ── Message Handler ───────────────────────────────────────

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'START_CAPTURE') {
      startCapture();
      sendResponse({ success: true });
    }
    if (message.type === 'STOP_CAPTURE') {
      const transcript = stopCapture();
      sendResponse({ success: true, transcript });
    }
    if (message.type === 'GET_LIVE_TRANSCRIPT') {
      sendResponse({ transcript: liveTranscriptBuffer.join(' ') });
    }
    if (message.type === 'GET_PAGE_TRANSCRIPT') {
      const transcript = extractFullTranscript();
      sendResponse({ transcript });
    }
    if (message.type === 'GET_VIDEO_META') {
      sendResponse(getVideoMeta());
    }
    if (message.type === 'OPEN_YT_TRANSCRIPT') {
      openYouTubeTranscriptPanel().then(t => sendResponse({ transcript: t }));
      return true;
    }
    return true;
  });

  // ── YouTube Transcript Panel ──────────────────────────────

  async function openYouTubeTranscriptPanel() {
    // Try to click "More" → "Open transcript"
    try {
      const moreBtn = document.querySelector('[aria-label="More actions"], #expand');
      if (moreBtn) {
        moreBtn.click();
        await sleep(500);
      }

      // Look for transcript button in menu
      const allButtons = Array.from(document.querySelectorAll('yt-formatted-string, tp-yt-paper-item'));
      const transcriptBtn = allButtons.find(el =>
        el.textContent.toLowerCase().includes('transcript') ||
        el.textContent.toLowerCase().includes('open transcript')
      );

      if (transcriptBtn) {
        transcriptBtn.click();
        await sleep(1000);
      }

      // Extract segments
      return await waitForTranscriptSegments();
    } catch (e) {
      return extractFullTranscript();
    }
  }

  async function waitForTranscriptSegments(maxAttempts = 10) {
    for (let i = 0; i < maxAttempts; i++) {
      const segments = document.querySelectorAll('ytd-transcript-segment-renderer .segment-text, [class*="segment-text"]');
      if (segments.length > 0) {
        return Array.from(segments).map(el => el.textContent.trim()).join(' ');
      }
      await sleep(500);
    }
    return extractFullTranscript();
  }

  // ── Live Caption Capture ──────────────────────────────────

  function startCapture() {
    if (isCapturing) return;
    isCapturing = true;
    liveTranscriptBuffer = [];

    // Watch for caption elements being added/changed
    captionObserver = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === 1) {
            const captionText = extractCaptionFromNode(node);
            if (captionText && captionText.length > 2) {
              liveTranscriptBuffer.push(captionText);
              // Send live update
              chrome.runtime.sendMessage({
                type: 'LIVE_TRANSCRIPT_UPDATE',
                text: captionText,
                buffer: liveTranscriptBuffer.join(' ')
              }).catch(() => {});
            }
          }
        });

        if (mutation.type === 'characterData') {
          const text = mutation.target.textContent?.trim();
          if (text && text.length > 2) {
            liveTranscriptBuffer.push(text);
          }
        }
      });
    });

    captionObserver.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  function stopCapture() {
    if (captionObserver) {
      captionObserver.disconnect();
      captionObserver = null;
    }
    isCapturing = false;
    return liveTranscriptBuffer.join(' ');
  }

  function extractCaptionFromNode(node) {
    const selectors = [
      '.ytp-caption-segment',
      '.caption-window span',
      '[class*="caption"]',
      '[class*="subtitle"]',
      '.segment-text'
    ];
    for (const sel of selectors) {
      if (node.matches?.(sel)) return node.textContent.trim();
      const found = node.querySelector?.(sel);
      if (found) return found.textContent.trim();
    }
    return null;
  }

  // ── Full Page Transcript Extraction ──────────────────────

  function extractFullTranscript() {
    const hostname = window.location.hostname;

    if (hostname.includes('youtube.com')) return extractYouTube();
    if (hostname.includes('coursera.org')) return extractCoursera();
    if (hostname.includes('udemy.com')) return extractUdemy();
    if (hostname.includes('khanacademy.org')) return extractKhan();

    return extractGeneric();
  }

  function extractYouTube() {
    // Try transcript panel first
    const transcriptItems = document.querySelectorAll(
      'ytd-transcript-segment-renderer .segment-text, ' +
      '[class*="transcript-segment"] span, ' +
      '.ytd-transcript-segment-renderer'
    );
    if (transcriptItems.length > 0) {
      return Array.from(transcriptItems).map(el => el.textContent.trim()).join(' ');
    }

    // Try live captions
    const captions = document.querySelectorAll('.ytp-caption-segment, .caption-window span');
    if (captions.length > 0) {
      return Array.from(captions).map(el => el.textContent).join(' ');
    }

    // Fall back to description + title
    const title = document.querySelector('h1.ytd-watch-metadata yt-formatted-string')?.textContent || '';
    const desc = document.querySelector('#description-inline-expander, #description')?.textContent || '';
    return `${title}\n\n${desc}`;
  }

  function extractCoursera() {
    const subs = document.querySelectorAll('[class*="subtitle"], [class*="transcript"] p, .rc-Phrase');
    return Array.from(subs).map(el => el.textContent.trim()).join(' ') || extractGeneric();
  }

  function extractUdemy() {
    const captions = document.querySelectorAll('[class*="transcript"] p, .vjs-text-track-cue, [data-purpose*="transcript"]');
    return Array.from(captions).map(el => el.textContent.trim()).join(' ') || extractGeneric();
  }

  function extractKhan() {
    const transcript = document.querySelector('[class*="transcript"]');
    return transcript?.innerText || extractGeneric();
  }

  function extractGeneric() {
    const selectors = [
      '[class*="transcript"]', '[class*="caption"]', '[class*="subtitle"]',
      'article', 'main', '.content', '#content',
      '[role="main"]'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.length > 200) {
        return el.innerText.substring(0, 50000);
      }
    }
    // Last resort
    return document.body.innerText.substring(0, 50000);
  }

  // ── Video Metadata ────────────────────────────────────────

  function getVideoMeta() {
    const hostname = window.location.hostname;
    let title = document.title;
    let url = window.location.href;
    let duration = 0;
    let platform = 'Generic';

    if (hostname.includes('youtube.com')) {
      title = document.querySelector('h1.ytd-watch-metadata yt-formatted-string')?.textContent ||
              document.querySelector('.title')?.textContent || title;
      const video = document.querySelector('video');
      duration = video?.duration || 0;
      platform = 'YouTube';
    } else if (hostname.includes('coursera.org')) {
      platform = 'Coursera';
    } else if (hostname.includes('udemy.com')) {
      platform = 'Udemy';
    } else if (hostname.includes('khanacademy.org')) {
      platform = 'Khan Academy';
    }

    return { title, url, duration, platform };
  }

  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  // ── Inject floating capture button ───────────────────────

  function injectCaptureButton() {
    if (document.getElementById('learnflow-fab')) return;

    const fab = document.createElement('div');
    fab.id = 'learnflow-fab';
    fab.innerHTML = `
      <div class="lf-fab-inner">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2L2 7l10 5 10-5-10-5z"/>
          <path d="M2 17l10 5 10-5"/>
          <path d="M2 12l10 5 10-5"/>
        </svg>
        <span>LearnFlow</span>
      </div>
    `;

    fab.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'OPEN_SIDEPANEL' });
    });

    document.body.appendChild(fab);
  }

  // Only inject on video pages
  const isVideoPage = document.querySelector('video') ||
    window.location.hostname.includes('youtube.com') ||
    window.location.hostname.includes('coursera.org') ||
    window.location.hostname.includes('udemy.com');

  if (isVideoPage) {
    // Wait for page load
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', injectCaptureButton);
    } else {
      setTimeout(injectCaptureButton, 1500);
    }
  }

})();
