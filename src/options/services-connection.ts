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
  input.type = "url";
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
  const disconnect = el("button", "", "Disconnect");
  connect.type = disconnect.type = "button";
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
  controls.append(connect, retry, disconnect, erase);
  section.append(field, inviteField, controls, feedback, el("div", "rule"));

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

  input.addEventListener("input", () => render());
  input.addEventListener("change", () => {
    const base = parsed();
    if (!base && input.value.trim()) {
      render("Enter a valid HTTPS Services URL.");
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

  connect.addEventListener("click", () => {
    const base = parsed();
    if (!base || busy) return;
    const access = chrome.permissions.request({
      origins: [servicesPermission(base)],
    });
    busy = true;
    render();
    void (async () => {
      let error: string | undefined;
      try {
        if (!(await access))
          throw new Error("Allow access to this host to connect.");
        await saving.catch(() => {});
        current = await request<ConnectionStatus>({
          op: "servicesConnect",
          inviteCode: invite.value.trim(),
          base,
        });
        invite.value = "";
        input.value = current.base;
      } catch (failure) {
        error = messageOf(failure);
      } finally {
        busy = false;
        render(error);
      }
    })();
  });
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
    if (area === "local" && changes[SERVICES_STATE_KEY] && !busy)
      void refresh().catch((error) => render(messageOf(error)));
  });
  render();
  void refresh().catch((error) => render(messageOf(error)));
  return section;
}
