import {
  createMetadataDraft,
  metadataDraftChanges,
  metadataDraftReducer,
} from "./metadataEditorDraft";

const source = {
  ratingKey: "42",
  type: "album",
  title: "Source",
  parentRatingKey: "7",
  parentTitle: "Original artist",
};
const target = {
  ...source,
  ratingKey: "84",
  title: "Destination",
  parentRatingKey: "9",
  parentTitle: "New artist",
};

it("can move a surviving album back to its original artist after a partial merge", () => {
  let state = createMetadataDraft(source);
  state = metadataDraftReducer(state, {
    type: "parent",
    field: "artist",
    value: { id: "9", title: "New artist" },
  });
  state = metadataDraftReducer(state, {
    type: "acknowledged",
    completed: { artwork: [], preferences: false, replacement: target },
  });
  expect(metadataDraftChanges(state).parents).toEqual({});
  state = metadataDraftReducer(state, {
    type: "parent",
    field: "artist",
    value: { id: "7", title: "Original artist" },
  });
  expect(metadataDraftChanges(state).parents).toEqual({
    artist: { id: "7", title: "Original artist" },
  });
});

it("keeps the final unlock after an accepted merge and upload, including subsequent failed retries", () => {
  let state = createMetadataDraft(source);
  state = metadataDraftReducer(state, {
    type: "artwork",
    field: "thumb",
    value: { type: "url", url: "https://images.example/cover.png" },
  });
  state = metadataDraftReducer(state, {
    type: "lock",
    field: "thumb",
    value: false,
  });
  state = metadataDraftReducer(state, {
    type: "acknowledged",
    completed: { artwork: ["thumb"], preferences: false, replacement: target },
  });
  state = metadataDraftReducer(state, {
    type: "acknowledged",
    completed: { artwork: [], preferences: false },
  });
  expect(metadataDraftChanges(state)).toMatchObject({
    artwork: {},
    locks: { thumb: false },
  });
  state = metadataDraftReducer(state, {
    type: "field",
    field: "title",
    value: source.title,
  });
  expect(metadataDraftChanges(state).changes).toEqual({ title: source.title });
});
