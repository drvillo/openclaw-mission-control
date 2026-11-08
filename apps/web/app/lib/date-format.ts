const DISPLAY_LOCALE = "en-GB";
const DISPLAY_TIME_ZONE = "Europe/Rome";
const CIVIL_DATE_TIME_ZONE = "UTC";

function parseCivilDate(value: string | null) {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})/u);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }
  const parsed = new Date(Date.UTC(year, month - 1, day, 12));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day ? parsed : null;
}

function parseDisplayDateTime(value: string | number | null) {
  if (!value || value === "none") {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatDisplayDate(value: string | null, emptyLabel = "n/a") {
  if (!value || value === "none") {
    return emptyLabel;
  }

  const parsed = parseCivilDate(value);
  if (!parsed) {
    return value;
  }

  return parsed.toLocaleDateString(DISPLAY_LOCALE, {
    dateStyle: "medium",
    timeZone: CIVIL_DATE_TIME_ZONE,
  });
}

export function formatDisplayDayDate(value: string | null, emptyLabel = "n/a") {
  if (!value || value === "none") {
    return emptyLabel;
  }

  const parsed = parseCivilDate(value);
  if (!parsed) {
    return value;
  }

  return parsed.toLocaleDateString(DISPLAY_LOCALE, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: CIVIL_DATE_TIME_ZONE,
  });
}

export function formatDisplayDateTime(value: string | number | null, emptyLabel = "none") {
  if (value == null) {
    return emptyLabel;
  }

  const parsed = parseDisplayDateTime(value);
  if (!parsed) {
    return String(value);
  }

  return parsed.toLocaleString(DISPLAY_LOCALE, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: DISPLAY_TIME_ZONE,
  });
}
