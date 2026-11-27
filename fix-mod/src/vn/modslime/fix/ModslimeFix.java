package vn.modslime.fix;

import net.neoforged.fml.common.Mod;

/** Mod vá nhỏ cho ModSlime: chỉ chứa mixin, không thêm vật phẩm/khối nào. */
@Mod(ModslimeFix.MOD_ID)
public class ModslimeFix {
    public static final String MOD_ID = "modslime_fix";

    public ModslimeFix() {
        System.out.println("[ModSlime Fix] Đã nạp: chống crash 'Cannot get config value before config is loaded' (Platform/VanillaBackport)");
    }
}
