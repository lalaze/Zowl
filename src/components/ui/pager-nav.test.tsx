// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";

import { translator } from "@/lib/i18n/locale";

import { PagerNav } from "./pager-nav";

afterEach(cleanup);

describe("PagerNav", () => {
  const t = translator("en");

  it("renders nothing when there is only one page", () => {
    const { container } = render(
      <PagerNav
        ariaLabel="Pagination"
        page={1}
        totalPages={1}
        previousHref="?page=1"
        nextHref="?page=1"
        t={t}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("omits chevrons on disabled buttons by default and renders them when enabled", () => {
    const { rerender } = render(
      <PagerNav
        ariaLabel="Account pagination"
        page={1}
        totalPages={3}
        previousHref="?page=1"
        nextHref="?page=2"
        t={t}
      />,
    );

    const prevDisabled = screen.getByRole("button", { name: "Previous" });
    expect(prevDisabled).toBeDisabled();
    expect(prevDisabled.querySelector("svg")).toBeNull();
    expect(screen.getByRole("link", { name: "Next" })).toHaveAttribute(
      "href",
      "?page=2",
    );

    rerender(
      <PagerNav
        ariaLabel="Transaction pagination"
        page={1}
        totalPages={3}
        previousHref="/transactions"
        nextHref="/transactions?page=2"
        t={t}
        showDisabledChevrons
      />,
    );

    const prevWithChevron = screen.getByRole("button", { name: "Previous" });
    expect(prevWithChevron).toBeDisabled();
    expect(prevWithChevron.querySelector("svg")).not.toBeNull();
  });
});
