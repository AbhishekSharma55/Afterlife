import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ToastProvider } from "../src/components/Toasts";
import { FIXTURE_ORDER } from "../src/lib/fixtures";
import { Overlay } from "../src/pages/Overlay";
import { Studio } from "../src/pages/Studio";
import { WorldView } from "../src/pages/WorldView";

function renderAt(path: string) {
  return render(
    <ToastProvider>
      <MemoryRouter
        initialEntries={[path]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/world/:worldId" element={<WorldView />} />
          <Route path="/overlay/:worldId" element={<Overlay />} />
          <Route path="/studio/:worldId" element={<Studio />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

describe.each(FIXTURE_ORDER)("fixture %s", (fixture) => {
  it.each(["world", "overlay", "studio"])(
    "renders the %s surface with a rehearsal label",
    (surface) => {
      renderAt(`/${surface}/preview?fixture=${fixture}`);
      expect(screen.getAllByText(/rehearsal/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText("Westbridge").length).toBeGreaterThan(0);
    },
  );
});

describe("world view", () => {
  it("links the episode-two dilemma to the remembered betrayal", () => {
    renderAt("/world/preview?fixture=returning");
    expect(
      screen.getByRole("heading", { name: "Blue demands an answer" }),
    ).toBeInTheDocument();
    const memory = screen.getByRole("complementary", {
      name: "The world remembers",
    });
    expect(memory).toHaveTextContent("Episode 1");
    expect(memory).toHaveTextContent(
      "The community breaks the Westbridge treaty with Blue.",
    );
    expect(screen.getByText("Unresolved grievance")).toBeInTheDocument();
    expect(
      screen.getByRole("meter", { name: "Trust between kingdoms" }),
    ).toHaveAttribute("aria-valuenow", "-20");
  });

  it("shows the live tally while voting is open", () => {
    renderAt("/world/preview?fixture=voting");
    expect(screen.getByText("Leading")).toBeInTheDocument();
    expect(screen.getByLabelText("2 votes, 100%")).toBeInTheDocument();
    expect(screen.getByRole("timer")).toBeInTheDocument();
  });

  it("explains a paused round instead of hiding it", () => {
    renderAt("/world/preview?fixture=disconnected");
    expect(
      screen.getByText(/Voting paused while chat reconnects/),
    ).toBeInTheDocument();
  });
});

describe("overlay", () => {
  it("announces the betrayal outcome", () => {
    renderAt("/overlay/preview?fixture=resolved-betrayal");
    expect(
      screen.getByText("The community chose: Break the treaty"),
    ).toBeInTheDocument();
    expect(screen.getByText("Chosen")).toBeInTheDocument();
  });

  it("shows what happened while the stream rested", () => {
    renderAt("/overlay/preview?fixture=while-away");
    // The fixture switcher has a link with the same name; check the overlay's own label.
    expect(
      screen.getByText("While you were away", {
        selector: ".ov-memory__label",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Blue prepares retaliation for the broken treaty."),
    ).toBeInTheDocument();
  });
});

describe("studio", () => {
  it("disables every control in fixture preview", () => {
    renderAt("/studio/preview?fixture=prepared");
    expect(
      screen.getByText(/controls are shown but disabled/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Open voting/ })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /End episode 1/ }),
    ).toBeDisabled();
  });

  it("guides the creator from a resting world to the next episode", () => {
    renderAt("/studio/preview?fixture=while-away");
    expect(
      screen.getByRole("heading", { name: "Begin episode 2" }),
    ).toBeInTheDocument();
  });

  it("explains why a paused rehearsal round cannot resume", () => {
    renderAt("/studio/preview?fixture=disconnected");
    expect(
      screen.getByRole("heading", { name: "Voting is paused" }),
    ).toBeInTheDocument();
  });
});
