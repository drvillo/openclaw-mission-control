"use client";

import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";

export type ActionAssigneeIdentity = {
  id: string;
  displayName: string;
  email?: string | null;
  aliases?: string[];
};

type ActionReassignControlProps = {
  assertionId: string | null;
  currentAssignee: string | null;
  meetingParticipants: string[];
  identities: ActionAssigneeIdentity[];
  pending: boolean;
  onReassign: (assertionId: string, assignee: string) => boolean | Promise<boolean>;
  onOpenChange?: (open: boolean) => void;
};

type OrderedIdentity = ActionAssigneeIdentity & {
  participantIndex: number;
};

const MAX_VISIBLE_OPTIONS = 8;

function identityKey(value: string | null | undefined) {
  return String(value || "").trim().replace(/\s+/gu, " ").toLowerCase();
}

function identityMatchesRaw(identity: ActionAssigneeIdentity, raw: string | null | undefined) {
  const key = identityKey(raw);
  if (!key) {
    return false;
  }
  return [identity.displayName, identity.email ?? "", ...(identity.aliases || [])].some((value) => identityKey(value) === key);
}

function identityLabel(identity: ActionAssigneeIdentity) {
  return identity.email ? `${identity.displayName} <${identity.email}>` : identity.displayName;
}

function identitySearchText(identity: ActionAssigneeIdentity) {
  return [identity.displayName, identity.email ?? "", ...(identity.aliases || [])].join(" ").toLowerCase();
}

function orderIdentities(identities: ActionAssigneeIdentity[], meetingParticipants: string[], currentAssignee: string | null) {
  const unique = new Map<string, ActionAssigneeIdentity>();
  for (const identity of identities) {
    if (!identity.id || !identity.displayName || identityMatchesRaw(identity, currentAssignee)) {
      continue;
    }
    unique.set(identity.id, identity);
  }

  const ordered: OrderedIdentity[] = [...unique.values()].map((identity) => {
    const participantIndex = meetingParticipants.findIndex((participant) => identityMatchesRaw(identity, participant));
    return { ...identity, participantIndex };
  });

  return ordered.sort((left, right) => {
    const leftInMeeting = left.participantIndex >= 0;
    const rightInMeeting = right.participantIndex >= 0;
    if (leftInMeeting || rightInMeeting) {
      if (leftInMeeting && rightInMeeting) {
        return left.participantIndex - right.participantIndex || left.displayName.localeCompare(right.displayName);
      }
      return leftInMeeting ? -1 : 1;
    }
    return left.displayName.localeCompare(right.displayName);
  });
}

