// Crowdin Translator Content Script — isw.co.in

// Utility to flash dot status (success/error)
function flashDot(dot, className) {
  dot.classList.add(className);
  setTimeout(() => {
    dot.classList.remove(className);
  }, 2000);
}

// Bypasses framework state bindings to update input fields
function setInputValue(element, value) {
  if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
    // Bypasses React / Vue / Angular shadow DOM overrides
    const nativeValueSetter = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(element),
      "value"
    )?.set;

    if (nativeValueSetter) {
      nativeValueSetter.call(element, value);
    } else {
      element.value = value;
    }

    // Dispatch input & change events for framework detection
    element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
  } else if (element.getAttribute('contenteditable') === 'true') {
    element.innerText = value;
    element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true, cancelable: true }));
  }
}

// Main Translation trigger
function handleTranslation(row, sourceContainer, dot) {
  return new Promise((resolve) => {
    // Clear any existing state classes
    dot.classList.remove('success', 'error');

    // Clone source container to extract text without our dot button's internal tooltip text
    const tempNode = sourceContainer.cloneNode(true);
    const dotInClone = tempNode.querySelector('.isw-translate-dot, .gemini-translate-dot');
    if (dotInClone) dotInClone.remove();
    const englishText = tempNode.innerText.trim();

    if (!englishText) {
      console.warn("Crowdin Translator (isw.co.in): No source English text found.");
      flashDot(dot, 'error');
      resolve();
      return;
    }

    // Locating target translation area
    let textarea = row.querySelector('textarea.side-by-side-textarea') ||
      row.querySelector('textarea') ||
      row.querySelector('div[contenteditable="true"]');

    // Fallback to fetch by ID matching data-id
    if (!textarea && row.hasAttribute('data-id')) {
      const dataId = row.getAttribute('data-id');
      textarea = document.getElementById(`area-${dataId}_-1`) ||
        document.querySelector(`textarea[id*="${dataId}"]`);
    }

    if (!textarea) {
      alert("Crowdin Translator (isw.co.in): Could not locate the target translation field inside this row. Make sure the editor is in Side-by-Side or Bilingual mode.");
      flashDot(dot, 'error');
      resolve();
      return;
    }

    // Load storage settings
    chrome.storage.local.get([
      'userEmail', 
      'targetLanguage', 
      'geminiPrompt', 
      'apiMode', 
      'apiBaseUrl', 
      'apiKey', 
      'apiModel'
    ], async (config) => {
      const apiMode = config.apiMode || 'saas';
      const userEmail = config.userEmail;
      const targetLanguage = config.targetLanguage || 'Tamil';
      let promptTemplate = config.geminiPrompt || "Translate the following English text to {targetLanguage}. Respond ONLY with the translation. Do not include any explanations, notes, intros, or surrounding quotes. Keep formatting, newlines, and place-holders exactly as in the original English text.";

      // Substitute {targetLanguage} placeholder if present
      if (promptTemplate.includes('{targetLanguage}')) {
        promptTemplate = promptTemplate.replace(/\{targetLanguage\}/g, targetLanguage);
      }

      if (apiMode === 'saas' && !userEmail) {
        alert("Crowdin Translator (isw.co.in): You are not logged in! Click the extension icon to sign in with Google.");
        flashDot(dot, 'error');
        resolve();
        return;
      }

      dot.classList.add('loading');

      try {
        const documentText = `${promptTemplate}\n\nEnglish text:\n${englishText}`;
        
        // Delegate translation to background script to bypass page-level CORS limitations
        chrome.runtime.sendMessage({
          type: 'TRANSLATE_REQUEST',
          apiMode: apiMode,
          apiBaseUrl: config.apiBaseUrl,
          apiKey: config.apiKey,
          apiModel: config.apiModel,
          documentText: documentText,
          userEmail: userEmail
        }, (response) => {
          if (!response) {
            console.error("Crowdin Translator: Received no response from background script.");
            alert("Translation error: Connection to background helper failed.");
            dot.classList.remove('loading');
            flashDot(dot, 'error');
            resolve();
            return;
          }

          if (!response.success) {
            console.error("Crowdin Translator: API Error:", response.error);
            alert(`Translation Error: ${response.error}`);
            dot.classList.remove('loading');
            flashDot(dot, 'error');
            resolve();
            return;
          }

          let translation = response.translation;
          if (!translation) {
            console.error("Crowdin Translator: Empty translation response", response);
            alert("The AI engine returned an empty translation. Please check the logs.");
            dot.classList.remove('loading');
            flashDot(dot, 'error');
            resolve();
            return;
          }

          // The backend in SaaS mode returns a JSON string representing an array of objects
          if (apiMode === 'saas') {
            try {
              const parsedResponse = JSON.parse(translation);
              if (Array.isArray(parsedResponse) && parsedResponse.length > 0 && parsedResponse[0].target) {
                translation = parsedResponse[0].target;
              }
            } catch (e) {
              console.warn("Crowdin Translator (isw.co.in): Could not parse response as JSON array, using raw text.");
            }
          }

          let cleanedTranslation = translation.trim();

          // Strip outer quotes if model adds them but source text does not have them
          if (!englishText.startsWith('"') && cleanedTranslation.startsWith('"') && cleanedTranslation.endsWith('"')) {
            cleanedTranslation = cleanedTranslation.slice(1, -1).trim();
          }
          if (!englishText.startsWith("'") && cleanedTranslation.startsWith("'") && cleanedTranslation.endsWith("'")) {
            cleanedTranslation = cleanedTranslation.slice(1, -1).trim();
          }

          // Enter translation into text area
          setInputValue(textarea, cleanedTranslation);

          dot.classList.remove('loading');
          flashDot(dot, 'success');
          resolve();
        });

      } catch (err) {
        console.error("Crowdin Translator (isw.co.in): Request Execution Error:", err);
        alert(`Error during translation: ${err.message}`);
        dot.classList.remove('loading');
        flashDot(dot, 'error');
        resolve();
      }
    });
  });
}

