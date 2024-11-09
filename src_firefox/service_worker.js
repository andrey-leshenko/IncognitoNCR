let storePromise = chrome.storage.local.get().then((items) => {
    let store = { next_nid: null, allowed_in_incognito: false };
    Object.assign(store, items);
    return store;
});

async function saveStore(store) {
    await chrome.storage.local.set(store);
}

// NOTE: In a previous version we registered an onHeadersReceived listener
// just-in-time for each request. Turns out that on Chrome (130.0.6723.116) the
// callback will sometimes be called without the set-cookie headers, even though
// they were sent by the server. Interestingly, adding another listener that
// always exists fixes it. I suspect there is a race, where the "extraHeaders"
// property isn't yet applied to the listener when the response is received. The
// current version uses a single global listener to avoid all those problems.

let pendingRequests = [];

chrome.webRequest.onHeadersReceived.addListener(
    (details) => {
        let hash = URL.parse(details.url).hash;
        for (let {marker: marker, resolve: resolve} of pendingRequests) {
            if (marker == hash) {
                pendingRequests.splice(pendingRequests.findIndex(x => x.marker == marker), 1);
                resolve(details.responseHeaders);
                return;
            }
        }
    },
    {urls: ['https://www.google.com/ncr*']},
    ['responseHeaders'],
);

async function fetchNewNIDCookie() {
    let headers = await new Promise((resolve, reject) => {
        // We mark our requests to differentiate them from regular ones
        let requestId = (Math.random() + 1).toString(36).substring(2);
        let marker = `#${chrome.runtime.id}-${requestId}`;

        pendingRequests.push({marker: marker, resolve: resolve});

        fetch('https://www.google.com/ncr' + marker, {
            credentials: 'omit', // Anonymous request, don't send current cookies
            redirect: 'manual', // Don't follow the redirect to google.com
        }).catch(e => {
            pendingRequests.splice(pendingRequests.findIndex(x => x.marker == marker), 1);
            reject(e);
        });

        setTimeout(() => {
            pendingRequests.splice(pendingRequests.findIndex(x => x.marker == marker), 1);
            reject("Timeout");
        }, 30_000);
    });

    for (let h of headers) {
        if (h.name != 'set-cookie') continue;
        let match = /NID=([^; ]*)/.exec(h.value);
        if (!match) continue;

        return match[1];
    }

    throw new Error('NID cookie not found');

}

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
        // next_id might be asynchronously updated when we reach this part but
        // it doesn't hurt to overwrite next_nid with a fresh nid.
        store.next_nid = nid;
        saveStore(store);
    });

    return nid;
}

async function __doNCR(override, storeId) {
    if (!override) {
        let cookie = await chrome.cookies.get({storeId: storeId, name: 'NID', url: 'https://www.google.com'});
        if (cookie !== null) return;
    }

    let nid = await getNIDCookie();

    await chrome.cookies.set({
        storeId: storeId,
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

async function _doNCR(override) {
    let stores = await chrome.cookies.getAllCookieStores();

    for (let store of stores.filter(s => s.incognito)) {
        await __doNCR(override, store.id);
    }
}

let working = false;

async function doNCR(override) {
    // No need to run multiple checks in parallel
    if (working) return;

    working = true;
    try {
        await _doNCR(override);
    }
    catch (error) {
        console.error(error);
    }
    finally {
        working = false;
    }
}


chrome.windows.onCreated.addListener(async (window) => {
    if (!window.incognito) return;
    await doNCR(false);
});

async function permissionCheck() {
    let allowed = await chrome.extension.isAllowedIncognitoAccess();

    if (allowed) {
        chrome.action.disable();
    }
    else {
        chrome.action.setBadgeText({text: "Off"});
    }

    let store = await storePromise;

    if (allowed != store.allowed_in_incognito) {
        store.allowed_in_incognito = allowed;
        saveStore(store);

        // When installing the extension, we want it to work immediately,
        // without needing to close all Incognito windows.
        if (allowed) {
            console.log('Resetting cookie after being enabled');
            await doNCR(true);
        }
    }
}

permissionCheck();
