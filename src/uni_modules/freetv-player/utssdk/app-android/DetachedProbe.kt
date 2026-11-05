package uts.sdk.modules.freetvPlayer

import android.app.Activity
import android.os.Handler
import android.os.Looper
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.media3.common.util.UnstableApi
import org.json.JSONObject

/** Verification from a details page: no player activity or user-visible navigation. */
@UnstableApi
internal object DetachedProbe {
    private val main = Handler(Looper.getMainLooper())
    private var view: ScopedVideo? = null
    private var id = ""
    private var deadline = 0L
    private var began = 0L
    private var session = ""
    private var excluded = ""
    private val poll = object: Runnable {
        override fun run() {
            val current = view ?: return
            val engine = current.manager.engine()?.engine()
            if (engine != null) Handler(engine.applicationLooper).post { try { current.stats.snapshot(engine); engine.volume = 0f } catch (_: Throwable) { current.stats.error = "DECODER_UNAVAILABLE" } }
            val stats = current.stats
            if (System.currentTimeMillis() >= deadline) { finish("unknown", "验证超时"); return }
            if (stats.error.isNotEmpty()) { finish("unknown", stats.error); return }
            if (excluded.isNotEmpty() && stats.finalUrl == excluded) { finish("unknown", "相同视频地址"); return }
            if (stats.firstFrame && stats.buffered >= 3000 && (stats.multiple() ?: 0.0) >= 2 && stats.width > 0 && stats.height > 0) { finish("ready", "已验证可播正片"); return }
            main.postDelayed(this, 100)
        }
    }
    fun start(activity: Activity, requestId: String, data: JSONObject) {
        cancel(); id = requestId; deadline = data.getLong("deadline"); began = System.currentTimeMillis(); excluded = data.optString("excludeUrl")
        try {
            val request = data.getJSONObject("request"); val episode = request.getJSONObject("episode")
            session = request.getString("sessionId")
            val created = ScopedVideo(activity, EngineStats(true)); view = created
            created.stats.initialSeekPending = request.optDouble("position", 0.0) > 0
            val root = activity.window.decorView as ViewGroup
            root.addView(created, FrameLayout.LayoutParams(4, 4, android.view.Gravity.BOTTOM or android.view.Gravity.END)); created.alpha = .02f
            created.importantForAccessibility = android.view.View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
            created.setNeedShowWifiTip(false); created.setIsTouchWiget(false)
            created.setUp(episode.getString("url"), false, "备用视频验证")
            created.suppressProbeFocus()
            created.setSeekOnStart((request.optDouble("position", 0.0) * 1000).toLong()); created.manager.setNeedMute(true); created.startPlayLogic()
            main.post(poll)
        } catch (_: Throwable) { finish("unknown", "验证实例不可用") }
    }
    private fun finish(status: String, reason: String) {
        val current = view; val requestId = id; id = ""
        val result = JSONObject().put("status", status).put("reason", reason).put("elapsedMs", System.currentTimeMillis() - began).put("sessionId", session)
        if (current != null) result.put("metrics", current.stats.json()).put("finalUrl", current.stats.finalUrl)
        FreeTVPlayerBridge.response(requestId, result); main.post { if (id.isEmpty()) release() }
    }
    private fun release() { main.removeCallbacks(poll); val current = view; view = null; current?.disposeFocus(); current?.manager?.dispose(); (current?.parent as? ViewGroup)?.removeView(current) }
    fun cancel() { if (id.isNotEmpty()) { val requestId = id; id = ""; FreeTVPlayerBridge.response(requestId, JSONObject().put("status", "unknown").put("reason", "验证已取消").put("elapsedMs", 0)) }; release() }
}
