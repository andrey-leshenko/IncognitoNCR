// NOTE: When inspecting the incognito service worker, to reset the session we
// need to close all incognito windows AND the incognito service worker devtools.

let getStore = (() => {
    let store = { next_nid: null };
    let initStore = chrome.storage.local.get().then((items) => {
        Object.assign(store, items);
    });
    return async () => {
        await initStore;
        return store;
    }
})();

async function saveStore(store) {
    await chrome.storage.local.set(store);
}

let nidPromise = null;
let nidPromiseResolve = null;
let nidPromiseReject = null;

// TODO: Check if the "open in incognito" button will work.

const NCR_URL = 'https://www.google.com/ncr';
// We mark our requests to differentiate between them and regular requests
const EXTENSION_HASH_MARKER = '#' + chrome.runtime.id;

chrome.webRequest.onHeadersReceived.addListener(
    async function(details) {
        if (URL.parse(details.url).hash != EXTENSION_HASH_MARKER)
            return;

        function parseNIDFromHeaders(details) {
            let set_cookie = details.responseHeaders.find(x => x.name == 'set-cookie');
            let matches = /NID=([^; ]*)/.exec(set_cookie.value);
            return matches[1];
        }

        let nid;

        try {
            nid = parseNIDFromHeaders(details);
        }
        catch (error) {
            nidPromiseReject(error);
        }

        let store = await getStore();

        store.next_nid = nid;
        nidPromiseResolve();
        nidPromise = null;
        await saveStore(store);

    },
    { urls: [NCR_URL] },
    ['responseHeaders', 'extraHeaders'],
);

async function fetchNextNIDCookie() {
    if (nidPromise)
        await nidPromise;

    nidPromise = new Promise((resolve, reject) => {
        nidPromiseResolve = resolve;
        nidPromiseReject = reject;
    });

    fetch(NCR_URL + EXTENSION_HASH_MARKER, {
        credentials: 'omit', // Make an anonymous request, without sending current cookies
    }).catch((err) => { nidPromiseReject(err); });

    await nidPromise;
}

async function getNIDCookie() {
    let store = await getStore();

    while (store.next_nid === null) {
        console.log('Fetching cookie for now');
        await fetchNextNIDCookie();
    }

    let nid = store.next_nid;
    store.next_nid = null;
    console.log('Using cookie', nid);

    saveStore(store); // In the background
    console.log('Fetching cookie for later');
    fetchNextNIDCookie(); // In the background

    return nid;
}

async function doNCR() {
    let cookie = await chrome.cookies.get({name: 'NID', url: 'https://www.google.com'});

    if (cookie !== null) {
        console.log('Cookie already set', cookie.value);
        return;
    }

    console.info('No cookie!');

    let nid = await getNIDCookie();

    await chrome.cookies.set({
        domain: '.google.com',
        httpOnly: true,
        name: 'NID',
        path: '/',
        sameSite: 'unspecified',
        secure: true,
        url: 'https://www.google.com',
        value: nid,
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
        return;
    }
    finally {
        working = false;
    }
});
