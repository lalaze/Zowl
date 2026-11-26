import { Flame, PiggyBank } from "lucide-react";

import { Card } from "@/components/ui/card";
import { translator, type Locale } from "@/lib/i18n/locale";
import { formatMoney } from "@/lib/money";

import { STREAK_DAYS, type HomeModel } from "./home-model";

export function DesktopStreakSavingsRow({
  locale,
  model,
}: {
  locale: Locale;
  model: HomeModel;
}) {
  const t = translator(locale);

  return (
    <section className="grid h-[109px] shrink-0 grid-cols-[1.14fr_1fr] gap-4">
      <Card className="flex h-full items-center gap-4 px-6 py-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-[16px] bg-tint-amber">
          <Flame className="size-6 fill-primary text-accent-text" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-baseline gap-2 text-[13px] font-black text-foreground">
            {t(
              `Tracking streak ${model.checkedDays} days`,
              `连续记账 ${model.checkedDays} 天`,
            )}
            <span className="text-[10px] text-accent-text">
              {t(
                `Completed ${model.litDots} / ${STREAK_DAYS}`,
                `已点亮 ${model.litDots} / ${STREAK_DAYS}`,
              )}
            </span>
          </p>
          <div
            aria-label={t(
              `Light up ${model.litDots} tracking streak dots`,
              `已点亮 ${model.litDots} 个记账圆点`,
            )}
            className="mt-2 flex items-center gap-[6px]"
            role="img"
          >
            {Array.from({ length: STREAK_DAYS }, (_, index) => (
              <span
                className={`size-3 rounded-full ${
                  index < model.litDots ? "bg-primary" : "bg-surface-strong"
                } ${index === model.litDots ? "ring-4 ring-tint-amber" : ""}`}
                key={index}
              />
            ))}
          </div>
          <p className="mt-2 text-[10px] font-bold text-muted">
            {model.litDots < STREAK_DAYS
              ? t(
                  `Keep going for ${STREAK_DAYS - model.litDots} days to unlock the Tracking Star badge`,
                  `再坚持 ${STREAK_DAYS - model.litDots} 天，解锁「记账之星」徽章`,
                )
              : t(
                  "All tracking days complete this month. Well done!",
                  "本月打卡已集满，太棒了！",
                )}
          </p>
        </div>
      </Card>

      <Card className="flex h-full items-center gap-4 px-6 py-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-[16px] bg-tint-leaf">
          <PiggyBank className="size-6 text-income" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-black text-foreground">
            {t("Monthly savings", "本月储蓄")}{" "}
            <span className="text-[12px] tabular-nums">
              {formatMoney(Math.max(model.savingsMinor, 0))}
            </span>
            <span className="ml-1 text-[10px] text-muted">
              {t("/ Goal ", "/ 目标 ")}
              {formatMoney(model.savingsGoalMinor)}
            </span>
          </p>
          <div className="mt-2 flex items-center gap-3">
            <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-strong">
              <div
                className="h-full rounded-full bg-income"
                style={{ width: `${model.savingsPercent}%` }}
              />
            </div>
            <span className="text-[13px] font-black text-income tabular-nums">
              {model.savingsPercent}%
            </span>
          </div>
          <p className="mt-1 text-[10px] font-bold text-muted">
            {t(
              "Every entry helps your savings grow!",
              "每记一笔，积蓄就多一分！",
            )}
          </p>
        </div>
      </Card>
    </section>
  );
}
