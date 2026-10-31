import { Link, Route, Routes } from "react-router-dom";
import { PageMessage } from "./components/Shell";
import { ToastProvider } from "./components/Toasts";
import { Home } from "./pages/Home";
import { Overlay } from "./pages/Overlay";
import { Studio } from "./pages/Studio";
import { StudioEntry } from "./pages/StudioEntry";
import { WorldView } from "./pages/WorldView";

export function App() {
  return (
    <ToastProvider>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/studio" element={<StudioEntry />} />
        <Route path="/studio/:worldId" element={<Studio />} />
        <Route path="/world/:worldId" element={<WorldView />} />
        <Route path="/overlay/:worldId" element={<Overlay />} />
        <Route
          path="*"
          element={
            <PageMessage
              title="This path leads nowhere"
              action={
                <Link className="btn" to="/">
                  Back to start
                </Link>
              }
            />
          }
        />
      </Routes>
    </ToastProvider>
  );
}
