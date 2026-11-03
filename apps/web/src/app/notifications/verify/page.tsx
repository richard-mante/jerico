import { NotificationVerification } from "../../../components/notification-verification";

export default async function NotificationVerificationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;
  return <NotificationVerification token={params.token ?? ""} />;
}
