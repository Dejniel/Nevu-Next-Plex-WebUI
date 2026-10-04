import { Alert, Box, CircularProgress, Grid } from "@mui/material";
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ActionableMediaCard } from "features/media-actions/public";
import { useInView } from "react-intersection-observer";
import type { LibrarySort } from "@nevu/contracts";
import LibrarySortDropDown, {
  normalizeLibrarySort,
  sortMetadata,
} from "./LibrarySortDropDown";
import { AppDialog } from "shared/ui";
import { getLibraryDirectory } from "../api/libraryDirectories";

function LibraryScreen() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [library, setLibrary] = useState<Plex.MediaContainer | null>(null);

  const [sortBy, setSortBy] = useState<LibrarySort>(
    normalizeLibrarySort(localStorage.getItem("sortBy")),
  );

  const bkey = searchParams.has("bkey")
    ? decodeURIComponent(searchParams.get("bkey") as string)
    : null;
  const browsePropsValue = searchParams.get("bprops");
  const browseProps = useMemo(
    () => parseBrowseProps(browsePropsValue),
    [browsePropsValue],
  );

  const close = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("bkey");
    next.delete("bprops");
    setSearchParams(next);
  };

  useEffect(() => {
    if (!searchParams.has("bkey")) return;
    if (!searchParams.has("mid") && !searchParams.has("pguid")) return;

    const next = new URLSearchParams(searchParams);
    next.delete("mid");
    next.delete("pguid");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!bkey) return;
    if (bkey === "/plextv/watchlist") {
      navigate("/watchlist", { replace: true });
      return;
    }
    let active = true;

    setLoading(true);
    setError(null);
    setLibrary(null);
    setSortBy(normalizeLibrarySort(localStorage.getItem("sortBy")));

    getLibraryDirectory(bkey, browseProps)
      .then((data) => {
        if (!active) return;
        setLibrary(data);
        setLoading(false);
      })
      .catch((e) => {
        if (!active) return;
        setError(e.message);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [bkey, browseProps, navigate]);

  if (bkey && bkey !== "/plextv/watchlist")
    return (
      <AppDialog
        open
        onClose={close}
        title={
          <Box
            component="span"
            sx={{
              width: "100%",
              minWidth: 0,
              display: "flex",
              alignItems: "center",
              gap: 2,
            }}
          >
            <Box
              component="span"
              sx={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {library?.title1 || "Browse"}
              {library?.title2 && ` - ${library.title2}`}
            </Box>
            {!loading && (
              <Box component="span" sx={{ ml: "auto", flexShrink: 0 }}>
                <LibrarySortDropDown sortHook={[sortBy, setSortBy]} />
              </Box>
            )}
          </Box>
        }
        contentSx={{ pb: (library?.Metadata?.length ?? 0) > 10 ? 6 : 3 }}
      >
        {loading ? (
          <Box
            sx={{
              minHeight: 240,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <CircularProgress />
          </Box>
        ) : (
          <>
            {error && (
              <Box sx={{ width: "100%", mb: 2 }}>
                <Alert severity="error">{error}</Alert>
              </Box>
            )}

            <Grid container spacing={2} sx={{ width: "100%" }}>
              {library?.Metadata &&
                sortMetadata(library.Metadata, sortBy).map((item, index) => (
                  <Grid
                    size={{ xs: 12, sm: 6, md: 4, lg: 4, xl: 3 }}
                    key={item.ratingKey}
                  >
                    <Element
                      item={item}
                      key={`${index}`}
                      plexTv={bkey.startsWith("/plextv")}
                    />
                  </Grid>
                ))}
            </Grid>
          </>
        )}
      </AppDialog>
    );

  return <></>;
}

function parseBrowseProps(value: string | null) {
  if (!value) return undefined;

  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
      return parsed as { [key: string]: string | number };
  } catch {
    // Ignore malformed links and load the unfiltered endpoint.
  }

  return undefined;
}

function Element({ item, plexTv }: { item: Plex.Metadata; plexTv?: boolean }) {
  const { inView, ref } = useInView({
    triggerOnce: true,
    rootMargin: "800px 0px",
  });

  return (
    <div ref={ref}>
      {inView && (
        <ActionableMediaCard
          item={item}
          PlexTvSource={plexTv}
          imageLoading="eager"
        />
      )}
      {!inView && (
        <Box style={{ width: "100%" }}>
          <Box sx={{ width: "100%", height: "auto", aspectRatio: "16/9" }} />
          <Box sx={{ width: "100%", height: "60px" }} />
        </Box>
      )}
    </div>
  );
}

export default LibraryScreen;
