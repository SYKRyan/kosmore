import type { FriendDetails } from "../shared/trade-matches";
import { button, el } from "./ui";
import { enableMarketLink as enablePageLink } from "./market-links";

const familyKey = (name: string) =>
  name.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();

/** Matching friend details shared by the Trade tab and companion tooltip. */
export class FriendList {
  readonly element = el("div", "friends");
  private list = this.element;
  private data: FriendDetails[] = [];
  private expanded?: string;
  constructor() {
    this.element.setAttribute("role", "list");
    this.element.setAttribute("aria-label", "Matching friends");
  }
  clear() {
    this.data = [];
    this.expanded = undefined;
    this.list.replaceChildren();
  }
  setData(data: FriendDetails[]) {
    this.data = data;
    this.list.replaceChildren();
    if (!data.some((item) => item.friend.key === this.expanded))
      this.expanded = undefined;
    for (const detail of data) {
      const row = el("section", "friend-row");
      row.setAttribute("role", "listitem");
      row.dataset.friend = detail.friend.key;
      const summary = button(
        "",
        () =>
          this.expand(
            this.expanded === detail.friend.key ? undefined : detail.friend.key,
          ),
        "friend-summary",
      );
      const avatar = el(
        "span",
        "friend-avatar",
        detail.friend.handle.slice(0, 2).toUpperCase(),
      );
      avatar.setAttribute("aria-hidden", "true");
      const label = el("span", "friend-label"),
        chevron = el("span", "chevron", "▾");
      chevron.setAttribute("aria-hidden", "true");
      label.append(
        el("b", "friend-name", detail.friend.handle),
        el(
          "span",
          "match-count",
          `${detail.families.length} matching ${detail.families.length === 1 ? "family" : "families"}`,
        ),
      );
      summary.append(avatar, label, chevron);
      summary.setAttribute("aria-label", detail.friend.handle);
      summary.setAttribute(
        "aria-controls",
        `friend-details-${detail.friend.key}`,
      );
      const content = el("div", "friend-details");
      content.id = `friend-details-${detail.friend.key}`;
      content.setAttribute("role", "region");
      content.setAttribute("aria-label", `${detail.friend.handle} details`);
      row.append(summary, content);
      this.list.append(row);
    }
    this.expand(this.expanded);
  }
  private expand(key?: string) {
    if (this.data.length === 1) key = this.data[0].friend.key;
    this.expanded = key;
    for (const row of this.list.children) {
      const open = (row as HTMLElement).dataset.friend === key,
        summary = row.querySelector<HTMLButtonElement>(".friend-summary")!,
        content = row.querySelector<HTMLElement>(".friend-details")!;
      summary.setAttribute("aria-expanded", String(open));
      row.toggleAttribute("data-expanded", open);
      content.hidden = !open;
      content.replaceChildren();
      if (!open) continue;
      const detail = this.data.find((item) => item.friend.key === key)!;
      const families = el("div", "families");
      families.setAttribute("aria-label", "Saved families");
      const matched = new Set(detail.families.map((f) => familyKey(f.name)));
      for (const family of detail.reminder.families)
        families.append(
          el(
            "span",
            `family-badge${matched.has(familyKey(family)) ? " matched" : ""}`,
            family,
          ),
        );
      const familySection = el("section", "detail-section");
      familySection.append(
        el("h3", "detail-title", "Family preferences"),
        families,
      );
      const noteSection = el("section", "detail-section note-section");
      noteSection.append(
        el("h3", "detail-title", "Private notes"),
        el(
          "p",
          `notes${detail.reminder.notes ? "" : " empty"}`,
          detail.reminder.notes || "No notes saved yet.",
        ),
      );
      content.append(familySection, noteSection);
      const footer = el("footer", "friend-links"),
        social = el("a", "", "Social"),
        profile = el("a", "", "Profile");
      social.href = `/social?${new URLSearchParams({ f: detail.friend.handle })}`;
      profile.href = `/u/${encodeURIComponent(detail.friend.handle)}`;
      for (const link of [social, profile]) {
        link.setAttribute("aria-label", link.textContent!);
        const arrow = el("span", "link-arrow", "↗");
        arrow.setAttribute("aria-hidden", "true");
        link.append(arrow);
        enablePageLink(link);
      }
      footer.append(social, profile);
      content.append(footer);
    }
  }
}
