import { ProjectObservability } from "../../../../../components/project-observability";

export default async function ProjectObservabilityPage({
  searchParams,
}: {
  searchParams: Promise<{ organizationId?: string }>;
}) {
  const query = await searchParams;
  return <ProjectObservability initialOrganizationId={query.organizationId ?? ""} />;
}
