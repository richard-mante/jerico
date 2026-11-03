import { ProjectObservability } from "../../../../../components/project-observability";

export default async function ProjectObservabilityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const organizationId = typeof query.organizationId === "string" ? query.organizationId : "";
  return <ProjectObservability initialOrganizationId={organizationId} />;
}
