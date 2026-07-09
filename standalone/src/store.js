const runs = [];

export function listRuns() {
  return [...runs].sort((a, b) => new Date(b.started_at) - new Date(a.started_at));
}

export function getRun(runId) {
  return runs.find((run) => run.id === runId) ?? null;
}

export function saveRun(run) {
  runs.push(run);
  return run;
}
