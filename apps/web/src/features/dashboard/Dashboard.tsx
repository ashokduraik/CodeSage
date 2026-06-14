import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, BookOpen, GitBranch, MessageSquare, Users } from "lucide-react";
import { Spinner } from "@/shared/ui";
import { formatRelativeTime } from "@/shared/lib";
import { StatCard } from "./StatCard";
import { StatusBadge } from "./StatusBadge";
import { useDashboardData } from "./useDashboardData";

/** Landing page: aggregate stats, recent projects and recent conversations. */
export function Dashboard() {
  const { t, i18n } = useTranslation();
  const { data, isPending, isError } = useDashboardData();

  if (isPending) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex h-[60vh] items-center justify-center px-6 text-center text-sm text-muted-foreground">
        {t("dashboard.loadError")}
      </div>
    );
  }

  const { projects, sessions, stats } = data;

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-6 lg:p-8">
      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground">{t("dashboard.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("dashboard.subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={GitBranch}
          label={t("dashboard.stats.projects")}
          value={stats.projectCount}
          sublabel={t("dashboard.stats.indexedCount", { count: stats.indexedProjectCount })}
          color="primary"
        />
        <StatCard
          icon={MessageSquare}
          label={t("dashboard.stats.sessions")}
          value={stats.sessionCount}
          sublabel={t("dashboard.stats.conversations")}
          color="blue"
        />
        <StatCard
          icon={BookOpen}
          label={t("dashboard.stats.knowledge")}
          value={stats.knowledgeCount}
          sublabel={t("dashboard.stats.cataloged")}
          color="green"
        />
        <StatCard
          icon={Users}
          label={t("dashboard.stats.reviews")}
          value={stats.pendingReviewCount}
          sublabel={t("dashboard.stats.awaiting")}
          color="amber"
        />
      </div>

      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border p-5">
          <h2 className="font-heading font-semibold text-foreground">
            {t("dashboard.recentProjects")}
          </h2>
        </div>
        {projects.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            {t("dashboard.noProjects")}
          </p>
        ) : (
          <div className="divide-y divide-border">
            {projects.slice(0, 4).map((project) => (
              <div
                key={project.id}
                className="flex items-center justify-between p-4 transition-colors hover:bg-muted/50"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent">
                    <GitBranch className="h-4 w-4 text-accent-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{project.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {project.language ?? "—"} · {t("dashboard.repoCount", { count: project.repoCount })}
                    </p>
                  </div>
                </div>
                <StatusBadge status={project.status} />
              </div>
            ))}
          </div>
        )}
      </div>

      {sessions.length > 0 ? (
        <div className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border p-5">
            <h2 className="font-heading font-semibold text-foreground">
              {t("dashboard.recentConversations")}
            </h2>
            <Link
              to="/chat"
              className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              {t("dashboard.viewAll")} <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="divide-y divide-border">
            {sessions.slice(0, 3).map((session) => (
              <Link
                key={session.id}
                to={`/chat/${session.id}`}
                className="flex items-center justify-between p-4 transition-colors hover:bg-muted/50"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
                    <MessageSquare className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{session.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {t(`chat.mode.${session.mode}`)} · {session.projectName ?? t("chat.general")} ·{" "}
                      {t("chat.messageCount", { count: session.messageCount })}
                    </p>
                  </div>
                </div>
                <span className="whitespace-nowrap text-xs text-muted-foreground">
                  {session.lastMessageAt
                    ? formatRelativeTime(session.lastMessageAt, { locale: i18n.language })
                    : "—"}
                </span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
