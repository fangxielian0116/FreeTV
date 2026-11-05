import type { SourceDefinition } from './catalog'
import { parseHttpUrl } from './http-url'
const seed = (id: string, name: string, api: string, prior: number, aliases: string[] = []): SourceDefinition => ({ id, name, api, prior, aliases: [name, ...aliases], enabled: true })
export const BUILTIN_SOURCES: SourceDefinition[] = [
  seed('xigua', '西瓜', 'https://caiji.xgzyapi.com/api.php/provide/vod/', .95),
  seed('qiyi', '期颐', 'https://iqiyizyapi.com/api.php/provide/vod/from/iqym3u8', .8),
  seed('modu', '魔都', 'https://caiji.moduapi.cc/api.php/provide/vod/from/modum3u8', .8, ['魔都2']),
  seed('tianya', '天涯', 'https://tyyszyapi.com/api.php/provide/vod/', .8),
  seed('baidu', '百度', 'https://api.apibdzy.com/api.php/provide/vod/', .8),
  seed('wusun', '无损云', 'https://api.wsyzy.net/api.php/provide/vod/', .8),
  seed('niuniu', '牛牛', 'https://api.niuniuzy.me/api.php/provide/vod/', .8),
  seed('360', '360', 'https://360zy.com/api.php/provide/vod/at/json', .8, ['HD(LY)']),
  seed('bf', 'BF', 'https://bfzyapi.com/api.php/provide/vod/', .65, ['HD(BF)']),
  seed('tiantang', '天堂', 'http://caiji.dyttzyapi.com/api.php/provide/vod/', .65),
  seed('wuyou', '无忧', 'https://www.wyvod.com/api.php/provide/vod/', .65),
  seed('zuidai', '最大', 'https://api.zuidapi.com/api.php/provide/vod/', .65),
  seed('ok', 'OK', 'http://api.okzyw.net/api.php/provide/vod/', .65),
  seed('feifan', '非凡', 'http://api.ffzyapi.com/api.php/provide/vod/', .65, ['非凡(FF)']),
]
export const DEFAULT_SOURCE = 'xigua'
export const SOURCE_UPSTREAM = 'https://raw.githubusercontent.com/whyyy-404/video_freevip/main/vip-video.user.js'
export const SOURCE_PROXY = 'https://gh-proxy.com/'
export function normalizeApi(input: string) {
  const url = parseHttpUrl(input)
  return url.origin + (url.pathname === '/' ? '/api.php/provide/vod/' : url.pathname) + url.search
}
