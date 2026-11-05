// Set by the dedicated TV build; never infer television mode from screen width.
import {versionName} from '@/manifest.json'
export const TV_BUILD = typeof __FREETV_TV__ !== 'undefined' && __FREETV_TV__
export const APP_VERSION = versionName
