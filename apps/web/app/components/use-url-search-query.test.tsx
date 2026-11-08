import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { SearchControl } from "./search-control";
import { useUrlSearchQuery } from "./use-url-search-query";

function SearchProbe() {
  const [query, setQuery] = useUrlSearchQuery();
  return <SearchControl value={query} onChange={setQuery} placeholder="Search records" />;
}

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

describe("useUrlSearchQuery", () => {
  test("hydrates from an empty query before applying the URL query after mount", async () => {
    window.history.replaceState(null, "", "/accountability/people?q=tom");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const container = document.createElement("div");
    container.innerHTML = renderToString(<SearchProbe />);

    expect(container.querySelector("input")?.getAttribute("value")).toBe("");
    expect(container.querySelector("[aria-label='Clear search']")).toBeNull();

    const root = hydrateRoot(container, <SearchProbe />);

    await waitFor(() => {
      expect(container.querySelector("input")).toHaveValue("tom");
    });
    expect(container.querySelector("[aria-label='Clear search']")).not.toBeNull();
    expect(errorSpy.mock.calls.some((call) => call.some((value) => String(value).includes("Hydration")))).toBe(false);

    await act(async () => {
      root.unmount();
    });
  });
});
