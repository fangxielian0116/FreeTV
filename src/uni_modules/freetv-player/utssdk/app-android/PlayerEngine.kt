package uts.sdk.modules.freetvPlayer

import android.content.Context
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.os.Message
import android.os.SystemClock
import android.view.View
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.database.StandaloneDatabaseProvider
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.datasource.TransferListener
import androidx.media3.datasource.cache.CacheDataSource
import androidx.media3.datasource.cache.LeastRecentlyUsedCacheEvictor
import androidx.media3.datasource.cache.SimpleCache
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.analytics.AnalyticsListener
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.exoplayer.source.LoadEventInfo
import androidx.media3.exoplayer.source.MediaLoadData
import com.shuyu.gsyvideoplayer.GSYVideoBaseManager
import com.shuyu.gsyvideoplayer.cache.ICacheManager
import com.shuyu.gsyvideoplayer.model.GSYModel
import com.shuyu.gsyvideoplayer.model.VideoOptionModel
import com.shuyu.gsyvideoplayer.player.IPlayerManager
import com.shuyu.gsyvideoplayer.video.StandardGSYVideoPlayer
import com.shuyu.gsyvideoplayer.video.base.GSYVideoViewBridge
import org.json.JSONObject
import tv.danmaku.ijk.media.exo2.Exo2PlayerManager
import tv.danmaku.ijk.media.exo2.IjkExo2MediaPlayer
import java.io.File
import java.util.IdentityHashMap

private data class TransferSample(val began: Long, var bytes: Long = 0)
private val cacheableMediaPath = Regex("\\.(ts|m4s|mp4|mkv|webm|aac|mp3)$", RegexOption.IGNORE_CASE)

// A probe must not wait for cache index/disk locks held by the active stream.
// Choose on every open so promotion keeps the prepared samples and future loads resume caching.
private class PlaybackDataSource(private val stats: EngineStats, private val network: DataSource.Factory, private val cached: DataSource.Factory): DataSource {
    private var current: DataSource? = null
    private val listeners = mutableListOf<TransferListener>()
    override fun addTransferListener(listener: TransferListener) { listeners.add(listener); current?.addTransferListener(listener) }
    override fun open(spec: DataSpec): Long {
        val manifest = if (spec.httpMethod == DataSpec.HTTP_METHOD_GET && spec.position == 0L && spec.length == C.LENGTH_UNSET.toLong() && spec.uri.path.orEmpty().endsWith(".m3u8", true)) stats.startup?.take(spec.uri.toString()) else null
        // Playlists and keys can carry short-lived URLs: retries must fetch them fresh.
        val useCache = !stats.candidate && cacheableMediaPath.containsMatchIn(spec.uri.path.orEmpty())
        val source = if (manifest != null) { stats.startupManifests++; stats.recordNetwork(manifest.bytes.size.toLong(), manifest.networkMs); PlaybackStartup.dataSource(manifest) } else (if (useCache) cached else network).createDataSource()
        listeners.forEach { source.addTransferListener(it) }; current = source
        return source.open(spec)
    }
    override fun read(buffer: ByteArray, offset: Int, length: Int): Int = checkNotNull(current).read(buffer, offset, length)
    override fun getUri(): Uri? = current?.uri
    override fun getResponseHeaders(): Map<String, List<String>> = current?.responseHeaders ?: emptyMap()
    override fun close() { try { current?.close() } finally { current = null } }
}

@UnstableApi
internal object PlayerCache {
    private var instance: SimpleCache? = null
    @Synchronized fun get(context: Context): SimpleCache {
        if (instance == null) instance = SimpleCache(File(context.cacheDir, "freetv-media3"), LeastRecentlyUsedCacheEvictor(128L * 1024 * 1024), StandaloneDatabaseProvider(context))
        return instance!!
    }
}

