"use client";

import { startTransition, useState } from "react";

type ActionButtonProps = {
  endpoint: string;
  label: string;
  body?: Record<string, string>;
  confirmText?: string;
  disabled?: boolean;
};

export function ActionButton({ endpoint, label, body, confirmText, disabled = false }: ActionButtonProps) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="action-button">
      <button
        type="button"
        className="action-trigger"
        disabled={disabled || pending}
        onClick={() => {
          if (confirmText && !window.confirm(confirmText)) {
            return;
          }

          startTransition(async () => {
            setPending(true);
            setMessage(null);
            try {
              const response = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body ?? {}),
              });
              const payload = (await response.json()) as { ok?: boolean; summary?: string; error?: string };
              if (!response.ok || payload.ok === false) {
                throw new Error(payload.error ?? `HTTP ${response.status}`);
              }
              setMessage(payload.summary ?? "Completed");
              window.location.reload();
            } catch (error) {
              setMessage(error instanceof Error ? error.message : String(error));
            } finally {
              setPending(false);
            }
          });
        }}
      >
        {pending ? "Working..." : label}
      </button>
      {message ? <p className="action-message">{message}</p> : null}
    </div>
  );
}
