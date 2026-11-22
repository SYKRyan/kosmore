async function finish() {
  const query = location.hash.slice(1);
  history.replaceState(null, "", location.pathname);
  const status = document.querySelector('[role="status"]');
  const requestId = crypto.randomUUID();
  try {
    const result = await chrome.runtime.sendMessage({
      op: "servicesFinishLink",
      query,
      requestId,
    });
    if (!result?.ok || result.requestId !== requestId)
      throw new Error(
        result?.error || "Return to KosMore Settings to start a new link.",
      );
    status.textContent = `Linked to ${result.data.handle}. You can close this tab.`;
  } catch (error) {
    status.textContent = error.message;
  }
}
if (window.top === window) void finish();
