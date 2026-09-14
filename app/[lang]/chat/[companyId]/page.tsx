import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function ChatRedirectPage({
  params,
}: {
  params: Promise<{ lang: string; companyId: string }>;
}) {
  const { lang, companyId } = await params;
  const user = await getCurrentUser();

  if (!user) {
    redirect(`/${lang}/login?redirect=/${lang}/chat/${companyId}`);
  }

  if (user.role === "COMPTABLE") {
    redirect(`/${lang}/comptable/chat?companyId=${companyId}`);
  } else {
    redirect(`/${lang}/client/chat?companyId=${companyId}`);
  }
}
