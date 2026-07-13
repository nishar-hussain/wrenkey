import { redirect } from "next/navigation";

export default async function VerifiableCloudAppRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/verifiable-compute/apps/${id}`);
}
