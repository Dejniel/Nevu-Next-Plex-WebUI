import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { MediaItemData } from "entities/media/model";
import { PlexRequestError } from "shared/api/PlexClient";
import { serverQueryClient } from "shared/api/queryClient";
import { createMetadataMatcher } from "../api/matching";
import {
  metadataMatchCriteriaErrors,
  matchSearchTerm,
  type MetadataMatchCandidate,
  type MetadataMatchCriteria,
} from "./matching";

function requestError(error: unknown) {
  if (error instanceof PlexRequestError) {
    if (error.status === 401 || error.status === 403)
      return "Matching metadata requires Plex server administrator access.";
    if (error.status === 404)
      return "This item or metadata agent is no longer available in Plex.";
    return `Plex could not complete metadata matching (HTTP ${error.status}).`;
  }
  return error instanceof Error
    ? error.message
    : "Plex could not complete metadata matching.";
}

export function useMetadataMatch(
  item: MediaItemData,
  onClose: () => void,
  onSaved?: () => void,
) {
  const [initial] = useState(() => item);
  const [source] = useState(() => createMetadataMatcher(initial));
  const [criteria, setCriteria] = useState<MetadataMatchCriteria>(() => ({
    title:
      "originalTitle" in initial && initial.originalTitle
        ? initial.originalTitle
        : initial.title,
    year: initial.type === "artist" ? undefined : initial.year || undefined,
    language: "",
    agent: "",
  }));
  const [submitted, setSubmitted] = useState(criteria);
  const [selectedGuid, setSelectedGuid] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const identity = [
    source.scope?.serverId,
    source.scope?.profileKey,
    source.revision,
    initial.ratingKey,
  ];
  const agents = useQuery(
    {
      queryKey: [
        "metadata-match-agents",
        ...identity.slice(0, 3),
        initial.type,
      ],
      queryFn: ({ signal }) => source.agents(signal),
    },
    serverQueryClient,
  );
  const results = useQuery(
    {
      queryKey: ["metadata-matches", ...identity, submitted],
      queryFn: ({ signal }) => source.search(submitted, signal),
      enabled: !Object.keys(metadataMatchCriteriaErrors(submitted)).length,
    },
    serverQueryClient,
  );
  const mutation = useMutation(
    {
      mutationKey: ["metadata-match", ...identity],
      mutationFn: ({
        candidate,
        signal,
      }: {
        candidate: MetadataMatchCandidate;
        signal: AbortSignal;
      }) => source.apply(candidate, signal),
    },
    serverQueryClient,
  );
  const candidates = results.data ?? [];
  const selected =
    candidates.find((candidate) => candidate.guid === selectedGuid) ??
    candidates.find((candidate) => candidate.guid !== initial.guid) ??
    candidates[0];
  const errors = metadataMatchCriteriaErrors(criteria);
  const canApply = Boolean(
    selected &&
      selected.guid !== initial.guid &&
      !results.isFetching &&
      !mutation.isPending &&
      !results.isError,
  );
  return {
    criteria,
    setCriteria,
    errors,
    identifier: !errors.title && matchSearchTerm(criteria.title).identifier,
    candidates,
    selected,
    select: setSelectedGuid,
    agents: agents.data ?? [],
    agentsLoading: agents.isPending,
    agentsError: agents.error
      ? "Metadata agents could not be loaded. Library-default matching remains available."
      : null,
    retryAgents: () => void agents.refetch(),
    searching: results.isFetching,
    searched: results.isSuccess,
    applying: mutation.isPending,
    error: mutation.error
      ? requestError(mutation.error)
      : results.error
        ? requestError(results.error)
        : null,
    canApply,
    search() {
      if (Object.keys(errors).length || mutation.isPending) return;
      mutation.reset();
      setSelectedGuid(null);
      if (JSON.stringify(submitted) === JSON.stringify(criteria))
        void results.refetch();
      else setSubmitted({ ...criteria });
    },
    async apply() {
      if (!canApply || !selected || request.current) return;
      const controller = new AbortController();
      request.current = controller;
      try {
        await mutation.mutateAsync({
          candidate: selected,
          signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          try {
            onSaved?.();
          } finally {
            onClose();
          }
        }
      } catch {
        // The mutation owns the visible error; closing cancels stale completions.
      } finally {
        if (request.current === controller) request.current = null;
      }
    },
  };
}