internal class EngineStats(@Volatile var candidate: Boolean) {
    var startup: PlaybackStartup.Launch? = null
    @Volatile var startupManifests = 0
    @Volatile var firstFrame = false
    @Volatile var error = ""
    @Volatile var position = 0L
    @Volatile var duration = 0L
    @Volatile var buffered = 0L
    @Volatile var width = 0
    @Volatile var height = 0
    @Volatile var state = "loading"
    @Volatile var effectiveMs = 0L
    @Volatile var rebufferCount = 0
    @Volatile var rebufferMs = 0L
    @Volatile var dropped = 0
    @Volatile var networkBytes = 0L
    @Volatile var networkMs = 0L
    @Volatile var mediaBytes = 0L
    @Volatile var mediaMs = 0L
    @Volatile var finalUrl = ""
    @Volatile var ignoreNextSeek = true
    @Volatile var seekGraceUntil = 0L
    @Volatile var snapshotAt = 0L
    @Volatile var initialSeekPending = false
    @Volatile var frameAt = 0L
    private val mediaRanges = mutableListOf<Pair<Long, Long>>()
    var onSeek: (() -> Unit)? = null
    var onRetry: (() -> Unit)? = null
    private var bufferingAt = 0L
    private val recentStalls = mutableListOf<Pair<Long, Long>>()
    private var lastTick = SystemClock.elapsedRealtime()
    private var lastPosition = 0L
    fun snapshot(player: ExoPlayer) {
        val now = SystemClock.elapsedRealtime(); val elapsed = (now - lastTick).coerceIn(0L, 1000L)
        position = player.currentPosition.coerceAtLeast(0L)
        duration = player.duration.takeIf { it > 0 } ?: 0L
        buffered = player.totalBufferedDuration.coerceAtLeast(0L)
        player.videoFormat?.let { width = it.width.coerceAtLeast(0); height = it.height.coerceAtLeast(0) }
        state = when { error.isNotEmpty() -> "error"; player.playbackState == Player.STATE_ENDED -> "ended"; player.playbackState == Player.STATE_BUFFERING -> "buffering"; player.isPlaying -> "playing"; firstFrame && player.playbackState == Player.STATE_READY -> "paused"; else -> "loading" }
        if (player.isPlaying && position > lastPosition && now > seekGraceUntil) effectiveMs += elapsed
        if (state == "buffering" && firstFrame && player.playWhenReady && now > seekGraceUntil) {
            if (bufferingAt == 0L) bufferingAt = now
        } else if (bufferingAt != 0L) {
            if (now - bufferingAt >= 3000) recentStalls.add(now to (now - bufferingAt))
            bufferingAt = 0L
        }
        recentStalls.removeAll { now - it.first > 300000 }
        val waiting = if (bufferingAt == 0L) 0L else now - bufferingAt
        rebufferCount = recentStalls.size + if (waiting >= 3000) 1 else 0
        rebufferMs = maxOf(recentStalls.maxOfOrNull { it.second } ?: 0L, waiting)
        lastPosition = position; lastTick = now; snapshotAt = now
    }
    fun multiple(): Double? {
        if (networkBytes <= 0L || networkMs <= 0L || mediaBytes <= 0L || mediaMs <= 0L) return null
        return (networkBytes.toDouble() / networkMs) / (mediaBytes.toDouble() / mediaMs)
    }
    @Synchronized fun recordNetwork(bytes: Long, elapsed: Long) { networkBytes += bytes; networkMs += elapsed.coerceAtLeast(1) }
    @Synchronized fun recordMedia(bytes: Long, start: Long, end: Long) {
        mediaBytes += bytes
        mediaRanges.add(start to end)
        val merged = mutableListOf<Pair<Long, Long>>()
        for (range in mediaRanges.sortedBy { it.first }) {
            val last = merged.lastOrNull()
            if (last != null && range.first <= last.second) merged[merged.lastIndex] = last.first to maxOf(last.second, range.second) else merged.add(range)
        }
        mediaRanges.clear(); mediaRanges.addAll(merged)
        mediaMs = merged.sumOf { it.second - it.first }
    }
    fun json(): JSONObject = JSONObject().put("firstFrame", firstFrame).put("effectiveSeconds", effectiveMs / 1000.0).put("rebufferCount", rebufferCount).put("rebufferMs", rebufferMs).put("width", width).put("height", height).put("bufferedSeconds", buffered / 1000.0).put("droppedFrames", dropped).put("networkMultiple", multiple() ?: JSONObject.NULL).put("finalUrl", finalUrl).put("startupManifests", startupManifests)
}

