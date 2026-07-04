import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/cn";
import { useRepoIndexingEvents } from "./useRepoIndexingEvents";
import {
  formatIndexingEventDuration,
  formatIndexingEventPhaseLabel,
  formatIndexingEventStepLabel,
  formatIndexingEventTimestamp,
  INDEXING_PHASE_BADGE_CLASSES,
  INDEXING_STEP_ACCENT_CLASSES,
  resolveIndexingEventDurationMs,
  shouldShowIndexingEventDuration,
} from "./indexingEventDisplay";
import type { NodeApi } from "@codesage/shared-types";

type Repo = NodeApi.components["schemas"]["Repo"];
type RepoIndexingEvent = NodeApi.components["schemas"]["RepoIndexingEvent"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  repo: Repo;
}

/** Pixels from the scroll bottom that count as "reached the end". */
const SCROLL_BOTTOM_THRESHOLD_PX = 4;

/**
 * Skeleton rows shown while the first page of indexing events loads.
 */
function IndexingLogsSkeleton(): JSX.Element {
  return (
    <div className="space-y-3 py-1" aria-hidden="true">
      {Array.from({ length: 4 }, (_, i) => (
        <div
          key={i}
          className="space-y-2 rounded-md border border-border border-l-4 border-l-muted bg-muted/20 p-3"
        >
          <div className="flex justify-between gap-4">
            <div className="h-4 w-28 animate-pulse rounded bg-muted" />
            <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          </div>
          <div className="h-3 w-full animate-pulse rounded bg-muted" />
          <div className="h-3 w-20 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

/**
 * Single indexing log row with step accent, status badge, and duration.
 */
function IndexingLogRow({
  event,
  locale,
}: {
  event: RepoIndexingEvent;
  locale: string;
}): JSX.Element {
  const { t } = useTranslation();
  const durationMs = resolveIndexingEventDurationMs(event);
  const showDuration = shouldShowIndexingEventDuration(event.phase) && durationMs !== undefined;

  return (
    <article
      className={cn(
        "rounded-md border border-border border-l-4 bg-card p-3 shadow-sm",
        INDEXING_STEP_ACCENT_CLASSES[event.step],
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">{formatIndexingEventStepLabel(event, t)}</span>
          <span
            className={cn(
              "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium",
              INDEXING_PHASE_BADGE_CLASSES[event.phase],
              event.phase === "started" && "animate-pulse",
            )}
          >
            {formatIndexingEventPhaseLabel(event, t)}
          </span>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5 text-right">
          <time className="text-xs text-muted-foreground" dateTime={event.startedAt}>
            {formatIndexingEventTimestamp(event.startedAt, locale)}
          </time>
          {showDuration ? (
            <span className="font-mono text-[11px] text-muted-foreground">
              {formatIndexingEventDuration(durationMs)}
            </span>
          ) : null}
        </div>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-foreground/90">{event.message}</p>
      {event.failureReason ? (
        <p className="mt-2 rounded-md border border-destructive/20 bg-destructive/5 px-2 py-1.5 text-sm text-destructive">
          {event.failureReason}
        </p>
      ) : null}
    </article>
  );
}

/**
 * Modal listing repo indexing progress events with bottom-triggered infinite scroll.
 */
export function IndexingLogsDialog({
  open,
  onOpenChange,
  projectId,
  repo,
}: Props): JSX.Element {
  const { t, i18n } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const loadingMoreRef = useRef(false);

  const pollWhileConnecting = open && repo.connectionStatus === "connecting";
  const {
    data,
    isPending,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useRepoIndexingEvents({
    projectId,
    repoId: repo.id,
    enabled: open,
    pollWhileConnecting,
  });

  const events = data?.pages.flatMap((page) => page.items) ?? [];
  const subtitle = repo.fullName || repo.repoUrl;

  useEffect(() => {
    loadingMoreRef.current = isFetchingNextPage;
  }, [isFetchingNextPage]);

  const tryLoadMoreAtBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el || !hasNextPage || loadingMoreRef.current) {
      return;
    }

    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom > SCROLL_BOTTOM_THRESHOLD_PX) {
      return;
    }

    loadingMoreRef.current = true;
    void fetchNextPage().finally(() => {
      loadingMoreRef.current = false;
    });
  }, [hasNextPage, fetchNextPage]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!open || !el) {
      return undefined;
    }

    const onScroll = (): void => {
      tryLoadMoreAtBottom();
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [open, tryLoadMoreAtBottom, events.length]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t("common.close")} className="sm:max-w-xl">
        <DialogHeader className="space-y-1 border-b border-border pb-3">
          <DialogTitle>{t("projects.repoCard.indexingLogsTitle")}</DialogTitle>
          <p className="truncate text-sm text-muted-foreground">{subtitle}</p>
        </DialogHeader>

        <div
          ref={scrollRef}
          className="max-h-[60vh] space-y-3 overflow-y-auto pr-1 pt-1"
          aria-busy={isPending || isFetchingNextPage}
        >
          {isPending && !data ? <IndexingLogsSkeleton /> : null}

          {isError ? (
            <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-border py-10 text-center">
              <p className="text-sm text-destructive">
                {t("projects.repoCard.indexingLogsError")}
              </p>
              <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
                {t("projects.repoCard.indexingLogsRetry")}
              </Button>
            </div>
          ) : null}

          {!isPending && !isError && events.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {t("projects.repoCard.indexingLogsEmpty")}
            </p>
          ) : null}

          {!isError && events.length > 0 ? (
            <>
              {events.map((event) => (
                <IndexingLogRow key={event.id} event={event} locale={i18n.language} />
              ))}
              {hasNextPage ? (
                <div className="flex justify-center py-2">
                  {isFetchingNextPage ? (
                    <Loader2
                      className="h-5 w-5 animate-spin text-muted-foreground"
                      aria-label={t("projects.repoCard.indexingLogsLoadMore")}
                    />
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {t("projects.repoCard.indexingLogsScrollHint")}
                    </p>
                  )}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
