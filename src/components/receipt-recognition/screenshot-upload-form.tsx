"use client";

import {
  Camera,
  ImagePlus,
  LoaderCircle,
  LockKeyhole,
  ShieldAlert,
  Sparkles,
  Trash2,
  UploadCloud,
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useLocale, useT } from "@/components/i18n/i18n-provider";
import { Button } from "@/components/ui/button";
import {
  getApiError,
  readApiPayload,
  unwrapApiData,
} from "@/lib/client-api";
import type { Translate } from "@/lib/i18n/locale";
import { localizeServerMessage } from "@/lib/i18n/server-messages";
import { cn } from "@/lib/utils";

const MAX_FILES = 10;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 40 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const ALLOWED_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp"]);
let imageSequence = 0;

type SelectedImage = {
  id: string;
  file: File;
  previewUrl: string;
};

function fileKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function imageId(file: File) {
  imageSequence += 1;
  return `${fileKey(file)}:${Date.now()}:${imageSequence}`;
}

function formatFileSize(size: number) {
  return size < 1024 * 1024
    ? `${Math.ceil(size / 1024)} KiB`
    : `${(size / 1024 / 1024).toFixed(1)} MiB`;
}

function validateFile(file: File, t: Translate) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (!ALLOWED_TYPES.has(file.type) || !extension || !ALLOWED_EXTENSIONS.has(extension)) {
    return t(
      `${file.name} is not a PNG, JPEG or WebP image`,
      `${file.name} 不是 PNG、JPEG 或 WebP 图片`,
    );
  }
  if (!file.size || file.size > MAX_FILE_BYTES) {
    return t(`${file.name} must be smaller than 8 MiB`, `${file.name} 必须小于 8 MiB`);
  }
  return null;
}

