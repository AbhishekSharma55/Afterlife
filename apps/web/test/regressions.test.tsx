import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, renderHook, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type { WorldEvent, WorldSnapshot } from "@afterlife/shared";
import { Chronicle } from "../src/components/Chronicle";
import { ToastProvider } from "../src/components/Toasts";
import { api, ApiError } from "../src/lib/api";
import { getFixture } from "../src/lib/fixtures";
import { useCommand } from "../src/lib/useCommand";
import { useWorld } from "../src/lib/useWorld";

function event(
  sequence: number,
  kind: WorldEvent["kind"],
  worldId = "world-a",
): WorldEvent {
  const base = getFixture("returning").recentEvents[0]!;
  return {
    ...base,
    id: `${worldId}-ev-${sequence}`,
    worldId,
    sequence,
    kind,
    summary: `${kind} ${sequence}`,
    causeEventIds: [],
  } as WorldEvent;
}

afterEach(() => vi.restoreAllMocks());

describe("Chronicle", () => {
  it("keeps history controls when only episode boundaries are recent (FE-03)", () => {
    const events = [event(30, "episode_ended"), event(29, "episode_started")];
    render(
      <Chronicle events={events} known={{}} hasOlder onLoadOlder={() => {}} />,
    );
    expect(
      screen.getByRole("button", { name: /show all events/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /load older history/i }),
    ).toBeInTheDocument();
  });

  it("shows a selected cause that falls outside the visible limit (FE-04)", () => {
    const events = [6, 5, 4, 3, 2, 1].map((n) => event(n, "decision_resolved"));
    const known = Object.fromEntries(events.map((e) => [e.id, e]));
    const { container } = render(
      <Chronicle
        events={events}
        known={known}
        limit={5}
        selectedId={events[5]!.id}
        onSelect={() => {}}
      />,
    );
    expect(container.querySelector(`#event-${events[5]!.id}`)).toHaveClass(
      "entry--selected",
    );
  });
});

describe("useCommand", () => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ToastProvider>{children}</ToastProvider>
  );

  it("keeps the request ID after a server error (FE-05)", async () => {
    const ids: string[] = [];
    const { result } = renderHook(() => useCommand(() => {}), { wrapper });
    const failing = async (id: string): Promise<WorldSnapshot> => {
      ids.push(id);
      throw new ApiError(500, "internal", "Server error");
    };
    await act(() => result.current.run("start", failing));
    await act(() => result.current.run("start", failing));
    expect(ids[0]).toBe(ids[1]);
  });

  it("drops the request ID after a definite rejection", async () => {
    const ids: string[] = [];
    const { result } = renderHook(() => useCommand(() => {}), { wrapper });
    const failing = async (id: string): Promise<WorldSnapshot> => {
      ids.push(id);
      throw new ApiError(409, "conflict", "Conflict");
    };
    await act(() => result.current.run("start", failing));
    await act(() => result.current.run("start", failing));
    expect(ids[0]).not.toBe(ids[1]);
  });

  it("reports an expired session so sign-in can be shown (FE-02)", async () => {
    const onUnauthorized = vi.fn();
    const { result } = renderHook(() => useCommand(() => {}, onUnauthorized), {
      wrapper,
    });
    await act(() =>
      result.current.run("start", async () => {
        throw new ApiError(401, "unauthorized", "Sign in again");
      }),
    );
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });
});

describe("useWorld", () => {
  it("ignores a history page that arrives after switching worlds (FE-01)", async () => {
    class FakeSource {
      static CLOSED = 2;
      readyState = 0;
      addEventListener() {}
      close() {}
    }
    vi.stubGlobal("EventSource", FakeSource);
    const snapshotFor = (worldId: string) => {
      const fixture = getFixture("returning");
      return {
        ...fixture,
        worldId,
        recentEvents: [event(40, "decision_resolved", worldId)],
      } as WorldSnapshot;
    };
    vi.spyOn(api, "getWorld").mockImplementation(async (id) => snapshotFor(id));
    let releaseA!: () => void;
    vi.spyOn(api, "history").mockImplementation(
      (id) =>
        new Promise((resolve) => {
          const page = {
            events: [event(1, "world_created", id)],
            nextCursor: null,
          };
          if (id === "world-a") releaseA = () => resolve(page as never);
        }),
    );

    const { result, rerender } = renderHook(({ id }) => useWorld(id), {
      initialProps: { id: "world-a" },
    });
    await act(async () => {});
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.loadOlderHistory();
    });
    rerender({ id: "world-b" });
    await act(async () => {});
    await act(async () => {
      releaseA();
      await pending;
    });

    expect(Object.keys(result.current.events)).toEqual(["world-b-ev-40"]);
    expect(result.current.hasOlderHistory).toBe(true);
    vi.unstubAllGlobals();
  });
});
