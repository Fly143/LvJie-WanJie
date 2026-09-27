package com.lvjie.app

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import org.json.JSONObject
import java.io.BufferedReader
import java.io.File
import java.io.InputStreamReader
import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.URL
import java.util.concurrent.Executors

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private val httpExecutor = Executors.newCachedThreadPool()
    private var server: ServerSocket? = null
    private var filePathCallback: ValueCallback<Array<Uri>>? = null

    inner class Bridge {
        @JavascriptInterface
        fun httpRequest(id: String, url: String, method: String, headersJson: String?, body: String?, timeoutMs: Int) {
            httpExecutor.execute {
                var conn: HttpURLConnection? = null
                try {
                    if (!isAllowedApiUrl(url)) {
                        postResult(id, false, 0, "", "地址不被允许")
                        return@execute
                    }
                    val methodU = method.uppercase()
                    if (methodU !in setOf("GET", "POST", "PUT", "PATCH", "DELETE", "HEAD")) {
                        postResult(id, false, 0, "", "不允许的 HTTP 方法")
                        return@execute
                    }
                    val u = URL(url)
                    conn = u.openConnection() as HttpURLConnection
                    conn.requestMethod = methodU
                    conn.connectTimeout = timeoutMs.coerceIn(1000, 180000)
                    conn.readTimeout = conn.connectTimeout
                    // 重定向逐跳校验，防 30x 绕过
                    conn.instanceFollowRedirects = false
                    try {
                        val headers = JSONObject(headersJson ?: "{}")
                        val keys = headers.keys()
                        while (keys.hasNext()) {
                            val k = keys.next()
                            conn.setRequestProperty(k, headers.optString(k))
                        }
                    } catch (_: Exception) {}
                    if (methodU != "GET" && methodU != "HEAD" && body != null) {
                        conn.doOutput = true
                        conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
                    }
                    var code = conn.responseCode
                    var hop = 0
                    var curUrl = url
                    var curMethod = methodU
                    var curBody = body
                    while (code in setOf(301, 302, 303, 307, 308) && hop < 5) {
                        val loc = conn.getHeaderField("Location") ?: break
                        val next = try {
                            URL(URL(curUrl), loc).toString()
                        } catch (_: Exception) {
                            postResult(id, false, 0, "", "非法重定向地址")
                            return@execute
                        }
                        if (!isAllowedApiUrl(next)) {
                            postResult(id, false, 0, "", "重定向目标不被允许")
                            return@execute
                        }
                        // 301/302/303 非 GET 降级 GET 并丢 body
                        val downgrade = code == 303 || ((code == 301 || code == 302) && curMethod != "GET" && curMethod != "HEAD")
                        if (downgrade) {
                            curMethod = "GET"
                            curBody = null
                        }
                        conn.disconnect()
                        val nu = URL(next)
                        conn = nu.openConnection() as HttpURLConnection
                        conn.requestMethod = curMethod
                        conn.connectTimeout = timeoutMs.coerceIn(1000, 180000)
                        conn.readTimeout = conn.connectTimeout
                        conn.instanceFollowRedirects = false
                        try {
                            val headers = JSONObject(headersJson ?: "{}")
                            val keys = headers.keys()
                            val sameOrigin = try {
                                URL(curUrl).host.equals(nu.host, true) && URL(curUrl).protocol == nu.protocol
                            } catch (_: Exception) { false }
                            while (keys.hasNext()) {
                                val k = keys.next()
                                val lk = k.lowercase()
                                // 跨 origin 剥掉认证头，防 Bearer Key 外带
                                if (!sameOrigin && (lk == "authorization" || lk == "cookie" || lk == "proxy-authorization")) continue
                                conn.setRequestProperty(k, headers.optString(k))
                            }
                        } catch (_: Exception) {}
                        if (conn.requestMethod != "GET" && conn.requestMethod != "HEAD" && curBody != null) {
                            conn.doOutput = true
                            conn.outputStream.use { it.write(curBody.toByteArray(Charsets.UTF_8)) }
                        }
                        curUrl = next
                        code = conn.responseCode
                        hop++
                    }
                    val stream = if (code >= 400) conn.errorStream else conn.inputStream
                    val text = stream?.readBytes()?.toString(Charsets.UTF_8) ?: ""
                    postResult(id, true, code, text, null)
                } catch (e: Exception) {
                    postResult(id, false, 0, "", e.message ?: "网络错误")
                } finally {
                    conn?.disconnect()
                }
            }
        }
    }

    /** 仅本机静态服页面可注入桥 */
    private fun isTrustedPage(url: String?): Boolean {
        return try {
            val u = URL(url ?: return false)
            (u.protocol == "http") && (u.host == "127.0.0.1" || u.host == "localhost")
        } catch (_: Exception) {
            false
        }
    }

    /** 仅允许 http(s)；拒绝云元数据/链路本地；默认 https，http 仅本机 */
    private fun isAllowedApiUrl(raw: String): Boolean {
        return try {
            val u = URL(raw)
            val scheme = u.protocol.lowercase()
            if (scheme != "http" && scheme != "https") return false
            val h = (u.host ?: "").lowercase()
            if (h.isEmpty()) return false
            if (h in setOf("0.0.0.0", "169.254.169.254", "metadata.google.internal")) return false
            if (h == "localhost" || h == "127.0.0.1" || h == "::1" || h == "[::1]") return true
            // 对外只允许 https
            scheme == "https"
        } catch (_: Exception) {
            false
        }
    }

    private fun postResult(id: String, ok: Boolean, status: Int, text: String, error: String?) {
        val payload = JSONObject()
            .put("id", id)
            .put("ok", ok)
            .put("status", status)
            .put("text", text)
            .put("error", error ?: "")
            .toString()
        val js = "window.__awHostHttpCb&&window.__awHostHttpCb(" + JSONObject.quote(payload) + ")"
        runOnUiThread {
            if (this::webView.isInitialized) webView.evaluateJavascript(js, null)
        }
    }

    private fun startLocalServer(): Int {
        val sock = ServerSocket()
        try {
            sock.bind(InetSocketAddress("127.0.0.1", 8765))
        } catch (e: Exception) {
            sock.bind(InetSocketAddress("127.0.0.1", 0))
        }
        server = sock
        val port = sock.localPort
        Thread {
            while (!sock.isClosed) {
                try {
                    val client = sock.accept()
                    httpExecutor.execute { handleHttp(client) }
                } catch (_: Exception) {
                    break
                }
            }
        }.start()
        return port
    }

    private fun handleHttp(client: java.net.Socket) {
        client.use { s ->
            try {
                val input = BufferedReader(InputStreamReader(s.getInputStream(), Charsets.UTF_8))
                val line = input.readLine() ?: return
                val path = line.split(" ").getOrNull(1) ?: "/"
                var rel = path.substringBefore("?").removePrefix("/")
                if (rel.isEmpty() || rel.endsWith("/")) rel += "index.html"
                if (rel.contains("..")) {
                    writeResp(s, 400, "text/plain", "bad")
                    return
                }
                val file = "www/$rel"
                val bytes = try {
                    assets.open(file).readBytes()
                } catch (e: Exception) {
                    writeResp(s, 404, "text/plain", "not found")
                    return
                }
                writeResp(s, 200, mimeFor(rel), bytes)
            } catch (e: Exception) {
                try { writeResp(s, 500, "text/plain", "err") } catch (_: Exception) {}
            }
        }
    }

    private fun writeResp(s: java.net.Socket, code: Int, mime: String, body: ByteArray) {
        val header = "HTTP/1.1 $code OK\r\nContent-Type: $mime\r\nContent-Length: ${body.size}\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n"
        val out: OutputStream = s.getOutputStream()
        out.write(header.toByteArray(Charsets.US_ASCII))
        out.write(body)
        out.flush()
    }

    private fun writeResp(s: java.net.Socket, code: Int, mime: String, body: String) {
        writeResp(s, code, mime, body.toByteArray(Charsets.UTF_8))
    }

    private fun mimeFor(path: String): String {
        val p = path.lowercase()
        return when {
            p.endsWith(".html") -> "text/html"
            p.endsWith(".js") || p.endsWith(".mjs") -> "application/javascript"
            p.endsWith(".css") -> "text/css"
            p.endsWith(".json") -> "application/json"
            p.endsWith(".svg") -> "image/svg+xml"
            p.endsWith(".png") -> "image/png"
            p.endsWith(".jpg") || p.endsWith(".jpeg") -> "image/jpeg"
            p.endsWith(".mid") || p.endsWith(".midi") -> "audio/midi"
            p.endsWith(".mp3") -> "audio/mpeg"
            p.endsWith(".ico") -> "image/x-icon"
            else -> "application/octet-stream"
        }
    }

    private fun injectBridge(view: WebView?) {
        val js = "(function(){if(window.awHost)return;var cbs={};window.__awHostHttpCb=function(p){try{var o=typeof p==='string'?JSON.parse(p):p;var cb=cbs[o.id];if(cb){delete cbs[o.id];cb(o)}}catch(e){}};function req(r){return new Promise(function(res){var id='r'+Math.random().toString(36).slice(2);cbs[id]=res;try{AndroidHttp.httpRequest(id,String(r.url||''),String(r.method||'GET'),JSON.stringify(r.headers||{}),r.body==null?null:String(r.body),Number(r.timeoutMs||30000))}catch(e){delete cbs[id];res({ok:false,error:String(e)})}})};window.awHost={http:{request:req,stream:function(){return Promise.resolve({ok:false})},abort:function(){return Promise.resolve({ok:true})},onChunk:function(){return function(){}},onEnd:function(){return function(){}},onHead:function(){return function(){}}},asset:{read:function(){return Promise.resolve({ok:false})}},secrets:{load:function(){try{return Promise.resolve(JSON.parse(localStorage.getItem('agentworlds_apikeys_v1')||'null'))}catch(e){return Promise.resolve(null)}},save:function(p){try{localStorage.setItem('agentworlds_apikeys_v1',JSON.stringify(p));return Promise.resolve({ok:true})}catch(e){return Promise.resolve({ok:false})}},clear:function(){try{localStorage.removeItem('agentworlds_apikeys_v1')}catch(e){};return Promise.resolve({ok:true})}}};})()"
        view?.evaluateJavascript(js, null)
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, true)

        webView = WebView(this)
        setContentView(webView)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            mediaPlaybackRequiresUserGesture = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            cacheMode = WebSettings.LOAD_NO_CACHE
        }

        webView.addJavascriptInterface(Bridge(), "AndroidHttp")

        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(view: WebView?, cb: ValueCallback<Array<Uri>>?, params: FileChooserParams?): Boolean {
                filePathCallback?.onReceiveValue(null)
                filePathCallback = cb
                val intent = params?.createIntent()
                    ?: Intent(Intent.ACTION_GET_CONTENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*" + "/*")
                return try {
                    startActivityForResult(intent, 1001)
                    true
                } catch (e: Exception) {
                    filePathCallback = null
                    false
                }
            }
        }

        webView.webViewClient = object : WebViewClient() {
            override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
                super.onPageStarted(view, url, favicon)
                if (isTrustedPage(url)) injectBridge(view)
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                if (isTrustedPage(url)) injectBridge(view)
            }

            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val url = request?.url ?: return false
                val isLocal = (url.scheme == "http" || url.scheme == "https") && url.host == "127.0.0.1"
                return !isLocal
            }
        }

        val port = startLocalServer()
        webView.loadUrl("http://127.0.0.1:$port/index.html")
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == 1001) {
            val arr = if (resultCode == RESULT_OK && data?.data != null) arrayOf(data.data!!) else null
            filePathCallback?.onReceiveValue(arr)
            filePathCallback = null
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (this::webView.isInitialized && webView.canGoBack()) webView.goBack()
        else super.onBackPressed()
    }

    override fun onDestroy() {
        try { server?.close() } catch (_: Exception) {}
        super.onDestroy()
    }
}
