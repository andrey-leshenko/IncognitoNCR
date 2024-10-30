document.getElementById('options-link').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({'url': 'chrome://extensions/?id=' + chrome.runtime.id});
})
