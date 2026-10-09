import {
  PlexResponseError,
  plexContainer,
  plexObject,
  plexArray,
  plexFields,
  plexString,
  plexInteger,
  plexBoolean,
} from "./plexResponse";

const resource = "playback decision";
const text = (value: unknown) => plexString(value, resource);
const integer = (value: unknown) => plexInteger(value, resource);
const flag = (value: unknown) => plexBoolean(value, resource);
const object = (value: unknown) => plexObject(value, resource);
const array =
  <T>(read: (value: unknown) => T) =>
  (value: unknown) =>
    plexArray(value, resource).map((entry) => read(entry));

/** Decision rows describe negotiated tracks, rather than original file metadata. */
export function readPlaybackDecision(value: unknown) {
  return {
    MediaContainer: plexFields(plexContainer(value, resource), {
      generalDecisionCode: integer,
      generalDecisionText: text,
      directPlayDecisionCode: integer,
      directPlayDecisionText: text,
      transcodeDecisionCode: integer,
      transcodeDecisionText: text,
      mdeDecisionCode: integer,
      mdeDecisionText: text,
      Metadata: array((value) =>
        plexFields(object(value), {
          Media: array((value) =>
            plexFields(object(value), {
              selected: flag,
              protocol: text,
              Part: array((value) =>
                plexFields(object(value), {
                  selected: flag,
                  decision: text,
                  Stream: array((value) => {
                    const row = object(value);
                    const streamType = row.streamType;
                    if (
                      streamType !== 1 &&
                      streamType !== 2 &&
                      streamType !== 3
                    )
                      throw new PlexResponseError(resource);
                    return {
                      streamType,
                      ...plexFields(row, {
                        decision: text,
                        selected: flag,
                        key: text,
                        codec: text,
                      }),
                    };
                  }),
                }),
              ),
            }),
          ),
        }),
      ),
    }),
  };
}

export type PlexPlaybackDecision = ReturnType<typeof readPlaybackDecision>;
