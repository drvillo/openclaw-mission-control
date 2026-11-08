"use client";

import { useCallback, useEffect, useState } from "react";

export function useUrlSearchQuery() {
  const [query, setQueryState] = useState("");

  useEffect(() => {
    setQueryState(new URL(window.location.href).searchParams.get("q") ?? "");
  }, []);

  const setQuery = useCallback((nextQuery: string) => {
    setQueryState(nextQuery);

    if (typeof window === "undefined") {
      return;
    }

    const url = new URL(window.location.href);
    const normalized = nextQuery.trim();
    if (normalized) {
      url.searchParams.set("q", normalized);
    } else {
      url.searchParams.delete("q");
    }
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  return [query, setQuery] as const;
}
