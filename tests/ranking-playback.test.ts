import test from 'node:test'
import assert from 'node:assert/strict'
import { rankSources, recordObservation, HALF_LIFE_MS } from '../src/domain/ranking'
import { BUILTIN_SOURCES } from '../src/domain/sources'
import { StallTracker, playbackReward, resumePosition, type PlaybackEvent } from '../src/domain/playback'
test('One attempt is corrected instead of accumulating unlimited positive samples', () => {
  let rows = recordObservation([], { id: 'one', sourceId: 'xigua', reward: 1, weight: 1, at: 100, reason: '' })
  rows = recordObservation(rows, { id: 'one', sourceId: 'xigua', reward: 0, weight: 1, at: 101, reason: '' })
  assert.equal(rows.length, 1); assert.equal(rows[0].reward, 0)
})
test('Discounted confidence lets unused candidates re-enter selection and keeps means bounded', () => {
  const sources = BUILTIN_SOURCES.slice(0, 4), rows = Array.from({ length: 100 }, (_, i) => ({ id: String(i), sourceId: 'xigua', reward: 1, weight: 1, at: 1000, reason: '' }))
  const ranked = rankSources(sources, rows, 1000, 1000)
  assert.notEqual(ranked[0].source.id, 'xigua')
  assert.ok(ranked.every(x => x.mean >= 0 && x.mean <= 1))
  const later = rankSources(sources, rows, 1000 + HALF_LIFE_MS, 1000)
  assert.ok(later.find(x => x.source.id === 'xigua')!.count < ranked.find(x => x.source.id === 'xigua')!.count)
})
test('Seek, pause and offline do not count as stalls; repeated real rebuffering does', () => {
  const tracker = new StallTracker()
  assert.equal(tracker.update('buffering', 1000, false), false)
  assert.equal(tracker.update('buffering', 100000, false), false)
  assert.equal(tracker.update('buffering', 200000, true), false)
  assert.equal(tracker.update('playing', 203500, true), false)
  assert.equal(tracker.update('buffering', 205000, true), false)
  assert.equal(tracker.update('buffering', 208500, true), true)
})
test('Positive feedback needs real watch time and actual widescreen resolution, with safe progress bounds', () => {
  const event: PlaybackEvent = { sessionId: 'a', state: 'playing', position: 0, duration: 1000, online: true, at: 0, metrics: { effectiveSeconds: 119, rebufferCount: 0, rebufferMs: 0, width: 1920, height: 800, bufferedSeconds: 10, droppedFrames: 0 } }
  assert.equal(playbackReward(event), undefined); event.metrics.effectiveSeconds = 120
  assert.equal(playbackReward(event), 1); event.online = false; event.state = 'error'; assert.equal(playbackReward(event), undefined)
  assert.equal(resumePosition(1800, 1000), 0); assert.equal(resumePosition(300, 1000), 300)
})

test('Past rebuffer events do not repeatedly trigger recovery while playback stays healthy', () => {
  const tracker = new StallTracker()
  tracker.update('buffering',1000,true); tracker.update('playing',4500,true)
  tracker.update('buffering',6000,true); assert.equal(tracker.update('buffering',9500,true),true)
  assert.equal(tracker.update('playing',10000,true),true)
  assert.equal(tracker.update('playing',12000,true),false)
  assert.equal(tracker.update('playing',14000,true),false)
  assert.equal(tracker.update('buffering',15000,true),false)
})