@UnstableApi
internal class PlaybackObserver(private val stats: EngineStats): AnalyticsListener {
    override fun onRenderedFirstFrame(eventTime: AnalyticsListener.EventTime, output: Any, renderTimeMs: Long) { stats.firstFrame = true; stats.frameAt = SystemClock.elapsedRealtime() }
    override fun onPlayerError(eventTime: AnalyticsListener.EventTime, error: PlaybackException) { stats.error = error.errorCodeName }
    override fun onDroppedVideoFrames(eventTime: AnalyticsListener.EventTime, droppedFrames: Int, elapsedMs: Long) { stats.dropped += droppedFrames }
    override fun onLoadCompleted(eventTime: AnalyticsListener.EventTime, info: LoadEventInfo, data: MediaLoadData) {
        if (data.dataType == C.DATA_TYPE_MEDIA && data.mediaEndTimeMs > data.mediaStartTimeMs && data.mediaStartTimeMs != C.TIME_UNSET) stats.recordMedia(info.bytesLoaded, data.mediaStartTimeMs, data.mediaEndTimeMs)
        if (data.dataType == C.DATA_TYPE_MANIFEST || info.uri.path?.contains(".m3u8") == true) stats.finalUrl = info.uri.toString()
    }
    override fun onPositionDiscontinuity(eventTime: AnalyticsListener.EventTime, oldPosition: Player.PositionInfo, newPosition: Player.PositionInfo, reason: Int) {
        if (reason == Player.DISCONTINUITY_REASON_SEEK) { stats.seekGraceUntil = SystemClock.elapsedRealtime() + 2000; if (stats.ignoreNextSeek) stats.ignoreNextSeek = false else stats.onSeek?.invoke() }
    }
}

/** All playback commands/getters and their threading belong to GSY's shipped adapter. */
@UnstableApi
internal class FreeTVEngine(private val stats: EngineStats): Exo2PlayerManager() {
    private val main = Handler(Looper.getMainLooper())
    private var watched: ExoPlayer? = null
    private val observer = PlaybackObserver(stats)
    companion object {
        // GSY 14 exposes the wrapper but no core getter. This accessor only attaches
        // read-only metrics; it never changes GSY fields or its control state.
        private val coreField = IjkExo2MediaPlayer::class.java.getDeclaredField("mInternalPlayer").apply { isAccessible = true }
    }
    fun engine(): ExoPlayer? = (getMediaPlayer() as? IjkExo2MediaPlayer)?.let { coreField.get(it) as? ExoPlayer }
    override fun initVideoPlayer(context: Context, message: Message, options: MutableList<VideoOptionModel>?, cache: ICacheManager?) {
        super.initVideoPlayer(context, message, options, cache)
        val model = message.obj as GSYModel
        val http = DefaultHttpDataSource.Factory().setConnectTimeoutMs(if(stats.candidate) 4000 else 8000).setReadTimeoutMs(if(stats.candidate) 4000 else 8000).setAllowCrossProtocolRedirects(true).setDefaultRequestProperties(model.mapHeadData ?: emptyMap())
        http.setTransferListener(object: TransferListener {
            private val samples = IdentityHashMap<DataSource, TransferSample>()
            @Synchronized override fun onTransferInitializing(source: DataSource, spec: DataSpec, network: Boolean) { if(network) samples[source] = TransferSample(SystemClock.elapsedRealtime()) }
            @Synchronized override fun onTransferStart(source: DataSource, spec: DataSpec, network: Boolean) { if(network && !samples.containsKey(source)) samples[source] = TransferSample(SystemClock.elapsedRealtime()) }
            @Synchronized override fun onBytesTransferred(source: DataSource, spec: DataSpec, network: Boolean, count: Int) { if(network) samples[source]?.let { it.bytes += count } }
            @Synchronized override fun onTransferEnd(source: DataSource, spec: DataSpec, network: Boolean) { val sample = samples.remove(source); if(network && sample != null && sample.bytes > 0) stats.recordNetwork(sample.bytes, SystemClock.elapsedRealtime()-sample.began) }
        })
        val app = context.applicationContext
        val cached = DataSource.Factory { CacheDataSource.Factory().setCache(PlayerCache.get(app)).setUpstreamDataSourceFactory(http).setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR).createDataSource() }
        val dataSource = DataSource.Factory { PlaybackDataSource(stats,http,cached) }
        val wrapper = getMediaPlayer() as IjkExo2MediaPlayer
        wrapper.setCache(false)
        wrapper.setMediaSource(DefaultMediaSourceFactory(dataSource).createMediaSource(MediaItem.fromUri(model.url)))
        // Normal playback uses Media3's standard thresholds. Only the hidden probe
        // has a smaller preload budget, and still needs a decoded frame + 3s buffer.
        if(stats.candidate) wrapper.setLoadControl(DefaultLoadControl.Builder().setBufferDurationsMs(3000,12000,500,1000).build())
        fun attach(attempt: Int) {
            if(getMediaPlayer() !== wrapper) return
            val core = engine()
            if(core != null) { if(stats.candidate) core.volume = 0f; core.addAnalyticsListener(observer); watched = core }
            else if(attempt < 80) main.postDelayed({ attach(attempt+1) }, if(attempt == 0) 0 else 50)
        }
        main.post { attach(0) }
    }
    override fun seekTo(time: Long) {
        var target = time
        if(stats.initialSeekPending) { stats.initialSeekPending = false; val length = getDuration(); if(length > 0 && target >= length) target = 0 }
        super.seekTo(target)
    }
    override fun release() { stats.startup?.cancel(); watched?.removeAnalyticsListener(observer); watched = null; super.release() }
}

