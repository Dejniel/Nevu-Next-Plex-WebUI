function preferenceValue(type, value) {
  if (type === "bool") {
    if ([true, 1, "true", "1"].includes(value)) return "1";
    if ([false, 0, "false", "0"].includes(value)) return "0";
  }
  if (
    ["int", "double"].includes(type) &&
    String(value ?? "").trim() &&
    Number.isFinite(Number(value))
  )
    return String(Number(value));
  return String(value ?? "");
}

function normalizePlexPreferences(settings) {
  if (!Array.isArray(settings)) throw new Error("Plex did not return a preference list.");
  return settings
    .filter(
      (setting) =>
        setting &&
        typeof setting.id === "string" &&
        setting.id &&
        ![true, 1, "true", "1"].includes(setting.hidden),
    )
    .map((setting) => {
      const type = typeof setting.type === "string" ? setting.type : "text";
      const choices = new Map();
      if (typeof setting.enumValues === "string") {
        setting.enumValues
          .split("|")
          .filter(Boolean)
          .forEach((entry) => {
            const separator = entry.indexOf(":");
            const value = preferenceValue(type, separator < 0 ? entry : entry.slice(0, separator));
            choices.set(value, {
              value,
              label: separator < 0 ? entry : entry.slice(separator + 1),
            });
          });
      }
      return {
        id: setting.id,
        label: setting.label || setting.id,
        summary: setting.summary || "",
        type,
        value: preferenceValue(type, setting.value),
        default: preferenceValue(type, setting.default),
        choices: [...choices.values()],
        group: typeof setting.group === "string" ? setting.group : "",
        advanced: [true, 1, "true", "1"].includes(setting.advanced),
      };
    });
}

function preferenceValueError(preference, raw) {
  if (!["string", "boolean", "number"].includes(typeof raw)) return "Enter a valid value.";
  const value = preferenceValue(preference.type, raw);
  if (preference.type === "bool" && !["0", "1"].includes(value)) return "Choose on or off.";
  if (
    preference.type === "int" &&
    (!/^-?\d+$/.test(String(raw)) || !Number.isSafeInteger(Number(raw)))
  )
    return "Enter a whole number.";
  if (
    preference.type === "double" &&
    (!String(raw).trim() ||
      !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(String(raw)) ||
      !Number.isFinite(Number(raw)))
  )
    return "Enter a finite number.";
  if (preference.type === "text" && typeof raw !== "string") return "Enter text.";
  if (!["text", "bool", "int", "double"].includes(preference.type))
    return "This preference type cannot be edited.";
  if (preference.choices.length && !preference.choices.some((choice) => choice.value === value))
    return "Choose one of the available values.";
  return undefined;
}

function preferenceChanges(preferences, draft) {
  return Object.fromEntries(
    preferences.flatMap((preference) => {
      if (!Object.hasOwn(draft, preference.id)) return [];
      const value = preferenceValue(preference.type, draft[preference.id]);
      return value === preference.value ? [] : [[preference.id, value]];
    }),
  );
}

function validatePreferenceChanges(preferences, input) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Invalid preference changes.");
  const available = new Map(preferences.map((preference) => [preference.id, preference]));
  for (const [id, value] of Object.entries(input)) {
    const preference = available.get(id);
    if (!preference) throw new Error(`Unknown or hidden preference: ${id}`);
    const error = preferenceValueError(preference, value);
    if (error) throw new Error(`${preference.label}: ${error}`);
  }
  return preferenceChanges(preferences, input);
}

export {
  normalizePlexPreferences,
  preferenceValue,
  preferenceValueError,
  preferenceChanges,
  validatePreferenceChanges,
};
