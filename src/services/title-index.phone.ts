import type {TitleSuggestion} from '@/domain/title-index'
// Phone builds preserve touch/IME search and do not load the TV dictionary or scheduler.
export const titleSyncState={busy:false,count:0,updatedAt:0,completed:0,message:''}
export const hotTitles={suggestions:(_input:string):TitleSuggestion[]=>[],refresh:async(_force=false)=>{},pause:()=>{},resume:async()=>{}}
export function setTitleForeground(_value:boolean){}
export function setTitlePlayback(_value:boolean){}
export function titleSearchHistory():string[]{return []}
export function rememberTitleSearch(_input:string){}
