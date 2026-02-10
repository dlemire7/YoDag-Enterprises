export function useIpc() {
  const api = window.api

  if (!api) {
    console.warn('window.api is not available. IPC calls will be no-ops.')
    return {
      invoke: async () => null,
      send: () => {},
      on: () => () => {}
    }
  }

  return {
    invoke: (channel, ...args) => api.invoke(channel, ...args),
    send: (channel, ...args) => api.send(channel, ...args),
    on: (channel, callback) => api.on(channel, callback)
  }
}
