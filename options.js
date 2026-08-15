const DEFAULT_PROMPT = "Translate the following English text to {targetLanguage}. Respond ONLY with the translation. Do not include any explanations, notes, intros, or surrounding quotes. Keep formatting, newlines, and place-holders exactly as in the original English text.";
const DEFAULT_MODEL = "gemini-2.5-flash";
const DEFAULT_LANGUAGE = "Tamil";
const BACKEND_URL = "https://isw.co.in/billing/api";

const DEFAULT_API_MODE = "saas";
const DEFAULT_API_BASE_URL = "http://172.18.1.17:14005";
const DEFAULT_API_KEY = "";
const DEFAULT_API_MODEL = "gemini-3-flash-preview";

document.addEventListener("DOMContentLoaded", () => {
  const targetLanguageSelect = document.getElementById("targetLanguage");
  const promptInput = document.getElementById("prompt");
  const saveBtn = document.getElementById("saveBtn");
  const statusMsg = document.getElementById("statusMsg");
  
  const unauthView = document.getElementById("unauth-view");
  const authView = document.getElementById("auth-view");
  const loginBtn = document.getElementById("loginBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const displayEmail = document.getElementById("displayEmail");
  const displayCredits = document.getElementById("displayCredits");
  const rechargeBtn = document.getElementById("rechargeBtn");

  const apiModeSelect = document.getElementById("apiMode");
  const directApiFields = document.getElementById("direct-api-fields");
  const apiBaseUrlInput = document.getElementById("apiBaseUrl");
  const apiKeyInput = document.getElementById("apiKey");
  const apiModelInput = document.getElementById("apiModel");
  const testApiBtn = document.getElementById("testApiBtn");

  // Show status indicator
  const showStatus = (text, isSuccess) => {
    statusMsg.textContent = text;
    statusMsg.style.display = "flex";
    statusMsg.className = `status-msg ${isSuccess ? "status-success" : "status-error"}`;
    setTimeout(() => {
      statusMsg.style.display = "none";
    }, 4500);
  };

  const updateVisibility = (mode, email) => {
    if (mode === "direct") {
      unauthView.style.display = "none";
      authView.style.display = "none";
      directApiFields.style.display = "block";
    } else {
      directApiFields.style.display = "none";
      if (email) {
        unauthView.style.display = "none";
        authView.style.display = "block";
        displayEmail.textContent = email;
        fetchCredits(email);
      } else {
        unauthView.style.display = "block";
        authView.style.display = "none";
        displayEmail.textContent = "loading...";
        displayCredits.textContent = "...";
      }
    }
  };

  const fetchCredits = async (email) => {
    displayCredits.textContent = "Fetching...";
    try {
      const res = await fetch(`${BACKEND_URL}?action=get_credits`, {
        method: "POST",
        headers: { "X-User-Email": email }
      });
      const data = await res.json();
      if (data.credits !== undefined) {
        displayCredits.textContent = data.credits;
      } else {
        displayCredits.textContent = "Error";
      }
    } catch (e) {
      console.error(e);
      displayCredits.textContent = "Offline";
    }
  };

  // Auto-save target language on change
  targetLanguageSelect.addEventListener("change", () => {
    chrome.storage.local.set({ targetLanguage: targetLanguageSelect.value }, () => {
      showStatus("Target language saved!", true);
    });
  });

  // Toggle visible settings fields when connection mode changes
  apiModeSelect.addEventListener("change", () => {
    const mode = apiModeSelect.value;
    chrome.storage.local.get(["userEmail"], (data) => {
      updateVisibility(mode, data.userEmail);
    });
  });

  // Load configuration from local storage
  chrome.storage.local.get([
    "targetLanguage", 
    "geminiPrompt", 
    "userEmail", 
    "apiMode", 
    "apiBaseUrl", 
    "apiKey", 
    "apiModel"
  ], (data) => {
    if (data.targetLanguage) targetLanguageSelect.value = data.targetLanguage;
    else targetLanguageSelect.value = DEFAULT_LANGUAGE;

    promptInput.value = data.geminiPrompt || DEFAULT_PROMPT;

    const currentMode = data.apiMode || DEFAULT_API_MODE;
    apiModeSelect.value = currentMode;

    apiBaseUrlInput.value = data.apiBaseUrl || DEFAULT_API_BASE_URL;
    apiKeyInput.value = data.apiKey || DEFAULT_API_KEY;
    apiModelInput.value = data.apiModel || DEFAULT_API_MODEL;

    updateVisibility(currentMode, data.userEmail);
  });

  // Test Direct API Connection
  testApiBtn.addEventListener("click", async () => {
    const baseUrl = apiBaseUrlInput.value.trim();
    const apiKey = apiKeyInput.value.trim();
    const model = apiModelInput.value.trim();

    if (!baseUrl) {
      showStatus("Please enter an API Base URL", false);
      return;
    }

    testApiBtn.textContent = "Testing...";
    testApiBtn.disabled = true;

    // Send a message to background service worker to perform the test request
    const testPrompt = "Respond with the word 'SUCCESS' and nothing else.";
    chrome.runtime.sendMessage({
      type: "TRANSLATE_REQUEST",
      apiMode: "direct",
      apiBaseUrl: baseUrl,
      apiKey: apiKey,
      apiModel: model,
      documentText: testPrompt
    }, (response) => {
      testApiBtn.textContent = "Test Connection";
      testApiBtn.disabled = false;

      if (response && response.success) {
        showStatus(`Success! Connection verified. Response: "${response.translation.trim()}"`, true);
      } else {
        const errorMsg = (response && response.error) ? response.error : "Connection timed out or failed";
        showStatus(`Connection failed: ${errorMsg}`, false);
      }
    });
  });

  // Login via Google OAuth (Identity API)
  loginBtn.addEventListener("click", () => {
    loginBtn.disabled = true;
    const originalContent = loginBtn.innerHTML;
    loginBtn.textContent = "Signing in...";
    
    // Request OAuth token from Chrome
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError || !token) {
        const error = chrome.runtime.lastError ? chrome.runtime.lastError.message : "Access token request denied.";
        showStatus(`Login Failed: ${error}`, false);
        loginBtn.disabled = false;
        loginBtn.innerHTML = originalContent;
        return;
      }

      // Fetch user profile email using OAuth token
      fetch("https://www.googleapis.com/oauth2/v1/userinfo?alt=json", {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status} trying to retrieve userinfo`);
        return res.json();
      })
      .then(profile => {
        if (profile.email) {
          chrome.storage.local.set({ userEmail: profile.email }, () => {
            showStatus(`Successfully logged in as ${profile.email}`, true);
            updateVisibility(apiModeSelect.value, profile.email);
          });
        } else {
          throw new Error("No email returned in Google profile data.");
        }
      })
      .catch(err => {
        showStatus(`Failed to fetch profile: ${err.message}`, false);
        loginBtn.disabled = false;
        loginBtn.innerHTML = originalContent;
      });
    });
  });

  // Logout (SaaS Mode)
  logoutBtn.addEventListener("click", () => {
    chrome.storage.local.remove('userEmail', () => {
      chrome.storage.local.get(["apiMode"], (data) => {
        updateVisibility(data.apiMode || DEFAULT_API_MODE, null);
        showStatus("Logged out of Extension.", true);
      });
    });
  });

  // Periodically check if email was set by background script (during external login)
  setInterval(() => {
    chrome.storage.local.get(['userEmail', 'apiMode'], (data) => {
      const mode = data.apiMode || DEFAULT_API_MODE;
      // If we are currently showing unauth view but we now have an email, update UI
      if (mode === "saas" && data.userEmail && unauthView.style.display !== "none") {
        updateVisibility("saas", data.userEmail);
      }
    });
  }, 2000);

  // Attempt silent login via Chrome profile info on load
  chrome.storage.local.get(['userEmail'], (data) => {
    if (!data.userEmail) {
      chrome.identity.getProfileUserInfo({ accountStatus: 'ANY' }, (userInfo) => {
        if (userInfo && userInfo.email) {
          chrome.storage.local.set({ userEmail: userInfo.email }, () => {
            chrome.storage.local.get(['apiMode'], (config) => {
              updateVisibility(config.apiMode || DEFAULT_API_MODE, userInfo.email);
            });
          });
        }
      });
    }
  });

  // Save Settings
  saveBtn.addEventListener("click", () => {
    const targetLanguage = targetLanguageSelect.value;
    const prompt = promptInput.value.trim() || DEFAULT_PROMPT;
    const apiMode = apiModeSelect.value;
    const apiBaseUrl = apiBaseUrlInput.value.trim();
    const apiKey = apiKeyInput.value.trim();
    const apiModel = apiModelInput.value.trim();

    chrome.storage.local.set({
      targetLanguage: targetLanguage,
      geminiPrompt: prompt,
      apiMode: apiMode,
      apiBaseUrl: apiBaseUrl,
      apiKey: apiKey,
      apiModel: apiModel
    }, () => {
      showStatus("All settings saved successfully!", true);
    });
  });

  // Recharge via Website Redirect
  rechargeBtn.addEventListener("click", () => {
    chrome.tabs.create({ url: "https://isw.co.in/billing/" });
  });
});