// Injects a floating Translate All button at the bottom-right of the screen
function injectTranslateAllButton() {
  if (document.getElementById('isw-translate-all-container')) return;

  const container = document.createElement('div');
  container.id = 'isw-translate-all-container';
  container.className = 'isw-translate-all-container';

  const button = document.createElement('button');
  button.id = 'isw-translate-all-btn';
  button.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-globe"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
    Translate All
  `;

  container.appendChild(button);
  document.body.appendChild(container);

  button.addEventListener('click', async (e) => {
    e.stopPropagation();
    e.preventDefault();

    // Find all untranslated dots visible on the screen
    const dots = Array.from(document.querySelectorAll('.isw-translate-dot:not(.loading):not(.success)'));
    
    if (dots.length === 0) {
      alert("Crowdin Translator: No pending string translations found on this page.");
      return;
    }

    if (!confirm(`Do you want to translate all ${dots.length} visible strings automatically?`)) {
      return;
    }

    button.disabled = true;
    let completed = 0;
    let failures = 0;

    for (const dot of dots) {
      // Confirm dot is still on the screen and not already processed
      if (dot.classList.contains('success') || dot.classList.contains('loading')) continue;

      const sourceContainer = dot.parentElement;
      const row = sourceContainer.closest('.proofread-string-wrapper') ||
        sourceContainer.closest('.side-by-side') ||
        sourceContainer.closest('.editor-row') ||
        sourceContainer.parentElement.parentElement;

      if (row) {
        button.innerHTML = `
          <svg class="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle><path d="M12 2a10 10 0 0 1 10 10" stroke-dasharray="16"></path></svg>
          Translating (${completed + 1}/${dots.length})...
        `;

        await handleTranslation(row, sourceContainer, dot);
        
        if (dot.classList.contains('error')) {
          failures++;
          if (failures >= 3) {
            alert("Translate All halted: Capped at 3 translation failures. Please verify your credentials, endpoint URL, or model permissions.");
            break;
          }
        } else {
          completed++;
        }

        // Add 500ms safety gap to avoid local model concurrency/rate exhaustion
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    button.disabled = false;
    button.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
      Translate All
    `;
    
    // Flash status message
    const origText = button.innerHTML;
    button.innerHTML = "✓ Done!";
    setTimeout(() => {
      button.innerHTML = origText;
    }, 3000);
  });
}

// Scans Crowdin page structure to append blue dot buttons
function scanAndAddDots() {
  const sourceContainers = document.querySelectorAll('.source-string-container');

  // Inject or show/hide the Translate All button based on page state
  if (sourceContainers.length > 0) {
    injectTranslateAllButton();
  } else {
    const container = document.getElementById('isw-translate-all-container');
    if (container) container.style.display = 'none';
  }

  chrome.storage.local.get(['targetLanguage'], (config) => {
    const targetLanguage = config.targetLanguage || 'Tamil';

    const container = document.getElementById('isw-translate-all-container');
    if (container && sourceContainers.length > 0) {
      container.style.display = 'block';
    }

    sourceContainers.forEach(sourceContainer => {
      // Avoid double injection
      if (sourceContainer.querySelector('.isw-translate-dot, .gemini-translate-dot')) return;

      // Discover the containing row
      const row = sourceContainer.closest('.proofread-string-wrapper') ||
        sourceContainer.closest('.side-by-side') ||
        sourceContainer.closest('.editor-row') ||
        sourceContainer.parentElement.parentElement;

      if (!row) return;

      // Verify sourceContainer has positioning enabled
      if (window.getComputedStyle(sourceContainer).position === 'static') {
        sourceContainer.style.position = 'relative';
      }

      // Create dot element
      const dot = document.createElement('div');
      dot.className = 'isw-translate-dot';
      dot.setAttribute('contenteditable', 'false');
      dot.setAttribute('title', `Translate to ${targetLanguage}`);

      // Create tooltip
      const tooltip = document.createElement('span');
      tooltip.className = 'isw-tooltip';
      tooltip.innerText = `Translate to ${targetLanguage}`;
      dot.appendChild(tooltip);

      sourceContainer.appendChild(dot);

      // Click trigger
      dot.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        handleTranslation(row, sourceContainer, dot);
      });
    });
  });
}

// Watch for DOM changes to accommodate dynamically scrolled items and SPA views
let scanTimeout = null;
const observer = new MutationObserver(() => {
  if (scanTimeout) clearTimeout(scanTimeout);
  scanTimeout = setTimeout(scanAndAddDots, 150);
});

// Start observer
observer.observe(document.body, { childList: true, subtree: true });

// Run periodically to catch edge cases
setInterval(scanAndAddDots, 1500);

// Immediate execution
scanAndAddDots();
console.log("Crowdin Translator extension by isw.co.in loaded and running.");
