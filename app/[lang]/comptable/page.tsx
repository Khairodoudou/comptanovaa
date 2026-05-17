import { redirect } from "next/navigation";

export default async function ComptableIndexPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  redirect(`/${lang}/comptable/dashboard`);
}
