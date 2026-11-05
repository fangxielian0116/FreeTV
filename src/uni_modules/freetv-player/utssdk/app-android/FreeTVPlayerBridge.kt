package uts.sdk.modules.freetvPlayer

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.webkit.CookieManager
import android.webkit.WebStorage
import io.dcloud.uts.UTSAndroid
import org.json.JSONObject

object FreeTVPlayerBridge {
    private val main = Handler(Looper.getMainLooper())
    private var listener: ((String) -> Unit)? = null
    internal var initial: JSONObject? = null
    internal var activity: FreeTVPlayerActivity? = null
    fun connect(callback: (String) -> Unit) {
        listener = callback
        main.post {
            val context = UTSAndroid.getAppContext() ?: return@post
            val prefs = context.getSharedPreferences("freetv-player-v3", Context.MODE_PRIVATE)
            if (!prefs.getBoolean("legacy-cleared", false)) {
                CookieManager.getInstance().removeAllCookies(null)
                CookieManager.getInstance().flush()
                WebStorage.getInstance().deleteOrigin("https://pan.quark.cn")
                prefs.edit().putBoolean("legacy-cleared", true).apply()
            }
        }
    }
    internal fun send(message: JSONObject) { main.post { listener?.invoke(message.toString()) } }
    internal fun response(id: String, value: Any? = null, error: String? = null) {
        if (id.isEmpty()) return
        val result = JSONObject().put("type", "response").put("id", id)
        if (error != null) result.put("error", error) else result.put("value", value ?: JSONObject.NULL)
        send(result)
    }
    internal fun event(value: JSONObject) { send(JSONObject().put("type", "event").put("value", value)) }
    fun command(raw: String) {
        main.post {
            var id = ""
            try {
                val message = JSONObject(raw); id = message.optString("id"); val command = message.getString("command"); val data = message.optJSONObject("data") ?: JSONObject()
                when (command) {
                    "open" -> {
                        DetachedProbe.cancel()
                        val current = activity
                        if (current != null) current.open(data)
                        else {
                            val context = UTSAndroid.getUniActivity() ?: throw IllegalStateException("应用尚未就绪")
                            PlaybackStartup.begin(context, data)
                            initial = data; context.startActivity(Intent(context, FreeTVPlayerActivity::class.java))
                        }
                        response(id, true)
                    }
                    "probe" -> {
                        val current = activity
                        if (current != null) { DetachedProbe.cancel(); current.probe(id, data) }
                        else { val host = UTSAndroid.getUniActivity(); if (host != null) DetachedProbe.start(host, id, data) else response(id, error = "应用尚未就绪") }
                    }
                    "commit" -> activity?.commit(id, data) ?: response(id, false)
                    "rollback" -> response(id, activity?.rollback() ?: false)
                    "cancelProbe" -> { activity?.discardCandidate(); DetachedProbe.cancel(); response(id, true) }
                    "pause" -> { activity?.pausePlayback(); response(id, true) }
                    "close" -> { activity?.closeFromApp(); response(id, true) }
                    "ackProgress" -> {
                        val prefs = UTSAndroid.getAppContext()?.getSharedPreferences("freetv-player-v3", Context.MODE_PRIVATE)
                        val current = prefs?.getString("pending", "")
                        if (!current.isNullOrEmpty()) { val saved = JSONObject(current); if (saved.optLong("updatedAt") == data.optLong("updatedAt") && saved.optString("sourceId") == data.optString("sourceId") && saved.optString("vodId") == data.optString("vodId")) prefs.edit().remove("pending").apply() }
                        response(id, true)
                    }
                    "clearPending" -> { UTSAndroid.getAppContext()?.getSharedPreferences("freetv-player-v3", Context.MODE_PRIVATE)?.edit()?.remove("pending")?.apply(); response(id, true) }
                    else -> response(id, error = "不支持的播放操作")
                }
            } catch (error: Throwable) { response(id, error = error.message ?: "播放器操作失败") }
        }
    }
    fun pendingProgress(): String {
        val context = UTSAndroid.getAppContext() ?: return ""
        return context.getSharedPreferences("freetv-player-v3", Context.MODE_PRIVATE).getString("pending", "") ?: ""
    }
    internal fun saveProgress(progress: JSONObject) {
        UTSAndroid.getAppContext()?.getSharedPreferences("freetv-player-v3", Context.MODE_PRIVATE)?.edit()?.putString("pending", progress.toString())?.apply()
    }
}
