import { contextBridge, ipcRenderer } from 'electron'

const validInvokeChannels = [
  'db:get-restaurants',
  'db:get-watch-jobs',
  'db:get-booking-history',
  'db:create-watch-job',
  'db:update-watch-job',
  'db:delete-watch-job',
  'db:fetch-restaurant-images',
  'app:get-version',
  'credentials:get-all-statuses',
  'credentials:delete',
  'credentials:browser-login'
]

const validSendChannels = []

const validReceiveChannels = [
  'images:progress',
  'images:complete',
  'monitor:job-update'
]

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
