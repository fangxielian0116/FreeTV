<template>
  <button class="drama-card" :data-tv-id="'drama-'+itemKey(item)" @click="$emit('open', item)"><view class="poster"><PosterImage class="poster-content" :src="item.poster" :title="item.title" :refresh-key="refreshKey" :eager="eager" :cache-key="itemKey(item)"/><text v-if="item.remarks" class="card-badge">{{item.remarks}}</text></view><view class="card-copy"><text class="card-name">{{item.title}}</text><text class="card-category">{{item.categories[0]?.name || '影视'}} {{item.year ? '· '+item.year : ''}}</text></view></button>
</template>
<script setup lang="ts">
import PosterImage from './PosterImage.vue'
import {itemKey,type CatalogItem} from '@/domain/catalog'
defineProps<{item:CatalogItem;refreshKey?:string|number;eager?:boolean}>();defineEmits<{open:[item:CatalogItem]}>()
</script>
<style scoped>
.drama-card{display:block;width:100%;padding:0;text-align:left;background:transparent;color:var(--ft-text)}.poster{position:relative;height:0;padding-top:140%;border-radius:12px;overflow:hidden;background:var(--ft-soft)}.poster-content{position:absolute;top:0;left:0;width:100%;height:100%}.card-copy{padding:10px 1px 15px}.card-name{display:block;font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.card-category{display:block;font-size:11px;color:var(--ft-muted);margin-top:4px}.card-badge{position:absolute;left:7px;right:7px;bottom:7px;width:max-content;max-width:calc(100% - 14px);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background:#1c3547d9;border-radius:5px;color:white;font-size:10px;padding:3px 6px}
</style>
