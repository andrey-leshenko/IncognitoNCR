let enabled = await chrome.extension.isAllowedIncognitoAccess();

if (enabled) {
    document.getElementById('msg-enabled').removeAttribute('hidden');
}
else {
    document.getElementById('msg-disabled').removeAttribute('hidden');
}
