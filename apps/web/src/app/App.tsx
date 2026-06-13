import { useEffect, useState } from "react";
import { getHealth } from "./api";

type Status =
  | { kind: "loading" }
  | { kind: "ok"; service: string }
  | { kind: "error" };

export function App() {
  const [status, setStatus] = useState<Status>({ kind: "loading" });

  useEffect(() => {
    getHealth()
      .then((h) => setStatus({ kind: "ok", service: h.service }))
      .catch(() => setStatus({ kind: "error" }));
  }, []);

  return (
    <main>
      <h1>CodeSage</h1>
      <p data-testid="status">
        {status.kind === "loading" && "Checking API…"}
        {status.kind === "ok" && `API healthy: ${status.service}`}
        {status.kind === "error" && "API unreachable"}
      </p>
    </main>
  );
}
