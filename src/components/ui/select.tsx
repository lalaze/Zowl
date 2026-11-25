"use client";

import { Check, ChevronDown } from "lucide-react";
import * as React from "react";

import { useT } from "@/components/i18n/i18n-provider";
import { cn } from "@/lib/utils";

export type SelectOption = {
  value: string;
  label: string;
  description?: string;
  leading?: React.ReactNode;
  disabled?: boolean;
};

type SelectProps = Omit<
  React.ComponentProps<"button">,
  "children" | "defaultValue" | "form" | "name" | "onChange" | "value"
> & {
  value?: string;
  defaultValue?: string;
  options: readonly SelectOption[];
  placeholder?: string;
  onValueChange?: (value: string) => void;
  name?: string;
  form?: string;
};

function nextEnabledIndex(
  options: readonly SelectOption[],
  currentIndex: number,
  direction: 1 | -1,
) {
  if (!options.length) return -1;
  for (let offset = 1; offset <= options.length; offset += 1) {
    const candidate =
      (currentIndex + direction * offset + options.length) % options.length;
    if (!options[candidate]?.disabled) return candidate;
  }
  return -1;
}

function edgeEnabledIndex(
  options: readonly SelectOption[],
  direction: 1 | -1,
) {
  const indexes = options.map((_, index) => index);
  if (direction === -1) indexes.reverse();
  return indexes.find((index) => !options[index]?.disabled) ?? -1;
}

export function Select({
  value,
  defaultValue = "",
  options,
  placeholder,
  onValueChange,
  name,
  form,
  className,
  disabled,
  id,
  ...props
}: SelectProps) {
  const t = useT();
  const generatedId = React.useId();
  const triggerId = id ?? `select-${generatedId}`;
  const listboxId = `${triggerId}-listbox`;
  const rootRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const optionRefs = React.useRef<Array<HTMLDivElement | null>>([]);
  const [open, setOpen] = React.useState(false);
  const [uncontrolledValue, setUncontrolledValue] =
    React.useState(defaultValue);
  const controlled = value !== undefined;
  const currentValue = controlled ? value : uncontrolledValue;
  const selectedIndex = options.findIndex(
    (option) => option.value === currentValue,
  );
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : undefined;
  const [activeIndex, setActiveIndex] = React.useState(
    selectedIndex >= 0 ? selectedIndex : edgeEnabledIndex(options, 1),
  );

  const openMenu = React.useCallback(() => {
    if (disabled) return;
    setActiveIndex(
      selectedIndex >= 0 && !options[selectedIndex]?.disabled
        ? selectedIndex
        : edgeEnabledIndex(options, 1),
    );
    setOpen(true);
  }, [disabled, options, selectedIndex]);

  React.useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  React.useEffect(() => {
    if (open && activeIndex >= 0) {
      optionRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex, open]);

  function choose(option: SelectOption) {
    if (option.disabled) return;
    if (!controlled) setUncontrolledValue(option.value);
    onValueChange?.(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        openMenu();
        return;
      }
      setActiveIndex((current) =>
        nextEnabledIndex(options, current, event.key === "ArrowDown" ? 1 : -1),
      );
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      if (!open) return;
      event.preventDefault();
      setActiveIndex(edgeEnabledIndex(options, event.key === "Home" ? 1 : -1));
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!open) {
        openMenu();
        return;
      }
      const option = options[activeIndex];
      if (option) choose(option);
      return;
    }
    if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    }
  }

  return (
    <div
      ref={rootRef}
      className={cn("relative", open && "z-40")}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      {name ? (
        <input
          disabled={disabled}
          form={form}
          name={name}
          type="hidden"
          value={currentValue}
        />
      ) : null}
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        role="combobox"
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-activedescendant={
          open && activeIndex >= 0
            ? `${listboxId}-option-${activeIndex}`
            : undefined
        }
        disabled={disabled}
        className={cn(
          "group flex h-[50px] w-full items-center gap-2.5 rounded-2xl border border-transparent bg-surface-muted px-4 text-left text-sm text-foreground outline-none transition-[background-color,border-color,box-shadow]",
          "hover:bg-surface-strong/60 focus:border-primary focus:bg-surface focus:ring-4 focus:ring-primary/15",
          "disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-danger aria-[invalid=true]:bg-tint-berry",
          open && "border-primary bg-surface ring-4 ring-primary/15",
          className,
        )}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={handleKeyDown}
        {...props}
      >
        {selectedOption?.leading ? (
          <span className="shrink-0">{selectedOption.leading}</span>
        ) : null}
        <span
          className={cn(
            "min-w-0 flex-1 truncate font-bold",
            !selectedOption && "font-medium text-subtle",
          )}
        >
          {selectedOption?.label ?? placeholder ?? t("Choose", "请选择")}
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-subtle transition-transform duration-200 group-hover:text-muted",
            open && "rotate-180 text-primary",
          )}
        />
      </button>

      {open ? (
        <div
          id={listboxId}
          role="listbox"
          aria-labelledby={triggerId}
          className="absolute left-0 top-full z-50 mt-2 w-full min-w-52 overflow-hidden rounded-2xl bg-surface p-1.5 shadow-[0_12px_32px_rgb(31_34_48/14%)] ring-1 ring-divider"
        >
          <div className="max-h-64 overflow-y-auto overscroll-contain">
            {options.map((option, index) => {
              const selected = option.value === currentValue;
              const active = index === activeIndex;
              return (
                <div
                  ref={(node) => {
                    optionRefs.current[index] = node;
                  }}
                  id={`${listboxId}-option-${index}`}
                  key={option.value || "__empty__"}
                  role="option"
                  aria-selected={selected}
                  aria-disabled={option.disabled || undefined}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm outline-none transition",
                    active && "bg-surface-muted text-foreground",
                    selected && "bg-primary-soft text-foreground",
                    option.disabled && "pointer-events-none opacity-45",
                  )}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => choose(option)}
                >
                  {option.leading ? (
                    <span className="shrink-0">{option.leading}</span>
                  ) : null}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">
                      {option.label}
                    </span>
                    {option.description ? (
                      <span className="mt-0.5 block truncate text-xs font-normal text-subtle">
                        {option.description}
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={cn(
                      "grid size-5 shrink-0 place-items-center rounded-full",
                      selected
                        ? "bg-primary text-on-primary"
                        : "text-transparent",
                    )}
                  >
                    <Check className="size-3" />
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
