document.getElementById("open-zalo")?.addEventListener("click", () => {
  chrome.tabs.create({ url: "https://chat.zalo.me/", active: true });
});
