package com.fxl.freetv.test;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.os.Bundle;
import org.json.JSONObject;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import android.graphics.Bitmap;
import java.io.File;
import java.io.FileOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import org.json.JSONArray;

/** Runs inside the installed app. No exported debug endpoint is added to the release APK. */
public class PlayerChecks extends Instrumentation {
    private static final long VERIFY_MS = 12000;
    private static final long COMMIT_MS = 5000;
    private final LinkedBlockingQueue<JSONObject> messages = new LinkedBlockingQueue<>();
    private Object bridge;
    private Method command;
    private Bundle arguments;
    private JSONObject latest;
    private Activity inspectedActivity;
    private String lastUiState="";
    private long startupOpenAt;
    private boolean startupTraceError;
    private volatile boolean startupSampling;
    private boolean methodTracing;
    private volatile long renderedFirstFrameAt,renderedFirstFrameCallbackAt;
    private boolean startupWatching;
    private String sourceSession="";
    private boolean suppressUiInspection;
    private final java.util.IdentityHashMap<Object,Boolean> tracedCores=new java.util.IdentityHashMap<>();
    private final java.util.concurrent.ConcurrentLinkedQueue<String> startupNotes=new java.util.concurrent.ConcurrentLinkedQueue<>();
    private int sequence;
    private String base;
    private String run;
    private String url(String path) { return base + "/" + path + "-" + run + "/index.m3u8"; }
    @Override public void onCreate(Bundle args) { arguments = args; super.onCreate(args); start(); }
    @Override public void onStart() {
        Bundle result = new Bundle();
        if("cleanupFixture".equals(arguments.getString("mode"))){try{
            cleanupSyntheticLibraryProgress();
            android.content.SharedPreferences preferences=getTargetContext().getSharedPreferences("freetv-player-v3",android.content.Context.MODE_PRIVATE);
            String pending=preferences.getString("pending","");
            if(!pending.isEmpty()){JSONObject value=new JSONObject(pending);if("fixture".equals(value.optString("sourceId"))&&"fixture".equals(value.optString("vodId")))preferences.edit().remove("pending").commit();}
            result.putString("stream","Only synthetic fixture pending progress was cleared\n");finish(Activity.RESULT_OK,result);
        }catch(Throwable error){result.putString("stream","Fixture cleanup failed: "+error+"\n");finish(Activity.RESULT_CANCELED,result);}return;}
        if("exportTrace".equals(arguments.getString("mode"))){try{
            File trace=new File(getTargetContext().getExternalFilesDir(null),"startup-method-1.trace");
            android.content.ContentValues values=new android.content.ContentValues();String name="freetv-startup-"+System.currentTimeMillis()+".trace";
            values.put(android.provider.MediaStore.MediaColumns.DISPLAY_NAME,name);values.put(android.provider.MediaStore.MediaColumns.MIME_TYPE,"application/octet-stream");values.put(android.provider.MediaStore.MediaColumns.RELATIVE_PATH,"Download/FreeTV");
            android.net.Uri uri=getTargetContext().getContentResolver().insert(android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI,values);
            try(InputStream input=new java.io.FileInputStream(trace);java.io.OutputStream output=getTargetContext().getContentResolver().openOutputStream(uri)){byte[] buffer=new byte[65536];int count;while((count=input.read(buffer))!=-1)output.write(buffer,0,count);}
            result.putString("stream","TRACE_EXPORT /sdcard/Download/FreeTV/"+name+"\n");finish(Activity.RESULT_OK,result);
        }catch(Throwable error){result.putString("stream","Trace export failed: "+error+"\n");finish(Activity.RESULT_CANCELED,result);}return;}
        try { runChecks(); result.putString("stream", "categories".equals(arguments.getString("mode"))?"FreeTV category/time checks passed\n":"startupCache".equals(arguments.getString("mode"))?"FreeTV startup warmup checks passed\n": "sources".equals(arguments.getString("mode"))||"reference".equals(arguments.getString("mode")) ? "Source sampling completed; inspect the individual result records\n" : "FreeTV native playback checks passed\n"); finish(Activity.RESULT_OK, result); }
        catch (Throwable error) { result.putString("stream", "FreeTV native playback check failed: " + error + "\n"); finish(Activity.RESULT_CANCELED, result); }
    }
    private void check(boolean value, String message) { if (!value) throw new AssertionError(message); }
    private JSONObject request(String session, String path, double position) throws Exception {
        return new JSONObject().put("sessionId", session).put("position", position)
            .put("uiMode",arguments.getString("tv","false").equals("true")?"tv":"phone")
            .put("source", new JSONObject().put("id", "fixture"))
            .put("detail", new JSONObject().put("id", "fixture").put("title", "FreeTV playback fixture"))
            .put("episode", new JSONObject().put("url", url(path)).put("label", "第01集"))
            .put("progress", new JSONObject().put("sourceId", "fixture").put("vodId", "fixture").put("routeId", "main").put("episodeKey", "01").put("episodeLabel", "第01集")
                .put("item",new JSONObject().put("sourceId","fixture").put("id","fixture").put("title","Synthetic native test").put("aliases",new org.json.JSONArray()).put("poster","").put("year","2026").put("kind","movie").put("categories",new org.json.JSONArray()).put("remarks","").put("updatedAt","").put("cast",new org.json.JSONArray()).put("directors",new org.json.JSONArray()).put("synopsis","")));
    }
    private String send(String name, JSONObject data) throws Exception {
        String id = "test-" + (++sequence);
        command.invoke(bridge, new JSONObject().put("command",name).put("id",id).put("data",data).toString());
        return id;
    }
    private JSONObject next(long deadline) throws Exception {
        JSONObject item = messages.poll(Math.max(1, deadline - System.currentTimeMillis()), TimeUnit.MILLISECONDS);
        if (item != null && "event".equals(item.optString("type")) && (sourceSession.isEmpty()||sourceSession.equals(item.getJSONObject("value").optString("sessionId")))) latest = item.getJSONObject("value");
        if(methodTracing&&latest!=null&&latest.optJSONObject("metrics")!=null&&latest.getJSONObject("metrics").optBoolean("firstFrame")){android.os.Debug.stopMethodTracing();methodTracing=false;}
        if(item!=null&&"event".equals(item.optString("type"))&&!suppressUiInspection&&inspectedActivity!=null){String state=uiState(inspectedActivity);if(!state.equals(lastUiState)){lastUiState=state;note("UI_STATE "+state+(latest==null?"":"; engine="+latest.optString("state")+"; position="+latest.optDouble("position")));}}
        String diagnostic;while((diagnostic=startupNotes.poll())!=null)note(diagnostic);
        return item;
    }
    private String uiState(Activity activity){
        final String[] result={"unavailable"};
        runOnMainSync(()->{try{Field active=activity.getClass().getDeclaredField("active");active.setAccessible(true);Object slot=active.get(activity);if(slot==null)return;Field viewField=slot.getClass().getDeclaredField("view");viewField.setAccessible(true);Object view=viewField.get(slot);result[0]="gsy="+view.getClass().getMethod("getCurrentState").invoke(view);traceLoads(view);}catch(Exception error){result[0]=error.toString();}});
        return result[0];
    }
    private void traceLoads(Object view){try{
        Object manager=view.getClass().getMethod("getManager").invoke(view),adapter=manager.getClass().getMethod("engine").invoke(manager);if(adapter==null)return;
        Object core=adapter.getClass().getMethod("engine").invoke(adapter);if(core==null||tracedCores.containsKey(core))return;
        ClassLoader loader=core.getClass().getClassLoader();Class<?> listener=loader.loadClass("androidx.media3.exoplayer.analytics.AnalyticsListener");
        final long openedAt=startupOpenAt;
        Object observer=Proxy.newProxyInstance(loader,new Class<?>[]{listener},(proxy,method,args)->{
            if(arguments.getString("startup","false").equals("true")&&openedAt==startupOpenAt){
                String name=method.getName();
                if("onLoadStarted".equals(name)||"onLoadCompleted".equals(name)){
                    Object info=args[1],data=args[2];
                    JSONObject timing=new JSONObject().put("event",name).put("elapsedMs",android.os.SystemClock.elapsedRealtime()-openedAt).put("type",data.getClass().getField("dataType").get(data)).put("uri",String.valueOf(info.getClass().getField("uri").get(info)));
                    timing.put("eventTimeMs",args[0].getClass().getField("realtimeMs").get(args[0])).put("loadEventTimeMs",info.getClass().getField("elapsedRealtimeMs").get(info));
                    if("onLoadCompleted".equals(name))timing.put("loadMs",info.getClass().getField("loadDurationMs").get(info)).put("bytes",info.getClass().getField("bytesLoaded").get(info));
                    startupNotes.offer("STARTUP_LOAD "+timing);
                }
                if("onRenderedFirstFrame".equals(name)){
                    long callback=android.os.SystemClock.elapsedRealtime(),rendered=((Number)args[2]).longValue();
                    if(renderedFirstFrameAt==0){renderedFirstFrameAt=rendered;renderedFirstFrameCallbackAt=callback;}
                    startupNotes.offer("STARTUP_STAGE "+name+" renderedMs="+(rendered-openedAt)+" callbackMs="+(callback-openedAt)+" callbackLagMs="+(callback-rendered));
                }
                if("onVideoDecoderInitialized".equals(name))startupNotes.offer("STARTUP_STAGE "+name+" elapsedMs="+(android.os.SystemClock.elapsedRealtime()-openedAt)+" decoder="+args[1]+" initializationMs="+args[args.length-1]);
                if("onPlaybackStateChanged".equals(name))startupNotes.offer("CORE_STATE "+args[1]+" elapsedMs="+(android.os.SystemClock.elapsedRealtime()-openedAt));
            }
            if("onLoadError".equals(method.getName())){Object info=args[1];Object uri=info.getClass().getField("uri").get(info);Throwable error=(Throwable)args[3];while(error.getCause()!=null)error=error.getCause();note("LOAD_FAILURE host="+android.net.Uri.parse(uri.toString()).getHost()+" cause="+error);}
            if("hashCode".equals(method.getName()))return System.identityHashCode(proxy);
            if("equals".equals(method.getName()))return proxy==args[0];
            if("toString".equals(method.getName()))return "StartupNetworkTrace";
            return null;
        });
        loader.loadClass("androidx.media3.exoplayer.ExoPlayer").getMethod("addAnalyticsListener",listener).invoke(core,observer);tracedCores.put(core,true);
    }catch(Exception error){if(arguments.getString("startup","false").equals("true")&&!startupTraceError){startupTraceError=true;note("STARTUP_TRACE_ERROR "+error);}}}
    private void watchStartup(Class<?> type,long deadline){
        if(!startupWatching||android.os.SystemClock.elapsedRealtime()>deadline)return;
        try{Field owner=type.getDeclaredField("activity");owner.setAccessible(true);Activity activity=(Activity)owner.get(null);if(activity!=null){Field active=activity.getClass().getDeclaredField("active");active.setAccessible(true);Object slot=active.get(activity);if(slot!=null){Field view=slot.getClass().getDeclaredField("view");view.setAccessible(true);Object video=view.get(slot);int before=tracedCores.size();traceLoads(video);if(tracedCores.size()>before){startupWatching=false;return;}}}}catch(Exception ignored){}
        new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(()->watchStartup(type,deadline),50);
    }
    private JSONObject response(String id, long deadline) throws Exception {
        boolean previous=suppressUiInspection;suppressUiInspection=true;
        try{
        while (System.currentTimeMillis() < deadline) {
            JSONObject item = next(deadline);
            if (item != null && id.equals(item.optString("id"))) { check(!item.has("error"), item.optString("error")); return item; }
        }
        throw new AssertionError("Timed out waiting for " + id + "; main=" + java.util.Arrays.toString(android.os.Looper.getMainLooper().getThread().getStackTrace()));
        }finally{suppressUiInspection=previous;}
    }
    private JSONObject playing(String session, long timeout) throws Exception {
        long deadline = System.currentTimeMillis() + timeout;
        while (System.currentTimeMillis() < deadline) {
            next(deadline);
            if (latest != null && session.equals(latest.optString("sessionId")) && "playing".equals(latest.optString("state")) && latest.optDouble("position") > 1) return latest;
            if (latest != null && session.equals(latest.optString("sessionId")) && "error".equals(latest.optString("state"))) throw new AssertionError("Playback error: " + latest.optString("code"));
        }
        throw new AssertionError("No playing frame for " + session + "; last=" + latest);
    }
    private void note(String message) { Bundle status = new Bundle(); status.putString("stream", message + "\n"); sendStatus(1,status); }
    private String candidateState(Activity activity) {
        try {
            Field candidate = activity.getClass().getDeclaredField("candidate"); candidate.setAccessible(true); Object slot = candidate.get(activity);
            if (slot == null) return "no candidate";
            Field statsField = slot.getClass().getDeclaredField("stats"); statsField.setAccessible(true); Object stats = statsField.get(slot);
            JSONObject values = new JSONObject();
            try { Field diagnostic = activity.getClass().getDeclaredField("lastCommitCheck"); diagnostic.setAccessible(true); values.put("commit",diagnostic.get(activity)); } catch (Exception ignored) { values.put("commit","old native class without commit diagnostics"); }
            for (String key : new String[]{"state","position","buffered","firstFrame","frameAt","snapshotAt","error"}) {
                try { Field field = stats.getClass().getDeclaredField(key); field.setAccessible(true); values.put(key,field.get(stats)); } catch (Exception ignored) {}
            }
            return values.toString();
        } catch (Exception error) { return error.toString(); }
    }
    private String screenText(android.view.accessibility.AccessibilityNodeInfo node) {
        if(node==null||!node.isVisibleToUser())return "";
        StringBuilder text=new StringBuilder();if(node.getText()!=null)text.append(node.getText()).append('\n');
        for(int i=0;i<node.getChildCount();i++)text.append(screenText(node.getChild(i)));
        return text.toString();
    }
    private void cleanupSyntheticLibraryProgress() throws Exception {
        File file=getTargetContext().getDatabasePath("DCStorage");if(!file.exists())return;
        int removed=0;
        try(android.database.sqlite.SQLiteDatabase db=android.database.sqlite.SQLiteDatabase.openDatabase(file.getAbsolutePath(),null,android.database.sqlite.SQLiteDatabase.OPEN_READWRITE);
            android.database.Cursor tables=db.rawQuery("SELECT name FROM sqlite_master WHERE type='table'",null)){
            while(tables.moveToNext()){
                String table=tables.getString(0);if(!table.matches("[A-Za-z0-9_]+"))continue;
                java.util.Set<String> columns=new java.util.HashSet<>();try(android.database.Cursor schema=db.rawQuery("PRAGMA table_info(\""+table+"\")",null)){while(schema.moveToNext())columns.add(schema.getString(1).toLowerCase(java.util.Locale.ROOT));}
                if(!columns.contains("key")||!columns.contains("value"))continue;
                try(android.database.Cursor rows=db.query(table,new String[]{"value"},"key=?",new String[]{"freetv:v3:library"},null,null,null)){
                    if(!rows.moveToFirst())continue;String raw=rows.getString(0);JSONObject stored;try{stored=new JSONObject(raw);}catch(Exception ignored){continue;}
                    JSONObject library=stored;String wrapper="";boolean stringWrapper=false;
                    if(!library.has("progress")){
                        Object data=stored.opt("data");if(data instanceof JSONObject){library=(JSONObject)data;wrapper="data";}
                        else if(data instanceof String){try{library=new JSONObject((String)data);wrapper="data";stringWrapper=true;}catch(Exception ignored){continue;}}
                    }
                    JSONArray progress=library.optJSONArray("progress");if(progress==null||library.optJSONArray("favorites")==null)continue;
                    JSONArray retained=new JSONArray();int count=0;
                    for(int i=0;i<progress.length();i++){JSONObject row=progress.optJSONObject(i),item=row==null?null:row.optJSONObject("item");
                        boolean synthetic=row!=null&&"fixture".equals(row.optString("sourceId"))&&"fixture".equals(row.optString("vodId"))&&item!=null&&java.util.Arrays.asList("Synthetic native test","FreeTV playback fixture").contains(item.optString("title"));
                        if(synthetic)count++;else retained.put(progress.get(i));
                    }
                    if(count>0){library.put("progress",retained);if(!wrapper.isEmpty())stored.put(wrapper,stringWrapper?library.toString():library);android.content.ContentValues values=new android.content.ContentValues();values.put("value",stored.toString());check(db.update(table,values,"key=?",new String[]{"freetv:v3:library"})==1,"Synthetic cleanup write failed");removed+=count;}
                }
            }
        }
        note("Removed synthetic library progress entries: "+removed+"; real progress and favorites retained");
    }
    private android.view.accessibility.AccessibilityNodeInfo textNode(android.view.accessibility.AccessibilityNodeInfo node,String text,boolean editable){
        if(node==null||!node.isVisibleToUser())return null;
        if(editable&&node.isEditable()||!editable&&text.contentEquals(node.getText()==null?"":node.getText()))return node;
        for(int i=0;i<node.getChildCount();i++){android.view.accessibility.AccessibilityNodeInfo found=textNode(node.getChild(i),text,editable);if(found!=null)return found;}
        return null;
    }
    private String waitScreen(String expected,long timeout) throws Exception {
        long deadline=System.currentTimeMillis()+timeout;String text="";
        do{text=screenText(getUiAutomation().getRootInActiveWindow());if(text.contains(expected))return text;Thread.sleep(300);}while(System.currentTimeMillis()<deadline);
        throw new AssertionError("Missing UI text: "+expected+"; screen="+text);
    }
    private void clickText(String text) throws Exception {
        android.view.accessibility.AccessibilityNodeInfo node=textNode(getUiAutomation().getRootInActiveWindow(),text,false);
        check(node!=null,"Missing clickable text: "+text);
        if(text.contains("选择片库")){android.view.accessibility.AccessibilityNodeInfo ancestor=node;for(int i=0;ancestor!=null&&i<4;i++,ancestor=ancestor.getParent())note("UI_NODE "+ancestor.getClassName()+" click="+ancestor.isClickable()+" text="+ancestor.getText());}
        while(node!=null&&!node.isClickable())node=node.getParent();
        check(node!=null&&node.performAction(android.view.accessibility.AccessibilityNodeInfo.ACTION_CLICK),"Cannot click UI text: "+text);Thread.sleep(700);note("UI_CLICK "+text);
    }
    private void inputText(String value) throws Exception {
        android.view.accessibility.AccessibilityNodeInfo node=textNode(getUiAutomation().getRootInActiveWindow(),"",true);
        check(node!=null,"Missing editable field");Bundle data=new Bundle();data.putCharSequence(android.view.accessibility.AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,value);
        check(node.performAction(android.view.accessibility.AccessibilityNodeInfo.ACTION_SET_TEXT,data),"Text entry failed");Thread.sleep(300);
    }
    private void saveUiScreenshot(String label) throws Exception {
        Bitmap capture=getUiAutomation().takeScreenshot();check(capture!=null,"Screenshot unavailable");
        String name="freetv-ui-"+label+"-"+System.currentTimeMillis()+".png";android.content.ContentValues values=new android.content.ContentValues();
        values.put(android.provider.MediaStore.MediaColumns.DISPLAY_NAME,name);values.put(android.provider.MediaStore.MediaColumns.MIME_TYPE,"image/png");values.put(android.provider.MediaStore.MediaColumns.RELATIVE_PATH,"Download/FreeTV");
        android.net.Uri uri=getTargetContext().getContentResolver().insert(android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI,values);
        try(java.io.OutputStream output=getTargetContext().getContentResolver().openOutputStream(uri)){capture.compress(Bitmap.CompressFormat.PNG,100,output);}
        note("UI_SCREENSHOT /sdcard/Download/FreeTV/"+name);
    }
    private Object field(Object instance,String name)throws Exception {Field f=instance.getClass().getDeclaredField(name);f.setAccessible(true);return f.get(instance);}
    private float playbackRate(Activity activity)throws Exception {
        final float[] rate={0};runOnMainSync(()->{try{Object slot=field(activity,"active"),video=field(slot,"view"),manager=video.getClass().getMethod("getManager").invoke(video),adapter=manager.getClass().getMethod("engine").invoke(manager),core=adapter.getClass().getMethod("engine").invoke(adapter);Object parameters=getTargetContext().getClassLoader().loadClass("androidx.media3.common.Player").getMethod("getPlaybackParameters").invoke(core);rate[0]=parameters.getClass().getField("speed").getFloat(parameters);}catch(Exception error){throw new RuntimeException(error);}});return rate[0];
    }
    private void runUiChecks() throws Exception {
        android.graphics.drawable.Drawable icon=getTargetContext().getApplicationInfo().loadIcon(getTargetContext().getPackageManager());
        Bitmap bitmap=Bitmap.createBitmap(192,192,Bitmap.Config.ARGB_8888);icon.setBounds(0,0,192,192);icon.draw(new android.graphics.Canvas(bitmap));int opaque=0,white=0;
        for(int y=0;y<192;y++)for(int x=0;x<192;x++){int c=bitmap.getPixel(x,y);if(android.graphics.Color.alpha(c)>240)opaque++;if(android.graphics.Color.red(c)>225&&android.graphics.Color.green(c)>225&&android.graphics.Color.blue(c)>225)white++;}
        check(opaque>192*192*.9&&white>192*192*.05,"Launcher icon must contain the opaque FreeTV logo");note("ICON_REPORT "+new JSONObject().put("opaquePixels",opaque).put("whitePixels",white));
        Intent launch=getTargetContext().getPackageManager().getLaunchIntentForPackage("com.fxl.freetv.demo");check(launch!=null,"Launcher entry missing");startActivitySync(launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        String home=waitScreen("近期新作",25000);for(String label:new String[]{"电影","电视剧","综艺","动漫"})check(home.contains(label),"Missing home category: "+label);
        waitScreen("2026",25000);saveUiScreenshot("home");note("UI_HOME Four logical categories and recent works rendered");
        inputText("现在就出发");clickText("搜索");waitScreen("现在就出发第四季",25000);
        android.view.accessibility.AccessibilityNodeInfo input=textNode(getUiAutomation().getRootInActiveWindow(),"",true);
        check(input!=null&&"现在就出发".contentEquals(input.getText()),"Search input must retain decoded Chinese");saveUiScreenshot("search");note("UI_SEARCH Chinese navigation parameter retained");
        getUiAutomation().performGlobalAction(android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_BACK);waitScreen("近期新作",10000);
        clickText("设置");waitScreen("片库配置",10000);clickText("选择片库 ›");Thread.sleep(1000);saveUiScreenshot("picker-open");
        note("UI_PICKER Overlay requires screenshot review: Android WebView omits it from the accessibility tree; filtering is covered by the browser check");
        getUiAutomation().performGlobalAction(android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_BACK);Thread.sleep(500);
        saveUiScreenshot("picker-closed");check(screenText(getUiAutomation().getRootInActiveWindow()).contains("片库配置"),"Back must retain settings");note("UI text checks passed; review overlay screenshots");
    }
    private Object readTestStorage(String key) throws Exception {
        File file=getTargetContext().getDatabasePath("DCStorage");if(!file.exists())return null;
        try(android.database.sqlite.SQLiteDatabase db=android.database.sqlite.SQLiteDatabase.openDatabase(file.getAbsolutePath(),null,android.database.sqlite.SQLiteDatabase.OPEN_READONLY);android.database.Cursor tables=db.rawQuery("SELECT name FROM sqlite_master WHERE type='table'",null)){
            while(tables.moveToNext()){
                String table=tables.getString(0);if(!table.matches("[A-Za-z0-9_]+"))continue;
                java.util.Set<String> columns=new java.util.HashSet<>();try(android.database.Cursor schema=db.rawQuery("PRAGMA table_info(\""+table+"\")",null)){while(schema.moveToNext())columns.add(schema.getString(1).toLowerCase(java.util.Locale.ROOT));}
                if(!columns.contains("key")||!columns.contains("value"))continue;
                try(android.database.Cursor rows=db.query(table,new String[]{"value"},"key=?",new String[]{key},null,null,null)){
                    if(rows.moveToFirst()){Object value=new org.json.JSONTokener(rows.getString(0)).nextValue();if(value instanceof JSONObject&&((JSONObject)value).has("data"))return ((JSONObject)value).get("data");return value;}
                }
            }
        }return null;
    }
    private void runCategoryChecks() throws Exception {
        Intent launch=getTargetContext().getPackageManager().getLaunchIntentForPackage("com.fxl.freetv.demo");startActivitySync(launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        String home=waitScreen("近期新作",25000);String[] labels={"全部","电影","国产剧","海外剧","国产综艺","海外综艺","国漫","海外动漫"};JSONArray bounds=new JSONArray();int firstTop=-1,secondTop=-1;
        for(int i=0;i<labels.length;i++){
            check(home.contains(labels[i]),"Missing home category: "+labels[i]);android.view.accessibility.AccessibilityNodeInfo node=textNode(getUiAutomation().getRootInActiveWindow(),labels[i],false);check(node!=null,"Category unavailable: "+labels[i]);
            android.graphics.Rect rect=new android.graphics.Rect();node.getBoundsInScreen(rect);check(rect.width()>0,"Empty category bounds");
            if(i==0)firstTop=rect.top;if(i==4)secondTop=rect.top;check(Math.abs(rect.top-(i<4?firstTop:secondTop))<=3,"Categories must occupy two rows of four");bounds.put(new JSONObject().put("name",labels[i]).put("bounds",rect.toShortString()));
        }
        check(secondTop>firstTop,"Category rows overlap");note("HOME_LAYOUT_REPORT "+bounds);
        Thread.sleep(1000);saveUiScreenshot("eight-categories");
        clickText("国产综艺");waitScreen("大陆综艺",25000);
        Object category=readTestStorage("freetv:v3:home-category");check("variety-domestic".equals(String.valueOf(category)),"Category choice not persisted: "+category);note("CATEGORY_PREFERENCE persisted variety-domestic");
        clickText("全部");check("all".equals(String.valueOf(readTestStorage("freetv:v3:home-category"))),"All category choice not persisted");
        clickText("设置");String settings=waitScreen("最近检查：",15000);java.util.regex.Matcher matcher=java.util.regex.Pattern.compile("最近检查：(\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2})").matcher(settings);check(matcher.find(),"Check time must have a numeric Chinese date format");
        Object saved=readTestStorage("freetv:v3:sync:at");check(saved!=null,"Missing sync timestamp");java.text.SimpleDateFormat format=new java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss",java.util.Locale.CHINA);format.setTimeZone(java.util.TimeZone.getTimeZone("Asia/Shanghai"));String expected=format.format(new java.util.Date(Long.parseLong(String.valueOf(saved))));check(expected.equals(matcher.group(1)),"Displayed time is not China time: "+matcher.group(1)+" vs "+expected);
        note("CHINA_TIME_REPORT "+matcher.group(1));Thread.sleep(1000);saveUiScreenshot("china-time");
        getUiAutomation().performGlobalAction(android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_BACK);waitScreen("近期新作",10000);Thread.sleep(1200);saveUiScreenshot("eight-categories-returned");
    }
    private void posterViews(android.view.View view,java.util.List<android.webkit.WebView> result){if(view instanceof android.webkit.WebView)result.add((android.webkit.WebView)view);if(view instanceof android.view.ViewGroup){android.view.ViewGroup group=(android.view.ViewGroup)view;for(int i=0;i<group.getChildCount();i++)posterViews(group.getChildAt(i),result);}}
    private JSONObject posterDom(Activity activity,String script) throws Exception {
        java.util.List<android.webkit.WebView> views=new java.util.ArrayList<>();runOnMainSync(()->posterViews(activity.getWindow().getDecorView(),views));
        for(android.webkit.WebView view:views){LinkedBlockingQueue<String> results=new LinkedBlockingQueue<>();runOnMainSync(()->view.evaluateJavascript(script,results::offer));String value=results.poll(2,TimeUnit.SECONDS);if(value==null)continue;Object decoded=new org.json.JSONTokener(value).nextValue();if(decoded instanceof String){JSONObject row=new JSONObject((String)decoded);if(row.optInt("total")>0)return row;}}
        return new JSONObject().put("total",0);
    }
    private void runPosterChecks() throws Exception {
        final java.util.concurrent.atomic.AtomicReference<Activity> visible=new java.util.concurrent.atomic.AtomicReference<>();
        android.app.Application application=(android.app.Application)getTargetContext().getApplicationContext();
        android.app.Application.ActivityLifecycleCallbacks observer=(android.app.Application.ActivityLifecycleCallbacks)Proxy.newProxyInstance(getClass().getClassLoader(),new Class<?>[]{android.app.Application.ActivityLifecycleCallbacks.class},(proxy,method,args)->{if("onActivityResumed".equals(method.getName()))visible.set((Activity)args[0]);if("hashCode".equals(method.getName()))return System.identityHashCode(proxy);if("equals".equals(method.getName()))return proxy==args[0];return null;});
        application.registerActivityLifecycleCallbacks(observer);
        String script="JSON.stringify({total:document.querySelectorAll('.poster-image').length,firstTitle:document.querySelector('.card-name')?document.querySelector('.card-name').textContent:'',ready:Array.from(document.querySelectorAll('.poster-image uni-image.loaded')).filter(x=>{var i=x.querySelector('img');return i&&i.naturalWidth>0}).length,paths:Array.from(document.querySelectorAll('.poster-image uni-image.loaded img')).map(x=>x.src)})";
        long began=android.os.SystemClock.elapsedRealtime();JSONObject before=null,frame=new JSONObject();long firstMs=0;
        Object stored=readTestStorage("freetv:v3:poster-cache:v1");if(stored instanceof String)stored=new JSONObject((String)stored);if(stored instanceof JSONObject)before=(JSONObject)stored;
        try{
            Intent launch=getTargetContext().getPackageManager().getLaunchIntentForPackage("com.fxl.freetv.demo");startActivitySync(launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            long deadline=System.currentTimeMillis()+50000;
            while(System.currentTimeMillis()<deadline){Activity activity=visible.get();if(activity!=null){frame=posterDom(activity,script);if(frame.optInt("ready")>0&&firstMs==0)firstMs=android.os.SystemClock.elapsedRealtime()-began;if(frame.optInt("ready")>=2)break;}Thread.sleep(150);}
            check(frame.optInt("ready")>=2,"Posters did not decode: "+frame);
            JSONArray paths=frame.getJSONArray("paths");for(int i=0;i<paths.length();i++)check(paths.getString(i).contains("uniapp_save"),"Rendered poster must use a saved local file: "+paths.getString(i));
            Object value=readTestStorage("freetv:v3:poster-cache:v1");if(value instanceof String)value=new JSONObject((String)value);check(value instanceof JSONObject,"Persistent poster index missing");JSONObject snapshot=(JSONObject)value;
            check(snapshot.getJSONArray("entries").length()>=2,"Saved poster entries missing");
            JSONObject report=new JSONObject().put("phase",arguments.getString("phase","cold")).put("firstPaintedPosterMs",firstMs).put("ready",frame.getInt("ready")).put("total",frame.getInt("total")).put("savedFiles",snapshot.getJSONArray("entries").length()).put("paths",paths);
            if("warm".equals(arguments.getString("phase"))){check(before!=null,"Warm check requires a persisted cache");java.util.Map<String,Long> times=new java.util.HashMap<>();JSONArray original=before.getJSONArray("entries");for(int i=0;i<original.length();i++){JSONObject entry=original.getJSONObject(i);times.put(entry.getString("path"),entry.getLong("savedAt"));}int reused=0;JSONArray after=snapshot.getJSONArray("entries");for(int i=0;i<after.length();i++){JSONObject entry=after.getJSONObject(i);if(times.containsKey(entry.getString("path"))&&times.get(entry.getString("path"))==entry.getLong("savedAt"))reused++;}check(reused>=2,"Saved files were not reused after process restart");report.put("persistentFilesReused",reused);}
            note("POSTER_REPORT "+report);
            waitScreen("近期新作",10000);clickText("刷新");Thread.sleep(300);JSONObject refreshed=posterDom(visible.get(),script);check(refreshed.optInt("ready")>=2,"Refreshing hid already displayed posters: "+refreshed);note("POSTER_REFRESH retained decoded covers");
            // A return from settings also gives the emulator compositor a stable frame.
            clickText("设置");waitScreen("片库配置",10000);getUiAutomation().performGlobalAction(android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_BACK);waitScreen("近期新作",10000);Thread.sleep(1000);
            android.view.accessibility.AccessibilityNodeInfo heading=textNode(getUiAutomation().getRootInActiveWindow(),frame.optString("firstTitle"),false);if(heading!=null)heading.performAction(android.view.accessibility.AccessibilityNodeInfo.AccessibilityAction.ACTION_SHOW_ON_SCREEN.getId());Thread.sleep(600);saveUiScreenshot("posters-"+arguments.getString("phase","cold"));
        }finally{application.unregisterActivityLifecycleCallbacks(observer);}
        note("FreeTV poster cache checks passed");
    }
    private void runSearchStateChecks()throws Exception{
        final java.util.concurrent.atomic.AtomicReference<Activity> visible=new java.util.concurrent.atomic.AtomicReference<>();
        android.app.Application app=(android.app.Application)getTargetContext().getApplicationContext();
        android.app.Application.ActivityLifecycleCallbacks observer=(android.app.Application.ActivityLifecycleCallbacks)Proxy.newProxyInstance(getClass().getClassLoader(),new Class<?>[]{android.app.Application.ActivityLifecycleCallbacks.class},(proxy,method,args)->{if("onActivityResumed".equals(method.getName()))visible.set((Activity)args[0]);if("hashCode".equals(method.getName()))return System.identityHashCode(proxy);if("equals".equals(method.getName()))return proxy==args[0];return null;});
        app.registerActivityLifecycleCallbacks(observer);
        try{
            Intent launch=getTargetContext().getPackageManager().getLaunchIntentForPackage("com.fxl.freetv.demo");startActivitySync(launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            waitScreen("近期新作",30000);boolean offline=arguments.getString("offline","false").equals("true");
            inputText(offline?"狂飙":"zzqxv"+System.currentTimeMillis());clickText("搜索");
            String script="(function(){var r=Array.from(document.querySelectorAll('.screen')).find(function(e){return !e.classList.contains('home')&&e.querySelector('.search-input')});if(!r)return JSON.stringify({total:0});var empty=r.querySelector('.empty'),error=r.querySelector('.notice.error');return JSON.stringify({total:1,empty:empty?empty.textContent:'',error:error?error.textContent:'',tv:!!r.querySelector('.tv-keyboard'),text:r.textContent})})()";
            long until=System.currentTimeMillis()+90000;JSONObject state=new JSONObject();boolean ready=false;
            while(System.currentTimeMillis()<until){if(visible.get()!=null)state=posterDom(visible.get(),script);if(offline?!state.optString("error").isEmpty():state.optString("empty").contains("暂时没有找到")){ready=true;break;}Thread.sleep(200);}
            note("PHONE_SEARCH_DOM "+state);
            if(!ready){saveUiScreenshot("phone-search-failure");throw new AssertionError("Search state did not settle: "+state);}
            if(offline)check(!state.optString("empty").contains("暂时没有找到"),"Request failure also displayed an empty result");
            else check(state.optString("error").isEmpty(),"Empty search also has an error notice");
            check(!state.optBoolean("tv")&&!state.optString("text").contains("修改搜索"),"TV search replaced phone search");
            saveUiScreenshot(offline?"phone-search-error":"phone-search-empty");note(offline?"PHONE_SEARCH_ERROR Error only; no false empty result":"PHONE_SEARCH_EMPTY Completed empty response displayed correctly");
        }finally{app.unregisterActivityLifecycleCallbacks(observer);}
    }
    private void runChecks() throws Exception {
        if("searchState".equals(arguments.getString("mode"))){runSearchStateChecks();return;}
        if("posters".equals(arguments.getString("mode"))){runPosterChecks();return;}
        if("categories".equals(arguments.getString("mode"))){runCategoryChecks();return;}
        if("ui".equals(arguments.getString("mode"))){runUiChecks();return;}
        base = arguments.getString("base", "http://127.0.0.1:8754");
        run = Long.toString(System.currentTimeMillis());
        ClassLoader loader = getTargetContext().getClassLoader();
        Class<?> type = loader.loadClass("uts.sdk.modules.freetvPlayer.FreeTVPlayerBridge");
        String manager=loader.loadClass("uts.sdk.modules.freetvPlayer.FreeTVEngine").getSuperclass().getName();
        note("Playback command implementation: "+manager);
        check("tv.danmaku.ijk.media.exo2.Exo2PlayerManager".equals(manager),"Playback must use GSY's official Exo2PlayerManager");
        bridge = type.getField("INSTANCE").get(null);
        command = type.getMethod("command", String.class);
        Method connect = null;
        for (Method method : type.getMethods()) if (method.getName().equals("connect")) connect = method;
        check(connect != null,"Native connect method is missing");
        Object unit = loader.loadClass("kotlin.Unit").getField("INSTANCE").get(null);
        Object callback = Proxy.newProxyInstance(loader, new Class<?>[]{connect.getParameterTypes()[0]}, (proxy,method,args) -> {
            if ("invoke".equals(method.getName())) { messages.offer(new JSONObject(String.valueOf(args[0]))); return unit; }
            if ("toString".equals(method.getName())) return "FreeTVTestCallback";
            if ("hashCode".equals(method.getName())) return System.identityHashCode(proxy);
            if ("equals".equals(method.getName())) return proxy == args[0];
            return null;
        });
        connect.invoke(bridge,callback);
        if("startupCache".equals(arguments.getString("mode"))){runWarmupChecks(loader);return;}
        if ("sources".equals(arguments.getString("mode"))) { runSourceChecks(type); return; }
        double resume = Double.parseDouble(arguments.getString("position","9999"));
        Field initial = type.getDeclaredField("initial"); initial.setAccessible(true); initial.set(null,request("original","healthy",resume));
        Activity activity = startActivitySync(new Intent().setClassName(getTargetContext(),"uts.sdk.modules.freetvPlayer.FreeTVPlayerActivity").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));inspectedActivity=activity;
        note("Hardware acceleration: "+activity.getWindow().getDecorView().isHardwareAccelerated());
        try {
            if("reference".equals(arguments.getString("mode"))){runReference(activity);return;}
            JSONObject event = playing("original",20000);
            if(!"true".equals(arguments.getString("tv","false"))){check(field(activity,"tvControls")==null,"TV controls enabled in phone mode");check(field(activity,"controls")!=null,"Phone controls disappeared");}
            if("completion".equals(arguments.getString("mode"))){
                long until=System.currentTimeMillis()+12000;while(System.currentTimeMillis()<until&&!"ended".equals(latest.optString("state")))next(until);
                check("ended".equals(latest.optString("state")),"Native player did not emit completion: "+latest);
                Thread.sleep(300);JSONObject pending=new JSONObject(String.valueOf(type.getMethod("pendingProgress").invoke(bridge)));
                check(pending.optBoolean("ended"),"Completed progress was not saved");
                note("NATIVE_COMPLETION Media3 emitted ended and persisted completed progress; shared phone/TV controller handles the next episode");return;
            }
            if("tvPlayback".equals(arguments.getString("mode"))){
                Field controlsField=activity.getClass().getDeclaredField("tvControls");controlsField.setAccessible(true);
                Object layer=controlsField.get(activity);check(layer!=null,"TV control layer missing");
                android.view.View bar=(android.view.View)field(layer,"panel"),hud=(android.view.View)field(layer,"hud");
                android.widget.Button speed=(android.widget.Button)field(layer,"speedButton");
                check(bar.getHeight()<activity.getWindow().getDecorView().getHeight()*.28,"TV control panel occupies too much of the screen");
                check(speed.getText().toString().equals("倍速 1×"),"Current speed is not visible");saveUiScreenshot("tv-compact-controls");
                Thread.sleep(5500);check(bar.getVisibility()==android.view.View.GONE,"Playing controls did not auto-hide");
                sendKeyDownUpSync(android.view.KeyEvent.KEYCODE_DPAD_CENTER);
                long pausedUntil=System.currentTimeMillis()+4000;while(System.currentTimeMillis()<pausedUntil){next(pausedUntil);if(latest!=null&&"paused".equals(latest.optString("state")))break;}
                check("paused".equals(latest.optString("state")),"Remote OK did not pause");
                check(bar.getVisibility()==android.view.View.GONE,"Pause unexpectedly opened the control panel");
                sendKeyDownUpSync(android.view.KeyEvent.KEYCODE_DPAD_CENTER);playing("original",5000);
                Thread.sleep(5500);double beforeSeek=latest.optDouble("position");
                sendKeyDownUpSync(android.view.KeyEvent.KEYCODE_DPAD_RIGHT);Thread.sleep(200);
                check(bar.getVisibility()==android.view.View.GONE&&hud.getVisibility()==android.view.View.VISIBLE,"Seek opened the control panel or omitted progress feedback");saveUiScreenshot("tv-seek-hint");Thread.sleep(1300);
                long seekUntil=System.currentTimeMillis()+3000;while(System.currentTimeMillis()<seekUntil){next(seekUntil);if(latest.optDouble("position")>beforeSeek+7)break;}
                check(latest.optDouble("position")>beforeSeek+7,"Remote right did not seek: "+latest);
                sendKeyDownUpSync(android.view.KeyEvent.KEYCODE_DPAD_UP);Thread.sleep(150);check(bar.getVisibility()==android.view.View.VISIBLE&&speed.hasFocus(),"Up did not open the panel with speed focused");
                long heldAt=android.os.SystemClock.uptimeMillis();
                for(int repeat=0;repeat<4;repeat++)getUiAutomation().injectInputEvent(new android.view.KeyEvent(heldAt,android.os.SystemClock.uptimeMillis(),android.view.KeyEvent.ACTION_DOWN,android.view.KeyEvent.KEYCODE_DPAD_CENTER,repeat,0,android.view.KeyEvent.KEYCODE_UNKNOWN,0,0,android.view.InputDevice.SOURCE_DPAD),true);
                check(speed.getText().toString().equals("倍速 1.25×"),"Speed did not update on key-down, or held OK activated repeatedly: "+speed.getText());
                getUiAutomation().injectInputEvent(new android.view.KeyEvent(heldAt,android.os.SystemClock.uptimeMillis(),android.view.KeyEvent.ACTION_UP,android.view.KeyEvent.KEYCODE_DPAD_CENTER,0,0,android.view.KeyEvent.KEYCODE_UNKNOWN,0,0,android.view.InputDevice.SOURCE_DPAD),true);
                Thread.sleep(300);check(playbackRate(activity)==1.25f,"Displayed speed was not applied to playback");
                for(float expected:new float[]{1.5f,2f,1f}){sendKeyDownUpSync(android.view.KeyEvent.KEYCODE_DPAD_CENTER);Thread.sleep(250);check(playbackRate(activity)==expected,"Speed cycle did not reach "+expected);check(speed.getText().toString().contains(Float.toString(expected).replaceAll("\\.0$","")+"×"),"Speed button label is stale");}
                saveUiScreenshot("tv-speed-feedback");
                sendKeyDownUpSync(android.view.KeyEvent.KEYCODE_BACK);Thread.sleep(350);check(!activity.isFinishing()&&bar.getVisibility()==android.view.View.GONE,"Back should dismiss the open panel");
                sendKeyDownUpSync(android.view.KeyEvent.KEYCODE_BACK);Thread.sleep(350);check(activity.isFinishing()||activity.isDestroyed(),"Back with the panel hidden did not exit to episodes");
                note("TV_PLAYBACK Compact controls, hidden-panel seeks, immediate speed feedback, held-OK single activation, real speed cycle and remote back passed");return;
            }
            if("lifecycle".equals(arguments.getString("mode"))){
                String pause=send("pause",new JSONObject());response(pause,System.currentTimeMillis()+3000);
                long pausedDeadline=System.currentTimeMillis()+3000;while(System.currentTimeMillis()<pausedDeadline){next(pausedDeadline);if(latest!=null&&"paused".equals(latest.optString("state")))break;}
                note("Paused engine / controls: "+latest+"; "+uiState(activity));
                check("gsy=5".equals(uiState(activity)),"Host pause left the visible controls in the playing state");
                runOnMainSync(()->{callActivityOnPause(activity);callActivityOnResume(activity);});
                long stayedPaused=System.currentTimeMillis()+1000;while(System.currentTimeMillis()<stayedPaused)next(stayedPaused);
                check("paused".equals(latest.optString("state")),"An explicit pause must survive returning to the activity");
                runOnMainSync(()->{try{Field active=activity.getClass().getDeclaredField("active");active.setAccessible(true);Object slot=active.get(activity);Field view=slot.getClass().getDeclaredField("view");view.setAccessible(true);Object video=view.get(slot);video.getClass().getMethod("onVideoResume",boolean.class).invoke(video,false);}catch(Exception error){throw new RuntimeException(error);}});
                playing("original",10000);
                runOnMainSync(()->callActivityOnPause(activity));
                runOnMainSync(()->callActivityOnResume(activity));
                playing("original",10000);
                check("gsy=2".equals(uiState(activity)),"Transient lifecycle pause did not automatically restore the playing controls");
                note("Explicit pause retained; transient lifecycle pause resumed without a play-button click");
                String reopened=send("open",request("reopened","healthy",3));
                check(response(reopened,System.currentTimeMillis()+3000).optBoolean("value"),"An existing player must accept retry/episode requests without requiring a new UniActivity");
                playing("reopened",15000);note("Existing activity accepted a fresh playback session");
                return;
            }
            Bitmap capture = getUiAutomation().takeScreenshot();
            if (capture != null) try (FileOutputStream output = new FileOutputStream(new File(getTargetContext().getExternalFilesDir(null),"native-fixture.png"))) { capture.compress(Bitmap.CompressFormat.PNG,100,output); }
            note("Original playback metrics: "+event.getJSONObject("metrics"));
            check(event.getJSONObject("metrics").optBoolean("firstFrame"),"A decoded first frame is required, not only stream metadata");
            check(event.getJSONObject("metrics").getInt("width") == 1920,"Fixture must decode at 1920 pixels");
            check(event.getDouble("position") < 20,"Out-of-range resume position must restart from zero");
            note("Decoded 1080p fixture" + (resume > 100 ? " and recovered an out-of-range resume position" : ""));
            long steadyDeadline = System.currentTimeMillis() + 12000;
            while (System.currentTimeMillis() < steadyDeadline) {
                next(steadyDeadline);
                if (latest != null && latest.getJSONObject("metrics").optDouble("effectiveSeconds") >= 3 && System.currentTimeMillis()-latest.optLong("at") < 500) { event=latest; break; }
            }
            check(event.getJSONObject("metrics").optDouble("effectiveSeconds") >= 3,"Original never reached steady decoded playback");
            long began = System.currentTimeMillis();
            String backup = arguments.getString("backup","backup");
            String probe = send("probe",new JSONObject().put("request",request("backup",backup,event.getDouble("position"))).put("deadline",began+VERIFY_MS).put("excludeUrl",url("healthy")));
            JSONObject tested = response(probe,began+VERIFY_MS+1000).getJSONObject("value");
            check("ready".equals(tested.optString("status")),"Healthy backup was not ready: "+tested);
            check(latest != null && "original".equals(latest.optString("sessionId")) && latest.optDouble("position") > event.getDouble("position"),"Backup probe interrupted original playback");
            check(tested.getJSONObject("metrics").getDouble("bufferedSeconds") >= 3,"Backup buffer is too short");
            long elapsed = System.currentTimeMillis()-began;
            note("Ready candidate: " + tested + "; elapsed=" + elapsed);
            long commitDeadline = Math.min(began+VERIFY_MS+COMMIT_MS,System.currentTimeMillis()+COMMIT_MS);
            String commit = send("commit",new JSONObject().put("token",tested.getString("token")).put("position",latest.getDouble("position")).put("deadline",commitDeadline));
            check(response(commit,commitDeadline+500).optBoolean("value"),"Prepared instance commit failed; candidate="+candidateState(activity));
            playing("backup",5000); note("Backup prepared in "+elapsed+" ms; original kept playing; prepared instance took over");
            String third=send("probe",new JSONObject().put("request",request("third","healthy",0)).put("deadline",System.currentTimeMillis()+VERIFY_MS).put("excludeUrl",""));
            check(!"ready".equals(response(third,System.currentTimeMillis()+2000).getJSONObject("value").optString("status")),"Rollback retention must not allocate a third decoding instance");
            String rollback = send("rollback",new JSONObject());
            check(response(rollback,System.currentTimeMillis()+3000).optBoolean("value"),"Rollback failed");
            playing("original",5000); note("Rollback restored the original session");
            began = System.currentTimeMillis();
            probe = send("probe",new JSONObject().put("request",request("slow","slow",0)).put("deadline",began+VERIFY_MS).put("excludeUrl",""));
            tested = response(probe,began+VERIFY_MS+1000).getJSONObject("value");
            check(!"ready".equals(tested.optString("status")),"Low-speed fixture must not qualify");
            check(System.currentTimeMillis()-began < VERIFY_MS+1000,"Shared probe deadline was exceeded");
            check("original".equals(latest.optString("sessionId")),"Slow probe stole playback");
            note("Low-speed candidate rejected without replacing the original session");
            began = System.currentTimeMillis();
            probe = send("probe",new JSONObject().put("request",request("broken","broken",0)).put("deadline",began+VERIFY_MS).put("excludeUrl",""));
            tested = response(probe,began+VERIFY_MS+1000).getJSONObject("value");
            check(!"ready".equals(tested.optString("status")),"A valid manifest with missing media chunks must not qualify");
            check("original".equals(latest.optString("sessionId")),"A broken candidate replaced the original session");
            note("Missing HLS chunks rejected despite a successful manifest response");
            began = System.currentTimeMillis();
            probe = send("probe",new JSONObject().put("request",request("cancelled","backup",0)).put("deadline",began+VERIFY_MS).put("excludeUrl",""));
            android.os.SystemClock.sleep(200);
            String cancelled = send("cancelProbe",new JSONObject());
            tested = response(probe,began+VERIFY_MS+1000).getJSONObject("value");
            response(cancelled,System.currentTimeMillis()+3000);
            check(!"ready".equals(tested.optString("status")),"A cancelled probe must not return a late ready result");
            check("original".equals(latest.optString("sessionId")),"Cancellation changed the active session");
            note("Cancelled validation retained the original session");
        } finally { runOnMainSync(activity::finish); }
    }

    private void runReference(Activity activity)throws Exception{
        JSONArray inputs;try(InputStream input=getContext().getAssets().open("startup-playback-input.json")){ByteArrayOutputStream body=new ByteArrayOutputStream();byte[] buffer=new byte[4096];int count;while((count=input.read(buffer))!=-1)body.write(buffer,0,count);inputs=new JSONArray(body.toString("UTF-8"));}
        JSONObject source=inputs.getJSONObject(0);ClassLoader loader=getTargetContext().getClassLoader();final Object[] view={null};
        runOnMainSync(()->{try{
            Field active=activity.getClass().getDeclaredField("active");active.setAccessible(true);Object slot=active.get(activity);
            if(slot!=null){Method release=activity.getClass().getDeclaredMethod("release",slot.getClass());release.setAccessible(true);release.invoke(activity,slot);active.set(activity,null);}
            loader.loadClass("com.shuyu.gsyvideoplayer.player.PlayerFactory").getMethod("setPlayManager",Class.class).invoke(null,loader.loadClass("tv.danmaku.ijk.media.exo2.Exo2PlayerManager"));
            Class<?> type=loader.loadClass("com.shuyu.gsyvideoplayer.video.StandardGSYVideoPlayer");view[0]=type.getConstructor(android.content.Context.class).newInstance(activity);
            type.getMethod("setUp",String.class,boolean.class,String.class).invoke(view[0],source.getString("url"),false,"Official GSY reference");
            type.getMethod("setNeedShowWifiTip",boolean.class).invoke(view[0],false);
            activity.setContentView((android.view.View)view[0]);type.getMethod("startPlayLogic").invoke(view[0]);
        }catch(Exception error){throw new RuntimeException(error);}});
        long began=System.currentTimeMillis(),deadline=began+35000;int last=-1,bufferTransitions=0;double position=0;boolean started=false;
        try{
            while(System.currentTimeMillis()<deadline){
                final double[] sample={0,0};
                runOnMainSync(()->{try{Object video=view[0];sample[0]=((Number)video.getClass().getMethod("getCurrentState").invoke(video)).doubleValue();Object manager=video.getClass().getMethod("getGSYVideoManager").invoke(video);sample[1]=((Number)manager.getClass().getMethod("getCurrentPosition").invoke(manager)).doubleValue()/1000;}catch(Exception error){throw new RuntimeException(error);}});
                int state=(int)sample[0];position=sample[1];if(state!=last){if(state==3)bufferTransitions++;note("REFERENCE_STATE gsy="+state+" position="+position);last=state;}
                if(state==2&&position>1)started=true;
                if(state==7||position>=10)break;
                android.os.SystemClock.sleep(100);
            }
            note("REFERENCE_RESULT "+new JSONObject().put("episode",source.getString("episode")).put("implementation","Unmodified StandardGSYVideoPlayer + Exo2PlayerManager; cache disabled").put("startedWithoutClick",started).put("gsyState",last).put("position",position).put("bufferTransitions",bufferTransitions).put("elapsedMs",System.currentTimeMillis()-began));
        }finally{runOnMainSync(()->{try{loader.loadClass("com.shuyu.gsyvideoplayer.GSYVideoManager").getMethod("releaseAllVideos").invoke(null);}catch(Exception ignored){}});}
    }

    private int androidCatalog(String api) throws Exception {
        HttpURLConnection connection=(HttpURLConnection)new URL(api+(api.contains("?")?"&":"?")+"ac=detail&pg=1").openConnection();
        connection.setConnectTimeout(8000);connection.setReadTimeout(8000);
        try {
            check(connection.getResponseCode()==200,"Android directory HTTP "+connection.getResponseCode());
            ByteArrayOutputStream body=new ByteArrayOutputStream();
            try(InputStream input=connection.getInputStream()) { byte[] buffer=new byte[8192];int count;while((count=input.read(buffer))!=-1){body.write(buffer,0,count);check(body.size()<=2*1024*1024,"Directory exceeds limit");} }
            String text=body.toString("UTF-8").trim();
            if(text.startsWith("{"))return new JSONObject(text).getJSONArray("list").length();
            java.util.regex.Matcher videos=java.util.regex.Pattern.compile("<video(?:\\s|>)").matcher(text);int count=0;while(videos.find())count++;return count;
        } finally { connection.disconnect(); }
    }
    private Object warmup(Class<?> type,String session,String address)throws Exception{
        JSONObject input=request(session,"healthy",0);input.getJSONObject("episode").put("url",address);
        return type.getMethod("begin",android.content.Context.class,JSONObject.class).invoke(type.getField("INSTANCE").get(null),getTargetContext(),input);
    }
    private void warmupDone(Object launch)throws Exception{
        Field task=launch.getClass().getDeclaredField("task");task.setAccessible(true);java.util.concurrent.Future<?> future=(java.util.concurrent.Future<?>)task.get(launch);
        if(future!=null)future.get(6,TimeUnit.SECONDS);
    }
    private JSONObject fixtureStats(String key)throws Exception{
        HttpURLConnection connection=(HttpURLConnection)new URL("http://127.0.0.1:8756/stats/"+key).openConnection();connection.setConnectTimeout(2000);connection.setReadTimeout(2000);
        try(InputStream input=connection.getInputStream()){ByteArrayOutputStream body=new ByteArrayOutputStream();byte[] buffer=new byte[4096];int count;while((count=input.read(buffer))!=-1)body.write(buffer,0,count);return new JSONObject(body.toString("UTF-8"));}finally{connection.disconnect();}
    }
    private void runWarmupChecks(ClassLoader loader)throws Exception{
        Class<?> type=loader.loadClass("uts.sdk.modules.freetvPlayer.PlaybackStartup");String key="ready-"+run,root="http://127.0.0.1:8756/case/"+key+"/",address=root+"entry.m3u8";
        Object launch=warmup(type,"warm-one",address);warmupDone(launch);Method take=launch.getClass().getMethod("take",String.class);
        Object master=take.invoke(launch,address);check(master!=null,"Prepared master playlist was lost");
        check((root+"master.m3u8").equals(String.valueOf(master.getClass().getMethod("getUri").invoke(master))),"A redirect must retain its final URI for relative HLS resolution");
        Object media=take.invoke(launch,root+"media/index.m3u8");check(media!=null,"Relative media playlist was not prefetched");
        check(take.invoke(launch,address)==null,"A playlist may only be consumed once");
        JSONObject counts=fixtureStats(key);check(counts.length()==3,"Warmup must fetch only playlists, not video segments");for(java.util.Iterator<String> keys=counts.keys();keys.hasNext();)check(counts.getInt(keys.next())==1,"A prepared playlist was downloaded twice");
        Object replacement=warmup(type,"warm-two",address);warmupDone(replacement);check(take.invoke(launch,root+"media/index.m3u8")==null,"Old launch leaked into a new session");replacement.getClass().getMethod("cancel").invoke(replacement);check(take.invoke(replacement,address)==null,"Cancelled preload remained usable");
        check(fixtureStats(key).getInt("/case/"+key+"/entry.m3u8")==2,"A new launch must fetch a fresh playlist");
        Object slow=warmup(type,"warm-slow","http://127.0.0.1:8756/case/slow-"+run+"/entry.m3u8");long began=android.os.SystemClock.elapsedRealtime();check(take.invoke(slow,"http://127.0.0.1:8756/case/slow-"+run+"/entry.m3u8")==null,"Unfinished speculative work must fall back");check(android.os.SystemClock.elapsedRealtime()-began<150,"A speculative miss blocked normal loading");
        Object invalid=warmup(type,"warm-invalid","http://127.0.0.1:8756/case/invalid-"+run+"/entry.m3u8");warmupDone(invalid);check(take.invoke(invalid,"http://127.0.0.1:8756/case/invalid-"+run+"/entry.m3u8")==null,"Malformed prefetch must not replace normal loading");
        note("Warmup retained redirect bases, fetched only playlists, refreshed sessions, and discarded cancelled/unfinished/invalid data without waiting");
    }
    private void runSourceChecks(Class<?> type) throws Exception {
        ByteArrayOutputStream body=new ByteArrayOutputStream();
        try(InputStream input=getContext().getAssets().open(arguments.getString("input","source-playback-input.json"))){byte[] buffer=new byte[8192];int count;while((count=input.read(buffer))!=-1)body.write(buffer,0,count);}
        JSONArray sources=new JSONArray(body.toString("UTF-8")),results=new JSONArray();
        int repetitions=Math.min(3,Math.max(1,Integer.parseInt(arguments.getString("repeat","1"))));
        for(int index=0;index<sources.length()*repetitions;index++){
            JSONObject source=sources.getJSONObject(index%sources.length()),result=new JSONObject().put("sourceId",source.getString("sourceId")).put("name",source.getString("name")).put("title",source.getString("title")).put("episode",source.getString("episode")).put("attempt",index/sources.length()+1);
            if(arguments.containsKey("source")&&!arguments.getString("source").equals(source.getString("sourceId")))continue;
            double sampleSeconds=Double.parseDouble(arguments.getString("seconds","5"));
            Activity activity=null;long began=System.currentTimeMillis();latest=null;messages.clear();
            try{
                if(!arguments.getString("skipCatalog","false").equals("true")){int count=androidCatalog(source.getString("api"));check(count>0,"Android directory is empty");result.put("androidDirectoryItems",count).put("catalogMs",System.currentTimeMillis()-began);}
                String session="source-"+index;sourceSession=session;
                JSONObject request=request(session,"healthy",Double.parseDouble(arguments.getString("position","0")));request.getJSONObject("episode").put("url",source.getString("url"));
                if(arguments.containsKey("url")){request.getJSONObject("episode").put("url",arguments.getString("url"));result.put("streamOverride",arguments.getString("url"));}
                Field initial=type.getDeclaredField("initial");initial.setAccessible(true);initial.set(null,request);
                if(arguments.getString("readyApp","false").equals("true")){waitForIdleSync();result.put("applicationReadyBeforeTiming",true);}
                if(arguments.getString("coldMedia","false").equals("true")){
                    // Remove only this test episode's temporary media entries.
                    // Watch history, pending progress and other videos are untouched.
                    String prefix="/2026-11-02/45758_mEdbQ5PJgkYD7VukAM/";
                    check(android.net.Uri.parse(request.getJSONObject("episode").getString("url")).getPath().startsWith(prefix),"Cold-cache check is restricted to the defined episode fixture");
                    Class<?> cacheType=getTargetContext().getClassLoader().loadClass("uts.sdk.modules.freetvPlayer.PlayerCache");Object cache=cacheType.getMethod("get",android.content.Context.class).invoke(cacheType.getField("INSTANCE").get(null),getTargetContext());
                    java.util.Set<?> keys=(java.util.Set<?>)cache.getClass().getMethod("getKeys").invoke(cache);int removed=0;
                    for(Object key:new java.util.ArrayList<Object>(keys)){android.net.Uri uri=android.net.Uri.parse(String.valueOf(key));if(uri.getPath()!=null&&uri.getPath().startsWith(prefix)){cache.getClass().getMethod("removeResource",String.class).invoke(cache,String.valueOf(key));removed++;}}
                    result.put("coldMediaCacheRequested",true).put("removedEpisodeCacheEntries",removed);
                }
                int declared=getTargetContext().getPackageManager().getActivityInfo(new android.content.ComponentName(getTargetContext(),"uts.sdk.modules.freetvPlayer.FreeTVPlayerActivity"),0).screenOrientation;result.put("declaredOrientation",declared);
                if(arguments.getString("expectLandscape","false").equals("true"))check(declared==android.content.pm.ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE,"Release manifest must select landscape before creating the window");
                if(arguments.getString("methodTrace","false").equals("true")){
                    File trace=new File(getTargetContext().getExternalFilesDir(null),"startup-method-"+(index+1)+".trace");
                    result.put("tracePath",trace.getAbsolutePath()).put("traceBeforeMs",android.os.SystemClock.elapsedRealtime());
                    android.os.Debug.startMethodTracingSampling(trace.getAbsolutePath(),32*1024*1024,5000);methodTracing=true;
                }
                renderedFirstFrameAt=0;renderedFirstFrameCallbackAt=0;
                startupOpenAt=android.os.SystemClock.elapsedRealtime();result.put("nativeOpenAtMs",startupOpenAt);
                // Mirror the real bridge's first-open order: begin I/O before
                // startActivity, rather than relying on the activity fallback.
                try{Class<?> startupType=getTargetContext().getClassLoader().loadClass("uts.sdk.modules.freetvPlayer.PlaybackStartup");startupType.getMethod("begin",android.content.Context.class,JSONObject.class).invoke(startupType.getField("INSTANCE").get(null),getTargetContext(),request);result.put("launchWarmupBeforeActivity",true);}catch(ClassNotFoundException absent){result.put("launchWarmupBeforeActivity",false);}
                if(arguments.getString("startup","false").equals("true")){startupWatching=true;new android.os.Handler(android.os.Looper.getMainLooper()).post(()->watchStartup(type,startupOpenAt+30000));}
                if(arguments.getString("traceMain","false").equals("true")){
                    startupSampling=true;Thread sampler=new Thread(()->{for(int sample=0;sample<16&&startupSampling;sample++){try{Thread.sleep(500);if(!startupSampling)break;StackTraceElement[] frames=android.os.Looper.getMainLooper().getThread().getStackTrace();note("STARTUP_MAIN elapsedMs="+(android.os.SystemClock.elapsedRealtime()-startupOpenAt)+" "+java.util.Arrays.toString(java.util.Arrays.copyOf(frames,Math.min(10,frames.length))));}catch(Exception ignored){}}});sampler.setDaemon(true);sampler.start();
                }
                activity=startActivitySync(new Intent().setClassName(getTargetContext(),"uts.sdk.modules.freetvPlayer.FreeTVPlayerActivity").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));inspectedActivity=activity;lastUiState="";
                startupSampling=false;
                result.put("activityStartMs",android.os.SystemClock.elapsedRealtime()-startupOpenAt);
                final Activity opened=activity;final int[] flags={0};runOnMainSync(()->flags[0]=opened.getWindow().getAttributes().flags);result.put("fullscreenWindow",(flags[0]&android.view.WindowManager.LayoutParams.FLAG_FULLSCREEN)!=0);
                if(arguments.getString("expectLandscape","false").equals("true"))check((flags[0]&android.view.WindowManager.LayoutParams.FLAG_FULLSCREEN)!=0,"Release window must start with a fullscreen theme");
                playing(session,20000);long deadline=System.currentTimeMillis()+Math.max(15000,(long)(sampleSeconds*1500));
                while(System.currentTimeMillis()<deadline){next(deadline);if(latest!=null&&"error".equals(latest.optString("state")))throw new AssertionError("Playback error: "+latest.optString("code"));if(latest!=null&&latest.getJSONObject("metrics").optDouble("effectiveSeconds")>=sampleSeconds)break;}
                check(latest!=null&&latest.getJSONObject("metrics").optBoolean("firstFrame"),"No decoded frame");
                check(latest.getJSONObject("metrics").optDouble("effectiveSeconds")>=sampleSeconds,"Did not reach the requested decoded watch time");
                if(arguments.getString("expectWarmup","false").equals("true"))check(latest.getJSONObject("metrics").optInt("startupManifests")==2,"The player did not reuse both prepared redirected/relative playlists");
                result.put("status","sample-played").put("metrics",latest.getJSONObject("metrics")).put("duration",latest.optDouble("duration"));
            }catch(Throwable error){result.put("status","unverified").put("reason",error.toString());}
            finally{startupWatching=false;if(methodTracing){android.os.Debug.stopMethodTracing();methodTracing=false;}if(renderedFirstFrameAt>0)result.put("openToRenderedFrameMs",renderedFirstFrameAt-startupOpenAt).put("firstFrameCallbackLagMs",renderedFirstFrameCallbackAt-renderedFirstFrameAt);if(activity!=null){Activity closing=activity;runOnMainSync(()->{try{Field active=closing.getClass().getDeclaredField("active");active.setAccessible(true);Object slot=active.get(closing);Field stats=slot.getClass().getDeclaredField("stats");stats.setAccessible(true);Object values=stats.get(slot);Field frame=values.getClass().getDeclaredField("frameAt");frame.setAccessible(true);long at=frame.getLong(values);if(at>0)result.put("openToFirstFrameMs",at-startupOpenAt);}catch(Exception ignored){}closing.finish();});}}
            result.put("elapsedMs",System.currentTimeMillis()-began);results.put(result);note("SOURCE_RESULT "+result);
        }
        note("SOURCE_REPORT "+new JSONObject().put("at",System.currentTimeMillis()).put("scope","Android catalogue and short decoded sample, not full-episode smoothness or complete coverage").put("results",results));
    }
}
