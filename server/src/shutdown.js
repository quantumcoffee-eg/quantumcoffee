export function installShutdown({ server, worker, disconnect, runtime = process, deadlineMs = 25000,
  log = code => console.error('Quantum shutdown:', code) }) {
  let stopping;
  const stop = () => {
    if (stopping) return stopping;
    const deadline = setTimeout(() => { worker?.abort(); server.closeAllConnections?.(); log('DEADLINE_REACHED'); runtime.exit(1); }, deadlineMs);
    stopping = (async () => {
      try {
        await Promise.all([new Promise(resolve => server.close(resolve)), worker?.stop()]);
        await disconnect();
        runtime.exitCode = 0;
      } catch { log('CLEANUP_FAILED'); runtime.exitCode = 1; }
      finally { clearTimeout(deadline); runtime.removeListener('SIGTERM', stop); runtime.removeListener('SIGINT', stop); }
    })();
    return stopping;
  };
  runtime.once('SIGTERM', stop); runtime.once('SIGINT', stop);
  return stop;
}
