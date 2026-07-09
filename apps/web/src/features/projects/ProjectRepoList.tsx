import { useProjectRepos } from "./useProjectRepos";
import { RepoCard } from "./RepoCard";
import type { NodeApi } from "@codesage/shared-types";

type ProjectStatus = NodeApi.components["schemas"]["ProjectStatus"];

interface Props {
  projectId: string;
  projectStatus?: ProjectStatus;
}

/**
 * Lists repos attached to a project as rich metadata cards.
 */
export function ProjectRepoList({ projectId, projectStatus }: Props): JSX.Element | null {
  const { data: repos, isPending } = useProjectRepos({ projectId, projectStatus });

  if (isPending || !repos || repos.length === 0) {
    return null;
  }

  return (
    <ul className="mt-3 space-y-3 border-t border-border pt-3">
      {repos.map((repo) => (
        <RepoCard key={repo.id} projectId={projectId} repo={repo} />
      ))}
    </ul>
  );
}
