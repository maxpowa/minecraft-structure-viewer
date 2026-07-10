// setTimeout-based yields get throttled hard in background tabs, stalling
// builds whenever the tab loses focus. scheduler.yield (or a MessageChannel
// task where unsupported) yields the event loop without timer throttling.
export const yieldTask = globalThis.scheduler?.yield
  ? () => scheduler.yield()
  : () => new Promise(r => {
    const c = new MessageChannel()
    c.port1.onmessage = () => { c.port1.close(); r() }
    c.port2.postMessage(0)
  })
