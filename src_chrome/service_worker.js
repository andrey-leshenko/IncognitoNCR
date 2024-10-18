// NOTE: When inspecting the incognito service worker, to reset the session we
// need to close all incognito windows AND the incognito service worker devtools.

let storePromise = chrome.storage.local.get().then((items) => {
    let store = { next_nid: null };
    Object.assign(store, items);
    return store;
});

async function saveStore(store) {
    await chrome.storage.local.set(store);
}

// We mark our requests to differentiate them from regular ones
const EXTENSION_HASH_MARKER = '#' + chrome.runtime.id;

let headersPromise = null;
let headersPromiseResolve = null;
let headersPromiseReject = null;

async function fetchNewNIDCookie() {
    // For simplicity, only one fetch at a time
    while (headersPromise)
        await headersPromise;

    headersPromise = new Promise((resolve, reject) => {
        headersPromiseResolve = resolve;
        headersPromiseReject = reject;
    });

    fetch('https://www.google.com/ncr' + EXTENSION_HASH_MARKER, {
        credentials: 'omit', // Anonymous request, don't send current cookies
    }).catch((err) => { headersPromiseReject(err); });

    let headers = await headersPromise;

    for (let h of headers) {
        if (h.name != 'set-cookie')
            continue;
        let match = /NID=([^; ]*)/.exec(h.value);
        if (!match)
            continue;

        return match[1];
    }

    throw new Error('NID cookie not found');
}

chrome.webRequest.onHeadersReceived.addListener(
    async function(details) {
        if (URL.parse(details.url).hash != EXTENSION_HASH_MARKER)
            return;

        headersPromiseResolve(details.responseHeaders);
        headersPromise = null;
    },
    {urls: ['https://www.google.com/ncr']},
    ['responseHeaders', 'extraHeaders'],
);

async function getNIDCookie() {
    let store = await storePromise;
    let nid;

    if (store.next_nid !== null) {
        console.log('Using prefetched cookie');
        nid = store.next_nid;
        store.next_nid = null;
        saveStore(store);
    }
    else {
        console.log('Fetching cookie for now');
        nid = await fetchNewNIDCookie();
    }
    console.log('Cookie:', nid);

    console.log('Prefetching cookie for later');
    // In the background
    fetchNewNIDCookie().then((nid) => {
        store.next_nid = nid;
        saveStore(store);
    });

    return nid;
}

async function doNCR() {
    let cookie = await chrome.cookies.get({name: 'NID', url: 'https://www.google.com'});

    if (cookie !== null)
        return;

    let nid = await getNIDCookie();

    await chrome.cookies.set({
        name: 'NID',
        value: nid,
        url: 'https://www.google.com',
        domain: '.google.com',
        path: '/',
        httpOnly: true,
        secure: true,
        sameSite: 'no_restriction',
    });
}

let working = false;

chrome.windows.onCreated.addListener(async (window) => {
    if (!window.incognito)
        return;

    // No need to run multiple checks in parallel
    if (working)
        return;

    working = true;
    try {
        await doNCR();
    }
    catch (error) {
        console.error(error);
    }
    finally {
        working = false;
    }
});
