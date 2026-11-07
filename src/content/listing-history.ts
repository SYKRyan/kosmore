import type { Account, KosmoraClient } from "../shared/types";
import { FINISH_LABEL, messageOf } from "../shared/types";
import {
  LISTING_FRESH_MS,
  listingComplete,
  nextListingLimits,
  type ListingBatch,
} from "../kosmora/my-listings";
import type { HistoryMode } from "../shared/listing-cache";
import { formatKosmo } from "../kosmora/contracts";
import { button, el, note } from "./ui";

export class ListingHistory {
  private account?: string;
  private batch?: ListingBatch;
  private error?: string;
  private failedMode: HistoryMode = "initial";
  private request?: AbortController;
  private active = false;
  private closed = false;
  constructor(
    private area: HTMLElement,
    private subject: string,
    private client: KosmoraClient,
  ) {}
  setAccount(account: Account) {
    if (this.account === account.key) return;
    this.request?.abort();
    this.request = undefined;
    this.account = account.key;
    this.batch = undefined;
    this.error = undefined;
    if (this.active) void this.load();
  }
  setActive(active: boolean) {
    const changed = active !== this.active;
    this.active = active;
    if (!active) {
      this.request?.abort();
      this.request = undefined;
    } else if (changed) void this.load();
  }
  refresh() {
    this.request?.abort();
    this.request = undefined;
    if (this.active) void this.load("refresh");
  }
  invalidate() {
    if (this.batch) this.batch = { ...this.batch, fetchedAt: 0 };
    if (this.active) this.refresh();
  }
  dispose() {
    this.closed = true;
    this.request?.abort();
  }
  private async load(mode: HistoryMode = "initial") {
    if (!this.account || this.request || this.closed || !this.active) return;
    const request = new AbortController(),
      account = this.account;
    this.request = request;
    this.error = undefined;
    this.failedMode = mode;
    const valid = () =>
      !this.closed &&
      this.active &&
      !request.signal.aborted &&
      this.request === request &&
      account === this.account;
    this.render();
    try {
      if ((await this.client.account(request.signal)).key !== account)
        throw new Error("Your Kosmora account changed. Reopen the popup.");
      const cached = await this.client.cachedListings(
        this.subject,
        request.signal,
      );
      if (!valid()) return;
      if (
        cached.batch &&
        (!this.batch ||
          cached.batch.fetchedAt > this.batch.fetchedAt ||
          Object.values(cached.batch.limits).reduce((a, b) => a + b, 0) >
            Object.values(this.batch.limits).reduce((a, b) => a + b, 0))
      )
        this.batch = cached.batch;
      this.render();
      if (
        mode === "initial" &&
        this.batch &&
        Date.now() - this.batch.fetchedAt < LISTING_FRESH_MS
      )
        return;
      const batch = await this.client.listingHistory(
        this.subject,
        mode,
        request.signal,
        mode === "more" && this.batch
          ? nextListingLimits(this.batch)
          : undefined,
      );
      if (valid()) this.batch = batch;
    } catch (error) {
      if (valid()) this.error = messageOf(error);
    } finally {
      if (valid()) {
        this.request = undefined;
        this.render();
      }
    }
  }
  private render() {
    this.area.replaceChildren(el("h3", "", "My listing history"));
    const listings =
      this.batch?.listings.filter((item) => item.subjectId === this.subject) ??
      [];
    if (listings.length) {
      this.area.append(
        note(
          "Your starting prices, newest listings first. Dates show auction end times.",
        ),
      );
      const list = el("ul", "my-listings");
      list.setAttribute("aria-label", "My previous listings");
      for (const listing of listings) {
        const row = el("li", "my-listing"),
          info = el("div"),
          time = el("time", "", new Date(listing.endsAt).toLocaleString());
        time.dateTime = listing.endsAt;
        time.title = `Auction end: ${new Date(listing.endsAt).toString()}`;
        info.append(
          time,
          el(
            "span",
            "finish",
            `${FINISH_LABEL[listing.finish]} · ${listing.state}`,
          ),
        );
        const price = el("b", "", `$${formatKosmo(listing.startPrice)}`);
        price.title = `Your starting price: ${formatKosmo(listing.startPrice)} Kosmo`;
        row.append(info, price);
        list.append(row);
      }
      this.area.append(list);
    } else if (this.batch) {
      this.area.append(
        note(
          listingComplete(this.batch)
            ? "You haven't listed this card yet."
            : "No matching listings in this batch. Older listings may still be available.",
        ),
      );
    }
    if (this.request)
      this.area.append(
        note(
          this.batch
            ? "Updating your listing history…"
            : "Loading your listing history…",
        ),
      );
    if (this.error)
      this.area.append(
        note(this.error, true),
        button("Retry listing history", () => void this.load(this.failedMode)),
      );
    if (this.batch && !listingComplete(this.batch)) {
      const more = button(
        "Load more",
        () => void this.load("more"),
        "sales-toggle",
      );
      more.disabled = !!this.request;
      this.area.append(more);
    }
  }
}
