import { readPlaybackDecision } from "./plexPlaybackResponse";
import { PlexResponseError } from "./plexResponse";

it("reads negotiated streams without original media identities, and normalizes selection flags", () => {
  const result = readPlaybackDecision({
    MediaContainer: {
      generalDecisionCode: 1001,
      Metadata: [
        {
          Media: [
            {
              selected: 1,
              protocol: "dash",
              Part: [
                {
                  selected: 0,
                  decision: "transcode",
                  Stream: [
                    {
                      streamType: 1,
                      codec: "h264",
                      decision: "copy",
                      selected: 1,
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  });
  expect(result.MediaContainer.Metadata?.[0].Media?.[0]).toEqual({
    selected: true,
    protocol: "dash",
    Part: [
      {
        selected: false,
        decision: "transcode",
        Stream: [
          { streamType: 1, codec: "h264", decision: "copy", selected: true },
        ],
      },
    ],
  });
});

it("keeps a valid refusal available to the playback policy", () => {
  const response = {
    MediaContainer: {
      generalDecisionCode: 2000,
      generalDecisionText: "Denied",
      transcodeDecisionCode: 2010,
    },
  };
  expect(readPlaybackDecision(response)).toEqual(response);
});

it.each([
  {},
  { MediaContainer: [] },
  { MediaContainer: { generalDecisionCode: "1001" } },
  { MediaContainer: { generalDecisionCode: 1001, Metadata: {} } },
  { MediaContainer: { generalDecisionCode: 1001, Metadata: [{ Media: {} }] } },
  {
    MediaContainer: {
      generalDecisionCode: 1001,
      Metadata: [{ Media: [{ selected: "false" }] }],
    },
  },
  {
    MediaContainer: {
      generalDecisionCode: 1001,
      Metadata: [{ Media: [{ Part: {} }] }],
    },
  },
  {
    MediaContainer: {
      generalDecisionCode: 1001,
      Metadata: [{ Media: [{ Part: [{ Stream: {} }] }] }],
    },
  },
  {
    MediaContainer: {
      generalDecisionCode: 1001,
      Metadata: [
        { Media: [{ Part: [{ Stream: [{ streamType: 2, codec: 3 }] }] }] },
      ],
    },
  },
])("rejects malformed decisions before negotiation (%j)", (response) => {
  expect(() => readPlaybackDecision(response)).toThrow(PlexResponseError);
});
