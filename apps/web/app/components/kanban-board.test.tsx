import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { KanbanBoard } from "./kanban-board";

function dataTransfer() {
  const values = new Map<string, string>();
  return {
    setData: vi.fn((key: string, value: string) => values.set(key, value)),
    getData: vi.fn((key: string) => values.get(key) ?? ""),
  };
}

describe("KanbanBoard", () => {
  test("calls onMove with the dragged item id and target status", () => {
    const onMove = vi.fn();
    const transfer = dataTransfer();
    render(
      <KanbanBoard
        columns={[
          { id: "todo", label: "To do" },
          { id: "done", label: "Done" },
        ]}
        items={[
          { id: "item-1", status: "todo", label: "First item" },
        ]}
        getItemId={(item) => item.id}
        getItemStatus={(item) => item.status}
        renderCard={(item) => <article>{item.label}</article>}
        onMove={onMove}
      />,
    );

    fireEvent.dragStart(screen.getByText("First item").parentElement as HTMLElement, { dataTransfer: transfer });
    fireEvent.drop(screen.getByRole("heading", { name: "Done" }).closest("section") as HTMLElement, { dataTransfer: transfer });

    expect(onMove).toHaveBeenCalledWith("item-1", "done");
  });
});
