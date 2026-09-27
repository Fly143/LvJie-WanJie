const fs = require('fs')
const path = require('path')

const ktPath = path.resolve('android/app/src/main/java/com/lvjie/app/MainActivity.kt')
let kt = fs.readFileSync(ktPath, 'utf8')

// 1) Bridge 增加 httpStream / httpAbort
const bridgeAnchor = `        @JavascriptInterface
        fun httpRequest(id: String, url: String, method: String, headersJson: String?, body: String?, timeoutMs: Int) {`
const bridgeNew = `        /** 流式：增量读 body，按 chunk 回传 JS（SSE 文本透传，解析在 JS 层） */
        @JavascriptInterface
        fun httpStream(id: String, url: String, method: String, headersJson: String?, body: String?, timeoutMs: Int) {
            httpExecutor.execute {
                var conn: HttpURLConnection? = null
                try {
                    if (!isAllowedApiUrl(url)) {
                        postStreamEnd(id, false, 0, "地址不被允许", false)
                        return@execute
                    }
                    val methodU = method.uppercase()
                    if (methodU !in setOf("GET", "POST", "PUT", "PATCH", "DELETE", "HEAD")) {
                        postStreamEnd(id, false, 0, "不允许的 HTTP 方法", false)
                        return@execute
                    }
                    activeStreams[id] = true
                    var curUrl = url
                    var curMethod = methodU
                    var curBody = body
                    var hop = 0
                    while (hop < 5) {
                        val u = URL(curUrl)
                        conn = u.openConnection() as HttpURLConnection
                        conn!!.requestMethod = curMethod
                        conn!!.connectTimeout = timeoutMs.coerceIn(1000, 180000)
                        conn!!.readTimeout = conn!!.connectTimeout
                        conn!!.instanceFollowRedirects = false
                        try {
                            val headers = JSONObject(headersJson ?: "{}")
                            val keys = headers.keys()
                            while (keys.hasNext()) {
                                val k = keys.next()
                                conn!!.setRequestProperty(k, headers.optString(k))
                            }
                        } catch (_: Exception) {}
                        if (curMethod != "GET" && curMethod != "HEAD" && curBody != null) {
                            conn!!.doOutput = true
                            conn!!.outputStream.use { it.write(curBody.toByteArray(Charsets.UTF_8)) }
                        }
                        val code = conn!!.responseCode
                        if (code in setOf(301, 302, 303, 307, 308)) {
                            val loc = conn?.getHeaderField("Location") ?: break
                            val next = try { URL(URL(curUrl), loc).toString() } catch (_: Exception) {
                                postStreamEnd(id, false, 0, "非法重定向地址", false)
                                return@execute
                            }
                            if (!isAllowedApiUrl(next)) {
                                postStreamEnd(id, false, 0, "重定向目标不被允许", false)
                                return@execute
                            }
                            if (code == 303 || ((code == 301 || code == 302) && curMethod != "GET" && curMethod != "HEAD")) {
                                curMethod = "GET"
                                curBody = null
                            }
                            conn?.disconnect()
                            curUrl = next
                            hop++
                            continue
                        }
                        // 非重定向：开始流式读
                        val stream = if (code >= 400) conn?.errorStream else conn?.inputStream
                        postStreamHead(id, code, conn)
                        if (stream == null) {
                            postStreamEnd(id, code in 200..299, code, if (code >= 400) "HTTP $code" else null, false)
                            return@execute
                        }
                        val buf = ByteArray(8192)
                        stream.use { input ->
                            while (true) {
                                if (activeStreams[id] != true) {
                                    postStreamEnd(id, false, code, "已取消", true)
                                    return@execute
                                }
                                val n = input.read(buf)
                                if (n < 0) break
                                if (n == 0) continue
                                postStreamChunk(id, String(buf, 0, n, Charsets.UTF_8))
                            }
                        }
                        postStreamEnd(id, code in 200..299, code, if (code >= 400) "HTTP $code" else null, false)
                        return@execute
                    }
                    postStreamEnd(id, false, 0, "重定向过多", false)
                } catch (e: Exception) {
                    val aborted = activeStreams[id] != true
                    postStreamEnd(id, false, 0, e.message ?: "网络错误", aborted)
                } finally {
                    activeStreams.remove(id)
                    try { conn?.disconnect() } catch (_: Exception) {}
                }
            }
        }

        @JavascriptInterface
        fun httpAbort(id: String) {
            activeStreams[id] = false
        }

        @JavascriptInterface
        fun httpRequest(id: String, url: String, method: String, headersJson: String?, body: String?, timeoutMs: Int) {`

if (!kt.includes(bridgeAnchor)) {
  console.log('MISS bridge anchor')
  process.exit(1)
}
kt = kt.split(bridgeAnchor).join(bridgeNew)
console.log('OK bridge-stream')

// 2) activeStreams 字段
if (!kt.includes('activeStreams')) {
  kt = kt.replace(
    'private var filePathCallback: ValueCallback<Array<Uri>>? = null',
    'private var filePathCallback: ValueCallback<Array<Uri>>? = null\n    private val activeStreams = java.util.concurrent.ConcurrentHashMap<String, Boolean>()'
  )
  console.log('OK activeStreams')
}

