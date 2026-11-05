package com.fxl.freetv.test;

import android.app.Activity;
import android.app.Application;
import android.app.Instrumentation;
import android.content.Intent;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import org.json.JSONObject;
import org.json.JSONArray;
import java.lang.reflect.Proxy;
import java.util.ArrayList;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/** All user actions below are physical Android key events, never synthetic DOM clicks. */
public class TVChecks extends Instrumentation {
    private Bundle arguments;
    private final AtomicReference<Activity> visible=new AtomicReference<>();
    private void check(boolean value,String message){if(!value)throw new AssertionError(message);}
    private void note(String message){Bundle b=new Bundle();b.putString("stream",message+"\n");sendStatus(0,b);}
    private void screenshot(String label)throws Exception{android.graphics.Bitmap image=getUiAutomation().takeScreenshot();if(image==null)return;String name="tv-"+label+"-"+System.currentTimeMillis()+".png";android.content.ContentValues values=new android.content.ContentValues();values.put(android.provider.MediaStore.MediaColumns.DISPLAY_NAME,name);values.put(android.provider.MediaStore.MediaColumns.MIME_TYPE,"image/png");values.put(android.provider.MediaStore.MediaColumns.RELATIVE_PATH,"Download/FreeTV");android.net.Uri uri=getTargetContext().getContentResolver().insert(android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI,values);try(java.io.OutputStream out=getTargetContext().getContentResolver().openOutputStream(uri)){image.compress(android.graphics.Bitmap.CompressFormat.PNG,100,out);}note("TV_SCREENSHOT /sdcard/Download/FreeTV/"+name);}
    @Override public void onCreate(Bundle args){arguments=args;super.onCreate(args);start();}
    private void views(View view,ArrayList<WebView> out){if(view instanceof WebView&&view.isShown())out.add((WebView)view);if(view instanceof ViewGroup){ViewGroup g=(ViewGroup)view;for(int i=0;i<g.getChildCount();i++)views(g.getChildAt(i),out);}}
    private JSONObject dom()throws Exception{
        Activity activity=visible.get();if(activity==null)return new JSONObject();
        JSONObject diagnostic=new JSONObject();ArrayList<WebView> webviews=new ArrayList<>();runOnMainSync(()->views(activity.getWindow().getDecorView(),webviews));
        String script="(function(){var root=document.querySelector('.tv-screen');if(!root)return JSON.stringify({total:0,url:location.href,body:document.body?document.body.innerHTML.slice(0,2000):'no body'});var a=document.activeElement;var controls=Array.from(root.querySelectorAll('[data-tv-focus]')).filter(function(e){return e.getClientRects().length&&!e.disabled}).map(function(e){var r=e.getBoundingClientRect();return {id:e.getAttribute('data-tv-id')||'',focus:e.getAttribute('data-tv-focus'),text:(e.textContent||'').trim(),x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height}});return JSON.stringify({total:controls.length,focus:root.contains(a)?a.getAttribute('data-tv-focus'):'',focusId:a&&a.getAttribute('data-tv-id'),text:root.textContent,query:root.querySelector('.tv-query')?root.querySelector('.tv-query').firstElementChild.textContent:'',controls:controls,width:innerWidth,height:innerHeight,columns:root.querySelector('.drama-grid')?getComputedStyle(root.querySelector('.drama-grid')).gridTemplateColumns:'',outline:a?getComputedStyle(a).outlineWidth:'',unit:getComputedStyle(root).getPropertyValue('--tv-unit')})})()";
        for(int i=webviews.size()-1;i>=0;i--){WebView web=webviews.get(i);LinkedBlockingQueue<String> q=new LinkedBlockingQueue<>();runOnMainSync(()->web.evaluateJavascript(script,q::offer));String raw=q.poll(3,TimeUnit.SECONDS);if(raw!=null){Object decoded=new org.json.JSONTokener(raw).nextValue();if(decoded instanceof String){JSONObject d=new JSONObject((String)decoded);if(d.optInt("total")>0)return d;diagnostic=d;}}}
        return diagnostic;
    }
    private JSONObject waitText(String text,long timeout)throws Exception{long until=System.currentTimeMillis()+timeout;JSONObject d=new JSONObject();while(System.currentTimeMillis()<until){d=dom();if(d.optString("text").contains(text)&&!d.optString("focus").isEmpty())return d;Thread.sleep(100);}throw new AssertionError("Missing screen or initial focus "+text+": "+d);}
    private void key(int code)throws Exception{sendKeyDownUpSync(code);Thread.sleep(220);}
    private JSONObject control(JSONObject d,String id,boolean byText)throws Exception{JSONArray list=d.optJSONArray("controls");if(list!=null)for(int i=0;i<list.length();i++){JSONObject row=list.getJSONObject(i);if((byText?row.optString("text"):row.optString("id")).equals(id))return row;}return null;}
    private void move(String id,boolean byText)throws Exception{
        for(int step=0;step<50;step++){
            JSONObject d=dom(),target=control(d,id,byText),focused=null;
            if(target==null&&step<15){Thread.sleep(150);continue;}
            check(target!=null,"Missing focus target "+id+": "+d);
            JSONArray rows=d.getJSONArray("controls");for(int i=0;i<rows.length();i++)if(rows.getJSONObject(i).optString("focus").equals(d.optString("focus")))focused=rows.getJSONObject(i);
            if(focused==null){Thread.sleep(100);continue;}
            if(focused.optString("focus").equals(target.optString("focus")))return;
            double dx=target.getDouble("x")-focused.getDouble("x"),dy=target.getDouble("y")-focused.getDouble("y");
            int code=Math.abs(dy)>Math.min(target.getDouble("h"),focused.getDouble("h"))*.65?(dy>0?20:19):(dx>0?22:21);
            key(code);
            if(dom().optString("focus").equals(d.optString("focus"))){code=(code==19||code==20)?(dx>0?22:21):(dy>0?20:19);key(code);}
        }
        throw new AssertionError("D-pad could not reach "+id+": "+dom());
    }
    private void select(String id,boolean byText)throws Exception{move(id,byText);key(KeyEvent.KEYCODE_DPAD_CENTER);}
    private JSONObject waitPrefix(String prefix,long timeout)throws Exception{long until=System.currentTimeMillis()+timeout;while(System.currentTimeMillis()<until){JSONArray rows=dom().optJSONArray("controls");if(rows!=null)for(int i=0;i<rows.length();i++)if(rows.getJSONObject(i).optString("id").startsWith(prefix))return rows.getJSONObject(i);Thread.sleep(250);}throw new AssertionError("Missing control prefix "+prefix+": "+dom());}
    private JSONObject waitResults()throws Exception{
        boolean retried=false;long until=System.currentTimeMillis()+60000;
        while(System.currentTimeMillis()<until){JSONObject d=dom();JSONArray rows=d.optJSONArray("controls");if(rows!=null)for(int i=0;i<rows.length();i++)if(rows.getJSONObject(i).optString("id").startsWith("drama-"))return rows.getJSONObject(i);
            if(!retried&&control(d,"retry-search",false)!=null){check("retry-search".equals(d.optString("focusId")),"Failed search did not focus retry");note("TV_SEARCH_NETWORK One source request failed; focused retry was reachable");select("retry-search",false);retried=true;}
            Thread.sleep(250);
        }throw new AssertionError("No source results after a visible retry: "+dom());
    }
    private void heldOK()throws Exception{long start=android.os.SystemClock.uptimeMillis();for(int repeat=0;repeat<5;repeat++){getUiAutomation().injectInputEvent(new KeyEvent(start,android.os.SystemClock.uptimeMillis(),KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_DPAD_CENTER,repeat,0,KeyEvent.KEYCODE_UNKNOWN,0,0,android.view.InputDevice.SOURCE_DPAD),true);Thread.sleep(120);}getUiAutomation().injectInputEvent(new KeyEvent(start,android.os.SystemClock.uptimeMillis(),KeyEvent.ACTION_UP,KeyEvent.KEYCODE_DPAD_CENTER,0,0,KeyEvent.KEYCODE_UNKNOWN,0,0,android.view.InputDevice.SOURCE_DPAD),true);Thread.sleep(250);}
    private String titleSyncTime(String text){java.util.regex.Matcher m=java.util.regex.Pattern.compile("最近更新：(\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2})").matcher(text);return m.find()?m.group(1):"";}
    private void syncPolicy()throws Exception{
        select("设置",true);waitText("热门片名",30000);
        long until=System.currentTimeMillis()+150000;JSONObject state=dom();
        while(System.currentTimeMillis()<until){state=dom();if(control(state,"更新热门片名",true)!=null)break;Thread.sleep(500);}
        check(control(state,"更新热门片名",true)!=null&&state.optString("text").contains("热门片名已更新"),"Cold-start index refresh did not complete: "+state);
        check(state.optString("text").contains("冷启动时后台更新")&&!state.optString("text").contains("每小时"),"Hourly update UI remains");
        String updated=titleSyncTime(state.optString("text")),previous=arguments.getString("previousTime","").replace('T',' ');
        check(!updated.isEmpty()&&(previous.isEmpty()||!previous.equals(updated)),"New cold start did not refresh the recent cache: "+updated);
        key(KeyEvent.KEYCODE_BACK);waitText("近期新作",5000);select("设置",true);waitText("热门片名",5000);
        Thread.sleep(1200);check(updated.equals(titleSyncTime(dom().optString("text")))&&control(dom(),"更新热门片名",true)!=null,"Page return started another title refresh");
        getUiAutomation().performGlobalAction(android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_HOME);Thread.sleep(750);
        Intent launch=getTargetContext().getPackageManager().getLaunchIntentForPackage(getTargetContext().getPackageName());startActivitySync(launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_REORDER_TO_FRONT));Thread.sleep(1500);
        if(!dom().optString("text").contains("热门片名"))select("设置",true);
        waitText("热门片名",10000);Thread.sleep(1000);
        check(updated.equals(titleSyncTime(dom().optString("text")))&&control(dom(),"更新热门片名",true)!=null,"Warm resume started another title refresh");
        note("TV_COLD_SYNC "+updated);note("TV_WARM_SYNC No new update on page return or foreground resume");screenshot("cold-sync-policy");
    }
    private void journey()throws Exception{
        JSONObject suggestion=waitPrefix("suggest-",5000);select(suggestion.getString("id"),false);
        JSONObject card=waitResults();String cardId=card.getString("id");Thread.sleep(500);
        JSONObject results=dom();check(cardId.equals(results.optString("focusId")),"New results did not focus the first poster: "+results);
        check(control(results,"key-A",false)==null,"Keyboard still crowds search results");
        check(card.getDouble("y")+card.getDouble("h")/2<results.getDouble("height"),"First result is below the visible screen: "+card);
        screenshot("results");select(cardId,false);waitText("选集播放",20000);
        if(control(dom(),"＋ 加入追剧",true)!=null)select("＋ 加入追剧",true);
        check(dom().optString("text").contains("已加入追剧"),"Favorite was not saved");screenshot("detail");
        JSONObject episode=waitPrefix("episode-",15000);String episodeId=episode.getString("id");select(episodeId,false);
        long until=System.currentTimeMillis()+15000;while(System.currentTimeMillis()<until&&(visible.get()==null||!visible.get().getClass().getName().endsWith("FreeTVPlayerActivity")))Thread.sleep(250);
        check(visible.get()!=null&&visible.get().getClass().getName().endsWith("FreeTVPlayerActivity"),"Episode did not open native player");
        Thread.sleep(2500);screenshot("player");key(KeyEvent.KEYCODE_BACK);key(KeyEvent.KEYCODE_BACK);waitText("选集播放",10000);
        check(episodeId.equals(dom().optString("focusId")),"Returning from player lost episode focus: "+dom());
        key(KeyEvent.KEYCODE_BACK);waitText("搜索结果",10000);check(cardId.equals(dom().optString("focusId")),"Returning from details lost result focus");
        note("TV_JOURNEY Search suggestion, source result, favorite, episode, native player and focus restoration passed");
    }
    @Override public void onStart(){
        Bundle result=new Bundle();Application app=(Application)getTargetContext().getApplicationContext();
        Application.ActivityLifecycleCallbacks observer=(Application.ActivityLifecycleCallbacks)Proxy.newProxyInstance(getClass().getClassLoader(),new Class<?>[]{Application.ActivityLifecycleCallbacks.class},(proxy,method,args)->{if("onActivityResumed".equals(method.getName()))visible.set((Activity)args[0]);if("hashCode".equals(method.getName()))return System.identityHashCode(proxy);if("equals".equals(method.getName()))return proxy==args[0];return null;});
        app.registerActivityLifecycleCallbacks(observer);
        try{
            Intent launch=getTargetContext().getPackageManager().getLaunchIntentForPackage(getTargetContext().getPackageName());check(launch!=null,"Missing standard launcher");startActivitySync(launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            JSONObject home=waitText("近期新作",30000);note("TV_HOME "+home);screenshot("home");
            check(!home.optString("focus").isEmpty(),"Initial TV focus missing");
            if("syncPolicy".equals(arguments.getString("mode"))){syncPolicy();}
            else if(!"inspect".equals(arguments.getString("mode"))){
                String before=home.optString("focus");key(22);check(!dom().optString("focus").equals(before),"Physical DPAD_RIGHT did not move focus");
                check(control(home,"搜索",true)==null,"Duplicate search navigation remains");
                JSONObject entry=control(home,"search-entry",false),discover=control(home,"发现",true);check(entry!=null&&Math.abs(entry.getDouble("y")-discover.getDouble("y"))<10,"Search entry is not in the top header");
                select("search-entry",false);waitText("例如 kb",10000);
                select("key-K",false);move("key-B",false);heldOK();
                JSONObject search=waitText("片名联想",3000);check(search.optString("query").equals("kb"),"Keyboard entered a key more than once: "+search);
                note("TV_KEYBOARD "+search);screenshot("keyboard");
                if("journey".equals(arguments.getString("mode"))){journey();select("edit-search",false);waitText("例如 kb",5000);check(!dom().optString("query").isEmpty(),"Editing search lost the keyword");select("submit-search",false);waitResults();Thread.sleep(500);check(dom().optString("focusId").startsWith("drama-"),"Searching again did not focus results");}
                key(KeyEvent.KEYCODE_BACK);waitText("近期新作",10000);check(dom().optString("focus").equals("search-entry:1"),"Returning did not restore search entry focus: "+dom());
                select("设置",true);waitText("热门片名",10000);select("固定片库",true);waitText("选择固定片库",5000);
                JSONObject picker=dom();check(picker.optString("focus").startsWith("关闭"),"Picker did not capture focus: "+picker);
                for(int n=0;n<8;n++)key(20);
                check(!dom().optString("focus").isEmpty(),"Picker lost focus while scrolling");
                key(KeyEvent.KEYCODE_BACK);waitText("片库配置",5000);check(dom().optString("focus").startsWith("固定片库"),"Closing picker did not restore focus: "+dom());
                if("journey".equals(arguments.getString("mode"))){
                    long readyUntil=System.currentTimeMillis()+120000;
                    while(System.currentTimeMillis()<readyUntil&&control(dom(),"更新热门片名",true)==null)Thread.sleep(500);
                    check(control(dom(),"更新热门片名",true)!=null,"Cold-start title update did not release the manual update button");
                    String beforeSync=titleSyncTime(dom().optString("text"));select("更新热门片名",true);long syncUntil=System.currentTimeMillis()+120000;String afterSync=beforeSync;
                    while(System.currentTimeMillis()<syncUntil){JSONObject state=dom();afterSync=titleSyncTime(state.optString("text"));if(!afterSync.isEmpty()&&!afterSync.equals(beforeSync)&&state.optString("text").contains("热门片名已更新"))break;Thread.sleep(500);}
                    check(!afterSync.isEmpty()&&!afterSync.equals(beforeSync),"Manual title update did not complete: "+dom());screenshot("settings-sync");note("TV_TITLES_SYNC Manual background refresh completed on Android TV: "+afterSync);
                }
                key(KeyEvent.KEYCODE_BACK);waitText("近期新作",10000);
            }
            note("TV_INSPECT "+dom());result.putString("stream","FreeTV TV UI checks passed\n");finish(Activity.RESULT_OK,result);
        }catch(Throwable error){try{note("TV_FAILURE_DOM "+dom());screenshot("failure");}catch(Exception ignored){}result.putString("stream","FreeTV TV UI checks failed: "+error+"\n");finish(Activity.RESULT_CANCELED,result);}
        finally{app.unregisterActivityLifecycleCallbacks(observer);}
    }
}
