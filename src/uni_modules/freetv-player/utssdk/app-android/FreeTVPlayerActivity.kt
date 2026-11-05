package uts.sdk.modules.freetvPlayer

import android.app.Activity
import android.content.Context
import android.content.pm.ActivityInfo
import android.graphics.Color
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.view.KeyEvent
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import org.json.JSONObject
import java.util.UUID

@UnstableApi
class FreeTVPlayerActivity: Activity() {
    private data class Slot(val request: JSONObject, val stats: EngineStats, val view: ScopedVideo, val token: String = UUID.randomUUID().toString())
    private lateinit var root: FrameLayout
    private val main = Handler(Looper.getMainLooper())
    private var active: Slot? = null
    private var candidate: Slot? = null
    private var previous: Slot? = null
    private var previousExpires = 0L
    private var probeId = ""
    private var probeDeadline = 0L
    private var probeBegan = 0L
    private var probeExcluded = ""
    private var candidateReadyAt = 0L
    private var probeMinimum = 2.0
    private var savedState = ""
    private var lastSaved = 0L
    private var closingFromApp = false
    private var lastCommitAt = 0L
    private var lastCommitCheck = ""
    private var destroyPending = false
    private var controls: LinearLayout? = null
    private var titleView: TextView? = null
    private var resumeAfterPause = false
    private var tvControls: TVPlaybackControls? = null
    private val tick = object: Runnable {
        override fun run() {
            if (destroyPending) return
            listOfNotNull(active, candidate).forEach { collect(it) }
            val slot = active
            if (slot != null) {
                val now = SystemClock.elapsedRealtime()
                if (now - lastSaved >= 5000 || (slot.stats.state != savedState && slot.stats.state in listOf("paused", "ended", "error"))) { save(slot); lastSaved = now; savedState = slot.stats.state }
                emit(slot)
            }
            checkCandidate()
            if (previous != null && SystemClock.elapsedRealtime() >= previousExpires) { release(previous); previous = null }
            main.postDelayed(this, 250)
        }
    }
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val request = FreeTVPlayerBridge.initial
        if (request == null) { finish(); return }
        PlaybackStartup.begin(this, request)
        // Choose orientation before inflating the decor/player view, including
        // older hosts that do not yet have the activity's manifest declaration.
        if (requestedOrientation != ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE) requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED)
        window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        root = FrameLayout(this); root.setBackgroundColor(Color.BLACK); setContentView(root)
        FreeTVPlayerBridge.activity = this
        open(request)
    }
    fun open(request: JSONObject) {
        discardCandidate(); release(previous); previous = null; release(active)
        resumeAfterPause = false
        active = create(request, false); controls?.bringToFront()
    }
    private fun create(request: JSONObject, testing: Boolean): Slot {
        val stats = EngineStats(testing).apply { if (!testing) startup = PlaybackStartup.begin(this@FreeTVPlayerActivity, request) }; val view = ScopedVideo(this, stats); val slot = Slot(request, stats, view)
        root.addView(view, if (testing) FrameLayout.LayoutParams(4, 4, Gravity.BOTTOM or Gravity.END) else FrameLayout.LayoutParams(-1, -1))
        if (testing) { view.alpha = .02f; view.isClickable = false; view.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS } else view.alpha = 1f
        controls?.bringToFront()
        val episode = request.getJSONObject("episode"); val detail = request.getJSONObject("detail")
        stats.ignoreNextSeek = request.optDouble("position", 0.0) > 0
        stats.initialSeekPending = stats.ignoreNextSeek
        val headers = mutableMapOf<String, String>(); request.optJSONObject("headers")?.let { obj -> obj.keys().forEach { headers[it] = obj.getString(it) } }
        view.setUp(episode.getString("url"), false, null, headers, "${detail.getString("title")} · ${episode.getString("label")}")
        view.setNeedShowWifiTip(false)
        view.setStartAfterPrepared(true)
        view.setReleaseWhenLossAudio(false)
        if (testing) view.suppressProbeFocus()
        view.setIsTouchWiget(!testing)
        view.setIsTouchWigetFull(!testing)
        view.setSpeed(floatArrayOf(1f, 1.25f, 1.5f, 2f)[speedIndex])
        view.setSeekOnStart((request.optDouble("position", 0.0) * 1000).toLong())
        view.manager.setNeedMute(testing)
        view.startPlayLogic()
        view.fullscreenButton.setOnClickListener { requestedOrientation = if (resources.configuration.orientation == 2) ActivityInfo.SCREEN_ORIENTATION_PORTRAIT else ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE }
        view.backButton.setOnClickListener { onBackPressed() }
        stats.onSeek = { main.post { if (slot === active) { discardCandidate(); emit(slot, "seek") } } }
        stats.onRetry = { main.post { if (slot === active) emit(slot,"retry") } }
        if (!testing) installControls(slot)
        return slot
    }
    private fun installControls(slot: Slot) {
        tvControls?.let { it.dispose();root.removeView(it) };tvControls=null
        controls?.let { root.removeView(it) }
        controls=null
        if(slot.request.optString("uiMode")=="tv") {
            slot.view.configureTV()
            val bar=TVPlaybackControls(this,{active?.stats},
                {active?.view?.toggleTV()},
                {position -> active?.let {discardCandidate();it.view.manager.seekTo(position);emit(it,"seek")}},
                {active?.let {emit(it,"previous")}}, {active?.let {emit(it,"next")}},
                {floatArrayOf(1f,1.25f,1.5f,2f)[speedIndex]},
                {val rates=floatArrayOf(1f,1.25f,1.5f,2f);speedIndex=(speedIndex+1)%rates.size;active?.view?.manager?.setSpeed(rates[speedIndex],false)},
                {active?.let {emit(it,"retry")}})
            bar.title(slot.request.getJSONObject("detail").getString("title")+" · "+slot.request.getJSONObject("episode").getString("label"))
            root.addView(bar,FrameLayout.LayoutParams(-1,-1));tvControls=bar;bar.show()
            return
        }
        val bar = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setBackgroundColor(0x66101820); setPadding(12, 6, 12, 6) }
        val title = TextView(this).apply { setTextColor(Color.WHITE); textSize = 12f; text = slot.request.getJSONObject("episode").getString("label"); maxLines = 1 }
        bar.addView(title, LinearLayout.LayoutParams(0, -2, 1f)); titleView = title
        fun button(label: String, action: () -> Unit) { bar.addView(Button(this).apply { text = label; textSize = 11f; setTextColor(Color.WHITE); setBackgroundColor(Color.TRANSPARENT); setOnClickListener { action() } }, LinearLayout.LayoutParams(-2, 45)) }
        button("前集") { emit(active ?: return@button, "previous") }
        button("后集") { emit(active ?: return@button, "next") }
        button("选集") { emit(active ?: return@button, "episodes") }
        button("倍速") { val current = active ?: return@button; val rates = floatArrayOf(1f, 1.25f, 1.5f, 2f); speedIndex = (speedIndex + 1) % rates.size; current.view.manager.setSpeed(rates[speedIndex], false) }
        root.addView(bar, FrameLayout.LayoutParams(-1, -2, Gravity.TOP)); controls = bar
    }
    private var speedIndex = 0
    private fun collect(slot: Slot) {
        val engine = slot.view.manager.engine()?.engine() ?: return
        Handler(engine.applicationLooper).post {
            try { slot.stats.snapshot(engine); if (slot.stats.candidate && slot.stats.firstFrame) engine.volume = 0f } catch (_: Throwable) { slot.stats.error = "PLAYER_STATE_UNAVAILABLE" }
        }
    }
    private fun online(): Boolean {
        val manager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = manager.activeNetwork ?: return false
        return manager.getNetworkCapabilities(network)?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true
    }
    private fun emit(slot: Slot, action: String? = null) {
        if (slot !== active) return
        val value = JSONObject().put("sessionId", slot.request.getString("sessionId")).put("state", slot.stats.state).put("position", slot.stats.position / 1000.0).put("duration", slot.stats.duration / 1000.0).put("metrics", slot.stats.json()).put("online", online()).put("at", System.currentTimeMillis())
        if (action != null) value.put("action", action)
        if (slot.stats.error.isNotEmpty()) value.put("code", slot.stats.error).put("message", "视频暂时无法播放，正在尝试恢复")
        FreeTVPlayerBridge.event(value)
    }
    private fun save(slot: Slot) {
        val progress = JSONObject(slot.request.getJSONObject("progress").toString()).put("position", slot.stats.position / 1000.0).put("duration", slot.stats.duration / 1000.0).put("updatedAt", System.currentTimeMillis()).put("ended", slot.stats.state == "ended")
        FreeTVPlayerBridge.saveProgress(progress)
    }
    fun probe(id: String, data: JSONObject) {
        discardCandidate()
        if (previous != null && SystemClock.elapsedRealtime() < previousExpires) { FreeTVPlayerBridge.response(id, JSONObject().put("status","unknown").put("reason","切换观察期，保留回退实例").put("elapsedMs",0)); return }
        release(previous); previous = null
        if (!online()) { FreeTVPlayerBridge.response(id, JSONObject().put("status", "unknown").put("reason", "设备离线").put("elapsedMs", 0)); return }
        probeId = id; probeDeadline = data.getLong("deadline"); probeBegan = System.currentTimeMillis(); probeExcluded = data.optString("excludeUrl")
        probeMinimum = data.optDouble("minNetworkMultiple", 2.0).coerceAtLeast(2.0)
        try { candidate = create(data.getJSONObject("request"), true) }
        catch (_: Throwable) { finishProbe("unknown", "备用实例无法创建") }
    }
    private fun checkCandidate() {
        val slot = candidate ?: return
        if (probeId.isEmpty()) return
        if (System.currentTimeMillis() >= probeDeadline) { finishProbe("unknown", "验证超时"); return }
        if (slot.stats.error.isNotEmpty()) { finishProbe("unknown", slot.stats.error); return }
        if (slot.stats.finalUrl.isNotEmpty() && probeExcluded.isNotEmpty() && slot.stats.finalUrl == probeExcluded) { finishProbe("unknown", "备用源使用相同视频地址"); return }
        val ratio = slot.stats.multiple() ?: return
        if (!slot.stats.initialSeekPending && slot.stats.state == "playing" && slot.stats.firstFrame && slot.stats.buffered >= 3000 && ratio >= probeMinimum && slot.stats.width > 0 && slot.stats.height > 0) {
            slot.view.manager.pause()
            candidateReadyAt = System.currentTimeMillis()
            finishProbe("ready", "首帧、缓存和网络余量验证通过")
        }
    }
    private fun finishProbe(status: String, reason: String) {
        val id = probeId; probeId = ""
        val slot = candidate
        val result = JSONObject().put("status", status).put("reason", reason).put("elapsedMs", System.currentTimeMillis() - probeBegan)
        if (slot != null) result.put("token", slot.token).put("sessionId", slot.request.getString("sessionId")).put("position", slot.stats.position / 1000.0).put("metrics", slot.stats.json()).put("finalUrl", slot.stats.finalUrl)
        FreeTVPlayerBridge.response(id, result)
        if (status != "ready") { candidate = null; main.post { release(slot) } }
    }
    fun commit(id: String, data: JSONObject) {
        val next = candidate
        if (next == null || next.token != data.optString("token") || !next.stats.firstFrame || next.stats.error.isNotEmpty()) { FreeTVPlayerBridge.response(id, false); return }
        val old = active
        val target = (data.optDouble("position", next.stats.position / 1000.0) * 1000).toLong()
        val seek = if(next.stats.duration > 0 && target >= next.stats.duration) 0L else target
        val began = SystemClock.elapsedRealtime()
        val commitDeadline = kotlin.math.min(data.optLong("deadline", probeDeadline + 5000), System.currentTimeMillis() + 5000)
        val requiresSeek = kotlin.math.abs(next.stats.position - seek) > 1000
        if (requiresSeek) { next.stats.ignoreNextSeek = true; next.view.manager.seekTo(seek) }
        // Muted playback lets renderers finish an in-buffer seek before promotion.
        next.view.manager.start()
        fun finishWhenReady() {
            lastCommitCheck = "elapsed=${SystemClock.elapsedRealtime() - began}; remaining=${commitDeadline - System.currentTimeMillis()}; target=$seek; snapshotAge=${SystemClock.elapsedRealtime() - next.stats.snapshotAt}; state=${next.stats.state}; position=${next.stats.position}; buffered=${next.stats.buffered}; error=${next.stats.error}"
            if (candidate !== next || next.stats.error.isNotEmpty() || System.currentTimeMillis() - candidateReadyAt > 30000 || System.currentTimeMillis() >= commitDeadline) { FreeTVPlayerBridge.response(id, false); return }
            if (next.stats.snapshotAt <= began || next.stats.state != "playing" || next.stats.buffered < 3000 || kotlin.math.abs(next.stats.position - seek) > 2000) { main.postDelayed({ finishWhenReady() }, 100); return }
            old?.let { save(it); it.view.onVideoPause(); it.view.alpha = .001f }
            release(previous); previous = old; previousExpires = SystemClock.elapsedRealtime() + 8000
            candidate = null; active = next; next.stats.candidate = false; next.stats.effectiveMs = 0; next.stats.rebufferCount = 0; next.stats.rebufferMs = 0
            root.updateViewLayout(next.view, FrameLayout.LayoutParams(-1, -1))
            next.view.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_AUTO
            next.view.alpha = 1f; next.view.isClickable = true; next.view.setIsTouchWiget(true); next.view.setIsTouchWigetFull(true)
            next.view.activateFocus(); next.view.manager.setNeedMute(false); next.view.manager.start(); next.view.bringToFront(); installControls(next)
            next.view.manager.setSpeed(floatArrayOf(1f, 1.25f, 1.5f, 2f)[speedIndex], false)
            lastCommitAt = SystemClock.elapsedRealtime(); FreeTVPlayerBridge.response(id, true)
        }
        main.postDelayed({ finishWhenReady() }, 100)
    }
    fun rollback(): Boolean {
        val old = previous ?: return false
        release(active); active = old; previous = null; old.view.alpha = 1f; old.view.manager.setNeedMute(false); old.view.onVideoResume(false); old.view.bringToFront(); installControls(old); return true
    }
    fun discardCandidate() {
        if (probeId.isNotEmpty()) { val id = probeId; probeId = ""; FreeTVPlayerBridge.response(id, JSONObject().put("status", "unknown").put("reason", "验证已取消").put("elapsedMs", 0)) }
        release(candidate); candidate = null
    }
    private fun pauseActive() { active?.view?.onVideoPause(); active?.let { save(it) }; discardCandidate() }
    fun pausePlayback() { resumeAfterPause = false; pauseActive() }
    fun closeFromApp() { closingFromApp = true; finish() }
    private fun release(slot: Slot?) { if (slot == null) return; slot.view.disposeFocus(); slot.view.manager.dispose(); root.removeView(slot.view) }
    override fun onResume() {
        super.onResume()
        if (resumeAfterPause) { resumeAfterPause = false; active?.view?.onVideoResume(false) }
        main.removeCallbacks(tick); main.post(tick)
    }
    override fun onPause() { super.onPause(); main.removeCallbacks(tick); resumeAfterPause = active?.view?.playbackRequested == true; pauseActive(); active?.let { it.stats.state = "paused"; emit(it) } }
    override fun dispatchKeyEvent(event: KeyEvent): Boolean { if(tvControls?.key(event)==true)return true;return super.dispatchKeyEvent(event) }
    override fun onBackPressed() { if(tvControls?.back()==true)return;active?.let { save(it); if (!closingFromApp) emit(it, "close") }; super.onBackPressed() }
    override fun onDestroy() {
        destroyPending = true; main.removeCallbacks(tick); active?.let { save(it) }; discardCandidate(); release(previous); release(active); active = null; previous = null
        tvControls?.dispose();tvControls=null
        if (FreeTVPlayerBridge.activity === this) FreeTVPlayerBridge.activity = null
        window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON); super.onDestroy()
    }
}
