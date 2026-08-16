import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import { loginAction } from "@/lib/actions";
import { getCurrentUser } from "@/lib/auth";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");
  return (
    <AuthForm
      action={loginAction}
      title="登入"
      submitLabel="登入"
      altText="還沒有帳號？"
      altHref="/register"
      altLinkLabel="立即註冊"
    />
  );
}
