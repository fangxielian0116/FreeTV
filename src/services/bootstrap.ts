import { clearLegacyData } from './storage'
import { initializeSources, syncSources } from './source-store'
import { library } from './library'
import { player } from '@/platform/player'
let initialized = false
export function bootstrap() {
  if (initialized) return
  clearLegacyData(); initializeSources(); initialized = true
  restoreNativeProgress(); void syncSources()
}
export function restoreNativeProgress() { const progress = player.readPending(); if (progress) { library.saveProgress(progress); player.acknowledgeProgress(progress) } }
