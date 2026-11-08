import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { SearchControl } from "./search-control";

describe("SearchControl", () => {
  test("renders a search input, summary, and emits changes", () => {
    const onChange = vi.fn();
    render(<SearchControl value="" onChange={onChange} placeholder="Search records" resultSummary="3 visible" />);

    expect(screen.getByRole("searchbox")).toHaveAttribute("placeholder", "Search records");
    expect(screen.getByText("3 visible")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "launch" } });
    expect(onChange).toHaveBeenCalledWith("launch");
  });

  test("clears the current query", () => {
    const onChange = vi.fn();
    render(<SearchControl value="launch" onChange={onChange} placeholder="Search records" />);

    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(onChange).toHaveBeenCalledWith("");
  });
});
