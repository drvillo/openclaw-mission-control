const DISPLAY_LOCALE = "en-GB";
const DISPLAY_TIME_ZONE = "Europe/Rome";

function parseDisplayDate(value: string | null) {
  if (!value || value === "none") {
    return null;
  }

  const normalized = /^\d{4}-\d{2}-\d{2}$/u.test(value) ? `${value}T00:00:00` : value;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatDisplayDate(value: string | null, emptyLabel = "n/a") {
  if (!value || value === "none") {
    return emptyLabel;
  }

  const parsed = parseDisplayDate(value);
  if (!parsed) {
    return value;
  }

  return parsed.toLocaleDateString(DISPLAY_LOCALE, {
    dateStyle: "medium",
    timeZone: DISPLAY_TIME_ZONE,
  });
}

export function formatDisplayDayDate(value: string | null, emptyLabel = "n/a") {
  if (!value || value === "none") {
    return emptyLabel;
  }

  const parsed = parseDisplayDate(value);
  if (!parsed) {
    return value;
  }

  return parsed.toLocaleDateString(DISPLAY_LOCALE, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: DISPLAY_TIME_ZONE,
  });
}

export function formatDisplayDateTime(value: string | number | null, emptyLabel = "none") {
  if (value == null) {
    return emptyLabel;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }

  return parsed.toLocaleString(DISPLAY_LOCALE, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: DISPLAY_TIME_ZONE,
  });
}