export function ActionReassignControl({ assertionId, currentAssignee, meetingParticipants, identities, pending, onReassign, onOpenChange }: ActionReassignControlProps) {
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedIdentityId, setSelectedIdentityId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const orderedIdentities = useMemo(
    () => orderIdentities(identities, meetingParticipants, currentAssignee),
    [currentAssignee, identities, meetingParticipants],
  );
  const filteredIdentities = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return orderedIdentities;
    }
    return orderedIdentities.filter((identity) => identitySearchText(identity).includes(normalizedQuery));
  }, [orderedIdentities, query]);
  const visibleIdentities = filteredIdentities.slice(0, MAX_VISIBLE_OPTIONS);
  const pickedIdentity = selectedIdentityId ? orderedIdentities.find((identity) => identity.id === selectedIdentityId) ?? null : null;
  const activeIdentity = visibleIdentities[activeIndex] ?? visibleIdentities[0] ?? null;
  const selectedIdentity = pickedIdentity ?? activeIdentity;
  const disabled = pending || submitting || !assertionId || orderedIdentities.length === 0;

  function setPickerOpen(nextOpen: boolean) {
    setOpen(nextOpen);
    onOpenChange?.(nextOpen);
  }

  function closePicker() {
    setPickerOpen(false);
    setQuery("");
    setActiveIndex(0);
    setSelectedIdentityId(null);
  }

  function updateMenuPosition() {
    const rect = inputRef.current?.getBoundingClientRect();
    if (!rect) {
      setMenuPosition(null);
      return;
    }
    const width = Math.min(Math.max(rect.width, 288), Math.max(window.innerWidth - 24, rect.width));
    const left = Math.min(Math.max(rect.left, 12), Math.max(window.innerWidth - width - 12, 12));
    setMenuPosition({ top: rect.bottom + 4, left, width });
  }

  useEffect(() => {
    if (!open) {
      return;
    }

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        closePicker();
      }
    }

    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        closePicker();
      }
    }

    updateMenuPosition();
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, open]);

  function openPicker() {
    setPickerOpen(true);
    setQuery("");
    setSelectedIdentityId(null);
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      updateMenuPosition();
    });
  }

  async function submitIdentity(identity: ActionAssigneeIdentity | null) {
    if (!assertionId || !identity || submitting) {
      return;
    }
    setSubmitting(true);
    try {
      const ok = await onReassign(assertionId, identity.displayName);
      if (ok) {
        closePicker();
      }
    } finally {
      setSubmitting(false);
    }
  }

  function pickIdentity(identity: OrderedIdentity, index: number) {
    setSelectedIdentityId(identity.id);
    setActiveIndex(index);
    setQuery(identity.displayName);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitIdentity(selectedIdentity);
  }

  function closeOnEscape(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Escape") {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    closePicker();
  }

  function onInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      closeOnEscape(event);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIdentityId(null);
      setActiveIndex((current) => Math.min(current + 1, Math.max(visibleIdentities.length - 1, 0)));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIdentityId(null);
      setActiveIndex((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      void submitIdentity(selectedIdentity);
    }
  }

  if (!open) {
    return (
      <button type="button" className="meeting-review-action-button" disabled={disabled} onClick={openPicker}>
        Reassign
      </button>
    );
  }

  const menuStyle =
    menuPosition
      ? { top: menuPosition.top, left: menuPosition.left, width: menuPosition.width }
      : { top: 0, left: 0, width: 288, visibility: "hidden" as const };
  const menu = open
    ? createPortal(
        <div
          ref={menuRef}
          id={listboxId}
          className="action-reassign-menu"
          role="listbox"
          aria-label="Matching identities"
          style={menuStyle}
          onKeyDown={closeOnEscape}
        >
          {visibleIdentities.map((identity, index) => (
            <button
              key={identity.id}
              id={`${listboxId}-option-${index}`}
              type="button"
              role="option"
              aria-selected={identity.id === selectedIdentity?.id}
              className={`action-reassign-option ${identity.id === selectedIdentity?.id ? "action-reassign-option-active" : ""}`}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => pickIdentity(identity, index)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void submitIdentity(identity);
                }
              }}
              disabled={pending || submitting}
            >
              <span>
                <strong>{identity.displayName}</strong>
                {identity.email ? <small>{identity.email}</small> : null}
              </span>
              {identity.participantIndex >= 0 ? <span className="action-reassign-option-tag">Meeting</span> : null}
            </button>
          ))}
          {visibleIdentities.length === 0 ? <div className="action-reassign-empty">No matching identities</div> : null}
        </div>,
        document.body,
      )
    : null;

  return (
    <div ref={rootRef} className="action-reassign-root" onKeyDown={closeOnEscape}>
      <form className="action-reassign-control" onSubmit={submit}>
        <div className="action-reassign-combobox">
          <input
            ref={inputRef}
            className="action-reassign-input"
            type="text"
            value={query}
            onChange={(event) => {
              setSelectedIdentityId(null);
              setQuery(event.target.value);
            }}
            onKeyDown={onInputKeyDown}
            placeholder="Type a person"
            disabled={pending || submitting}
            role="combobox"
            aria-autocomplete="list"
            aria-controls={listboxId}
            aria-expanded="true"
            aria-activedescendant={selectedIdentity ? `${listboxId}-option-${activeIndex}` : undefined}
            aria-label="Reassign action to"
          />
        </div>
        <button type="submit" className="action-reassign-icon-button action-reassign-icon-accept" disabled={disabled || !selectedIdentity} aria-label="Confirm reassignment" title="Confirm reassignment">
          ✓
        </button>
      </form>
      <button type="button" className="action-reassign-icon-button action-reassign-icon-cancel" disabled={pending || submitting} onClick={closePicker} aria-label="Cancel reassignment" title="Cancel reassignment">
        ×
      </button>
      {menu}
    </div>
  );
}