// 3) 回传函数
const postAnchor = `    private fun postResult(id: String, ok: Boolean, status: Int, text: String, error: String?) {`
const postNew = `    private fun postStreamChunk(id: String, text: String) {
        val payload = JSONObject().put("id", id).put("text", text).toString()
        val js = "window.__awHostStreamChunk&&window.__awHostStreamChunk(" + JSONObject.quote(payload) + ")"
        runOnUiThread {
            if (this::webView.isInitialized) webView.evaluateJavascript(js, null)
        }
    }

    private fun postStreamHead(id: String, status: Int, conn: HttpURLConnection?) {
        val headers = JSONObject()
        try {
            conn?.headerFields?.forEach { (k, v) ->
                if (k != null) headers.put(k, v.joinToString(","))
            }
        } catch (_: Exception) {}
        val payload = JSONObject().put("id", id).put("status", status).put("headers", headers).toString()
        val js = "window.__awHostStreamHead&&window.__awHostStreamHead(" + JSONObject.quote(payload) + ")"
        runOnUiThread {
            if (this::webView.isInitialized) webView.evaluateJavascript(js, null)
        }
    }

    private fun postStreamEnd(id: String, ok: Boolean, status: Int, error: String?, aborted: Boolean) {
        val payload = JSONObject()
            .put("id", id)
            .put("ok", ok)
            .put("status", status)
            .put("error", error ?: "")
            .put("aborted", aborted)
            .toString()
        val js = "window.__awHostStreamEnd&&window.__awHostStreamEnd(" + JSONObject.quote(payload) + ")"
        runOnUiThread {
            if (this::webView.isInitialized) webView.evaluateJavascript(js, null)
        }
    }

    private fun postResult(id: String, ok: Boolean, status: Int, text: String, error: String?) {`

if (!kt.includes(postAnchor)) {
  console.log('MISS postResult anchor')
  process.exit(1)
}
kt = kt.split(postAnchor).join(postNew)
console.log('OK stream-posters')

// 4) injectBridge：真流式接口
const oldJsStart = 'window.awHost={http:{request:req,abort:function(){return Promise.resolve({ok:true})},onChunk:function(){return function(){}},onEnd:function(){return function(){}},onHead:function(){return function(){}}}'
const newJsStart = 'window.awHost={http:{request:req,stream:function(r){return new Promise(function(res){var id=\'s\'+Math.random().toString(36).slice(2);try{AndroidHttp.httpStream(id,String(r.url||\'\'),String(r.method||\'POST\'),JSON.stringify(r.headers||{}),r.body==null?null:String(r.body),Number(r.timeoutMs||180000));res({ok:true,id:id})}catch(e){res({ok:false,error:String(e)})}})},abort:function(id){try{AndroidHttp.httpAbort(String(id||\'\'))}catch(e){};return Promise.resolve({ok:true})},onChunk:function(fn){if(typeof fn!==\'function\')return function(){};window.__awHostStreamCbs.chunk.push(fn);return function(){var a=window.__awHostStreamCbs.chunk;var i=a.indexOf(fn);if(i>=0)a.splice(i,1)}},onEnd:function(fn){if(typeof fn!==\'function\')return function(){};window.__awHostStreamCbs.end.push(fn);return function(){var a=window.__awHostStreamCbs.end;var i=a.indexOf(fn);if(i>=0)a.splice(i,1)}},onHead:function(fn){if(typeof fn!==\'function\')return function(){};window.__awHostStreamCbs.head.push(fn);return function(){var a=window.__awHostStreamCbs.head;var i=a.indexOf(fn);if(i>=0)a.splice(i,1)}}}'

if (!kt.includes(oldJsStart)) {
  console.log('MISS injectBridge js')
  process.exit(1)
}
kt = kt.split(oldJsStart).join(newJsStart)
console.log('OK injectBridge-stream')

// 在 IIFE 开头注入 stream cbs 分发器
const jsPrefix = '(function(){if(window.awHost)return;var cbs={};'
const jsPrefixNew = '(function(){if(window.awHost)return;var cbs={};window.__awHostStreamCbs={chunk:[],end:[],head:[]};window.__awHostStreamChunk=function(p){try{var o=typeof p===\'string\'?JSON.parse(p):p;var a=window.__awHostStreamCbs.chunk.slice();for(var i=0;i<a.length;i++){try{a[i](o)}catch(e){}}}catch(e){}};window.__awHostStreamEnd=function(p){try{var o=typeof p===\'string\'?JSON.parse(p):p;var a=window.__awHostStreamCbs.end.slice();for(var i=0;i<a.length;i++){try{a[i](o)}catch(e){}}}catch(e){}};window.__awHostStreamHead=function(p){try{var o=typeof p===\'string\'?JSON.parse(p):p;var a=window.__awHostStreamCbs.head.slice();for(var i=0;i<a.length;i++){try{a[i](o)}catch(e){}}}catch(e){}};'
if (!kt.includes(jsPrefix)) {
  console.log('MISS js prefix')
  process.exit(1)
}
kt = kt.split(jsPrefix).join(jsPrefixNew)
console.log('OK stream-dispatcher')

fs.writeFileSync(ktPath, kt)
console.log('written')
