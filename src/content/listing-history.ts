import type { Account, KosmoraClient } from "../shared/types";
import { FINISH_LABEL, messageOf } from "../shared/types";
import {
  listingComplete,
  nextListingLimits,
  type ListingBatch,
  type TrackedListing,
  type TrackedListingHistory,
} from "../kosmora/my-listings";
import type { HistoryMode } from "../shared/listing-cache";
import { formatKosmo } from "../kosmora/contracts";
import { button, el, note } from "./ui";

type LoadMode = HistoryMode | "saved";

export class ListingHistory {
  private account?: string;
  private saved?: TrackedListingHistory;
  private scan?: ListingBatch;
  private error?: string;
  private failedMode: LoadMode = "saved";
  private request?: AbortController;
  private active = false;
  private closed = false;
  private dirty = false;
  constructor(
    private area: HTMLElement,
    private subject: string,
    private client: KosmoraClient,
    private busy: (busy: boolean) => void,
  ) {}
  setAccount(account: Account) {
    if (this.account === account.key) return;
    this.cancel();
    this.account = account.key;
    this.saved = this.scan = undefined;
    this.error = undefined;
    if (this.active) void this.load();
  }
  setActive(active: boolean) {
    if (this.active === active) return;
    this.active = active;
    if (!active) this.cancel();
    else void this.load();
  }
  refresh() {
    void this.load("refresh");
  }
  invalidate() {
    if (!this.active) return;
    if (this.request) this.dirty = true;
    else void this.load();
  }
  private cancel() {
    this.request?.abort();
    this.request = undefined;
    this.dirty = false;
    this.busy(false);
  }
  dispose() {
    this.closed = true;
    this.cancel();
  }
  private async load(mode: LoadMode = "saved") {
    if (!this.account || this.request || this.closed || !this.active) return;
    const request = new AbortController();
    this.request = request;
    this.busy(true);
    this.error = undefined;
    this.failedMode = mode;
    const valid = () =>
      !this.closed &&
      this.active &&
      !request.signal.aborted &&
      this.request === request;
    this.render();
    try {
      if (mode !== "saved") {
        const limits =
          mode === "more" && this.scan
            ? nextListingLimits(this.scan)
            : undefined;
        const scan = await this.client.listingHistory(
          this.subject,
          mode,
          request.signal,
          limits,
        );
        if (!valid()) return;
        if (scan) this.scan = scan;
      }
      this.dirty = false;
      const saved = await this.client.cachedListings(
        this.subject,
        request.signal,
      );
      if (valid()) this.saved = saved;
    } catch (error) {
      if (valid()) this.error = messageOf(error);
    } finally {
      if (valid()) {
        this.request = undefined;
        this.busy(false);
        this.render();
        if (this.dirty) {
          this.dirty = false;
          if (!this.error) void this.load();
        }
      }
    }
  }
  private render() {
    this.area.replaceChildren(el("h3", "", "My listing history"));
    const listings = new Map<string, TrackedListing>(
      this.saved?.listings.map((row) => [row.id, row]),
    );
    for (const row of this.scan?.listings ?? [])
      if (!listings.has(row.id)) listings.set(row.id, row);
    if (listings.size) {
      this.area.append(note("Your original starting prices."));
      const list = el("ul", "my-listings");
      list.setAttribute("aria-label", "My previous listings");
      for (const listing of listings.values()) {
        const row = el("li", "my-listing"),
          info = el("div");
        const date = listing.submittedAt ?? listing.endsAt;
        if (date !== undefined) {
          const iso = new Date(date);
          const time = el("time", "", iso.toLocaleString());
          time.dateTime = iso.toISOString();
          time.title = listing.submittedAt ? "Submitted" : "Auction end";
          info.append(el("span", "", time.title + " "), time);
        }
        const details = [
          listing.finish && FINISH_LABEL[listing.finish],
          listing.state,
        ]
          .filter(Boolean)
          .join(" · ");
        if (details) info.append(el("span", "finish", details));
        const price = el("b", "", `$${formatKosmo(listing.startPrice)}`);
        price.title = `Your starting price: ${formatKosmo(listing.startPrice)} Kosmo`;
        row.append(info, price);
        list.append(row);
      }
      this.area.append(list);
    } else if (this.saved)
      this.area.append(
        note(
          this.saved.hasMore
            ? "No saved listings for this card."
            : "You haven't listed this card yet.",
        ),
      );
    if (this.request && this.failedMode !== "saved")
      this.area.append(note("Updating your listing history…"));
    if (this.error)
      this.area.append(
        note(this.error, true),
        button("Retry listing history", () => void this.load(this.failedMode)),
      );
    if (this.saved?.hasMore && !(this.scan && listingComplete(this.scan))) {
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
