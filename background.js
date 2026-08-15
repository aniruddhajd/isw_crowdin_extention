// Background service worker for Crowdin Translator
// Handles: options page opener, external sync

// Open options page when extension icon is clicked
chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

// Silently sync Chrome Profile email status on startup/install
function syncChromeProfileEmail() {
  chrome.identity.getProfileUserInfo({ accountStatus: 'ANY' }, (userInfo) => {
    if (userInfo && userInfo.email) {
      chrome.storage.local.get(['userEmail'], (data) => {
        if (!data.userEmail) {
          chrome.storage.local.set({ userEmail: userInfo.email });
        }
      });
    }
  });
}

chrome.runtime.onInstalled.addListener(syncChromeProfileEmail);
chrome.runtime.onStartup.addListener(syncChromeProfileEmail);

// Listen for external messages (e.g. from isw.co.in website)
chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
  if (request.type === "LOGIN_SUCCESS" && request.email) {
    // Save email to local storage
    chrome.storage.local.set({ userEmail: request.email }, () => {
      sendResponse({ success: true });
    });
  }
});

// Listen for internal messages (from content.js or options.js)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "TRANSLATE_REQUEST") {
    const { apiMode, apiBaseUrl, apiKey, apiModel, documentText, userEmail } = request;

    if (apiMode === "direct") {
      const baseUrl = apiBaseUrl || "http://172.18.1.17:14005";
      const cleanUrl = baseUrl.endsWith("/v1") ? `${baseUrl}/chat/completions` : `${baseUrl.replace(/\/$/, "")}/v1/chat/completions`;
      
      const payload = {
        model: apiModel || "gemini-3-flash-preview",
        messages: [
          {
            role: "user",
            content: documentText
          }
        ]
      };

      fetch(cleanUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify(payload)
      })
      .then(response => {
        if (!response.ok) {
          return response.text().then(text => {
            throw new Error(`API returned HTTP ${response.status}: ${text}`);
          });
        }
        return response.json();
      })
      .then(data => {
        const translation = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
        if (!translation) {
          throw new Error("Empty response or invalid JSON structure from AI provider.");
        }
        sendResponse({ success: true, translation: translation });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });

      return true; // Keep the message channel open for async response
    } else {
      // SaaS Mode: Translate using isw.co.in
      const url = `https://isw.co.in/translator_crowdin/api?action=translate_document`;
      fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Email': userEmail
        },
        body: JSON.stringify({
          document: documentText,
          model_name: 'model_1'
        })
      })
      .then(response => {
        if (!response.ok) {
          return response.text().then(text => {
            throw new Error(`SaaS API returned HTTP ${response.status}: ${text}`);
          });
        }
        return response.json();
      })
      .then(data => {
        if (data.error) {
          throw new Error(data.error);
        }
        sendResponse({ success: true, translation: data.response });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });

      return true; // Keep the message channel open for async response
    }
  }
});

