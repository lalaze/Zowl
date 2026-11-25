"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, LoaderCircle, LogIn } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { useT } from "@/components/i18n/i18n-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Translate } from "@/lib/i18n/locale";

function createFormSchema(t: Translate) {
  return z.object({
    email: z.email(t("Enter a valid email address", "请输入有效的邮箱")),
    password: z.string().min(1, t("Enter your password", "请输入密码")),
  });
}

type FormValues = z.infer<ReturnType<typeof createFormSchema>>;

export function LoginForm({
  defaultEmail,
  defaultPassword,
}: {
  defaultEmail: string;
  defaultPassword: string;
}) {
  const t = useT();
  const formSchema = useMemo(() => createFormSchema(t), [t]);
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: defaultEmail, password: defaultPassword },
  });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(values),
    });
    const payload = (await response.json()) as {
      error?: { message?: string };
    };

    if (!response.ok) {
      setServerError(payload.error?.message ?? t("Login failed. Try again later", "登录失败，请稍后重试"));
      return;
    }

    router.replace("/");
    router.refresh();
  }

  return (
    <form className="mt-8 space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="space-y-2">
        <Label htmlFor="email">{t("Email", "邮箱")}</Label>
        <Input
          id="email"
          type="email"
          autoComplete="username"
          aria-invalid={Boolean(errors.email)}
          {...register("email")}
        />
        {errors.email ? (
          <p className="text-sm text-rose-600">{errors.email.message}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">{t("Password", "密码")}</Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            className="pr-11"
            aria-invalid={Boolean(errors.password)}
            {...register("password")}
          />
          <button
            type="button"
            aria-label={
              showPassword
                ? t("Hide password", "隐藏密码")
                : t("Show password", "显示密码")
            }
            className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted transition hover:text-foreground"
            onClick={() => setShowPassword((value) => !value)}
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        {errors.password ? (
          <p className="text-sm text-rose-600">{errors.password.message}</p>
        ) : null}
      </div>

      {serverError ? (
        <div
          role="alert"
          className="rounded-2xl border-2 border-divider bg-tint-berry px-3 py-2.5 text-sm font-semibold text-danger"
        >
          {serverError}
        </div>
      ) : null}

      <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? (
          <LoaderCircle className="size-4 animate-spin" />
        ) : (
          <LogIn className="size-4" />
        )}
        {isSubmitting ? t("Signing in…", "正在登录…") : t("Open Zowl", "进入 Zowl")}
      </Button>
    </form>
  );
}
