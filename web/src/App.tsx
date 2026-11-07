import { useEffect, useState } from "react";

type Health =
  | { state: "loading" }
  | { state: "ok"; body: unknown }
  | { state: "error"; message: string };

// Placeholder page: checks that the UI can reach the API through /api.
export default function App() {
  const [health, setHealth] = useState<Health>({ state: "loading" });

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/health", { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        setHealth({ state: "ok", body: await res.json() });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        setHealth({
          state: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      });

    return () => controller.abort();
  }, []);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-3xl font-bold">Sunday School Scheduler</h1>
      <h2 className="mt-6 text-xl font-semibold">API health</h2>
      {health.state === "loading" && <p className="mt-2">Checking…</p>}
      {health.state === "ok" && (
        <pre className="mt-2 rounded-md bg-gray-100 p-3 font-mono text-sm dark:bg-gray-800">
          {JSON.stringify(health.body, null, 2)}
        </pre>
      )}
      {health.state === "error" && (
        <p role="alert" className="mt-2 text-red-700 dark:text-red-400">
          Couldn't reach the API ({health.message}). Is it running?
        </p>
      )}
    </main>
  );
}
