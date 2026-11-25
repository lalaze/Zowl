// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { useState } from "react";

import { Select, type SelectOption } from "@/components/ui/select";

const options: SelectOption[] = [
  { value: "", label: "All sources" },
  { value: "alipay", label: "Alipay" },
  { value: "wechat", label: "WeChat Pay" },
  { value: "disabled", label: "Unavailable", disabled: true },
];

const originalScrollIntoView = Element.prototype.scrollIntoView;

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(cleanup);

afterAll(() => {
  Element.prototype.scrollIntoView = originalScrollIntoView;
});

describe("Select", () => {
  it("supports controlled selection and an external label", () => {
    function ControlledSelect() {
      const [value, setValue] = useState("");
      return (
        <div>
          <label htmlFor="source">Source</label>
          <Select
            id="source"
            onValueChange={setValue}
            options={options}
            value={value}
          />
        </div>
      );
    }

    render(<ControlledSelect />);
    const trigger = screen.getByRole("combobox", { name: "Source" });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("option", { name: "Alipay" }));

    expect(trigger).toHaveTextContent("Alipay");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("submits an uncontrolled value through a native form", () => {
    render(
      <form data-testid="filters">
        <Select
          defaultValue=""
          name="source"
          options={options}
        />
      </form>,
    );

    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(screen.getByRole("option", { name: "WeChat Pay" }));

    const form = screen.getByTestId("filters") as HTMLFormElement;
    expect(new FormData(form).get("source")).toBe("wechat");
  });

  it("supports keyboard selection and skips disabled options", () => {
    const onValueChange = vi.fn();
    render(
      <Select
        onValueChange={onValueChange}
        options={options}
        value="wechat"
      />,
    );

    const trigger = screen.getByRole("combobox");
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.keyDown(trigger, { key: "Enter" });

    expect(onValueChange).toHaveBeenCalledWith("");
  });
});