@UnstableApi
internal class SlotManager(private val stats: EngineStats): GSYVideoBaseManager() {
    private var disposed = false
    init { init() }
    override fun getPlayManager(): IPlayerManager = FreeTVEngine(stats)
    fun engine(): FreeTVEngine? = getPlayer() as? FreeTVEngine
    fun dispose() { if(disposed) return; disposed = true; releaseMediaPlayer() }
}

@UnstableApi
internal class ScopedVideo(context: Context, val stats: EngineStats): StandardGSYVideoPlayer(context) {
    val manager = SlotManager(stats).also { it.initContext(context.applicationContext) }
    val playbackRequested: Boolean get() = !mPauseBeforePrepared && mCurrentState in listOf(CURRENT_STATE_PREPAREING,CURRENT_STATE_PLAYING,CURRENT_STATE_PLAYING_BUFFERING_START)
    override fun getGSYVideoManager(): GSYVideoViewBridge = manager
    fun suppressProbeFocus() { mAudioFocusManager = null }
    fun activateFocus() { if(mAudioFocusManager == null) super.initAudioFocusManager(); mAudioFocusManager?.requestAudioFocus() }
    fun disposeFocus() { mAudioFocusManager?.abandonAudioFocus() }
    private var tv = false
    override fun setViewShowState(view:View?, visibility:Int) {super.setViewShowState(view,if(tv&&(view===mTopContainer||view===mBottomContainer||view===mStartButton||view===mBottomProgressBar))View.GONE else visibility)}
    fun configureTV() {tv=true;setIsTouchWiget(false);setIsTouchWigetFull(false);com.shuyu.gsyvideoplayer.utils.GSYVideoType.setShowType(com.shuyu.gsyvideoplayer.utils.GSYVideoType.SCREEN_TYPE_DEFAULT);hideAllWidget();mTopContainer.visibility=View.GONE;mBottomContainer.visibility=View.GONE;fullscreenButton.visibility=View.GONE;backButton.visibility=View.GONE}
    fun toggleTV() {clickStartIcon()}
    override fun onClickUiToggle(event:android.view.MotionEvent?) {if(!tv)super.onClickUiToggle(event)}
    override fun clickStartIcon() {
        if(mCurrentState == CURRENT_STATE_ERROR || stats.error.isNotEmpty()) { stats.onRetry?.invoke(); return }
        super.clickStartIcon()
    }
    override fun releaseVideos() { manager.dispose() }
    override fun backFromFull(context: Context) = false
}
