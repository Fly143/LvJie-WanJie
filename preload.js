// 渲染进程桥：仅暴露 HTTP 代理与密钥存取，不暴露 Node
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('awHost', {
  http: {
    request: (req) => ipcRenderer.invoke('aw:http', req)
  },
  secrets: {
    load: () => ipcRenderer.invoke('aw:secrets:load'),
    save: (payload) => ipcRenderer.invoke('aw:secrets:save', payload),
    clear: () => ipcRenderer.invoke('aw:secrets:clear')
  }
})
