package uts.sdk.modules.freetvPlayer

import android.content.Context
import android.net.Uri
import android.os.SystemClock
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.ByteArrayDataSource
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.hls.playlist.HlsMultivariantPlaylist
import androidx.media3.exoplayer.hls.playlist.HlsMediaPlaylist
import androidx.media3.exoplayer.hls.playlist.HlsPlaylistParser
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.Future
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/** One launch's fresh playlists, fetched while Android builds/draws the player window.
 * No extra decoder, media scan, persistent playlist cache, or replacement player thread.
 */
@UnstableApi
internal object PlaybackStartup {
    private val io = ThreadPoolExecutor(2, 2, 30, TimeUnit.SECONDS, ArrayBlockingQueue(2),
        { task -> Thread(task, "FreeTV-startup-io").apply { isDaemon = true } }, ThreadPoolExecutor.DiscardOldestPolicy())
    private val cacheScheduled = AtomicBoolean(false)
    private var current: Launch? = null

    @Synchronized fun begin(context: Context, request: JSONObject): Launch {
        val session = request.getString("sessionId")
        current?.takeIf { it.session == session }?.let { return it }
        current?.cancel()
        val headers = mutableMapOf<String, String>()
        request.optJSONObject("headers")?.let { values -> values.keys().forEach { headers[it] = values.getString(it) } }
        val launch = Launch(session, request.getJSONObject("episode").getString("url"), headers)
        current = launch
        // Cache index/disk initialization and HTTP setup are independent jobs.
        if (cacheScheduled.compareAndSet(false, true)) {
            val app = context.applicationContext
            io.execute { try { PlayerCache.get(app) } catch (_: Exception) { cacheScheduled.set(false) } }
        }
        launch.start()
        return launch
    }

    internal data class Manifest(val bytes: ByteArray, val uri: Uri, val headers: Map<String, List<String>>, val networkMs: Long)

    internal class Launch(val session: String, private val url: String, private val headers: Map<String, String>) {
        private val began = SystemClock.elapsedRealtime()
        private val available = mutableMapOf<String, Manifest>()
        @Volatile private var cancelled = false
        private var task: Future<*>? = null
        fun start() {
            if (!Uri.parse(url).path.orEmpty().endsWith(".m3u8", true)) return
            task = io.submit {
                try {
                    val master = fetch(url) ?: return@submit
                    val playlist = HlsPlaylistParser().parse(master.uri, ByteArrayInputStream(master.bytes))
                    if (playlist is HlsMediaPlaylist && !playlist.hasEndTag) return@submit
                    publish(url, master)
                    if (playlist is HlsMultivariantPlaylist) {
                        // HLS variants are related alternatives; warm one, leave ABR selection to Media3.
                        val variant = playlist.variants.firstOrNull() ?: return@submit
                        val media = fetch(variant.url.toString()) ?: return@submit
                        val parsed = HlsPlaylistParser().parse(media.uri, ByteArrayInputStream(media.bytes))
                        if (parsed is HlsMediaPlaylist && parsed.hasEndTag) publish(variant.url.toString(), media)
                    }
                } catch (_: Exception) { /* Normal GSY loading remains the fallback. */ }
            }
        }
        private fun fetch(address: String): Manifest? {
            if (cancelled || SystemClock.elapsedRealtime() - began >= 5000) return null
            val source = DefaultHttpDataSource.Factory().setConnectTimeoutMs(2500).setReadTimeoutMs(2500)
                .setAllowCrossProtocolRedirects(true).setDefaultRequestProperties(headers).createDataSource()
            val started = SystemClock.elapsedRealtime()
            try {
                source.open(DataSpec(Uri.parse(address)))
                val body = ByteArrayOutputStream(); val buffer = ByteArray(16384)
                while (!cancelled && SystemClock.elapsedRealtime() - began < 5000) {
                    val count = source.read(buffer, 0, buffer.size)
                    if (count == -1) return Manifest(body.toByteArray(), source.uri ?: Uri.parse(address), source.responseHeaders, (SystemClock.elapsedRealtime() - started).coerceAtLeast(1))
                    if (body.size() + count > 2 * 1024 * 1024) return null
                    body.write(buffer, 0, count)
                }
                return null
            } finally { source.close() }
        }
        @Synchronized private fun publish(address: String, manifest: Manifest) {
            if (!cancelled) { available[address] = manifest; available[manifest.uri.toString()] = manifest }
        }
        @Synchronized fun take(address: String): Manifest? {
            if (cancelled || SystemClock.elapsedRealtime() - began > 10000) { cancel(); return null }
            val found = available[address]
            if (found == null) { cancel(); return null } // Never wait for speculative I/O.
            available.entries.removeAll { it.value === found }
            return found
        }
        @Synchronized fun cancel() { cancelled = true; available.clear(); task?.cancel(true) }
    }

    fun dataSource(manifest: Manifest): DataSource = object: DataSource {
        private val data = ByteArrayDataSource(manifest.bytes)
        override fun addTransferListener(listener: androidx.media3.datasource.TransferListener) = data.addTransferListener(listener)
        override fun open(spec: DataSpec): Long = data.open(spec.buildUpon().setUri(manifest.uri).build())
        override fun read(buffer: ByteArray, offset: Int, length: Int): Int = data.read(buffer, offset, length)
        override fun getUri(): Uri? = data.uri
        override fun getResponseHeaders(): Map<String, List<String>> = manifest.headers
        override fun close() = data.close()
    }
}
