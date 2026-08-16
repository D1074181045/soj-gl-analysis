import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import { registerAction } from "@/lib/actions";
import { getCurrentUser } from "@/lib/auth";

export default async function RegisterPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");
  return (
    <AuthForm
      action={registerAction}
      title="註冊帳號"
      submitLabel="註冊"
      altText="已經有帳號？"
      altHref="/login"
      altLinkLabel="前往登入"
    />
  );
}