export function ScreenshotUploadForm({
  providerMode,
  providerLabel,
  disclosure,
  retentionPolicy,
}: {
  providerMode: "mock" | "third-party" | "unavailable";
  providerLabel?: string;
  disclosure?: string;
  retentionPolicy?: string;
}) {
  const router = useRouter();
  const t = useT();
  const locale = useLocale();
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedRef = useRef<SelectedImage[]>([]);
  const [images, setImages] = useState<SelectedImage[]>([]);
  const [dragging, setDragging] = useState(false);
  const [consented, setConsented] = useState(providerMode !== "third-party");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    selectedRef.current = images;
  }, [images]);
  useEffect(
    () => () => {
      selectedRef.current.forEach((image) => URL.revokeObjectURL(image.previewUrl));
    },
    [],
  );

  function choose(files: FileList | File[]) {
    setError(null);
    const candidates = Array.from(files);
    if (!candidates.length) return;

    const validationErrors = candidates
      .map((file) => validateFile(file, t))
      .filter((message): message is string => Boolean(message));
    if (validationErrors.length) {
      setError(validationErrors.slice(0, 2).join(t("; ", "；")));
      return;
    }

    setImages((current) => {
      const existing = new Set(current.map((image) => fileKey(image.file)));
      const unique = candidates.filter((file) => !existing.has(fileKey(file)));
      if (current.length + unique.length > MAX_FILES) {
        setError(
          t(
            `Select up to ${MAX_FILES} images per upload; selected: ${current.length} images`,
            `每次最多选择 ${MAX_FILES} 张图片，当前已选择 ${current.length} 张`,
          ),
        );
        return current;
      }
      const totalBytes = [...current.map((image) => image.file), ...unique].reduce(
        (sum, file) => sum + file.size,
        0,
      );
      if (totalBytes > MAX_TOTAL_BYTES) {
        setError(t("Total selected image size must not exceed 40 MiB", "所选图片总大小不能超过 40 MiB"));
        return current;
      }

      return [
        ...current,
        ...unique.map((file) => ({
          id: imageId(file),
          file,
          previewUrl: URL.createObjectURL(file),
        })),
      ];
    });

    if (inputRef.current) inputRef.current.value = "";
  }

  function remove(id: string) {
    setImages((current) => {
      const target = current.find((image) => image.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return current.filter((image) => image.id !== id);
    });
  }

  async function submit() {
    if (!images.length || pending || !consented) return;
    setPending(true);
    setError(null);

    const formData = new FormData();
    images.forEach(({ file }) => formData.append("images", file));
    if (thirdParty) formData.set("consentToThirdParty", "true");

    try {
      const response = await fetch("/api/imports/screenshots", {
        method: "POST",
        body: formData,
      });
      const payload = await readApiPayload(response);
      const data = unwrapApiData<{ jobId?: string; id?: string }>(payload);
      const jobId = data?.jobId ?? data?.id;

      if (!response.ok || !jobId) {
        setError(
          getApiError(
            payload,
            t(
              "Image upload or recognition startup failed. Try again later",
              "图片上传或识别启动失败，请稍后重试",
            ),
          ),
        );
        return;
      }

      router.push(`/imports/screenshots/${jobId}/review`);
      router.refresh();
    } catch {
      setError(
        t(
          "Network connection failed. Images remain on this page; retry directly.",
          "网络连接失败。图片仍保留在当前页面，可以直接重试。",
        ),
      );
    } finally {
      setPending(false);
    }
  }

  const thirdParty = providerMode === "third-party";
  const unavailable = providerMode === "unavailable";
  // Provider copy comes from the recognition service in English.
  const localProviderLabel = providerLabel
    ? localizeServerMessage(providerLabel, locale)
    : providerLabel;

  return (
    <div className="space-y-5">
      <div
        className={cn(
          "relative rounded-[24px] border-2 border-dashed border-divider p-4 transition sm:p-6",
          dragging
            ? "bg-tint-amber"
            : "bg-surface hover:bg-surface-muted",
        )}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setDragging(false);
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          choose(event.dataTransfer.files);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
          className="sr-only"
          onChange={(event) => {
            if (event.target.files) choose(event.target.files);
          }}
        />

        {images.length ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-black text-foreground">{t(`Selected ${images.length} images`, `已选择 ${images.length} 张`)}</p>
                <p className="mt-0.5 text-xs font-semibold text-muted">{t(`Add more, up to ${MAX_FILES} images`, `可以继续添加，最多 ${MAX_FILES} 张`)}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={images.length >= MAX_FILES}
                onClick={() => inputRef.current?.click()}
              >
                <ImagePlus className="size-4" />{t("Add more", "继续添加")}
              </Button>
            </div>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {images.map((image, index) => (
                <li key={image.id} className="overflow-hidden rounded-2xl border-2 border-divider bg-surface">
                  <div className="relative aspect-[4/3] bg-surface-muted">
                    <Image
                      src={image.previewUrl}
                      alt={t(
                        `Screenshots to recognize ${index + 1}: ${image.file.name}`,
                        `待识别截图 ${index + 1}：${image.file.name}`,
                      )}
                      fill
                      unoptimized
                      className="object-contain"
                    />
                    <button
                      type="button"
                      aria-label={t(`Remove ${image.file.name}`, `移除 ${image.file.name}`)}
                      className="absolute right-2 top-2 grid size-8 place-items-center rounded-full border-2 border-divider bg-surface/90 text-danger backdrop-blur transition hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      onClick={() => remove(image.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                  <div className="p-2.5">
                    <p className="truncate text-xs font-extrabold text-foreground">{image.file.name}</p>
                    <p className="mt-0.5 text-[11px] font-semibold text-muted">{formatFileSize(image.file.size)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <button
            type="button"
            className="grid min-h-56 w-full place-items-center text-center"
            onClick={() => inputRef.current?.click()}
          >
            <span>
              <span className="mx-auto grid size-12 place-items-center rounded-2xl border-2 border-divider bg-tint-sky text-foreground">
                <UploadCloud className="size-6" />
              </span>
              <span className="mt-4 block font-black text-foreground">{t("Select or drag payment screenshots", "选择或拖入支付截图")}</span>
              <span className="mt-1 block text-sm font-semibold text-muted">{t("Upload 1–10 PNG, JPEG, or WebP images, up to 40 MiB total", "一次可上传 1–10 张 PNG、JPEG 或 WebP 图片，总计不超过 40 MiB")}</span>
              <span className="mt-3 inline-flex items-center gap-1 text-xs font-extrabold text-accent-text">
                <Camera className="size-3.5" />{t("On mobile, choose from your gallery or take a photo", "手机上可以直接从相册选择或拍照")}
              </span>
            </span>
          </button>
        )}
      </div>

      <div
        className={cn(
          "rounded-2xl border-2 border-divider px-3.5 py-3 font-semibold",
          thirdParty || unavailable
            ? "bg-tint-amber text-foreground"
            : "bg-tint-leaf text-foreground",
        )}
      >
        <div className="flex items-start gap-2.5">
          {thirdParty || unavailable ? <ShieldAlert className="mt-0.5 size-4 shrink-0" /> : <LockKeyhole className="mt-0.5 size-4 shrink-0" />}
          <div className="min-w-0">
            <p className="text-sm font-bold">
              {thirdParty
                ? t(
                    `Processed by ${localProviderLabel || 'a third-party recognition service'}`,
                    `将由${localProviderLabel || "第三方识别服务"}处理`,
                  )
                : unavailable
                  ? localProviderLabel ?? t("Automatic recognition is unavailable", "自动识别暂不可用")
                  : t("Currently in Mock demo mode", "当前为 Mock 演示模式")}
            </p>
            <p className="mt-1 text-xs leading-5 opacity-80">
              {disclosure
                ? localizeServerMessage(disclosure, locale)
                : thirdParty
                  ? t(
                      "Selected originals will be sent to the configured multimodal service to extract transaction fields. Avoid unrelated sensitive images. Review every result manually.",
                      "所选原图会发送给已配置的多模态服务来识别交易字段，请避免上传与记账无关的敏感图片。识别结果仍需逐条人工确认。",
                    )
                  : t(
                      "Images are not sent to an external recognition service.Mock returns empty fields. Complete them from the original image in the next step.",
                      "图片不会发送给外部识别服务。Mock 会返回空字段，请在下一步对照原图手动补全。",
                    )}
            </p>
            {retentionPolicy ? (
              <p className="mt-1 text-xs leading-5 opacity-80">{t("Retention policy:", "留存说明：")}{localizeServerMessage(retentionPolicy, locale)}</p>
            ) : null}
          </div>
        </div>
        {thirdParty ? (
          <label className="mt-3 flex cursor-pointer items-start gap-2.5 border-t-2 border-divider pt-3 text-sm font-bold">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-primary"
              checked={consented}
              onChange={(event) => setConsented(event.target.checked)}
            />
            {t(
              "I understand and agree to send the selected original images to this service",
              "我了解并同意将所选原图发送给上述服务处理",
            )}
          </label>
        ) : null}
      </div>

      {error ? (
        <div role="alert" className="rounded-2xl border-2 border-divider bg-tint-berry px-3 py-2.5 text-sm font-semibold text-danger">
          {error}
        </div>
      ) : null}

      <Button
        type="button"
        size="lg"
        className="w-full"
        disabled={!images.length || !consented || pending}
        onClick={submit}
      >
        {pending ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
        {pending
          ? t(`Uploading ${images.length} images…`, `正在上传 ${images.length} 张图片…`)
          : t(
              `Start recognition ${images.length || ""} images`,
              images.length ? `开始识别 ${images.length} 张图片` : "开始识别",
            )}
      </Button>
    </div>
  );
}
