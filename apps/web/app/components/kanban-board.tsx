"use client";

import type { ReactNode } from "react";
import { useState } from "react";

export type KanbanColumn<Status extends string> = {
  id: Status;
  label: string;
};

type KanbanBoardProps<Item, Status extends string> = {
  columns: readonly KanbanColumn<Status>[];
  items: Item[];
  getItemId: (item: Item) => string;
  getItemStatus: (item: Item) => Status;
  renderCard: (item: Item, context: { status: Status; pending: boolean }) => ReactNode;
  onMove: (itemId: string, nextStatus: Status) => void;
  renderColumnActions?: (column: KanbanColumn<Status>, items: Item[]) => ReactNode;
  emptyText?: string | ((column: KanbanColumn<Status>) => ReactNode);
  sortItems?: (left: Item, right: Item) => number;
  canDragItem?: (item: Item) => boolean;
  isItemPending?: (item: Item) => boolean;
  countLabel?: (count: number, column: KanbanColumn<Status>) => string;
  boardClassName?: string;
  columnClassName?: (column: KanbanColumn<Status>) => string;
  activeColumnClassName?: string;
  bodyClassName?: string;
  cardWrapperClassName?: (item: Item) => string;
  dragDataType?: string;
};

export function KanbanBoard<Item, Status extends string>({
  columns,
  items,
  getItemId,
  getItemStatus,
  renderCard,
  onMove,
  renderColumnActions,
  emptyText,
  sortItems,
  canDragItem,
  isItemPending,
  countLabel,
  boardClassName = "tasks-board",
  columnClassName,
  activeColumnClassName = "task-column-active",
  bodyClassName = "task-column-body",
  cardWrapperClassName,
  dragDataType = "text/kanban-item-id",
}: KanbanBoardProps<Item, Status>) {
  const [activeDropStatus, setActiveDropStatus] = useState<Status | null>(null);
  const itemById = new Map(items.map((item) => [getItemId(item), item]));

  function columnItems(status: Status) {
    const matches = items.filter((item) => getItemStatus(item) === status);
    return sortItems ? [...matches].sort(sortItems) : matches;
  }

  function renderEmpty(column: KanbanColumn<Status>) {
    if (typeof emptyText === "function") {
      return emptyText(column);
    }
    return emptyText ?? `No items in ${column.label.toLowerCase()}.`;
  }

  return (
    <div className={boardClassName}>
      {columns.map((column) => {
        const visibleItems = columnItems(column.id);
        const activeClass = activeDropStatus === column.id ? activeColumnClassName : "";
        return (
          <section
            key={column.id}
            className={`task-column ${columnClassName?.(column) ?? ""} ${activeClass}`.trim()}
            onDragOver={(event) => {
              event.preventDefault();
              setActiveDropStatus(column.id);
            }}
            onDragLeave={() => setActiveDropStatus((current) => (current === column.id ? null : current))}
            onDrop={(event) => {
              event.preventDefault();
              const itemId = event.dataTransfer.getData(dragDataType) || event.dataTransfer.getData("text/plain");
              if (itemId && itemById.has(itemId)) {
                onMove(itemId, column.id);
              }
              setActiveDropStatus(null);
            }}
          >
            <header className="task-column-header">
              <div>
                <h3>{column.label}</h3>
                <p className="muted">
                  {countLabel ? countLabel(visibleItems.length, column) : `${visibleItems.length} item${visibleItems.length === 1 ? "" : "s"}`}
                </p>
              </div>
              {renderColumnActions ? <div className="task-column-actions">{renderColumnActions(column, visibleItems)}</div> : null}
            </header>

            <div className={bodyClassName}>
              {visibleItems.map((item) => {
                const itemId = getItemId(item);
                const draggable = canDragItem ? canDragItem(item) : true;
                return (
                  <div
                    key={itemId}
                    className={cardWrapperClassName?.(item)}
                    draggable={draggable}
                    onDragStart={(event) => {
                      event.dataTransfer.setData(dragDataType, itemId);
                      event.dataTransfer.setData("text/plain", itemId);
                    }}
                  >
                    {renderCard(item, { status: column.id, pending: Boolean(isItemPending?.(item)) })}
                  </div>
                );
              })}
              {visibleItems.length === 0 ? <div className="task-column-empty">{renderEmpty(column)}</div> : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}
