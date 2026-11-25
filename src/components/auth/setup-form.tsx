"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, LoaderCircle, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { useT } from "@/components/i18n/i18n-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getApiError, readApiPayload } from "@/lib/client-api";
import type { Translate } from "@/lib/i18n/locale";

function createFormSchema(t: Translate) {
  return z
    .object({
      setupToken: z.string().min(1, t("Enter the setup secret", "请输入初始化密钥")),
      email: z.email(t("Enter a valid email address", "请输入有效的邮箱")),
      displayName: z
        .string()
        .trim()
        .max(40, t("Nickname must not exceed 40 characters", "昵称不能超过 40 个字符")),
      password: z
        .string()
        .min(12, t("Password must contain at least 12 characters", "密码至少需要 12 个字符"))
        .max(200, t("Password must not exceed 200 characters", "密码不能超过 200 个字符")),
      passwordConfirmation: z.string().min(1, t("Re-enter your password", "请再次输入密码")),
    })
    .refine((value) => value.password === value.passwordConfirmation, {
      path: ["passwordConfirmation"],
      message: t("Passwords do not match", "两次输入的密码不一致"),
    });
}

type FormValues = z.infer<ReturnType<typeof createFormSchema>>;

export function SetupForm() {
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
    defaultValues: {
      setupToken: "",
      email: "",
      displayName: "",
      password: "",
      passwordConfirmation: "",
    },
  });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    const response = await fetch("/api/setup/admin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        setupToken: values.setupToken,
        email: values.email,
        displayName: values.displayName || undefined,
        password: values.password,
      }),
    });
    const payload = await readApiPayload(response);
    if (!response.ok) {
      setServerError(getApiError(payload, t("Administrator initialization failed", "管理员初始化失败")));
      return;
    }

    router.replace("/");
    router.refresh();
  }

  return (
    <form className="mt-7 space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="space-y-2">
        <Label htmlFor="setup-token">{t("Setup secret", "初始化密钥")}</Label>
        <Input
          id="setup-token"
          type="password"
          autoComplete="off"
          aria-invalid={Boolean(errors.setupToken)}
          {...register("setupToken")}
        />
        {errors.setupToken ? (
          <p className="text-sm text-rose-600">{errors.setupToken.message}</p>
        ) : (
          <p className="text-xs font-medium leading-5 text-muted">
            {t(
              "Enter the contents of the one-time secret file on the deployment server.",
              "填写部署服务器上一次性密钥文件中的内容。",
            )}
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="setup-email">{t("Administrator email", "管理员邮箱")}</Label>
          <Input
            id="setup-email"
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
          <Label htmlFor="setup-display-name">{t("Nickname (optional)", "昵称（可选）")}</Label>
          <Input
            id="setup-display-name"
            type="text"
            autoComplete="nickname"
            aria-invalid={Boolean(errors.displayName)}
            {...register("displayName")}
          />
          {errors.displayName ? (
            <p className="text-sm text-rose-600">
              {errors.displayName.message}
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="setup-password">{t("Administrator password", "管理员密码")}</Label>
          <div className="relative">
            <Input
              id="setup-password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
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
              {showPassword ? (
                <EyeOff className="size-4" />
              ) : (
                <Eye className="size-4" />
              )}
            </button>
          </div>
          {errors.password ? (
            <p className="text-sm text-rose-600">{errors.password.message}</p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="setup-password-confirmation">
            {t("Confirm password", "确认密码")}
          </Label>
          <Input
            id="setup-password-confirmation"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            aria-invalid={Boolean(errors.passwordConfirmation)}
            {...register("passwordConfirmation")}
          />
          {errors.passwordConfirmation ? (
            <p className="text-sm text-rose-600">
              {errors.passwordConfirmation.message}
            </p>
          ) : null}
        </div>
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
          <ShieldCheck className="size-4" />
        )}
        {isSubmitting
          ? t("Creating administrator…", "正在创建管理员…")
          : t("Create administrator and open Zowl", "创建管理员并进入 Zowl")}
      </Button>
    </form>
  );
}
