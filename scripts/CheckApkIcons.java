import java.awt.image.BufferedImage;
import java.io.File;
import java.util.Arrays;
import java.util.zip.ZipFile;
import javax.imageio.ImageIO;

// aapt2 can recompress PNGs; compare decoded pixels rather than encoded bytes.
class CheckApkIcons {
    public static void main(String[] args) throws Exception {
        String[] densities={"mdpi","hdpi","xhdpi","xxhdpi","xxxhdpi"};
        try(ZipFile apk=new ZipFile(args[0])) {
            StringBuilder result=new StringBuilder("{");
            for(String density:densities) {
                BufferedImage actual=ImageIO.read(apk.getInputStream(apk.getEntry("res/drawable-"+density+"/icon.png")));
                BufferedImage expected=ImageIO.read(new File(args[1],"android-"+density+".png"));
                int w=expected.getWidth(),h=expected.getHeight();
                if(actual.getWidth()!=w||actual.getHeight()!=h||!Arrays.equals(expected.getRGB(0,0,w,h,null,0,w),actual.getRGB(0,0,w,h,null,0,w)))throw new AssertionError("Wrong launcher icon pixels: "+density);
                if(result.length()>1)result.append(',');result.append('"').append(density).append("\":\"").append(w).append('x').append(h).append('"');
            }
            System.out.println(result.append('}'));
        }
    }
}
