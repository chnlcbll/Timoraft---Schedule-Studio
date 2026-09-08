const ext = globalThis.chrome ?? globalThis.browser;
const APP_URL = ext.runtime.getURL("sidepanel.html");
const HUB_ORIGIN = "https://archershub.dlsu.edu.ph";
const OPEN_TAB_KEY = "timoraftOpenTabId";

ext.action.onClicked.addListener(async () => {
  const stored = await ext.storage.session.get(OPEN_TAB_KEY);
  const openTabId = stored[OPEN_TAB_KEY];
  if (openTabId) {
    try {
      const tab = await ext.tabs.get(openTabId);
      if (tab.url?.startsWith(ext.runtime.getURL(""))) {
        await ext.tabs.update(openTabId, { active: true });
        await ext.windows.update(tab.windowId, { focused: true });
        return;
      }
    } catch {}
  }
  const tab = await ext.tabs.create({ url: APP_URL });
  await ext.storage.session.set({ [OPEN_TAB_KEY]: tab.id });
});

ext.tabs.onRemoved.addListener(async (tabId) => {
  const stored = await ext.storage.session.get(OPEN_TAB_KEY);
  if (stored[OPEN_TAB_KEY] === tabId) await ext.storage.session.remove(OPEN_TAB_KEY);
});

async function getCookieHeader() {
  const cookies = await ext.cookies.getAll({ url: HUB_ORIGIN });
  return cookies.length ? cookies.map(({ name, value }) => `${name}=${value}`).join("; ") : null;
}

ext.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message.type === "GET_HUB_STATUS") {
    (async () => {
      const cookie = await getCookieHeader();
      respond({ loggedIn: Boolean(cookie) });
    })();
    return true;
  }
  if (message.type === "HUB_FETCH") {
    (async () => {
      try {
        const cookie = await getCookieHeader();
        if (!cookie) throw new Error("Sign in to Archer's Hub first");
        const response = await fetch(`${HUB_ORIGIN}${message.path}`, {
          method: "POST",
          headers: {
            Cookie: cookie,
            "Content-Type": message.isJson ? "application/json" : "application/x-www-form-urlencoded; charset=UTF-8",
            "X-Requested-With": "XMLHttpRequest",
          },
          body: message.body,
        });
        if (!response.ok) throw new Error(`Archer's Hub returned ${response.status}`);
        respond({ ok: true, text: await response.text() });
      } catch (error) {
        respond({ ok: false, error: error.message });
      }
    })();
    return true;
  }
});
