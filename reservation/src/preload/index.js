import { contextBridge, ipcRenderer } from 'electron'

const validInvokeChannels = [
  'db:get-restaurants',
  'db:get-watch-jobs',
  'db:get-booking-history',
  'db:create-watch-job',
  'db:update-watch-job',
  'db:delete-watch-job',
  'app:get-version'
]

const validSendChannels = []

const validReceiveChannels = []

contextBridge.exposeInMainWorld('api', {
  invoke: (channel, ...args) => {
    if (validInvokeChannels.includes(channel)) {
      return ipcRenderer.invoke(channel, ...args)
    }
    throw new Error(`IPC invoke not allowed for channel: ${channel}`)
  },

  send: (channel, ...args) => {
    if (validSendChannels.includes(channel)) {
      ipcRenderer.send(channel, ...args)
    }
  },

  on: (channel, callback) => {
    if (validReceiveChannels.includes(channel)) {
      const subscription = (_event, ...args) => callback(...args)
      ipcRenderer.on(channel, subscription)
      return () => ipcRenderer.removeListener(channel, subscription)
    }
  }
})
