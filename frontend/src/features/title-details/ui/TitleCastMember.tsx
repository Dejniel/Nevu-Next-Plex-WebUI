import { Avatar, Box, Button, Typography } from "@mui/material";
import { Link, useLocation } from "react-router-dom";
import { getTranscodeImageURL, type MediaMetadata } from "entities/media/model";
import { libraryBrowseTo } from "shared/lib/navigation";

export default function TitleCastMember({
  member,
  sectionId,
}: {
  member: NonNullable<MediaMetadata["Role"]>[number];
  sectionId?: number;
}) {
  const location = useLocation();
  const target =
    member.id !== undefined && sectionId !== undefined
      ? libraryBrowseTo(
          location,
          `/library/sections/${sectionId}/actor/${member.id}`,
        )
      : undefined;
  return (
    <Button
      component={target ? Link : "button"}
      to={target}
      disabled={!target}
      sx={{
        width: "100%",
        minHeight: 72,
        justifyContent: "flex-start",
        gap: 1.5,
        px: 1.5,
        overflow: "hidden",
      }}
    >
      <Avatar
        src={
          member.thumb
            ? getTranscodeImageURL(member.thumb, 120, 120)
            : undefined
        }
        alt=""
        sx={{ width: 48, height: 48, flexShrink: 0 }}
      />
      <Box sx={{ minWidth: 0, textAlign: "left" }}>
        <Typography noWrap sx={{ fontWeight: 600 }}>
          {member.tag}
        </Typography>
        <Typography noWrap variant="body2" sx={{ color: "text.secondary" }}>
          {member.role}
        </Typography>
      </Box>
    </Button>
  );
}
