package uts.sdk.modules.freetvPlayer

import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.StateListDrawable
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.text.TextUtils
import android.util.TypedValue
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView

/** A compact panel and a separate seek/pause hint; neither owns a decoding instance. */
internal class TVPlaybackControls(
    context: Context,
    private val snapshot: () -> EngineStats?,
    private val toggle: () -> Unit,
    private val seek: (Long) -> Unit,
    previous: () -> Unit, next: () -> Unit,
    private val currentSpeed: () -> Float,
    speed: () -> Unit, retry: () -> Unit
): FrameLayout(context) {
    private val handler = Handler(Looper.getMainLooper())
    private val unit = minOf(resources.displayMetrics.widthPixels / 960f, resources.displayMetrics.heightPixels / 540f)
    private var lastInteraction = SystemClock.elapsedRealtime()
    private var pendingSeek: Long? = null
    private var lastError = ""
    private var hudUntil = 0L
    private val panel = LinearLayout(context)
    private val heading = TextView(context)
    private val time = TextView(context)
    private val progress = ProgressBar(context, null, android.R.attr.progressBarStyleHorizontal)
    private val hud = TextView(context)
    private lateinit var speedButton: Button
    private val retryButton: Button
    private val commitSeek = Runnable {
        val target = pendingSeek
        pendingSeek = null
        if (target != null) { seek(target); hudUntil = SystemClock.elapsedRealtime() + 1200 }
    }
    private val poll = object: Runnable {
        override fun run() {
            val stats = snapshot()
            if (stats != null) {
                val now = SystemClock.elapsedRealtime()
                val failed = stats.state == "error" || stats.error.isNotEmpty()
                val errorKey = if (failed) stats.error.ifEmpty { "PLAYBACK_ERROR" } else ""
                retryButton.visibility = if (failed) View.VISIBLE else View.GONE
                if (errorKey.isNotEmpty() && errorKey != lastError) { show(); retryButton.requestFocus() }
                lastError = errorKey
                speedButton.text = speedLabel()
                time.text = "${format(pendingSeek ?: stats.position)} / ${format(stats.duration)}"
                progress.progress = if (stats.duration > 0) (((pendingSeek ?: stats.position) * 1000 / stats.duration).coerceIn(0, 1000)).toInt() else 0
                if (panel.visibility == View.VISIBLE && stats.state == "playing" && now - lastInteraction > 5000) hide()
                if (pendingSeek == null && now >= hudUntil) {
                    if (stats.state == "paused" && panel.visibility != View.VISIBLE) {
                        hud.text = "已暂停 · 确认键继续"; hud.visibility = View.VISIBLE
                    } else hud.visibility = View.GONE
                }
            }
            handler.postDelayed(this, 150)
        }
    }
    init {
        isFocusable = false
        panel.orientation = LinearLayout.VERTICAL
        panel.setPadding(px(48), px(12), px(48), px(27))
        panel.background = GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, intArrayOf(0xd9101b2b.toInt(), 0xf5101b2b.toInt()))
        val info = LinearLayout(context).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        style(heading, 18); heading.setSingleLine(); heading.ellipsize = TextUtils.TruncateAt.END
        style(time, 15, 0xffabc1d7.toInt()); time.gravity = Gravity.END
        info.addView(heading, LinearLayout.LayoutParams(0, px(27), 1f))
        info.addView(time, LinearLayout.LayoutParams(px(160), px(27)))
        panel.addView(info)
        progress.max = 1000
        progress.progressTintList = ColorStateList.valueOf(0xff61c7ff.toInt())
        progress.progressBackgroundTintList = ColorStateList.valueOf(0xff3a536e.toInt())
        panel.addView(progress, LinearLayout.LayoutParams(-1, px(3)).apply { setMargins(0, px(7), 0, px(12)) })
        val actions = LinearLayout(context).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        fun button(label: String, action: () -> Unit): Button {
            val button = Button(context).apply {
                text = label; style(this, 17); isAllCaps = false; isFocusable = true
                val focused = GradientDrawable().apply { setColor(0xff34587b.toInt()); cornerRadius = px(6).toFloat(); setStroke(px(2), 0xff91dcff.toInt()) }
                val normal = GradientDrawable().apply { setColor(0xff263c55.toInt()); cornerRadius = px(6).toFloat() }
                background = StateListDrawable().apply { addState(intArrayOf(android.R.attr.state_focused), focused); addState(intArrayOf(), normal) }
                minimumWidth = 0; minimumHeight = 0; setPadding(px(10), 0, px(10), 0)
                setOnClickListener { touch(); action() }
                setOnFocusChangeListener { _, focusedNow -> if (focusedNow) touch() }
            }
            actions.addView(button, LinearLayout.LayoutParams(px(112), px(38)).apply { setMargins(0, 0, px(12), 0) })
            return button
        }
        button("上一集", previous); button("下一集", next)
        speedButton = button(speedLabel()) { speed(); speedButton.text = speedLabel() }
        retryButton = button("重试", retry).apply { visibility = View.GONE }
        val help = TextView(context).apply { text = "左右快进退  ·  确认暂停 / 继续\n上下打开控制栏  ·  返回选集"; style(this, 13, 0xffabc1d7.toInt()); gravity = Gravity.END or Gravity.CENTER_VERTICAL }
        actions.addView(help, LinearLayout.LayoutParams(0, px(38), 1f))
        panel.addView(actions)
        addView(panel, LayoutParams(-1, -2, Gravity.BOTTOM))
        style(hud, 20); hud.gravity = Gravity.CENTER
        hud.setPadding(px(24), px(12), px(24), px(12))
        hud.background = GradientDrawable().apply { setColor(0xe6101b2b.toInt()); cornerRadius = px(8).toFloat() }
        hud.visibility = View.GONE
        addView(hud, LayoutParams(-2, -2, Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL).apply { bottomMargin = px(54) })
        handler.post(poll)
    }
    private fun px(value: Int) = (value * unit + .5f).toInt()
    private fun style(view: TextView, size: Int, color: Int = Color.WHITE) { view.setTextColor(color); view.setTextSize(TypedValue.COMPLEX_UNIT_PX, size * unit) }
    private fun format(ms: Long): String { val seconds = ms.coerceAtLeast(0) / 1000; return if (seconds >= 3600) "%d:%02d:%02d".format(seconds / 3600, seconds / 60 % 60, seconds % 60) else "%02d:%02d".format(seconds / 60, seconds % 60) }
    private fun speedLabel() = "倍速 ${currentSpeed().toString().removeSuffix(".0")}×"
    private fun touch() { lastInteraction = SystemClock.elapsedRealtime() }
    fun show() { panel.visibility = View.VISIBLE; hud.visibility = View.GONE; touch(); if (!panel.hasFocus()) speedButton.requestFocus() }
    private fun hide() { panel.findFocus()?.clearFocus(); panel.visibility = View.GONE }
    fun title(value: String) { heading.text = value }
    fun back(): Boolean { if (panel.visibility != View.VISIBLE) return false; hide(); return true }
    private fun togglePlayback() {
        val wasPaused = snapshot()?.state == "paused"
        toggle()
        if (panel.visibility != View.VISIBLE) { hud.text = if (wasPaused) "继续播放" else "已暂停 · 确认键继续"; hud.visibility = View.VISIBLE; hudUntil = SystemClock.elapsedRealtime() + 900 }
    }
    fun key(event: KeyEvent): Boolean {
        val code = event.keyCode
        val down = event.action == KeyEvent.ACTION_DOWN
        val select = code == KeyEvent.KEYCODE_DPAD_CENTER || code == KeyEvent.KEYCODE_ENTER || code == KeyEvent.KEYCODE_NUMPAD_ENTER
        if (code == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE || code == KeyEvent.KEYCODE_MEDIA_PLAY || code == KeyEvent.KEYCODE_MEDIA_PAUSE) {
            if (down && event.repeatCount == 0) { val state = snapshot()?.state; if (code == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE || code == KeyEvent.KEYCODE_MEDIA_PLAY && state == "paused" || code == KeyEvent.KEYCODE_MEDIA_PAUSE && state != "paused") togglePlayback() }
            return true
        }
        if (select) {
            // Activate on key-down for immediate feedback; repeats and key-up never click again.
            if (down && event.repeatCount == 0) {
                touch()
                if (panel.visibility == View.VISIBLE) {
                    val focused = panel.findFocus()
                    if (focused is Button) focused.performClick()
                } else togglePlayback()
            }
            return true
        }
        if (panel.visibility != View.VISIBLE && (code == KeyEvent.KEYCODE_DPAD_UP || code == KeyEvent.KEYCODE_DPAD_DOWN)) { if (down) show(); return true }
        val horizontal = code == KeyEvent.KEYCODE_DPAD_LEFT || code == KeyEvent.KEYCODE_DPAD_RIGHT
        val seeking = panel.visibility != View.VISIBLE || pendingSeek != null
        if (seeking && horizontal) {
            if (down) {
                val stats = snapshot() ?: return true
                if (stats.duration <= 0) return true
                val forward = code == KeyEvent.KEYCODE_DPAD_RIGHT
                val delta = if (forward) 10000L else -10000L
                val direction = if (forward) "快进" else "快退"
                pendingSeek = ((pendingSeek ?: stats.position) + delta).coerceIn(0, (stats.duration - 1000).coerceAtLeast(0))
                hud.text = "$direction 10 秒    ${format(pendingSeek!!)} / ${format(stats.duration)}"
                hud.visibility = View.VISIBLE; hudUntil = SystemClock.elapsedRealtime() + 1200
                handler.removeCallbacks(commitSeek); handler.postDelayed(commitSeek, 450)
            } else if (event.action == KeyEvent.ACTION_UP) { handler.removeCallbacks(commitSeek); handler.post(commitSeek) }
            return true
        }
        if (down && code in listOf(KeyEvent.KEYCODE_DPAD_UP, KeyEvent.KEYCODE_DPAD_DOWN, KeyEvent.KEYCODE_DPAD_LEFT, KeyEvent.KEYCODE_DPAD_RIGHT)) touch()
        return false
    }
    fun dispose() { handler.removeCallbacksAndMessages(null); pendingSeek = null }
}
