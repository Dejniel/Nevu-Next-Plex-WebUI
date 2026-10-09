import type { ManagedLibraryType } from "entities/library/model";

export const LIBRARY_TYPES: Array<{
  value: ManagedLibraryType;
  label: string;
}> = [
  { value: "movie", label: "Movies" },
  { value: "show", label: "TV shows" },
  { value: "artist", label: "Music" },
  { value: "photo", label: "Photos" },
  { value: "video", label: "Other videos" },
];
export const LIBRARY_LANGUAGES = [
  ["ar-SA", "Arabic"],
  ["bg-BG", "Bulgarian"],
  ["ca-ES", "Catalan"],
  ["zh-CN", "Chinese (Simplified)"],
  ["zh-TW", "Chinese (Traditional)"],
  ["cs-CZ", "Czech"],
  ["da-DK", "Danish"],
  ["nl-NL", "Dutch"],
  ["en-US", "English"],
  ["fi-FI", "Finnish"],
  ["fr-FR", "French"],
  ["de-DE", "German"],
  ["el-GR", "Greek"],
  ["he-IL", "Hebrew"],
  ["hu-HU", "Hungarian"],
  ["id-ID", "Indonesian"],
  ["it-IT", "Italian"],
  ["ja-JP", "Japanese"],
  ["ko-KR", "Korean"],
  ["no-NO", "Norwegian"],
  ["fa-IR", "Persian"],
  ["pl-PL", "Polish"],
  ["pt-BR", "Portuguese (Brazil)"],
  ["pt-PT", "Portuguese (Portugal)"],
  ["ro-RO", "Romanian"],
  ["ru-RU", "Russian"],
  ["sk-SK", "Slovak"],
  ["es-ES", "Spanish"],
  ["sv-SE", "Swedish"],
  ["th-TH", "Thai"],
  ["tr-TR", "Turkish"],
  ["uk-UA", "Ukrainian"],
  ["vi-VN", "Vietnamese"],
] as const;
