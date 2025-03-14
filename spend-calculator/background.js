chrome.runtime.onInstalled.addListener(() => {
  console.log("Spend Calculator extension installed");
});

chrome.action.onClicked.addListener(async (tab) => {
  const url = tab.url;
  let popupPage = "select.html";

  if (url.includes("book.olacabs.com")) {
    popupPage = "ola.html";
  } else if (url.includes("zeptonow.com")) {
    popupPage = "zepto.html";
  }

  chrome.action.setPopup({ tabId: tab.id, popup: popupPage });
});

// Listen for tab updates to change popup based on URL
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    let popupPage = "select.html";

    if (changeInfo.url.includes("book.olacabs.com")) {
      popupPage = "ola.html";
    } else if (changeInfo.url.includes("zeptonow.com")) {
      popupPage = "zepto.html";
    }

    chrome.action.setPopup({ tabId: tabId, popup: popupPage });
  }
});

// Add permissions for both domains
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getPermissions") {
    chrome.permissions.request(
      {
        origins: [
          "https://book.olacabs.com/*",
          "https://www.zeptonow.com/*",
          "https://api.zeptonow.com/*",
        ],
      },
      (granted) => {
        if (granted) {
          console.log("Required permissions granted");
          sendResponse({ success: true });
        } else {
          console.log("Required permissions denied");
          sendResponse({ success: false });
        }
      }
    );
    return true;
  }
});
