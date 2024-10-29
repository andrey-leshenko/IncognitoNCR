let enabled = await chrome.extension.isAllowedIncognitoAccess();

if (enabled) {
    document.getElementById('msg-enabled').removeAttribute('hidden');
}
else {
    document.getElementById('msg-disabled').removeAttribute('hidden');
}

document.getElementById('options-link').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({'url': 'chrome://extensions/?id=' + chrome.runtime.id});
})
