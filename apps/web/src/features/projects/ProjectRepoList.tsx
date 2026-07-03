import { useProjectRepos } from "./useProjectRepos";
import { RepoCard } from "./RepoCard";

interface Props {
  projectId: string;
}

/**
 * Lists repos attached to a project as rich metadata cards.
 */
export function ProjectRepoList({ projectId }: Props): JSX.Element | null {
  const { data: repos, isPending } = useProjectRepos(projectId);

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
