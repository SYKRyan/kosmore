import { el, note } from "../content/ui";
import { request } from "../shared/messages";
import {
  servicesBase,
  servicesPermission,
  SERVICES_STATE_KEY,
  type ConnectionStatus,
} from "../shared/services";
import { messageOf } from "../shared/types";

export function servicesConnection() {
  const section = el("div", "services-connection");
  const field = el("label", "field");
  field.append(el("span", "", "KosMore Services API base URL"));
  const input = el("input");
  input.type = "password";
  input.inputMode = "url";
  input.required = true;
  input.autocomplete = "off";
  input.spellcheck = false;
  input.placeholder = "https://services.example.com";
  field.append(input);
  const inviteField = el("label", "field");
  const invite = el("input");
  invite.type = "password";
  invite.autocomplete = "off";
  inviteField.append(el("span", "", "Tester invite code (optional)"), invite);
  const retry = el("button", "", "Retry access");
  retry.type = "button";
  retry.addEventListener("click", async () => {
    busy = true;
    render();
    try {
      current = await request<ConnectionStatus>({ op: "servicesRetry" });
    } catch (error) {
      busy = false;
      render(messageOf(error));
      return;
    }
    busy = false;
    render();
  });
  const controls = el("div", "account-row");
  const connect = el("button", "primary", "Connect");
  const copyLink = el("button", "", "Copy Link");
  const disconnect = el("button", "", "Disconnect");
  connect.type = copyLink.type = disconnect.type = "button";
  const linkField = el("label", "field");
  const linkInput = el("input");
  linkInput.type = "url";
  linkInput.readOnly = true;
  linkInput.addEventListener("focus", () => linkInput.select());
  linkField.append(el("span", "", "Sign-in link"), linkInput);
  linkField.hidden = true;
  const feedback = el("div");
  feedback.setAttribute("role", "status");
  const erase = el("button", "", "Erase synced listing history");
  erase.type = "button";
  erase.addEventListener("click", async () => {
    const { handle, base, playerId } = current;
    if (
      !handle ||
      !playerId ||
      !window.confirm(
        "Erase all synced listing history for " + handle + " across browsers?",
      )
    )
      return;
    busy = true;
    render();
    try {
      current = await request<ConnectionStatus>({
        op: "servicesEraseHistory",
        playerId,
        base,
      });
      busy = false;
      render();
      feedback.replaceChildren(
        note("Synced listing history erased for " + handle + "."),
      );
    } catch (error) {
      busy = false;
      render(messageOf(error));
    }
  });
  controls.append(connect, copyLink, retry, disconnect, erase);
  section.append(
    field,
    inviteField,
    controls,
    feedback,
    linkField,
  );

  let current: ConnectionStatus = { base: "" };
  let busy = false;
  let ready = false;
  let saving: Promise<unknown> = Promise.resolve();

  function parsed() {
    try {
      return servicesBase(input.value);
    } catch {
      return undefined;
    }
  }
  function render(error?: string) {
    const url = parsed();
    const linked = current.handle && url === current.base;
    connect.textContent = linked ? "Reconnect" : "Connect";
    connect.disabled = !ready || busy || !url;
    copyLink.disabled = connect.disabled;
    retry.hidden = !(linked && current.blocked);
    retry.disabled = busy;
    invite.disabled = busy;
    erase.hidden = !linked || !!current.blocked;
    erase.disabled = busy;
    disconnect.hidden = !linked;
    disconnect.disabled = busy;
    input.disabled = busy || !ready;
    feedback.replaceChildren(
      note(
        error ??
          (busy
            ? "Connecting to Kosmora…"
            : linked && current.blocked
              ? "Access blocked. Ask the administrator to restore access, then retry."
              : linked
                ? `Linked to ${current.handle}.`
                : url
                  ? "Link your Kosmora account to load card data."
                  : "Enter the Services URL provided for testing."),
        !!error,
      ),
    );
  }

  async function refresh() {
    const result = await request<ConnectionStatus>({ op: "servicesStatus" });
    if (!ready || document.activeElement !== input) input.value = result.base;
    current = result;
    ready = true;
    render();
  }

  function hideLink() {
    linkInput.value = "";
    linkField.hidden = true;
  }
  input.addEventListener("input", () => {
    hideLink();
    render();
  });
  input.addEventListener("change", () => {
    const base = parsed();
    if (!base && input.value.trim()) {
      render(
        "Use HTTPS, or use HTTP with localhost or 127.0.0.1 for local testing.",
      );
      return;
    }
    saving = saving
      .catch(() => {})
      .then(async () => {
        current = await request<ConnectionStatus>({
          op: "servicesSave",
          base: base ?? "",
        });
        if (!busy) render();
      });
    void saving.catch((error) => render(messageOf(error)));
  });

  function begin(copy: boolean) {
    const base = parsed();
    if (!base || busy) return;
    const access = chrome.permissions.request({
      origins: [servicesPermission(base)],
    });
    busy = true;
    hideLink();
    render();
    void (async () => {
      let error: string | undefined;
      let hint: string | undefined;
      try {
        if (!(await access))
          throw new Error("Allow access to this host to connect.");
        await saving.catch(() => {});
        const args = { inviteCode: invite.value.trim(), base };
        if (copy) {
          const { url } = await request<{ url: string }>({
            op: "servicesCopyLink",
            ...args,
          });
          linkInput.value = url;
          linkField.hidden = false;
          try {
            await navigator.clipboard.writeText(url);
            hint =
              "Link copied. Paste it into another tab in this browser and authorize KosMore.";
          } catch {
            linkInput.focus();
            linkInput.select();
            hint =
              "Copy the sign-in link below and paste it into another tab in this browser.";
          }
        } else {
          current = await request<ConnectionStatus>({
            op: "servicesConnect",
            ...args,
          });
          input.value = current.base;
        }
        invite.value = "";
      } catch (failure) {
        error = messageOf(failure);
      } finally {
        busy = false;
        render(error);
        if (hint) feedback.replaceChildren(note(hint));
      }
    })();
  }
  connect.addEventListener("click", () => begin(false));
  copyLink.addEventListener("click", () => begin(true));
  disconnect.addEventListener("click", () => {
    busy = true;
    render();
    void request<ConnectionStatus>({ op: "servicesDisconnect" }).then(
      (value) => {
        current = value;
        busy = false;
        render();
      },
      (error) => {
        current = { base: current.base };
        busy = false;
        render(messageOf(error));
      },
    );
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[SERVICES_STATE_KEY] && !busy) {
      hideLink();
      void refresh().catch((error) => render(messageOf(error)));
    }
  });
  render();
  void refresh().catch((error) => render(messageOf(error)));
  return section;
}
