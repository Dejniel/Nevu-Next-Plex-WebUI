import { SearchRounded } from "@mui/icons-material";
import {
  Backdrop,
  Box,
  CircularProgress,
  InputAdornment,
  Popper,
  TextField,
  Typography,
} from "@mui/material";
import { getTranscodeImageURL } from "entities/media/model";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, type To, useLocation, useNavigate } from "react-router-dom";
import { searchSuggestions } from "../model/searchResults";
import { searchResultTo } from "../model/searchNavigation";
import { usePlexSearch } from "../model/usePlexSearch";

interface SearchBarProps {
  enableShortcut?: boolean;
  inDrawer?: boolean;
  onResultSelected?: () => void;
}

export default function SearchBar({
  enableShortcut = true,
  inDrawer = false,
  onResultSelected,
}: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const search = usePlexSearch(query);
  const results = useMemo(
    () => searchSuggestions(search.results),
    [search.results],
  );
  const open = Boolean(anchor);

  const close = () => {
    inputRef.current?.blur();
    setAnchor(null);
  };

  const completeSelection = () => {
    close();
    onResultSelected?.();
  };

  useEffect(() => setSelectedIndex(null), [query]);

  useEffect(() => {
    setSelectedIndex((current) =>
      current !== null && current >= results.length ? null : current,
    );
  }, [results.length]);

  useEffect(() => {
    if (!enableShortcut) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "f" || !event.ctrlKey) return;
      event.preventDefault();
      event.stopPropagation();

      if (anchor) {
        inputRef.current?.blur();
        setAnchor(null);
        return;
      }
      inputRef.current?.focus();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [anchor, enableShortcut]);

  return (
    <>
      <Backdrop open={open} sx={{ zIndex: 10000 }} onClick={close} />
      <TextField
        inputRef={inputRef}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchRounded />
              </InputAdornment>
            ),
          },
        }}
        placeholder="Search"
        variant="outlined"
        size="small"
        value={query}
        onKeyDown={(event) => {
          switch (event.key) {
            case "Escape":
              close();
              break;
            case "ArrowDown":
              event.preventDefault();
              if (results.length === 0) return;
              setSelectedIndex((current) =>
                current === null ? 0 : Math.min(current + 1, results.length - 1),
              );
              break;
            case "ArrowUp":
              event.preventDefault();
              if (results.length === 0) return;
              setSelectedIndex((current) =>
                current === null ? 0 : current === 0 ? null : current - 1,
              );
              break;
            case "Tab":
              event.preventDefault();
              if (results.length === 0) return;
              setSelectedIndex((current) =>
                current === results.length - 1
                  ? null
                  : current === null
                    ? 0
                    : current + 1,
              );
              break;
            case "Enter": {
              const normalizedQuery = query.trim();
              if (!normalizedQuery) return;
              const selected =
                selectedIndex === null ? null : results[selectedIndex];
              const searchTarget = `/search/${encodeURIComponent(normalizedQuery)}`;
              const target = selected
                ? searchResultTo(location, selected) || searchTarget
                : searchTarget;
              navigate(target);
              completeSelection();
              break;
            }
          }
        }}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={(event) => setAnchor(event.currentTarget)}
        sx={{
          backgroundColor: "#121212AA",
          transition: "width 0.2s ease-in-out",
          zIndex: 11000,
          width: inDrawer ? "100%" : open ? "20vw" : 300,
        }}
      />
      <Popper
        anchorEl={anchor}
        open={open && query.length > 0}
        placement="bottom-end"
        sx={{
          borderRadius: "4px",
          backgroundColor: "#121212AA",
          backdropFilter: "blur(10px)",
          transition: "width 0.2s ease-in-out",
          p: "10px 10px 20px",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          width: inDrawer ? "260px" : open ? "20vw" : "300px",
          zIndex: 11000,
        }}
        onClick={(event) => event.stopPropagation()}
      >
        {search.loading && (
          <Box sx={{ display: "flex", justifyContent: "center", width: "100%" }}>
            <CircularProgress />
          </Box>
        )}
        {!search.loading && search.error && (
          <Typography color="error">{search.error}</Typography>
        )}
        {!search.loading && !search.error && results.length === 0 && (
          <Typography>No Results</Typography>
        )}
        {!search.loading &&
          results.map((result, index) => {
            const target = searchResultTo(location, result);
            if (!target) return null;
            return (
              <SearchSuggestion
                key={suggestionKey(result, index)}
                result={result}
                selected={selectedIndex === index}
                target={target}
                onSelect={completeSelection}
              />
            );
          })}
      </Popper>
    </>
  );
}

function SearchSuggestion({
  result,
  selected,
  target,
  onSelect,
}: {
  result: Plex.SearchResult;
  selected: boolean;
  target: To;
  onSelect: () => void;
}) {
  const metadata = result.Metadata;
  const directory = result.Directory;

  return (
    <Box
      component={Link}
      to={target}
      sx={{
        display: "flex",
        alignItems: "flex-start",
        width: "100%",
        borderRadius: "4px",
        backgroundColor: (theme) =>
          selected ? theme.palette.primary.dark : theme.palette.background.paper,
        p: "7px 10px",
        transition: "background-color 0.2s ease-in-out",
        userSelect: "none",
        color: "inherit",
        textDecoration: "none",
        "&:hover": { backgroundColor: (theme) => theme.palette.primary.dark },
      }}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
    >
      {metadata ? (
        <>
          <Box
            component="img"
            src={getTranscodeImageURL(metadata.thumb, 100, 100)}
            alt=""
            sx={{ width: 50, height: 50, objectFit: "cover", borderRadius: "4px" }}
          />
          <Box sx={{ ml: 2, display: "flex", flexDirection: "column" }}>
            <Typography>{metadata.title}</Typography>
            <Typography sx={{ fontSize: 12, color: "#777" }}>
              {metadata.librarySectionTitle}
            </Typography>
          </Box>
        </>
      ) : (
        <Typography>
          {directory?.librarySectionTitle} - {directory?.tag}
        </Typography>
      )}
    </Box>
  );
}

function suggestionKey(result: Plex.SearchResult, index: number) {
  return (
    result.Metadata?.ratingKey ||
    result.Directory?.key ||
    `${result.Directory?.librarySectionID}:${result.Directory?.id}:${index}`
  );
}
