export type ProductionRegion = 'domestic' | 'overseas' | 'unknown'
const domestic = /中国|中國|大陆|大陸|内地|內地|香港|澳门|澳門|台湾|臺灣|台灣|港澳台|国产|國產|国漫|國漫|港台|港澳|\b(?:china|prc|cn|hong\s*kong|hk|macau|macao|mo|taiwan|tw)\b/i
const overseas = /海外|国外|國外|欧美|歐美|日韩|日韓|新马|新馬|美剧|美劇|英剧|英劇|日剧|日劇|韩剧|韓劇|美国|美國|英国|英國|日本|韩国|韓國|朝鲜|朝鮮|泰国|泰國|法国|法國|德国|德國|俄罗斯|俄羅斯|加拿大|澳大利亚|澳大利亞|澳洲|新西兰|新西蘭|新加坡|马来西亚|馬來西亞|印度|印尼|印度尼西亚|菲律宾|菲律賓|越南|老挝|緬甸|缅甸|柬埔寨|蒙古|尼泊尔|巴基斯坦|孟加拉|斯里兰卡|伊朗|伊拉克|以色列|土耳其|沙特|阿联酋|黎巴嫩|约旦|也门|阿富汗|西班牙|葡萄牙|意大利|瑞典|挪威|丹麦|丹麥|芬兰|芬蘭|冰岛|冰島|荷兰|荷蘭|比利时|瑞士|奥地利|波兰|波蘭|捷克|斯洛伐克|匈牙利|罗马尼亚|保加利亚|希腊|希臘|爱尔兰|愛爾蘭|乌克兰|烏克蘭|白俄罗斯|立陶宛|拉脱维亚|爱沙尼亚|塞尔维亚|克罗地亚|斯洛文尼亚|波黑|阿尔巴尼亚|格鲁吉亚|哈萨克斯坦|乌兹别克斯坦|巴西|阿根廷|墨西哥|智利|秘鲁|哥伦比亚|委内瑞拉|乌拉圭|厄瓜多尔|玻利维亚|古巴|波多黎各|南非|埃及|摩洛哥|尼日利亚|肯尼亚|突尼斯|阿尔及利亚|欧洲|歐洲|北美|南美|\b(?:usa?|uk|united states|united kingdom|japan|jp|korea|kr|france|germany|canada|australia|singapore|malaysia|thailand|india|russia|spain|italy|brazil|mexico)\b/i

// Co-productions containing a domestic production region belong to domestic.
// Language labels such as Mandarin or Cantonese never determine production region.
export function productionRegion(values: readonly string[] = []): ProductionRegion {
  if (values.some(value => domestic.test(value))) return 'domestic'
  if (values.some(value => overseas.test(value))) return 'overseas'
  return 'unknown'
}
