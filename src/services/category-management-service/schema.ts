import { categoryKinds } from "@/db/schema";
import { locales } from "@/lib/i18n/locale";
import { isSupportedLucideIconName } from "@/lib/lucide-icon-library";
import { z } from "zod";

export const MAX_CATEGORIES_PER_USER = 200;

export function normalizeCategoryName(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

export function categoryNameKey(value: string) {
  return normalizeCategoryName(value).toLocaleLowerCase("en-US");
}

const categoryNameSchema = z
  .string()
  .max(40)
  .transform(normalizeCategoryName)
  .pipe(z.string().min(1, "Enter a category name").max(24, "Category names support up to 24 characters"));

const categoryIconSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine(isSupportedLucideIconName, "Choose a valid Lucide icon");

const nullableIconSchema = z
  .union([categoryIconSchema, z.literal(""), z.null()])
  .transform((value) => value || null);

const nullableColorSchema = z
  .union([
    z
      .string()
      .trim()
      .regex(/^#[0-9a-fA-F]{6}$/u, "Color must be a 6 digit hex value"),
    z.literal(""),
    z.null(),
  ])
  .transform((value) => (value ? value.toLowerCase() : null));

export const categoryIdSchema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9_-]+$/u, "Category ID has an invalid format");

export const categoryCreateSchema = z
  .object({
    name: categoryNameSchema,
    kind: z.enum(categoryKinds),
    icon: nullableIconSchema.default(null),
    color: nullableColorSchema.default(null),
  })
  .strict();

export const categoryUpdateSchema = z
  .object({
    name: categoryNameSchema.optional(),
    kind: z.enum(categoryKinds).optional(),
    icon: nullableIconSchema.optional(),
    color: nullableColorSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Submit at least one field to change",
  });

export const categoryReorderSchema = z
  .object({
    ids: z
      .array(categoryIdSchema)
      .min(1)
      .max(MAX_CATEGORIES_PER_USER)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: "Category order cannot contain duplicates",
      }),
  })
  .strict();

/** Which language to give the built-in categories' names. */
export const builtInNamesInputSchema = z
  .object({ locale: z.enum(locales) })
  .strict();

export const merchantRuleIdSchema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9_-]+$/u, "Rule ID has an invalid format");

export type CategoryCreateInput = z.infer<typeof categoryCreateSchema>;
export type CategoryUpdateInput = z.infer<typeof categoryUpdateSchema>;
