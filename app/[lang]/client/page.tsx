import { redirect } from "next/navigation";

export default async function ClientIndexPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  redirect(`/${lang}/client/dashboard`);
}
