export const HOME_CONTENT_GUTTER = "2.5vw";

export const homeHeroContentSx = {
  position: "absolute" as const,
  top: "64px",
  bottom: "20vh",
  left: 0,
  right: 0,
  px: HOME_CONTENT_GUTTER,
  display: "flex",
  flexDirection: "column" as const,
  alignItems: "flex-start",
  justifyContent: "center",
};
