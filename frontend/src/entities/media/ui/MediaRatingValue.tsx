import { StarRounded } from "@mui/icons-material";
import { Box } from "@mui/material";
import { formatMediaRating, validMediaRating } from "../model/mediaRatings";

export default function MediaRatingValue({ value }: { value: unknown }) {
  if (!validMediaRating(value)) return null;
  return (
    <Box
      component="span"
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0.5,
        fontWeight: 700,
      }}
    >
      <StarRounded aria-hidden sx={{ fontSize: 16, color: "#f5c518" }} />
      {formatMediaRating(value)}
    </Box>
  );
}
