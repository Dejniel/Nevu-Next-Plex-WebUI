import { Box } from "@mui/material";
import React from "react";
import { Link, type To } from "react-router-dom";

export default function StretchedLink({
  to,
  label,
  className,
  onClick,
  zIndex = 1,
}: {
  to: To;
  label: string;
  className?: string;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
  zIndex?: number;
}) {
  return (
    <Box
      component={Link}
      to={to}
      className={className}
      aria-label={label}
      onClick={onClick}
      sx={{
        position: "absolute",
        inset: 0,
        zIndex,
        color: "inherit",
        textDecoration: "none",
        outline: "none",
        borderRadius: "inherit",
        "&:focus-visible": {
          outline: "2px solid",
          outlineColor: "primary.main",
          outlineOffset: 2,
        },
      }}
    />
  );
}
