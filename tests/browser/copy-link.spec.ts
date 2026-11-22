import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { launchTestBrowser } from "./browser";

for (const popupFailed of [false, true]) {
  test(`completes a copied link in another tab after ${popupFailed ? "a failed popup" : "Copy Link"}`, async () => {
    let starts = 0,
      exchanges = 0,
      state = "",
      challenge = "",
      callback = "";
    const authorize =
      "https://kosmora.io/oauth/authorize?state=provider-fixture";
    const server = createServer(async (req, res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization",
      );
      if (req.method === "OPTIONS") {
        res.writeHead(204).end();
        return;
      }
      if (req.url === "/authorized") {
        res
          .writeHead(302, {
            Location: callback + "?code=fixture-code&state=" + state,
          })
          .end();
        return;
      }
      let body = "";
      for await (const part of req) body += part;
      const data = body ? JSON.parse(body) : {};
      res.setHeader("Content-Type", "application/json");
      if (
        req.url === "/v1/connect/start" &&
        data.inviteCode === "fixture-invite"
      ) {
        starts++;
        state = data.state;
        challenge = data.handoffChallenge;
        callback = data.redirectUri;
        res.end(JSON.stringify({ authorizationUrl: authorize }));
      } else if (
        req.url === "/v1/connect/exchange" &&
        data.code === "fixture-code" &&
        createHash("sha256")
          .update(data.handoffVerifier)
          .digest("base64url") === challenge
      ) {
        exchanges++;
        res.end(
          JSON.stringify({
            accessToken: "fixture",
            expiresAtUtc: "2099-01-01T00:00:00Z",
          }),
        );
      } else if (
        req.url === "/v1/me" &&
        req.headers.authorization === "Bearer fixture"
      ) {
        res.end(
          JSON.stringify({
            id: "000000000000000000000001",
            handle: "MobileTester",
          }),
        );
      } else {
        res.writeHead(400).end("{}");
      }
    });
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Missing fixture port");
    const service = "http://127.0.0.1:" + address.port;
    const profile = await mkdtemp(join(tmpdir(), "kosmore-copy-link-"));
    const bundle = resolve(process.env.KOSMORE_TEST_BUNDLE ?? "dist");
    try {
      const context = await launchTestBrowser(profile, {
        channel: "chromium",
        headless: true,
        viewport: { width: 390, height: 844 },
        args: [
          `--disable-extensions-except=${bundle}`,
          `--load-extension=${bundle}`,
        ],
      });
      try {
        const worker =
          context.serviceWorkers()[0] ??
          (await context.waitForEvent("serviceworker"));
        await worker.evaluate(() => {
          chrome.permissions.contains = async () => true;
          chrome.identity.launchWebAuthFlow = async () => {
            throw new Error(
              "Couldn't create a browser window to display an authorization page",
            );
          };
        });
        const settings = new URL("options.html#connected-account", worker.url())
          .href;
        const options = await context.newPage();
        await options.goto(settings);
        await options.evaluate(
          ({ popupFailed }) => {
            chrome.permissions.request = async () => true;
            Object.defineProperty(navigator, "clipboard", {
              value: {
                async writeText(text: string) {
                  if (popupFailed) throw new Error("Clipboard unavailable");
                  document.documentElement.dataset.copied = text;
                },
              },
            });
          },
          { popupFailed },
        );
        await options.getByLabel("KosMore Services API base URL").fill(service);
        await options.getByLabel("Tester invite code").fill("fixture-invite");
        if (popupFailed) {
          await options
            .getByRole("button", { name: "Connect", exact: true })
            .click();
          await expect(options.getByText(/Choose Copy Link/)).toBeVisible();
        }
        const copy = options.getByRole("button", { name: "Copy Link" });
        await copy.click();
        await expect(options.getByLabel("Sign-in link")).toHaveValue(authorize);
        await expect(
          options.getByText(
            popupFailed ? /Copy the sign-in link below/ : /Link copied/,
          ),
        ).toBeVisible();
        const pasted = popupFailed
          ? await options.getByLabel("Sign-in link").inputValue()
          : await options.locator("html").getAttribute("data-copied");
        expect(pasted).toBe(authorize);
        await copy.click();
        await expect(copy).toBeEnabled();
        expect(starts).toBe(1);
        const tab = await context.newPage();
        const completion = new URL("link-complete.html", worker.url()).href;
        await tab.goto(completion + "#code=fixture-code&state=wrong");
        await expect(tab.getByRole("status")).toContainText("does not match");
        expect(exchanges).toBe(0);
        if (popupFailed) {
          const devtools = await context.newCDPSession(options);
          const { targetInfos } = await devtools.send("Target.getTargets");
          const target = targetInfos.find(t => t.type === "service_worker" && t.url === worker.url());
          if (!target) throw new Error("Could not locate the extension worker");
          await devtools.send("Target.closeTarget", { targetId: target.targetId });
          await options.close();
        }
        await tab.route(authorize, (route) =>
          route.fulfill({
            contentType: "text/html",
            body: '<a href="' + service + '/authorized">Approve</a>',
          }),
        );
        await tab.goto(pasted!);
        await tab.getByText("Approve").click();
        await expect(tab.getByRole("status")).toContainText(
          "Linked to MobileTester",
        );
        await expect(tab).toHaveURL(completion);
        const linked = popupFailed ? await context.newPage() : options;
        if (popupFailed) await linked.goto(settings);
        await expect(
          linked.getByText("Linked to MobileTester.", { exact: true }),
        ).toBeVisible();
        await tab.goto(completion + "#code=fixture-code&state=" + state);
        await tab.reload();
        await expect(tab.getByRole("status")).toContainText(
          "already been used",
        );
        expect(exchanges).toBe(1);
      } finally {
        await context.close();
      }
    } finally {
      server.closeAllConnections();
      await new Promise<void>((done) => server.close(() => done()));
      await rm(profile, { recursive: true, force: true });
    }
  });
}
