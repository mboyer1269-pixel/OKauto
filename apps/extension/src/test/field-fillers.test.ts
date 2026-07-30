import { describe, expect, it, vi } from "vitest";
import { fillText, formatPriceForInput, pickDropdownOption, stagePhotos } from "../lib/field-fillers.js";
import { OkAutoApiClient } from "../lib/api-client.js";

describe("fillText", () => {
  it("sets value on inputs and dispatches input+change", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    const events: string[] = [];
    input.addEventListener("input", () => events.push("input"));
    input.addEventListener("change", () => events.push("change"));
    expect(fillText(input, "2021 Toyota Camry")).toBe(true);
    expect(input.value).toBe("2021 Toyota Camry");
    expect(events).toEqual(["input", "change"]);
    input.remove();
  });

  it("sets text on contenteditable", () => {
    const div = document.createElement("div");
    div.contentEditable = "true";
    // jsdom needs isContentEditable polyfill-ish behavior:
    Object.defineProperty(div, "isContentEditable", { value: true });
    document.body.appendChild(div);
    expect(fillText(div, "Hello description")).toBe(true);
    expect(div.textContent).toBe("Hello description");
    div.remove();
  });

  it("rejects unsupported elements", () => {
    const span = document.createElement("span");
    expect(fillText(span, "x")).toBe(false);
  });
});

describe("pickDropdownOption", () => {
  it("clicks the matching option by text", async () => {
    vi.useFakeTimers();
    const trigger = document.createElement("div");
    trigger.setAttribute("role", "combobox");
    document.body.appendChild(trigger);
    const listbox = document.createElement("div");
    listbox.setAttribute("role", "listbox");
    listbox.innerHTML = `<div role="option">2020</div><div role="option">2021</div>`;
    document.body.appendChild(listbox);

    const clicked: string[] = [];
    for (const opt of listbox.querySelectorAll("[role='option']")) {
      (opt as HTMLElement).addEventListener("click", () => clicked.push(opt.textContent!));
    }
    const promise = pickDropdownOption(document, trigger, "2021", 10);
    await vi.advanceTimersByTimeAsync(20);
    expect(await promise).toBe(true);
    expect(clicked).toEqual(["2021"]);
    vi.useRealTimers();
  });
});

describe("stagePhotos", () => {
  it("assigns files through DataTransfer and fires change (jsdom stub)", () => {
    const input = document.createElement("input");
    input.type = "file";
    document.body.appendChild(input);
    let changed = 0;
    input.addEventListener("change", () => (changed += 1));

    // jsdom has no DataTransfer/FileList implementation — stub the contract.
    const files: File[] = [];
    const fakeDt = {
      items: { add: (file: File) => files.push(file) },
      files,
      get length() {
        return files.length;
      },
    } as unknown as DataTransfer;
    let assigned: File[] = [];
    Object.defineProperty(input, "files", {
      get: () => (assigned.length > 0 ? assigned : files),
      set: (value: File[]) => {
        assigned = Array.from(value ?? []);
      },
      configurable: true,
    });

    const count = stagePhotos(
      input,
      [{ name: "p1.jpg", type: "image/jpeg", bytes: new Uint8Array([1, 2, 3]) }],
      fakeDt,
    );
    expect(count).toBe(1);
    expect(files).toHaveLength(1);
    expect(files[0]?.name).toBe("p1.jpg");
    expect(changed).toBe(1);
    input.remove();
  });
});

describe("formatPriceForInput", () => {
  it("converts cents to whole dollars", () => {
    expect(formatPriceForInput(2199500)).toBe("21995");
    expect(formatPriceForInput(2199550)).toBe("21996");
  });
});

describe("OkAutoApiClient", () => {
  it("sends PAT bearer header and parses responses", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchFn = (async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ items: [] }), { status: 200 });
    }) as unknown as typeof fetch;
    const client = new OkAutoApiClient("http://api.test/", "oka_ext_abc", fetchFn);
    await client.myQueue();
    expect(calls[0]?.url).toBe("http://api.test/api/v1/listings/queue/mine");
    expect((calls[0]?.init.headers as Record<string, string>).authorization).toBe("Bearer oka_ext_abc");
  });

  it("maps API errors to ApiError with code", async () => {
    const fetchFn = (async () =>
      new Response(JSON.stringify({ error: { code: "NOT_FOUND", message: "Listing not found" } }), {
        status: 404,
      })) as unknown as typeof fetch;
    const client = new OkAutoApiClient("http://api.test", "oka_ext_abc", fetchFn);
    await expect(client.myQueue()).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
  });
});
