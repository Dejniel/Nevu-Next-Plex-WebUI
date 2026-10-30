import {
  PlexResponseError,
  plexArray,
  plexBoolean,
  plexContainer,
  plexFields,
  plexInteger,
  plexObject,
  plexString,
} from "shared/api/plexResponse";
import { readMediaMetadata } from "entities/media/model";

const resource = "library catalog";
const text = (value: unknown) => plexString(value, resource);
const integer = (value: unknown) => plexInteger(value, resource);
const flag = (value: unknown) => plexBoolean(value, resource);
const object = (value: unknown) => plexObject(value, resource);
const array =
  <T>(read: (value: unknown) => T) =>
  (value: unknown) =>
    plexArray(value, resource).map((entry) => read(entry));
function identity(value: unknown) {
  const result = text(value);
  if (!result.trim()) throw new PlexResponseError(resource);
  return result;
}

function readNamedKey(value: unknown) {
  const row = object(value);
  return { key: identity(row.key), title: text(row.title) };
}

function readDirectory(value: unknown) {
  const row = object(value);
  return {
    ...readNamedKey(row),
    ...plexFields(row, {
      fastKey: text,
      secondary: flag,
      prompt: text,
      search: flag,
      type: text,
      librarySectionID: integer,
      librarySectionKey: text,
      librarySectionTitle: text,
      librarySectionType: integer,
      id: integer,
      filter: text,
      tag: text,
      tagType: integer,
      count: integer,
    }),
  };
}

function readField(value: unknown) {
  const row = object(value);
  return {
    ...readNamedKey(row),
    type: identity(row.type),
    ...plexFields(row, { subType: text }),
  };
}

function readFilter(value: unknown) {
  const row = object(value);
  return {
    ...readNamedKey(row),
    filter: identity(row.filter),
    filterType: identity(row.filterType),
    type: identity(row.type),
  };
}

function readSort(value: unknown) {
  const row = object(value);
  return {
    ...readNamedKey(row),
    descKey: identity(row.descKey),
    ...plexFields(row, {
      default: text,
      defaultDirection: text,
      firstCharacterKey: text,
    }),
  };
}

function readType(value: unknown) {
  const row = object(value);
  return {
    ...readNamedKey(row),
    type: identity(row.type),
    ...plexFields(row, {
      active: flag,
      Filter: array(readFilter),
      Sort: array(readSort),
      Field: array(readField),
    }),
  };
}

function readFieldType(value: unknown) {
  const row = object(value);
  return {
    type: identity(row.type),
    Operator: array(readNamedKey)(row.Operator),
  };
}

/** Navigation, filter descriptions and media share an envelope, not a row type. */
export function readLibraryCatalog(
  value: unknown,
  window?: { offset: number; size: number },
) {
  const row = plexContainer(value, resource);
  const Metadata = array(readMediaMetadata)(row.Metadata);
  const fields = plexFields(row, {
    Directory: array(readDirectory),
    Type: array(readType),
    FieldType: array(readFieldType),
    totalSize: integer,
    offset: integer,
    librarySectionID: integer,
    title1: text,
    title2: text,
    librarySectionTitle: text,
    viewGroup: text,
    art: text,
    thumb: text,
  });
  const count =
    Metadata.length +
    (fields.Directory?.length ?? 0) +
    (fields.Type?.length ?? 0) +
    (fields.FieldType?.length ?? 0);
  const size = row.size === undefined ? count : integer(row.size);
  if (
    size !== count ||
    (size > 0 &&
      fields.totalSize !== undefined &&
      (fields.offset ?? window?.offset ?? 0) + size > fields.totalSize) ||
    (size === 0 &&
      (window?.size ?? 1) > 0 &&
      fields.totalSize !== undefined &&
      (fields.offset ?? window?.offset ?? 0) < fields.totalSize) ||
    (window &&
      (size > window.size ||
        (fields.offset !== undefined && fields.offset !== window.offset)))
  )
    throw new PlexResponseError(resource);
  return { ...fields, size, Metadata };
}

/** Unknown library types remain descriptors; feature capabilities decide visibility. */
export function readLibrarySections(value: unknown) {
  const row = plexContainer(value, "library sections");
  const sections = plexArray(row.Directory, "library sections");
  if (row.size !== undefined && integer(row.size) !== sections.length)
    throw new PlexResponseError("library sections");
  return sections.map((value) => {
    const section = object(value);
    return {
      ...readNamedKey(section),
      type: identity(section.type),
      uuid: identity(section.uuid),
    };
  });
}

export type LibraryCatalog = ReturnType<typeof readLibraryCatalog>;
export type LibrarySection = ReturnType<typeof readLibrarySections>[number];
export type LibraryDirectory = ReturnType<typeof readDirectory>;
export type LibraryType = ReturnType<typeof readType>;
export type LibraryField = ReturnType<typeof readField>;
export type LibraryFilter = ReturnType<typeof readFilter>;
export type LibrarySortDefinition = ReturnType<typeof readSort>;
export type LibraryFieldType = ReturnType<typeof readFieldType>;
export type LibraryOperator = ReturnType<typeof readNamedKey>;
