# Incognito NCR

By default, Google tries to guess which country you are browsing from,
and changes the display language accordingly.
This behavior can be disabled by browsing to https://google.com/ncr (which stands for No Country Redirect). However, because Incognito mode doesn't keep cookies between sessions, you have to enable NCR again and again, each time you open a new Incognito window.

This extension solves the problem by automatically enabling NCR mode in Incognito windows.

## Implementation

Browsing to https://google.com/ncr sets the Google NID cookie to a new value.
According to Google, "The NID cookie contains a unique ID Google uses to remember your preferences and other information, such as your preferred language (e.g. English)".

Each time you open a new Incognito window, the extension will set a new NID cookie received from a request to https://google.com/ncr.
To avoid having to wait for a network request, the extension prefetches an NCR NID cookie beforehand.
