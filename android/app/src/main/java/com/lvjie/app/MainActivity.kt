package com.lvjie.app

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.webkit.ValueCallback
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private val httpExecutor = Executors.newCachedThreadPool()
    private var filePathCallback: ValueCallback<Array<Uri>>? = null

    inner class Bridge {
        @JavascriptInterface
        fun httpRequest(id: String, url: String, method: String, headersJson: String?, body: String?, timeoutMs: Int) {
            httpExecutor.execute {
                var conn: HttpURLConnection? = null
                try {
                    val methodU = method.uppercase()
                    val u = URL(url)
                    conn = (u.openConnection() as HttpURLConnection)
                    conn.requestMethod = if (methodU == "GET" || methodU == "HEAD") methodU else methodU
                    conn.connectTimeout = timeoutMs.coerceIn(1000, 180000)
                    conn.readTimeout = conn.connectTimeout
                    conn.instanceFollowRedirects = true
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
                    val code = conn.responseCode
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

    private fun postResult(id: String, ok: Boolean, status: Int, text: String, error: String?) {
        val payload = JSONObject()
            .put("id", id)
            .put("ok", ok)
            .put("status", status)
            .put("text", text)
            .put("error", error ?: "")
            .toString()
            .replace("\\", "\\\\")
            .replace("'", "\\'")
            .replace("\n", "\\n")
            .replace("\r", "")
        runOnUiThread {
            webView.evaluateJavascript("window.__awHostHttpCb&&window.__awHostHttpCb('$payload')", null)
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, true)

        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView = WebView(this)
        setContentView(webView)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = true
            allowContentAccess = true
            mediaPlaybackRequiresUserGesture = false
            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            cacheMode = WebSettings.LOAD_DEFAULT
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
            override fun shouldInterceptRequest(
                view: WebView?,
                request: WebResourceRequest?
            ): WebResourceResponse? {
                val resp = assetLoader.shouldInterceptRequest(request?.url ?: return null)
                if (resp != null) return resp
                return super.shouldInterceptRequest(view, request)
            }

            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest?
            ): Boolean {
                val url = request?.url ?: return false
                return !(url.scheme == "https" && url.host == "appassets.androidplatform.net")
            }


        fun injectBridge(view: WebView?) {
            val js = "(function(){if(window.awHost)return;var cbs={};window.__awHostHttpCb=function(p){try{var o=JSON.parse(p);var cb=cbs[o.id];if(cb){delete cbs[o.id];cb(o)}}catch(e){}};function req(r){return new Promise(function(res){var id='r'+Math.random().toString(36).slice(2);cbs[id]=res;try{AndroidHttp.httpRequest(id,String(r.url||''),String(r.method||'GET'),JSON.stringify(r.headers||{}),r.body==null?null:String(r.body),Number(r.timeoutMs||30000))}catch(e){delete cbs[id];res({ok:false,error:String(e)})}})};window.awHost={http:{request:req,stream:function(){return Promise.resolve({ok:false})},abort:function(){return Promise.resolve({ok:true})},onChunk:function(){return function(){}},onEnd:function(){return function(){}},onHead:function(){return function(){}}},asset:{read:function(){return Promise.resolve({ok:false})}},secrets:{load:function(){return Promise.resolve(null)},save:function(){return Promise.resolve({ok:true})},clear:function(){return Promise.resolve({ok:true})}}};})()"
            view?.evaluateJavascript(js, null)
        }

        override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
            super.onPageStarted(view, url, favicon)
            injectBridge(view)
        }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                // 注入与 Electron awHost 兼容的 HTTP 桥（绕过 CORS）
                val js = """
                    (function(){
                      if (window.awHost) return;
                      const seq = { n: 0 };
                      const cbs = {};
                      window.__awHostHttpCb = function(payloadStr){
                        try {
                          const p = JSON.parse(payloadStr);
                          const cb = cbs[p.id];
                          if (cb) { delete cbs[p.id]; cb(p); }
                        } catch (e) {}
                      };
                      function request(req) {
                        return new Promise(function(resolve){
                          const id = 'r' + (++seq.n);
                          cbs[id] = resolve;
                          try {
                            AndroidHttp.httpRequest(
                              id,
                              String(req.url||''),
                              String(req.method||'GET'),
                              JSON.stringify(req.headers||{}),
                              req.body == null ? null : String(req.body),
                              Number(req.timeoutMs||30000)
                            );
                          } catch (e) {
                            delete cbs[id];
                            resolve({ ok:false, error:String(e) });
                          }
                        });
                      }
                      window.awHost = {
                        http: {
                          request: request,
                          stream: function(){ return Promise.resolve({ ok:false }); },
                          abort: function(){ return Promise.resolve({ok:true}); },
                          onChunk: function(){ return function(){}; },
                          onEnd: function(){ return function(){}; },
                          onHead: function(){ return function(){}; }
                        },
                        asset: {
                          read: function(){ return Promise.resolve({ ok:false, error:'n/a' }); }
                        },
                        secrets: {
                          load: function(){ return Promise.resolve(null); },
                          save: function(){ return Promise.resolve({ ok:true }); },
                          clear: function(){ return Promise.resolve({ ok:true }); }
                        }
                      };
                    })();
                """.trimIndent()
                view?.evaluateJavascript(js, null)
            }
        }

        webView.loadUrl("file:///android_asset/www/index.html")
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
}
